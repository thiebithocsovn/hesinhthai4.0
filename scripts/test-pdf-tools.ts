import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import {
  createSinglePageRanges,
  createSplitPdfFileName,
  createStoredZip,
  parsePdfPageRanges,
  splitPdfByRanges,
} from '../src/lib/pdfTools';

let checks = 0;

function verify(condition: unknown, description: string): void {
  assert.ok(condition, description);
  checks += 1;
}

function verifyEqual(actual: unknown, expected: unknown, description: string): void {
  assert.deepEqual(actual, expected, description);
  checks += 1;
}

const parsed = parsePdfPageRanges('1-3, 5, 6-7', 8);
verifyEqual(parsed, [
  { start: 1, end: 3 },
  { start: 5, end: 5 },
  { start: 6, end: 7 },
], 'The page parser accepts individual pages and comma-separated ranges.');

verifyEqual(parsePdfPageRanges(' 2 ; 4 - 6\n8 ', 8), [
  { start: 2, end: 2 },
  { start: 4, end: 6 },
  { start: 8, end: 8 },
], 'Page ranges also accept whitespace, semicolons, and line breaks.');

for (const invalid of ['', '0', '9', '3-2', '1-a', '1,,3', '-1', '1-9']) {
  assert.throws(() => parsePdfPageRanges(invalid, 8), Error, `Invalid page selection ${JSON.stringify(invalid)} must fail safely.`);
  checks += 1;
}

assert.throws(() => createSinglePageRanges(0), Error, 'A PDF without pages is rejected.');
checks += 1;

verifyEqual(createSinglePageRanges(3), [
  { start: 1, end: 1 },
  { start: 2, end: 2 },
  { start: 3, end: 3 },
], 'Every-page mode generates one isolated output per page.');

verifyEqual(createSplitPdfFileName('Đề kiểm tra.pdf', { start: 2, end: 4 }), 'Đề_kiểm_tra_trang_2-4.pdf', 'Vietnamese file names remain readable.');
verifyEqual(createSplitPdfFileName('../../secret.pdf', { start: 1, end: 1 }), '_.._secret_trang_1.pdf', 'Unsafe file-name path segments are sanitized.');

const original = await PDFDocument.create();
for (let page = 1; page <= 8; page += 1) {
  original.addPage([200 + page * 10, 300 + page * 10]);
}
const sourceBytes = await original.save();

const separated = await splitPdfByRanges(sourceBytes, 'Đề thi.pdf', parsed);
verifyEqual(separated.length, 3, 'Each selected page range produces a separate PDF.');
verifyEqual(separated.map(result => result.pageNumbers), [[1, 2, 3], [5], [6, 7]], 'Split files retain the requested source-page ordering.');
verifyEqual(separated.map(result => result.fileName), [
  'Đề_thi_trang_1-3.pdf',
  'Đề_thi_trang_5.pdf',
  'Đề_thi_trang_6-7.pdf',
], 'Split outputs receive descriptive, collision-resistant download names.');

for (let index = 0; index < separated.length; index += 1) {
  const document = await PDFDocument.load(separated[index].bytes);
  verifyEqual(document.getPageCount(), separated[index].pageNumbers.length, 'The generated PDF contains exactly the requested number of pages.');
  verifyEqual(document.getPage(0).getWidth(), 200 + separated[index].pageNumbers[0] * 10, 'Copied PDF pages preserve the original page dimensions.');
}

const combined = await splitPdfByRanges(sourceBytes, 'Đề thi.pdf', [
  { start: 1, end: 2 },
  { start: 2, end: 2 },
  { start: 6, end: 7 },
], true);
verifyEqual(combined.length, 1, 'Extract-selected mode creates one PDF document.');
verifyEqual(combined[0].pageNumbers, [1, 2, 6, 7], 'Repeated selected pages are not accidentally duplicated.');
verifyEqual(combined[0].fileName, 'Đề_thi_trang_da_chon.pdf', 'The combined selection receives a clear download name.');
verifyEqual((await PDFDocument.load(combined[0].bytes)).getPageCount(), 4, 'The combined extraction remains a valid readable PDF.');

await assert.rejects(() => splitPdfByRanges(sourceBytes, 'exam.pdf', []), Error, 'Splitting requires at least one selected range.');
checks += 1;
await assert.rejects(() => splitPdfByRanges(sourceBytes, 'exam.pdf', [{ start: 1, end: 20 }]), Error, 'Out-of-bounds ranges are rejected before creating output.');
checks += 1;

const zip = createStoredZip(separated.map(result => ({ fileName: result.fileName, bytes: result.bytes })));
const zipView = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
verifyEqual(zipView.getUint32(0, true), 0x04034b50, 'The ZIP archive begins with a valid local file header.');
verifyEqual(zipView.getUint32(zip.length - 22, true), 0x06054b50, 'The ZIP archive ends with a valid central-directory record.');
verifyEqual(zipView.getUint16(zip.length - 12, true), separated.length, 'The ZIP central directory records every extracted PDF.');
verifyEqual(zipView.getUint16(6, true), 0x0800, 'Vietnamese ZIP filenames are explicitly encoded as UTF-8.');
assert.throws(() => createStoredZip([]), Error, 'An empty PDF archive is rejected.');
checks += 1;

const component = readFileSync(new URL('../src/components/PdfMerger.tsx', import.meta.url), 'utf8');
const ecosystem = readFileSync(new URL('../src/ecosystem.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

verify(component.includes('Tách, gộp file PDF'), 'The PDF tool displays the requested application name.');
verify(component.includes("label: 'Tách file PDF'"), 'The interface exposes a distinct PDF-splitting tab.');
verify(component.includes("label: 'Gộp file PDF'"), 'The existing PDF-merging flow remains available.');
verify(component.includes('Tách từng trang'), 'Teachers can split every page into its own document.');
verify(component.includes('Tách theo khoảng trang'), 'Teachers can split by custom page ranges.');
verify(component.includes('Trích các trang đã chọn'), 'Teachers can extract selected pages into one PDF.');
verify(component.includes('Tải tất cả dưới dạng ZIP'), 'Multiple extracted documents can be downloaded together.');
verify(component.includes('onDrop='), 'Teachers can drag and drop PDF documents into the tool.');
verify(component.includes('moveFile(index, -1)') && component.includes('moveFile(index, 1)'), 'Merge input files can be reordered safely.');
verify(!component.includes('fetch(') && !component.includes('firebase/firestore'), 'PDF documents never leave the browser or consume Firestore capacity.');
verify(ecosystem.includes("name: 'Tách, gộp file PDF'"), 'The public homepage catalog uses the new application name.');
verify(dashboard.includes('>Tách, gộp file PDF</h3>'), 'The teacher application library uses the new application name.');
verify(Boolean(manifest.dependencies['pdf-lib']), 'The implementation reuses the existing installed PDF library.');
verify(manifest.scripts['test:pdf'] === 'node --import tsx scripts/test-pdf-tools.ts', 'The PDF regression suite is available to GitHub Actions.');

console.info(`Private PDF splitting, merging, and ZIP downloads: ${checks} checks passed.`);
