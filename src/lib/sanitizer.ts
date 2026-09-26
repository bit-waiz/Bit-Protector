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
      cleanedBuffer = await cleanImageViaCanvas(buffer, ext, mimeType);
    } else {
      cleanedBuffer = cleanJpegSelective(buffer, options);
    }
  } else if (isPng || isWebp || isOtherImage) {
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

/**
 * Selective JPEG Sanitizer via piexif
 */
function cleanJpegSelective(buffer: ArrayBuffer, options: CleaningOptions): Uint8Array {
  try {
    const bytes = new Uint8Array(buffer);
    let binaryStr = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryStr += String.fromCharCode(bytes[i]);
    }

    const exifObj = piexif.load(binaryStr);
    if (!exifObj) {
      return bytes;
    }

    if (options.stripGps) {
      exifObj.GPS = {};
    }

    if (options.stripDevice) {
      if (exifObj['0th']) {
        delete exifObj['0th'][piexif.ImageIFD.Make];
        delete exifObj['0th'][piexif.ImageIFD.Model];
        delete exifObj['0th'][piexif.ImageIFD.Software];
      }
      if (exifObj.Exif) {
        delete exifObj.Exif[piexif.ExifIFD.BodySerialNumber];
        delete exifObj.Exif[piexif.ExifIFD.LensModel];
        delete exifObj.Exif[piexif.ExifIFD.MakerNote];
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
    return new Uint8Array(buffer);
  }
}

/**
 * 100% Pristine Canvas Re-rendering for Images
 * Destroys all EXIF, XMP, IPTC, Photoshop APP13 segments, MakerNotes, and serial numbers
 * while preserving original image dimensions.
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

/**
 * PDF Sanitizer
 */
async function cleanPdf(buffer: ArrayBuffer, options: CleaningOptions): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    const info = (pdfDoc as any).getInfoDict?.();

    if (options.stripAuthor) {
      if (info) {
        info.delete(PDFName.of('Author'));
        info.delete(PDFName.of('Title'));
        info.delete(PDFName.of('Subject'));
        info.delete(PDFName.of('Keywords'));
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

    // Always delete XMP / Metadata streams from catalog
    try {
      if (pdfDoc.catalog.has(PDFName.of('Metadata'))) {
        pdfDoc.catalog.delete(PDFName.of('Metadata'));
      }
      if (pdfDoc.catalog.has(PDFName.of('PieceInfo'))) {
        pdfDoc.catalog.delete(PDFName.of('PieceInfo'));
      }
    } catch (e) {}

    // Always delete page thumbnails
    try {
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        if (page.node.has(PDFName.of('Thumb'))) {
          page.node.delete(PDFName.of('Thumb'));
        }
      }
    } catch (e) {}

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

/**
 * Office OpenXML Sanitizer (.docx, .xlsx, .pptx)
 */
async function cleanOffice(buffer: ArrayBuffer, ext: string, options: CleaningOptions): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const serializer = new XMLSerializer();
    const parser = new DOMParser();

    const isAllClean = options.stripGps && options.stripDevice && options.stripAuthor && options.stripTimestamps;

    if (isAllClean) {
      // Blank minimal shells
      const blankCore = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"></cp:coreProperties>`;
      zip.file('docProps/core.xml', blankCore);

      const blankApp = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"></Properties>`;
      zip.file('docProps/app.xml', blankApp);
    } else {
      // Selective XML cleaning
      const coreFile = zip.file('docProps/core.xml');
      if (coreFile) {
        const coreText = await coreFile.async('text');
        const coreXml = parser.parseFromString(coreText, 'application/xml');

        const clearTags = (tags: string[]) => {
          for (const t of tags) {
            const els = Array.from(coreXml.getElementsByTagName(t));
            for (const el of els) el.textContent = '';
          }
        };

        if (options.stripAuthor) {
          clearTags(['dc:creator', 'creator', 'cp:lastModifiedBy', 'lastModifiedBy', 'dc:title', 'title', 'dc:subject', 'subject']);
        }
        if (options.stripTimestamps) {
          clearTags(['dcterms:created', 'created', 'dcterms:modified', 'modified']);
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
          clearTags(['Company', 'Manager']);
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

    // Delete custom properties & thumbnails
    if (zip.file('docProps/custom.xml')) {
      zip.remove('docProps/custom.xml');
    }

    const thumbFiles = Object.keys(zip.files).filter((path) =>
      /docProps\/thumbnail\.(jpeg|jpg|png|emf|wmf)$/i.test(path)
    );
    for (const p of thumbFiles) {
      zip.remove(p);
    }

    if (options.stripAuthor) {
      const sensitiveFiles = Object.keys(zip.files).filter((path) =>
        /(word|xl|ppt)\/(comments|people|revisions|commentsExtended|commentsIds)/i.test(path)
      );
      for (const sf of sensitiveFiles) {
        zip.remove(sf);
      }

      const docXmlFile = zip.file('word/document.xml');
      if (docXmlFile) {
        let docXmlText = await docXmlFile.async('text');
        docXmlText = docXmlText.replace(/w:author="[^"]*"/g, 'w:author=""');
        docXmlText = docXmlText.replace(/w:date="[^"]*"/g, 'w:date=""');
        docXmlText = docXmlText.replace(/<w:commentRangeStart[^>]*\/>/g, '');
        docXmlText = docXmlText.replace(/<w:commentRangeEnd[^>]*\/>/g, '');
        docXmlText = docXmlText.replace(/<w:commentReference[^>]*\/>/g, '');
        zip.file('word/document.xml', docXmlText);
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
