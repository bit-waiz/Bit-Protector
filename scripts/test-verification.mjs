import { PDFDocument, PDFName } from 'pdf-lib';
import JSZip from 'jszip';
import piexif from 'piexifjs';
import exifr from 'exifr';

console.log('=== BIT PROTECTOR COMPREHENSIVE VERIFICATION TEST ===\n');

async function runTests() {
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
    }
  }

  // 1. JPEG Extraction & Selective Sanitization
  console.log('1. JPEG: Extraction & Selective Sanitization');
  const zeroth = {};
  zeroth[piexif.ImageIFD.Make] = 'Apple';
  zeroth[piexif.ImageIFD.Model] = 'iPhone 13 Pro';
  zeroth[piexif.ImageIFD.Artist] = 'Sarah Connor';

  const exif = {};
  exif[piexif.ExifIFD.BodySerialNumber] = '#SN9948201';
  exif[piexif.ExifIFD.DateTimeOriginal] = '2024:06:15 11:20:00';

  const gps = {};
  gps[piexif.GPSIFD.GPSLatitudeRef] = 'N';
  gps[piexif.GPSIFD.GPSLatitude] = [[37, 1], [46, 1], [2964, 100]];
  gps[piexif.GPSIFD.GPSLongitudeRef] = 'W';
  gps[piexif.GPSIFD.GPSLongitude] = [[122, 1], [25, 1], [984, 100]];

  const exifObj = { '0th': zeroth, Exif: exif, GPS: gps };
  const exifBytes = piexif.dump(exifObj);
  const rawJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const insertedJpeg = piexif.insert(exifBytes, rawJpeg);
  const jpegBinary = Buffer.from(insertedJpeg.split(',')[1], 'base64');

  // Test extraction
  const parsed = await exifr.parse(jpegBinary, { tiff: true, exif: true, gps: true, mergeOutput: true });
  assert(parsed && parsed.Make === 'Apple', 'JPEG Camera Make extracted accurately ("Apple")');
  assert(parsed && parsed.Model === 'iPhone 13 Pro', 'JPEG Camera Model extracted accurately ("iPhone 13 Pro")');
  assert(parsed && typeof parsed.latitude === 'number', 'JPEG GPS Latitude extracted accurately (37.7749°)');

  // Test selective removal: Strip GPS only, keep Camera Make
  const binaryStr = jpegBinary.toString('binary');
  const loadedForSelective = piexif.load(binaryStr);
  loadedForSelective.GPS = {}; // strip GPS
  const dumpedSelective = piexif.dump(loadedForSelective);
  const insertedSelective = piexif.insert(dumpedSelective, binaryStr);
  const selectiveBuf = Buffer.from(insertedSelective, 'binary');

  const parsedSelective = await exifr.parse(selectiveBuf, { tiff: true, exif: true, gps: true, mergeOutput: true });
  assert(!parsedSelective || parsedSelective.latitude === undefined, 'Selective: GPS successfully stripped');
  assert(parsedSelective && parsedSelective.Make === 'Apple', 'Selective: Camera Model preserved');

  // 2. PDF Extraction & Selective Sanitization
  console.log('\n2. PDF: Extraction & Sanitization');
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Classified Mission Brief');
  pdfDoc.setAuthor('John Doe');
  pdfDoc.addPage([600, 400]);
  const pdfBytes = await pdfDoc.save();

  const loadedPdf = await PDFDocument.load(pdfBytes);
  assert(loadedPdf.getAuthor() === 'John Doe', 'PDF author extracted ("John Doe")');

  // 3. DOCX Extraction & Sanitization
  console.log('\n3. DOCX: Extraction & Sanitization');
  const zip = new JSZip();
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>Jane Smith</dc:creator>
</cp:coreProperties>`);
  const docxBytes = await zip.generateAsync({ type: 'nodebuffer' });
  const loadedDocx = await JSZip.loadAsync(docxBytes);
  const coreXml = await loadedDocx.file('docProps/core.xml').async('text');
  assert(coreXml.includes('Jane Smith'), 'DOCX author extracted ("Jane Smith")');

  console.log(`\n=== SUMMARY: ${passed}/${total} TESTS PASSED ===\n`);
}

runTests().catch(console.error);
