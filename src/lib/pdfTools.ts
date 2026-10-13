import { PDFDocument } from 'pdf-lib';

export interface PdfPageRange {
  start: number;
  end: number;
}

export interface SplitPdfResult {
  fileName: string;
  pageNumbers: number[];
  bytes: Uint8Array;
}

export interface ZipFileEntry {
  fileName: string;
  bytes: Uint8Array;
}

const MAX_ZIP_VALUE = 0xffffffff;
const MAX_ZIP_ENTRIES = 0xffff;

function assertValidPageCount(totalPages: number): void {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) {
    throw new Error('Tệp PDF không có trang hợp lệ để tách.');
  }
}

function normalizePdfBaseName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.pdf$/i, '').trim();
  const safeName = withoutExtension
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);

  return safeName || 'tai_lieu';
}

export function parsePdfPageRanges(value: string, totalPages: number): PdfPageRange[] {
  assertValidPageCount(totalPages);

  const selection = value.trim();
  if (!selection) {
    throw new Error('Vui lòng nhập số trang hoặc khoảng trang cần tách.');
  }

  const groups = selection.split(/[,;\n]/);

  return groups.map(group => {
    const trimmed = group.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed);

    if (!match) {
      throw new Error(`Khoảng trang "${trimmed || group}" không hợp lệ. Ví dụ: 1-3, 5, 8-10.`);
    }

    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      throw new Error('Số trang quá lớn hoặc không hợp lệ.');
    }

    if (start < 1 || end > totalPages) {
      throw new Error(`Số trang phải nằm trong khoảng từ 1 đến ${totalPages}.`);
    }

    if (end < start) {
      throw new Error(`Khoảng trang ${start}-${end} không hợp lệ: trang cuối phải lớn hơn hoặc bằng trang đầu.`);
    }

    return { start, end };
  });
}

export function createSinglePageRanges(totalPages: number): PdfPageRange[] {
  assertValidPageCount(totalPages);

  return Array.from({ length: totalPages }, (_, index) => ({
    start: index + 1,
    end: index + 1,
  }));
}

export function createSplitPdfFileName(fileName: string, range: PdfPageRange): string {
  const pages = range.start === range.end ? String(range.start) : `${range.start}-${range.end}`;
  return `${normalizePdfBaseName(fileName)}_trang_${pages}.pdf`;
}

export async function splitPdfByRanges(
  bytes: Uint8Array,
  originalFileName: string,
  ranges: PdfPageRange[],
  combineSelections = false,
): Promise<SplitPdfResult[]> {
  if (ranges.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một trang PDF.');
  }

  const source = await PDFDocument.load(bytes);
  const totalPages = source.getPageCount();
  assertValidPageCount(totalPages);

  const selections = ranges.map(range => {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) ||
        range.start < 1 || range.end > totalPages || range.end < range.start) {
      throw new Error(`Khoảng trang phải nằm trong giới hạn từ 1 đến ${totalPages}.`);
    }

    return Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index);
  });

  const pageGroups = combineSelections
    ? [Array.from(new Set(selections.flat()))]
    : selections;

  const results: SplitPdfResult[] = [];

  for (let index = 0; index < pageGroups.length; index += 1) {
    const pageNumbers = pageGroups[index];
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, pageNumbers.map(page => page - 1));
    pages.forEach(page => output.addPage(page));

    results.push({
      fileName: combineSelections
        ? `${normalizePdfBaseName(originalFileName)}_trang_da_chon.pdf`
        : createSplitPdfFileName(originalFileName, ranges[index]),
      pageNumbers,
      bytes: await output.save(),
    });
  }

  return results;
}

function calculateCrc32(bytes: Uint8Array): number {
  let crc = MAX_ZIP_VALUE;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ MAX_ZIP_VALUE) >>> 0;
}

export function createStoredZip(entries: ZipFileEntry[]): Uint8Array {
  if (entries.length < 1) {
    throw new Error('Không có tệp PDF nào để tải xuống.');
  }

  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error('Số lượng tệp vượt quá giới hạn của gói ZIP.');
  }

  const encoder = new TextEncoder();
  const prepared = entries.map(entry => {
    const fileName = entry.fileName.replace(/[\\/]/g, '_');
    const nameBytes = encoder.encode(fileName);

    if (nameBytes.length < 1 || nameBytes.length > MAX_ZIP_ENTRIES) {
      throw new Error('Tên tệp trong gói ZIP không hợp lệ.');
    }

    if (entry.bytes.length > MAX_ZIP_VALUE) {
      throw new Error('Tệp PDF quá lớn để đóng gói ZIP trên trình duyệt.');
    }

    return { nameBytes, bytes: entry.bytes, crc: calculateCrc32(entry.bytes) };
  });

  const localSize = prepared.reduce((total, entry) => total + 30 + entry.nameBytes.length + entry.bytes.length, 0);
  const directorySize = prepared.reduce((total, entry) => total + 46 + entry.nameBytes.length, 0);
  const archiveSize = localSize + directorySize + 22;

  if (localSize > MAX_ZIP_VALUE || directorySize > MAX_ZIP_VALUE || archiveSize > MAX_ZIP_VALUE) {
    throw new Error('Tổng dung lượng các tệp PDF vượt quá giới hạn ZIP trên trình duyệt.');
  }

  const archive = new Uint8Array(archiveSize);
  const view = new DataView(archive.buffer);
  let localOffset = 0;
  let directoryOffset = localSize;

  for (const entry of prepared) {
    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 4, 20, true);
    view.setUint16(localOffset + 6, 0x0800, true);
    view.setUint32(localOffset + 14, entry.crc, true);
    view.setUint32(localOffset + 18, entry.bytes.length, true);
    view.setUint32(localOffset + 22, entry.bytes.length, true);
    view.setUint16(localOffset + 26, entry.nameBytes.length, true);
    archive.set(entry.nameBytes, localOffset + 30);
    archive.set(entry.bytes, localOffset + 30 + entry.nameBytes.length);

    view.setUint32(directoryOffset, 0x02014b50, true);
    view.setUint16(directoryOffset + 4, 20, true);
    view.setUint16(directoryOffset + 6, 20, true);
    view.setUint16(directoryOffset + 8, 0x0800, true);
    view.setUint32(directoryOffset + 16, entry.crc, true);
    view.setUint32(directoryOffset + 20, entry.bytes.length, true);
    view.setUint32(directoryOffset + 24, entry.bytes.length, true);
    view.setUint16(directoryOffset + 28, entry.nameBytes.length, true);
    view.setUint32(directoryOffset + 42, localOffset, true);
    archive.set(entry.nameBytes, directoryOffset + 46);

    localOffset += 30 + entry.nameBytes.length + entry.bytes.length;
    directoryOffset += 46 + entry.nameBytes.length;
  }

  view.setUint32(directoryOffset, 0x06054b50, true);
  view.setUint16(directoryOffset + 8, prepared.length, true);
  view.setUint16(directoryOffset + 10, prepared.length, true);
  view.setUint32(directoryOffset + 12, directorySize, true);
  view.setUint32(directoryOffset + 16, localSize, true);

  return archive;
}
