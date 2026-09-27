import exifr from 'exifr';
import { PDFDocument, PDFName } from 'pdf-lib';
import JSZip from 'jszip';
import piexif from 'piexifjs';
import { InspectionResult, MetadataCategory, MetadataItem, RiskLevel, GPSInfo } from './types';

/**
 * Canonical display-label map for overlapping EXIF/metadata keys.
 * Keys that map to the same canonical label are considered duplicates;
 * only the first occurrence (by insertion order) is kept.
 */
const CANONICAL_KEY_MAP: Record<string, string> = {
  // Timestamps
  DateTimeOriginal: 'Date Taken',
  DateTimeDigitized: 'Date Taken',
  CreateDate: 'Date Taken',
  DateTime: 'Date Modified',
  ModifyDate: 'Date Modified',
  ModDate: 'Date Modified',
  // Author
  Artist: 'Author / Artist',
  'By-line': 'Author / Artist',
  Creator: 'Author / Artist',
  'dc:creator': 'Author / Artist',
  // Software
  Software: 'Software',
  CreatorTool: 'Software',
  ProcessingSoftware: 'Software',
  // Serial
  BodySerialNumber: 'Camera Serial #',
  CameraSerialNumber: 'Camera Serial #',
  InternalSerialNumber: 'Camera Serial #',
  LensSerialNumber: 'Lens Serial #',
};

/**
 * Normalizes a metadata item's key to its canonical display label
 * and deduplicates the list so each canonical key appears only once.
 */
function deduplicateMetadataItems(items: MetadataItem[]): MetadataItem[] {
  const seen = new Set<string>();
  const result: MetadataItem[] = [];

  for (const item of items) {
    const canonicalKey = CANONICAL_KEY_MAP[item.key] ?? item.key;
    // Use canonical key + value as the dedup fingerprint
    const fingerprint = `${canonicalKey}::${item.value}`;

    // Also deduplicate by canonical key alone (keep first encountered value)
    const keyOnlyFingerprint = `KEY::${canonicalKey}`;

    if (!seen.has(fingerprint) && !seen.has(keyOnlyFingerprint)) {
      seen.add(fingerprint);
      seen.add(keyOnlyFingerprint);
      // Apply the canonical label to the display key
      result.push({
        ...item,
        key: canonicalKey,
      });
    }
  }

  return result;
}

function formatCoordinate(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${Math.abs(val).toFixed(6)}° ${dir}`;
}

function parsePiexifGpsCoord(coordArr: number[][], ref: string): number | null {
  if (!Array.isArray(coordArr) || coordArr.length < 3) return null;
  const deg = coordArr[0][0] / coordArr[0][1];
  const min = coordArr[1][0] / coordArr[1][1];
  const sec = coordArr[2][0] / coordArr[2][1];
  let decimal = deg + min / 60 + sec / 3600;
  if (ref === 'S' || ref === 'W') decimal = -decimal;
  return decimal;
}

export async function inspectFile(file: File | { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<InspectionResult> {
  const fileName = file.name;
  const fileSize = file.size;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const buffer = await file.arrayBuffer();

  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'avif', 'tiff', 'tif', 'bmp'].includes(ext);
  const isPdf = ext === 'pdf';
  const isOffice = ['docx', 'xlsx', 'pptx', 'dotx', 'xltx', 'potx'].includes(ext);

  let rawReport: Record<string, any> = {};
  const items: MetadataItem[] = [];
  let gpsInfo: GPSInfo = { present: false };
  let hasThumbnail = false;
  let hasRevisionHistory = false;
  let hasXmpStream = false;
  let dimensions: { width: number; height: number } | undefined;

  let mimeType = 'application/octet-stream';
  let fileType = ext.toUpperCase();

  if (isImage) {
    if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';

    const imgResult = await extractImageMetadata(buffer, ext);
    rawReport = imgResult.rawReport;
    items.push(...imgResult.items);
    gpsInfo = imgResult.gpsInfo;
    hasThumbnail = imgResult.hasThumbnail;
    hasXmpStream = imgResult.hasXmpStream;
    dimensions = imgResult.dimensions;
  } else if (isPdf) {
    mimeType = 'application/pdf';
    const pdfResult = await extractPdfMetadata(buffer);
    rawReport = pdfResult.rawReport;
    items.push(...pdfResult.items);
    hasThumbnail = pdfResult.hasThumbnail;
    hasXmpStream = pdfResult.hasXmpStream;
  } else if (isOffice) {
    if (ext.startsWith('doc')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext.startsWith('xls')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (ext.startsWith('ppt')) mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

    const officeResult = await extractOfficeMetadata(buffer);
    rawReport = officeResult.rawReport;
    items.push(...officeResult.items);
    hasThumbnail = officeResult.hasThumbnail;
    hasRevisionHistory = officeResult.hasRevisionHistory;
  } else {
    rawReport = { file: fileName, size: fileSize };
  }

  // ── Deduplication & Normalization ────────────────────────────────────────────
  // Apply canonical key normalization and remove duplicate metadata fields
  // so each distinct property appears exactly once in the MetadataTable.
  const dedupedItems = deduplicateMetadataItems(items);

  // Categorize deduplicated items
  const categories: InspectionResult['categories'] = {
    location: [],
    device: [],
    author: [],
    timestamps: [],
    software: [],
    document: [],
    optics: [],
    technical: [],
  };

  for (const item of dedupedItems) {
    if (categories[item.category]) {
      categories[item.category].push(item);
    } else {
      categories.technical.push(item);
    }
  }

  // Calculate Risk Verdict
  let riskLevel: RiskLevel = 'LOW';
  let riskReason = '0 metadata fields detected. File is clean.';
  let riskSummary = 'No location coordinates, author names, device models, or timestamp tags found.';

  const hasGps = gpsInfo.present || categories.location.length > 0;
  const hasAuthorOrIdentity = categories.author.length > 0;
  const hasSerialOrHardware = categories.device.some(i => i.isSensitive || i.name.toLowerCase().includes('serial'));

  if (dedupedItems.length === 0) {
    riskLevel = 'LOW';
    riskReason = 'Clean (0 metadata fields detected)';
    riskSummary = 'This file has no embedded EXIF, GPS, author, or revision history properties.';
  } else if (hasGps || hasAuthorOrIdentity || hasSerialOrHardware) {
    riskLevel = 'HIGH';
    if (hasGps && hasAuthorOrIdentity) {
      riskReason = 'Risk: HIGH — GPS Location & Author ID detected';
      riskSummary = 'Public headers reveal exact physical location coordinates and user identity.';
    } else if (hasGps) {
      riskReason = 'Risk: HIGH — Location GPS coordinates exposed';
      riskSummary = 'Embedded GPS calculates physical location coordinates.';
    } else if (hasAuthorOrIdentity) {
      riskReason = 'Risk: HIGH — Author identity detected';
      riskSummary = 'Creator names, edit history, or machine user accounts are embedded.';
    } else {
      riskReason = 'Risk: HIGH — Device serial number exposed';
      riskSummary = 'Unique hardware serial numbers are linkable to specific camera/device units.';
    }
  } else if (
    categories.device.length > 0 ||
    categories.timestamps.length > 0 ||
    categories.software.length > 0 ||
    categories.document.length > 0 ||
    hasRevisionHistory ||
    hasThumbnail
  ) {
    riskLevel = 'MEDIUM';
    riskReason = 'Risk: MEDIUM — Timestamps or software signatures detected';
    riskSummary = 'Technical file headers contain creation timestamps, device specs, or software build versions.';
  }

  const sensitiveTagsCount = dedupedItems.filter(i => i.isSensitive).length;

  return {
    fileName,
    fileSize,
    fileType,
    mimeType,
    riskLevel,
    riskReason,
    riskSummary,
    gps: gpsInfo,
    items: dedupedItems,
    categories,
    totalTagsFound: dedupedItems.length,
    sensitiveTagsCount,
    hasThumbnail,
    hasRevisionHistory,
    hasXmpStream,
    rawReport,
    dimensions,
  };
}

async function extractImageMetadata(buffer: ArrayBuffer, ext: string) {
  const items: MetadataItem[] = [];
  const rawReport: Record<string, any> = {};
  let gpsInfo: GPSInfo = { present: false };
  let hasThumbnail = false;
  let hasXmpStream = false;
  let dimensions: { width: number; height: number } | undefined;

  // 1. First attempt: exifr
  try {
    const parsed = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      jfif: true,
      icc: false,
      mergeOutput: true,
      translateValues: true,
      reviveValues: false,
      sanitize: false,
    });

    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      Object.assign(rawReport, parsed);

      // GPS
      const lat = parsed.latitude ?? parsed.GPSLatitude;
      const lon = parsed.longitude ?? parsed.GPSLongitude;
      const alt = parsed.altitude ?? parsed.GPSAltitude;

      if (typeof lat === 'number' && typeof lon === 'number') {
        const formattedLat = formatCoordinate(lat, true);
        const formattedLon = formatCoordinate(lon, false);
        const altStr = typeof alt === 'number' ? `, Altitude: ${alt.toFixed(1)}m` : '';
        const formattedText = `${formattedLat}, ${formattedLon}${altStr}`;

        gpsInfo = {
          present: true,
          latitude: lat,
          longitude: lon,
          altitude: alt,
          formattedText,
          details: 'WGS-84 Location Vector',
        };

        items.push({
          id: 'gps-coords',
          category: 'location',
          name: 'GPS Location',
          key: 'GPSLatitude, GPSLongitude',
          value: `${formattedLat}, ${formattedLon}`,
          isSensitive: true,
          severity: 'HIGH',
        });

        if (typeof alt === 'number') {
          items.push({
            id: 'gps-altitude',
            category: 'location',
            name: 'GPS Altitude',
            key: 'GPSAltitude',
            value: `${alt.toFixed(1)} m`,
            isSensitive: true,
            severity: 'HIGH',
          });
        }
      }

      // Author / Creator
      const authorKeys = ['Artist', 'Creator', 'By-line', 'Credit', 'Copyright', 'Rights', 'OwnerName', 'CameraOwnerName'];
      for (const k of authorKeys) {
        if (parsed[k] && String(parsed[k]).trim()) {
          items.push({
            id: `author-${k.toLowerCase()}`,
            category: 'author',
            name: 'Author / Artist',
            key: k,
            value: String(parsed[k]),
            isSensitive: true,
            severity: 'HIGH',
          });
        }
      }

      // Camera Make & Model
      if (parsed.Make || parsed.Model) {
        const fullModel = [parsed.Make, parsed.Model].filter(Boolean).join(' ');
        if (fullModel.trim()) {
          items.push({
            id: 'device-model',
            category: 'device',
            name: 'Camera Model',
            key: 'Make / Model',
            value: fullModel,
            isSensitive: false,
            severity: 'MEDIUM',
          });
        }
      }

      // Serial Number
      const serialKeys = ['SerialNumber', 'BodySerialNumber', 'InternalSerialNumber', 'LensSerialNumber', 'CameraSerialNumber'];
      for (const k of serialKeys) {
        if (parsed[k] && String(parsed[k]).trim()) {
          items.push({
            id: `device-${k.toLowerCase()}`,
            category: 'device',
            name: 'Hardware Serial #',
            key: k,
            value: String(parsed[k]),
            isSensitive: true,
            severity: 'HIGH',
          });
        }
      }

      // Lens Model
      if (parsed.LensModel && String(parsed.LensModel).trim()) {
        items.push({
          id: 'device-lens',
          category: 'device',
          name: 'Lens Model',
          key: 'LensModel',
          value: String(parsed.LensModel),
          isSensitive: false,
          severity: 'MEDIUM',
        });
      }

      // Timestamps
      const timeKeys = ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'DateTimeDigitized'];
      for (const k of timeKeys) {
        if (parsed[k]) {
          let val = parsed[k];
          if (val instanceof Date) val = val.toISOString().replace('T', ' ').substring(0, 19);
          if (String(val).trim() && !String(val).startsWith('1970')) {
            items.push({
              id: `time-${k.toLowerCase()}`,
              category: 'timestamps',
              name: 'Date & Time',
              key: k,
              value: String(val),
              isSensitive: false,
              severity: 'MEDIUM',
            });
          }
        }
      }

      // Software
      const softKeys = ['Software', 'ProcessingSoftware', 'CreatorTool', 'HostComputer'];
      for (const k of softKeys) {
        if (parsed[k] && String(parsed[k]).trim()) {
          items.push({
            id: `soft-${k.toLowerCase()}`,
            category: 'software',
            name: 'Software / App',
            key: k,
            value: String(parsed[k]),
            isSensitive: false,
            severity: 'MEDIUM',
          });
        }
      }

      // Exposure / Optics
      if (parsed.ExposureTime || parsed.FNumber || parsed.ISO || parsed.ISOSpeedRatings) {
        const exposureParts: string[] = [];
        if (parsed.ExposureTime) {
          exposureParts.push(
            typeof parsed.ExposureTime === 'number' && parsed.ExposureTime < 1
              ? `1/${Math.round(1 / parsed.ExposureTime)}s`
              : `${parsed.ExposureTime}s`
          );
        }
        if (parsed.FNumber) exposureParts.push(`f/${parsed.FNumber}`);
        const iso = parsed.ISO || parsed.ISOSpeedRatings;
        if (iso) exposureParts.push(`ISO ${iso}`);

        if (exposureParts.length > 0) {
          items.push({
            id: 'optics-exposure',
            category: 'optics',
            name: 'Exposure / Settings',
            key: 'Exposure',
            value: exposureParts.join(' • '),
            isSensitive: false,
            severity: 'LOW',
          });
        }
      }

      if (parsed.FocalLength) {
        items.push({
          id: 'optics-focal',
          category: 'optics',
          name: 'Focal Length',
          key: 'FocalLength',
          value: `${parsed.FocalLength} mm`,
          isSensitive: false,
          severity: 'LOW',
        });
      }

      if (parsed.thumbnail || parsed.ThumbnailImage || parsed.ThumbnailLength) {
        hasThumbnail = true;
        items.push({
          id: 'tech-thumbnail',
          category: 'technical',
          name: 'Embedded Thumbnail',
          key: 'ThumbnailImage',
          value: 'Cached unedited thumbnail bytes present',
          isSensitive: true,
          severity: 'MEDIUM',
        });
      }
    }
  } catch (err) {
    // exifr error fallback
  }

  // 2. Secondary fallback / supplement for JPEGs via piexif
  if ((ext === 'jpg' || ext === 'jpeg') && items.length === 0) {
    try {
      const bytes = new Uint8Array(buffer);
      let binaryStr = '';
      for (let i = 0; i < Math.min(bytes.length, 500000); i++) {
        binaryStr += String.fromCharCode(bytes[i]);
      }

      const exifObj = piexif.load(binaryStr);
      if (exifObj) {
        // GPS
        if (exifObj.GPS && Object.keys(exifObj.GPS).length > 0) {
          const latArr = exifObj.GPS[piexif.GPSIFD.GPSLatitude];
          const latRef = exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] || 'N';
          const lonArr = exifObj.GPS[piexif.GPSIFD.GPSLongitude];
          const lonRef = exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] || 'E';

          const lat = parsePiexifGpsCoord(latArr, latRef);
          const lon = parsePiexifGpsCoord(lonArr, lonRef);

          if (lat !== null && lon !== null) {
            const formattedLat = formatCoordinate(lat, true);
            const formattedLon = formatCoordinate(lon, false);
            const formattedText = `${formattedLat}, ${formattedLon}`;

            gpsInfo = {
              present: true,
              latitude: lat,
              longitude: lon,
              formattedText,
              details: 'WGS-84 Location Vector',
            };

            items.push({
              id: 'gps-coords-piexif',
              category: 'location',
              name: 'GPS Location',
              key: 'GPS',
              value: formattedText,
              isSensitive: true,
              severity: 'HIGH',
            });
          }
        }

        // Camera Make / Model
        if (exifObj['0th']) {
          const make = exifObj['0th'][piexif.ImageIFD.Make];
          const model = exifObj['0th'][piexif.ImageIFD.Model];
          const fullModel = [make, model].filter(Boolean).join(' ').trim();
          if (fullModel) {
            items.push({
              id: 'device-model-piexif',
              category: 'device',
              name: 'Camera Model',
              key: 'Make / Model',
              value: fullModel,
              isSensitive: false,
              severity: 'MEDIUM',
            });
          }

          const artist = exifObj['0th'][piexif.ImageIFD.Artist];
          if (artist && String(artist).trim()) {
            items.push({
              id: 'author-piexif',
              category: 'author',
              name: 'Author / Artist',
              key: 'Artist',
              value: String(artist).trim(),
              isSensitive: true,
              severity: 'HIGH',
            });
          }

          const software = exifObj['0th'][piexif.ImageIFD.Software];
          if (software && String(software).trim()) {
            items.push({
              id: 'software-piexif',
              category: 'software',
              name: 'Software / App',
              key: 'Software',
              value: String(software).trim(),
              isSensitive: false,
              severity: 'MEDIUM',
            });
          }
        }

        // Exif IFD
        if (exifObj.Exif) {
          const dateOrig = exifObj.Exif[piexif.ExifIFD.DateTimeOriginal] || exifObj.Exif[piexif.ExifIFD.DateTimeDigitized];
          if (dateOrig && String(dateOrig).trim() && !String(dateOrig).startsWith('1970')) {
            items.push({
              id: 'timestamp-piexif',
              category: 'timestamps',
              name: 'Date & Time',
              key: 'DateTimeOriginal',
              value: String(dateOrig).trim(),
              isSensitive: false,
              severity: 'MEDIUM',
            });
          }

          const serial = exifObj.Exif[piexif.ExifIFD.BodySerialNumber] || exifObj.Exif[piexif.ExifIFD.CameraOwnerName];
          if (serial && String(serial).trim()) {
            items.push({
              id: 'serial-piexif',
              category: 'device',
              name: 'Hardware Serial #',
              key: 'BodySerialNumber',
              value: String(serial).trim(),
              isSensitive: true,
              severity: 'HIGH',
            });
          }

          const lens = exifObj.Exif[piexif.ExifIFD.LensModel];
          if (lens && String(lens).trim()) {
            items.push({
              id: 'lens-piexif',
              category: 'device',
              name: 'Lens Model',
              key: 'LensModel',
              value: String(lens).trim(),
              isSensitive: false,
              severity: 'MEDIUM',
            });
          }
        }
      }
    } catch (e) {
      // piexif error ignore
    }
  }

  // 3. PNG Text & eXIf chunks
  if (ext === 'png') {
    const pngChunks = inspectPngChunks(new Uint8Array(buffer));
    for (const chunk of pngChunks) {
      if (!items.some(i => i.name === chunk.name)) {
        items.push({
          id: `png-${chunk.name.toLowerCase()}`,
          category: chunk.category,
          name: chunk.name,
          key: chunk.name,
          value: chunk.value,
          isSensitive: chunk.isSensitive,
          severity: chunk.severity,
        });
      }
    }
  }

  return { items, rawReport, gpsInfo, hasThumbnail, hasXmpStream, dimensions };
}

function inspectPngChunks(bytes: Uint8Array): Array<{ name: string; value: string; category: MetadataCategory; isSensitive: boolean; severity: RiskLevel }> {
  const result: Array<{ name: string; value: string; category: MetadataCategory; isSensitive: boolean; severity: RiskLevel }> = [];
  try {
    let offset = 8;
    const decoder = new TextDecoder('latin1');

    while (offset < bytes.length - 8) {
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

      if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
        const chunkData = bytes.subarray(offset + 8, offset + 8 + Math.min(length, 1024));
        const textStr = decoder.decode(chunkData);
        const nullIdx = textStr.indexOf('\0');
        const keyword = nullIdx !== -1 ? textStr.substring(0, nullIdx) : 'PNG Text';
        const val = nullIdx !== -1 ? textStr.substring(nullIdx + 1).trim() : textStr;

        if (val.trim()) {
          const isAuthor = /author|creator|artist|copyright/i.test(keyword);
          result.push({
            name: isAuthor ? 'Author / Creator' : 'PNG Text Attribute',
            value: val.substring(0, 150),
            category: isAuthor ? 'author' : 'document',
            isSensitive: isAuthor,
            severity: isAuthor ? 'HIGH' : 'MEDIUM',
          });
        }
      }

      offset += 12 + length;
    }
  } catch (err) {
    // Ignore chunk parsing errors
  }
  return result;
}

async function extractPdfMetadata(buffer: ArrayBuffer) {
  const items: MetadataItem[] = [];
  const rawReport: Record<string, any> = {};
  let hasThumbnail = false;
  let hasXmpStream = false;

  try {
    const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false, ignoreEncryption: true });

    const title = pdfDoc.getTitle()?.trim();
    const author = pdfDoc.getAuthor()?.trim();
    const subject = pdfDoc.getSubject()?.trim();
    const creator = pdfDoc.getCreator()?.trim();
    const producer = pdfDoc.getProducer()?.trim();
    const keywords = pdfDoc.getKeywords()?.trim();
    const creationDate = pdfDoc.getCreationDate();
    const modificationDate = pdfDoc.getModificationDate();

    if (author) {
      items.push({
        id: 'pdf-author',
        category: 'author',
        name: 'Author',
        key: 'Author',
        value: author,
        isSensitive: true,
        severity: 'HIGH',
      });
      rawReport.author = author;
    }

    if (title) {
      items.push({
        id: 'pdf-title',
        category: 'document',
        name: 'Title',
        key: 'Title',
        value: title,
        isSensitive: false,
        severity: 'LOW',
      });
      rawReport.title = title;
    }

    if (subject) {
      items.push({
        id: 'pdf-subject',
        category: 'document',
        name: 'Subject',
        key: 'Subject',
        value: subject,
        isSensitive: false,
        severity: 'LOW',
      });
      rawReport.subject = subject;
    }

    if (keywords) {
      items.push({
        id: 'pdf-keywords',
        category: 'document',
        name: 'Keywords',
        key: 'Keywords',
        value: keywords,
        isSensitive: false,
        severity: 'LOW',
      });
      rawReport.keywords = keywords;
    }

    if (creator) {
      items.push({
        id: 'pdf-creator',
        category: 'software',
        name: 'Application / Creator',
        key: 'Creator',
        value: creator,
        isSensitive: false,
        severity: 'MEDIUM',
      });
      rawReport.creator = creator;
    }

    if (producer) {
      items.push({
        id: 'pdf-producer',
        category: 'software',
        name: 'PDF Producer',
        key: 'Producer',
        value: producer,
        isSensitive: false,
        severity: 'MEDIUM',
      });
      rawReport.producer = producer;
    }

    if (creationDate && creationDate.getTime() > 86400000) {
      items.push({
        id: 'pdf-created',
        category: 'timestamps',
        name: 'Creation Date',
        key: 'CreationDate',
        value: creationDate.toISOString().replace('T', ' ').substring(0, 19),
        isSensitive: false,
        severity: 'MEDIUM',
      });
      rawReport.creationDate = creationDate;
    }

    if (modificationDate && modificationDate.getTime() > 86400000) {
      items.push({
        id: 'pdf-modified',
        category: 'timestamps',
        name: 'Modification Date',
        key: 'ModDate',
        value: modificationDate.toISOString().replace('T', ' ').substring(0, 19),
        isSensitive: false,
        severity: 'MEDIUM',
      });
      rawReport.modificationDate = modificationDate;
    }

    try {
      if (pdfDoc.catalog.has(PDFName.of('Metadata'))) {
        hasXmpStream = true;
        items.push({
          id: 'pdf-xmp',
          category: 'technical',
          name: 'XMP Metadata Stream',
          key: 'Metadata',
          value: 'Embedded XMP XML history stream',
          isSensitive: true,
          severity: 'MEDIUM',
        });
      }
    } catch (e) {}

  } catch (err) {
    console.warn('PDF extraction error:', err);
  }

  return { items, rawReport, hasThumbnail, hasXmpStream };
}

async function extractOfficeMetadata(buffer: ArrayBuffer) {
  const items: MetadataItem[] = [];
  const rawReport: Record<string, any> = {};
  let hasThumbnail = false;
  let hasRevisionHistory = false;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const parser = new DOMParser();

    // 1. docProps/core.xml
    const coreFile = zip.file('docProps/core.xml');
    if (coreFile) {
      const coreText = await coreFile.async('text');
      const coreXml = parser.parseFromString(coreText, 'application/xml');

      const getNodeVal = (tagName: string) => {
        const el = coreXml.getElementsByTagName(tagName)[0] || coreXml.querySelector(tagName);
        const text = el ? el.textContent?.trim() : undefined;
        return text && text.length > 0 ? text : undefined;
      };

      const creator = getNodeVal('dc:creator') || getNodeVal('creator');
      const lastModifiedBy = getNodeVal('cp:lastModifiedBy') || getNodeVal('lastModifiedBy');
      const revision = getNodeVal('cp:revision') || getNodeVal('revision');
      const created = getNodeVal('dcterms:created') || getNodeVal('created');
      const modified = getNodeVal('dcterms:modified') || getNodeVal('modified');
      const title = getNodeVal('dc:title') || getNodeVal('title');

      if (creator) {
        items.push({
          id: 'office-creator',
          category: 'author',
          name: 'Author',
          key: 'dc:creator',
          value: creator,
          isSensitive: true,
          severity: 'HIGH',
        });
        rawReport.creator = creator;
      }

      if (lastModifiedBy) {
        items.push({
          id: 'office-lastmodifiedby',
          category: 'author',
          name: 'Last Modified By',
          key: 'cp:lastModifiedBy',
          value: lastModifiedBy,
          isSensitive: true,
          severity: 'HIGH',
        });
        rawReport.lastModifiedBy = lastModifiedBy;
      }

      if (revision && revision !== '0' && revision !== '1') {
        hasRevisionHistory = true;
        items.push({
          id: 'office-revision',
          category: 'document',
          name: 'Revision Number',
          key: 'cp:revision',
          value: `Revision ${revision}`,
          isSensitive: false,
          severity: 'MEDIUM',
        });
      }

      if (created) {
        items.push({
          id: 'office-created',
          category: 'timestamps',
          name: 'Creation Date',
          key: 'dcterms:created',
          value: created,
          isSensitive: false,
          severity: 'MEDIUM',
        });
      }

      if (modified) {
        items.push({
          id: 'office-modified',
          category: 'timestamps',
          name: 'Modified Date',
          key: 'dcterms:modified',
          value: modified,
          isSensitive: false,
          severity: 'MEDIUM',
        });
      }

      if (title) {
        items.push({
          id: 'office-title',
          category: 'document',
          name: 'Title',
          key: 'dc:title',
          value: title,
          isSensitive: false,
          severity: 'LOW',
        });
      }
    }

    // 2. docProps/app.xml
    const appFile = zip.file('docProps/app.xml');
    if (appFile) {
      const appText = await appFile.async('text');
      const appXml = parser.parseFromString(appText, 'application/xml');

      const getNodeVal = (tagName: string) => {
        const el = appXml.getElementsByTagName(tagName)[0] || appXml.querySelector(tagName);
        const text = el ? el.textContent?.trim() : undefined;
        return text && text.length > 0 ? text : undefined;
      };

      const company = getNodeVal('Company');
      const manager = getNodeVal('Manager');
      const totalTime = getNodeVal('TotalTime');
      const application = getNodeVal('Application');

      if (company) {
        items.push({
          id: 'office-company',
          category: 'author',
          name: 'Company / Organization',
          key: 'Company',
          value: company,
          isSensitive: true,
          severity: 'HIGH',
        });
        rawReport.company = company;
      }

      if (manager) {
        items.push({
          id: 'office-manager',
          category: 'author',
          name: 'Manager',
          key: 'Manager',
          value: manager,
          isSensitive: true,
          severity: 'HIGH',
        });
      }

      if (totalTime && totalTime !== '0') {
        items.push({
          id: 'office-totaltime',
          category: 'document',
          name: 'Editing Time',
          key: 'TotalTime',
          value: `${totalTime} mins`,
          isSensitive: false,
          severity: 'MEDIUM',
        });
      }

      if (application) {
        items.push({
          id: 'office-application',
          category: 'software',
          name: 'Application',
          key: 'Application',
          value: application,
          isSensitive: false,
          severity: 'MEDIUM',
        });
      }
    }

    // 3. Thumbnails check
    const thumbFiles = Object.keys(zip.files).filter(path => /docProps\/thumbnail\.(jpeg|jpg|png|emf|wmf)$/i.test(path));
    if (thumbFiles.length > 0) {
      hasThumbnail = true;
      items.push({
        id: 'office-thumbnail',
        category: 'technical',
        name: 'Document Thumbnail',
        key: 'thumbnail',
        value: 'Snapshot of first page/slide',
        isSensitive: true,
        severity: 'MEDIUM',
      });
    }

    // 4. Comments check
    const commentFiles = Object.keys(zip.files).filter(path => /(word|xl|ppt)\/comments/i.test(path));
    if (commentFiles.length > 0) {
      hasRevisionHistory = true;
      items.push({
        id: 'office-comments',
        category: 'document',
        name: 'Comments & Reviews',
        key: 'comments',
        value: 'Contains author initials & comment threads',
        isSensitive: true,
        severity: 'HIGH',
      });
    }
  } catch (err) {
    console.warn('Office docs extraction error:', err);
  }

  return { items, rawReport, hasThumbnail, hasRevisionHistory };
}
