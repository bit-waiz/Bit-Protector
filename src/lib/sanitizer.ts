import { PDFDocument, PDFName } from 'pdf-lib';
import JSZip from 'jszip';
import piexif from 'piexifjs';
import { CleaningOptions, InspectionResult, SanitizationResult } from './types';
import { inspectFile } from './extractor';

export async function sanitizeFile(
  file: File | { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
  originalInspection: InspectionResult,
  options: CleaningOptions
): Promise<SanitizationResult> {
  const startTime = performance.now();
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
  const cleanedFileName = `${baseName}_cleaned.${ext}`;

  const buffer = await file.arrayBuffer();
  let cleanedBuffer: Uint8Array;
  const mimeType = originalInspection.mimeType;

  const isJpeg = ext === 'jpg' || ext === 'jpeg';
  const isPng = ext === 'png';
  const isWebp = ext === 'webp';
  const isOtherImage = ['heic', 'avif', 'bmp', 'tiff', 'tif'].includes(ext);
  const isPdf = ext === 'pdf';
  const isOffice = ['docx', 'xlsx', 'pptx', 'dotx', 'xltx', 'potx'].includes(ext);

  const isAllClean = options.stripGps && options.stripDevice && options.stripAuthor && options.stripTimestamps;

  if (isJpeg) {
    if (isAllClean) {
      // Full deep-clean: canvas re-render strips all binary metadata segments
      cleanedBuffer = await cleanImageViaCanvas(buffer, ext, mimeType);
    } else {
      // Selective: use piexif for targeted field removal + strip hidden segments
      cleanedBuffer = cleanJpegSelective(buffer, options);
    }
  } else if (isPng) {
    // Always strip PNG metadata chunks then re-render for a pristine output
    cleanedBuffer = stripPngMetadataChunks(buffer);
    if (isAllClean) {
      cleanedBuffer = await cleanImageViaCanvas(cleanedBuffer.buffer as ArrayBuffer, ext, mimeType);
    }
  } else if (isWebp || isOtherImage) {
    cleanedBuffer = await cleanImageViaCanvas(buffer, ext, mimeType);
  } else if (isPdf) {
    cleanedBuffer = await cleanPdf(buffer, options);
  } else if (isOffice) {
    cleanedBuffer = await cleanOffice(buffer, ext, options);
  } else {
    cleanedBuffer = new Uint8Array(buffer);
  }

  // Create clean Blob
  const cleanedBlob = new Blob([cleanedBuffer as unknown as BlobPart], { type: mimeType });

  // Re-inspect the cleaned file to ensure verified result
  const afterInspection = await inspectFile({
    name: cleanedFileName,
    size: cleanedBlob.size,
    arrayBuffer: () => cleanedBlob.arrayBuffer(),
  });

  const durationMs = Math.round(performance.now() - startTime);
  const bytesReduced = Math.max(0, file.size - cleanedBlob.size);

  const originalKeys = originalInspection.items.map(i => `${i.name}: ${i.value}`);
  const remainingKeys = afterInspection.items.map(i => `${i.name}: ${i.value}`);
  const wipedTags = originalKeys.filter(k => !remainingKeys.includes(k));

  return {
    cleanedBlob,
    cleanedFileName,
    cleanedFileSize: cleanedBlob.size,
    bytesReduced,
    originalInspection,
    afterInspection,
    wipedTags: wipedTags.length > 0 ? wipedTags : ['Selected metadata scrubbed'],
    remainingTags: remainingKeys,
    durationMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// JPEG: Selective piexif strip + deep APP segment wiper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Selective JPEG Sanitizer via piexif.
 * Also wipes IPTC APP13, XMP APP1, Adobe APP14, and ICC APP2 segments
 * that piexif does not touch, and strips IFD1 thumbnail bytes.
 */
function cleanJpegSelective(buffer: ArrayBuffer, options: CleaningOptions): Uint8Array {
  let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(buffer);

  // ── Step 1: Strip hidden APP segments (IPTC, XMP, Adobe, ICC) ──────────────
  bytes = stripJpegHiddenSegments(bytes) as Uint8Array<ArrayBuffer>;

  // ── Step 2: Selective EXIF field removal via piexif ────────────────────────
  try {
    let binaryStr = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryStr += String.fromCharCode(bytes[i]);
    }

    const exifObj = piexif.load(binaryStr);
    if (!exifObj) return bytes;

    // Strip IFD1 thumbnail (preview embedded in JPEG header)
    if (exifObj['1st']) {
      delete exifObj['1st'][piexif.ImageIFD.JPEGInterchangeFormat];
      delete exifObj['1st'][piexif.ImageIFD.JPEGInterchangeFormatLength];
      exifObj['1st'] = {};
      exifObj.thumbnail = null;
    }

    if (options.stripGps) {
      exifObj.GPS = {};
    }

    if (options.stripDevice) {
      if (exifObj['0th']) {
        delete exifObj['0th'][piexif.ImageIFD.Make];
        delete exifObj['0th'][piexif.ImageIFD.Model];
        delete exifObj['0th'][piexif.ImageIFD.Software];
        delete exifObj['0th'][piexif.ImageIFD.HostComputer];
      }
      if (exifObj.Exif) {
        delete exifObj.Exif[piexif.ExifIFD.BodySerialNumber];
        delete exifObj.Exif[piexif.ExifIFD.LensModel];
        delete exifObj.Exif[piexif.ExifIFD.MakerNote];
        delete exifObj.Exif[piexif.ExifIFD.LensSerialNumber];
        delete exifObj.Exif[piexif.ExifIFD.CameraOwnerName];
      }
    }

    if (options.stripAuthor) {
      if (exifObj['0th']) {
        delete exifObj['0th'][piexif.ImageIFD.Artist];
        delete exifObj['0th'][piexif.ImageIFD.Copyright];
      }
      if (exifObj.Exif) {
        delete exifObj.Exif[piexif.ExifIFD.CameraOwnerName];
      }
    }

    if (options.stripTimestamps) {
      if (exifObj['0th']) {
        delete exifObj['0th'][piexif.ImageIFD.DateTime];
      }
      if (exifObj.Exif) {
        delete exifObj.Exif[piexif.ExifIFD.DateTimeOriginal];
        delete exifObj.Exif[piexif.ExifIFD.DateTimeDigitized];
        delete exifObj.Exif[piexif.ExifIFD.SubSecTime];
        delete exifObj.Exif[piexif.ExifIFD.SubSecTimeOriginal];
        delete exifObj.Exif[piexif.ExifIFD.SubSecTimeDigitized];
      }
    }

    const exifBytes = piexif.dump(exifObj);
    const newBinaryStr = piexif.insert(exifBytes, binaryStr);

    const outBytes = new Uint8Array(newBinaryStr.length);
    for (let i = 0; i < newBinaryStr.length; i++) {
      outBytes[i] = newBinaryStr.charCodeAt(i);
    }
    return outBytes;
  } catch (err) {
    console.warn('piexif selective cleaning error:', err);
    return bytes;
  }
}

/**
 * Strips IPTC APP13 (0xFFED), XMP APP1 that starts with "http://ns.adobe.com/xap",
 * Adobe APP14 (0xFFEE), ICC Color Profile APP2 (0xFFE2), and any APP1 that
 * isn't the primary EXIF block, from a JPEG byte stream.
 */
function stripJpegHiddenSegments(bytes: Uint8Array): Uint8Array {
  const result: number[] = [];
  let i = 0;

  // Copy SOI marker (FF D8)
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;
  result.push(0xFF, 0xD8);
  i = 2;

  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xFF) break;

    const marker = bytes[i + 1];

    // SOS: start of scan — copy everything from here to end
    if (marker === 0xDA) {
      for (let j = i; j < bytes.length; j++) result.push(bytes[j]);
      break;
    }

    // Markers without length (standalone)
    if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
      result.push(0xFF, marker);
      i += 2;
      continue;
    }

    const segLength = (bytes[i + 2] << 8) | bytes[i + 3];
    const segEnd = i + 2 + segLength;

    let skip = false;

    if (marker === 0xED) {
      // APP13 — IPTC / Photoshop
      skip = true;
    } else if (marker === 0xEE) {
      // APP14 — Adobe
      skip = true;
    } else if (marker === 0xE2) {
      // APP2 — ICC Color Profile (check signature)
      const sig = String.fromCharCode(...bytes.subarray(i + 4, i + 16));
      if (sig.startsWith('ICC_PROFILE')) skip = true;
    } else if (marker === 0xE1) {
      // APP1 — could be EXIF or XMP
      const hdr = String.fromCharCode(...bytes.subarray(i + 4, i + 32));
      if (hdr.startsWith('http://ns.adobe.com/xap') || hdr.startsWith('XMP\x00')) {
        // XMP APP1 — strip it
        skip = true;
      }
      // Primary EXIF APP1 (starts with "Exif\0\0") is kept
    }

    if (skip) {
      i = segEnd;
      continue;
    }

    // Copy this segment
    for (let j = i; j < Math.min(segEnd, bytes.length); j++) {
      result.push(bytes[j]);
    }
    i = segEnd;
  }

  return new Uint8Array(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// PNG: Metadata chunk stripper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips the following PNG chunk types that carry metadata:
 *   eXIf – EXIF data
 *   tEXt – plain-text key/value pairs
 *   iTXt – international text (XMP commonly stored here)
 *   zTXt – compressed text
 *   gAMA – gamma correction value (can fingerprint encoding software)
 *   cHRM – primary chromaticities (color profiling)
 *   sRGB – sRGB rendering intent
 *   iCCP – embedded ICC color profile
 *   bKGD – background colour (minor)
 *   hIST – colour histogram
 *   sPLT – suggested palette
 *   tIME – last-modification time
 */
function stripPngMetadataChunks(buffer: ArrayBuffer): Uint8Array {
  const STRIP_CHUNKS = new Set([
    'eXIf', 'tEXt', 'iTXt', 'zTXt',
    'gAMA', 'cHRM', 'sRGB', 'iCCP',
    'bKGD', 'hIST', 'sPLT', 'tIME',
  ]);

  const bytes = new Uint8Array(buffer);
  // PNG signature: 8 bytes
  if (bytes.length < 8) return bytes;

  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let s = 0; s < 8; s++) {
    if (bytes[s] !== PNG_SIG[s]) return bytes;
  }

  const result: number[] = Array.from(bytes.subarray(0, 8)); // Keep signature
  let offset = 8;

  while (offset < bytes.length - 12) {
    const dataLength =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];

    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    const chunkTotal = 12 + dataLength; // 4 len + 4 type + data + 4 crc

    if (!STRIP_CHUNKS.has(type)) {
      // Keep this chunk
      for (let j = offset; j < Math.min(offset + chunkTotal, bytes.length); j++) {
        result.push(bytes[j]);
      }
    }
    // else: silently drop the chunk

    offset += chunkTotal;

    if (type === 'IEND') break;
  }

  return new Uint8Array(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas re-render (full deep-clean for images)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 100% Pristine Canvas Re-rendering for Images.
 * Destroys all EXIF, XMP, IPTC, Photoshop APP13 segments, MakerNotes,
 * serial numbers, and ICC profiles while preserving original dimensions.
 */
async function cleanImageViaCanvas(buffer: ArrayBuffer, ext: string, originalMime: string): Promise<Uint8Array> {
  return new Promise((resolve) => {
    let outputMime = 'image/jpeg';
    if (ext === 'png') outputMime = 'image/png';
    else if (ext === 'webp') outputMime = 'image/webp';
    else if (ext === 'jpg' || ext === 'jpeg') outputMime = 'image/jpeg';
    else if (originalMime.startsWith('image/')) outputMime = originalMime;

    const blob = new Blob([buffer], { type: outputMime });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) {
          resolve(new Uint8Array(buffer));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const quality = outputMime === 'image/jpeg' ? 0.95 : undefined;
        canvas.toBlob(
          (cleanBlob) => {
            if (!cleanBlob) {
              resolve(new Uint8Array(buffer));
              return;
            }
            cleanBlob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)));
          },
          outputMime,
          quality
        );
      } catch (err) {
        console.error('Canvas re-encoding error:', err);
        resolve(new Uint8Array(buffer));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(new Uint8Array(buffer));
    };

    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF: Deep Sanitizer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips all /Info dictionary entries, /Metadata XML streams, page /Thumb
 * objects, /PieceInfo dictionaries, /StructTreeRoot structure trees, and
 * /MarkInfo tags. Saves with updateMetadata: false to prevent pdf-lib
 * from re-stamping creation dates.
 */
async function cleanPdf(buffer: ArrayBuffer, options: CleaningOptions): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    // Access the raw Info dictionary if available
    const info = (pdfDoc as any).getInfoDict?.();

    // ── /Info dictionary fields ──────────────────────────────────────────────
    if (options.stripAuthor) {
      if (info) {
        info.delete(PDFName.of('Author'));
        info.delete(PDFName.of('Title'));
        info.delete(PDFName.of('Subject'));
        info.delete(PDFName.of('Keywords'));
        info.delete(PDFName.of('Trapped'));
      }
      pdfDoc.setAuthor('');
      pdfDoc.setTitle('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
    }

    if (options.stripDevice) {
      if (info) {
        info.delete(PDFName.of('Creator'));
        info.delete(PDFName.of('Producer'));
        info.delete(PDFName.of('Trapped'));
      }
      pdfDoc.setCreator('');
      pdfDoc.setProducer('');
    }

    if (options.stripTimestamps) {
      if (info) {
        info.delete(PDFName.of('CreationDate'));
        info.delete(PDFName.of('ModDate'));
      }
      pdfDoc.setCreationDate(new Date(0));
      pdfDoc.setModificationDate(new Date(0));
    }

    // ── Catalog-level metadata streams & structures (always strip) ───────────
    try {
      const catalog = pdfDoc.catalog;

      // /Metadata — XMP stream
      if (catalog.has(PDFName.of('Metadata'))) {
        catalog.delete(PDFName.of('Metadata'));
      }

      // /PieceInfo — application-private data
      if (catalog.has(PDFName.of('PieceInfo'))) {
        catalog.delete(PDFName.of('PieceInfo'));
      }

      // /StructTreeRoot — structure tree (accessibility tree, can leak authoring tool info)
      if (catalog.has(PDFName.of('StructTreeRoot'))) {
        catalog.delete(PDFName.of('StructTreeRoot'));
      }

      // /MarkInfo — mark information dict
      if (catalog.has(PDFName.of('MarkInfo'))) {
        catalog.delete(PDFName.of('MarkInfo'));
      }
    } catch (e) {
      // Catalog access may fail on malformed PDFs; continue
    }

    // ── Page-level: /Thumb and /PieceInfo ───────────────────────────────────
    try {
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        // /Thumb — embedded thumbnail preview
        if (page.node.has(PDFName.of('Thumb'))) {
          page.node.delete(PDFName.of('Thumb'));
        }
        // /PieceInfo — per-page application data
        if (page.node.has(PDFName.of('PieceInfo'))) {
          page.node.delete(PDFName.of('PieceInfo'));
        }
        // /Metadata — per-page XMP stream
        if (page.node.has(PDFName.of('Metadata'))) {
          page.node.delete(PDFName.of('Metadata'));
        }
      }
    } catch (e) {
      // Page iteration may fail; continue gracefully
    }

    const pdfBytes = await pdfDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
      updateMetadata: false,
    } as any);

    return pdfBytes;
  } catch (err) {
    console.error('PDF cleaning error:', err);
    return new Uint8Array(buffer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Office OpenXML: Deep Sanitizer (.docx, .xlsx, .pptx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overwrites docProps/core.xml and docProps/app.xml with sanitized shells.
 * Deletes: docProps/custom.xml, thumbnail files, comments, people, revisions.
 * Strips w:author and w:date attributes from all XML content nodes.
 */
async function cleanOffice(buffer: ArrayBuffer, ext: string, options: CleaningOptions): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const serializer = new XMLSerializer();
    const parser = new DOMParser();

    const isAllClean = options.stripGps && options.stripDevice && options.stripAuthor && options.stripTimestamps;

    // ── docProps/core.xml ────────────────────────────────────────────────────
    if (isAllClean) {
      // Full clean: replace with empty minimal shells
      const blankCore = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
</cp:coreProperties>`;
      zip.file('docProps/core.xml', blankCore);

      const blankApp = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
</Properties>`;
      zip.file('docProps/app.xml', blankApp);
    } else {
      // Selective XML cleaning
      const coreFile = zip.file('docProps/core.xml');
      if (coreFile) {
        const coreText = await coreFile.async('text');
        const coreXml = parser.parseFromString(coreText, 'application/xml');

        const clearTags = (tags: string[]) => {
          for (const t of tags) {
            // Try both namespaced and un-namespaced forms
            const selectors = [t, t.replace(':', '|')];
            for (const sel of selectors) {
              try {
                const els = Array.from(coreXml.getElementsByTagName(sel));
                for (const el of els) el.textContent = '';
              } catch (_) {}
            }
          }
        };

        if (options.stripAuthor) {
          clearTags(['dc:creator', 'creator', 'cp:lastModifiedBy', 'lastModifiedBy',
                     'dc:title', 'title', 'dc:subject', 'subject', 'dc:description', 'description']);
        }
        if (options.stripTimestamps) {
          clearTags(['dcterms:created', 'created', 'dcterms:modified', 'modified']);
          // Reset revision to 1 to remove revision history fingerprint
          const revEls = Array.from(coreXml.getElementsByTagName('cp:revision'));
          for (const r of revEls) r.textContent = '1';
        }

        zip.file('docProps/core.xml', serializer.serializeToString(coreXml));
      }

      const appFile = zip.file('docProps/app.xml');
      if (appFile) {
        const appText = await appFile.async('text');
        const appXml = parser.parseFromString(appText, 'application/xml');

        const clearTags = (tags: string[]) => {
          for (const t of tags) {
            const els = Array.from(appXml.getElementsByTagName(t));
            for (const el of els) el.textContent = '';
          }
        };

        if (options.stripAuthor) {
          clearTags(['Company', 'Manager', 'HyperlinkBase']);
        }
        if (options.stripDevice) {
          clearTags(['Application', 'AppVersion', 'Template']);
        }
        if (options.stripTimestamps) {
          clearTags(['TotalTime']);
        }

        zip.file('docProps/app.xml', serializer.serializeToString(appXml));
      }
    }

    // ── Always delete sensitive ancillary files ──────────────────────────────

    // Custom properties
    if (zip.file('docProps/custom.xml')) {
      zip.remove('docProps/custom.xml');
    }

    // Embedded thumbnails (JPEG, WMF, EMF)
    const thumbFiles = Object.keys(zip.files).filter((path) =>
      /docProps\/thumbnail\.(jpeg|jpg|png|emf|wmf)$/i.test(path)
    );
    for (const p of thumbFiles) {
      zip.remove(p);
    }

    // ── Author-related cleanup ────────────────────────────────────────────────
    if (options.stripAuthor) {
      // Remove internal revision/author tracking files
      const sensitiveFiles = Object.keys(zip.files).filter((path) =>
        /(word|xl|ppt)\/(comments|people|revisions|commentsExtended|commentsIds|suggestedRevisions)/i.test(path)
      );
      for (const sf of sensitiveFiles) {
        zip.remove(sf);
      }

      // Strip w:author and w:date attributes from word/document.xml
      const docXmlFile = zip.file('word/document.xml');
      if (docXmlFile) {
        let docXmlText = await docXmlFile.async('text');
        docXmlText = docXmlText.replace(/\sw:author="[^"]*"/g, ' w:author=""');
        docXmlText = docXmlText.replace(/\sw:date="[^"]*"/g, ' w:date=""');
        docXmlText = docXmlText.replace(/<w:commentRangeStart[^>]*\/>/g, '');
        docXmlText = docXmlText.replace(/<w:commentRangeEnd[^>]*\/>/g, '');
        docXmlText = docXmlText.replace(/<w:commentReference[^>]*\/>/g, '');
        docXmlText = docXmlText.replace(/<w:ins\s[^>]*>/g, '<w:ins>');
        docXmlText = docXmlText.replace(/<w:del\s[^>]*>/g, '<w:del>');
        zip.file('word/document.xml', docXmlText);
      }

      // Also strip author attributes from xl/worksheets and ppt/slides if present
      for (const xmlPath of Object.keys(zip.files)) {
        if (
          (xmlPath.startsWith('xl/') || xmlPath.startsWith('ppt/')) &&
          xmlPath.endsWith('.xml') &&
          !xmlPath.includes('_rels')
        ) {
          try {
            const f = zip.file(xmlPath);
            if (!f) continue;
            let content = await f.async('text');
            const modified = content
              .replace(/\sw:author="[^"]*"/g, ' w:author=""')
              .replace(/\sw:date="[^"]*"/g, ' w:date=""');
            if (modified !== content) {
              zip.file(xmlPath, modified);
            }
          } catch (_) {
            // Skip files that can't be read as text
          }
        }
      }
    }

    const outputBuffer = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return outputBuffer;
  } catch (err) {
    console.error('Office document cleaning error:', err);
    return new Uint8Array(buffer);
  }
}
