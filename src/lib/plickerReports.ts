import type { PlickerAnswer } from './plickerVision';
import { normalizePlickerQuestionPoints, sumPlickerScores } from './plickerScoring';

export interface PlickerReportStudent {
  id: string;
  name: string;
  classId?: string;
  cardId?: number;
}

export interface PlickerReportResponse {
  studentId: string;
  studentName: string;
  cardId: number;
  answer: PlickerAnswer;
  confidence: number;
  timestamp: number;
  source: 'camera' | 'manual';
}

export interface PlickerReportQuestion {
  text: string;
  correctAnswer: PlickerAnswer | null;
  gradingType?: 'graded' | 'survey';
  points?: number;
  responses: PlickerReportResponse[];
}

export interface PlickerClassroomReport {
  id: string;
  classId: string;
  className: string;
  setTitle: string;
  completedAt: string;
  studentCount: number;
  students?: PlickerReportStudent[];
  questions: PlickerReportQuestion[];
}

export interface PlickerReportSettings {
  schoolName: string;
  schoolYear: string;
  subject: string;
  teacherName: string;
  examDate: string;
}

export interface PlickerStudentScoreRow {
  student: PlickerReportStudent;
  questionScores: (number | null)[];
  totalScore: number;
}

export interface PlickerReportDeletionResult {
  reports: PlickerClassroomReport[];
  selectedReportId: string | null;
}

export function deletePlickerReport(
  reports: PlickerClassroomReport[],
  reportId: string,
  selectedReportId: string | null,
): PlickerReportDeletionResult {
  const deletedIndex = reports.findIndex(report => report.id === reportId);
  if (deletedIndex < 0) return { reports, selectedReportId };

  const remaining = reports.filter(report => report.id !== reportId);
  if (selectedReportId !== reportId) return { reports: remaining, selectedReportId };

  return {
    reports: remaining,
    selectedReportId: remaining[Math.min(deletedIndex, remaining.length - 1)]?.id || null,
  };
}

export function inferPlickerSchoolYear(date = new Date()): string {
  const startYear = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear} - ${startYear + 1}`;
}

export function resolvePlickerReportStudents(
  report: PlickerClassroomReport,
  currentStudents: PlickerReportStudent[] = [],
): PlickerReportStudent[] {
  let candidates: PlickerReportStudent[];
  if (Array.isArray(report.students)) {
    candidates = report.students;
  } else if (currentStudents.length) {
    candidates = currentStudents.filter(student => !student.classId || student.classId === report.classId);
  } else {
    candidates = report.questions.flatMap(question => question.responses.map(response => ({
      id: response.studentId,
      name: response.studentName,
      classId: report.classId,
      cardId: response.cardId,
    })));
  }

  const seen = new Set<string>();
  return candidates
    .filter(student => {
      if (!student?.id || !student.name?.trim() || seen.has(student.id)) return false;
      if (student.classId && student.classId !== report.classId) return false;
      seen.add(student.id);
      return true;
    })
    .slice(0, 63)
    .map(student => ({ ...student, name: student.name.trim() }))
    .sort((left, right) => (left.cardId || 64) - (right.cardId || 64));
}

export function buildPlickerStudentScoreRows(
  report: PlickerClassroomReport,
  currentStudents: PlickerReportStudent[] = [],
): PlickerStudentScoreRow[] {
  const students = resolvePlickerReportStudents(report, currentStudents);
  const responseMaps = report.questions.map(question => {
    const responses = new Map<string, PlickerReportResponse>();
    for (const response of question.responses) {
      const previous = responses.get(response.studentId);
      if (!previous || response.timestamp >= previous.timestamp) {
        responses.set(response.studentId, response);
      }
    }
    return responses;
  });

  return students.map(student => {
    const questionScores = report.questions.map((question, index) => {
      if (question.gradingType === 'survey' || !question.correctAnswer) return null;
      const response = responseMaps[index].get(student.id);
      if (!response) return null;
      return response.answer === question.correctAnswer
        ? normalizePlickerQuestionPoints(question.points)
        : 0;
    });
    return { student, questionScores, totalScore: sumPlickerScores(questionScores) };
  });
}

export function getPlickerReportMaximumScore(report: PlickerClassroomReport): number {
  return sumPlickerScores(report.questions.map(question =>
    question.gradingType === 'survey' || !question.correctAnswer
      ? 0
      : normalizePlickerQuestionPoints(question.points)));
}

interface ExcelCell {
  value: string | number;
  style: number;
  formula?: string;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ENCODER = new TextEncoder();

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function plickerExcelColumnName(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('Cột Excel không hợp lệ.');
  let column = index + 1;
  let name = '';
  while (column > 0) {
    column -= 1;
    name = String.fromCharCode(65 + column % 26) + name;
    column = Math.floor(column / 26);
  }
  return name;
}

function formatExamDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '……/……/…………'
    : parsed.toLocaleDateString('vi-VN');
}

function makeWorksheetXml(
  report: PlickerClassroomReport,
  rows: PlickerStudentScoreRow[],
  settings: PlickerReportSettings,
): string {
  const questionCount = Math.max(1, report.questions.length);
  const totalColumn = questionCount + 2;
  const lastColumn = plickerExcelColumnName(totalColumn);
  const lastQuestionColumn = plickerExcelColumnName(totalColumn - 1);
  const displayRowCount = Math.max(12, rows.length);
  const signatureRow = 12 + displayRowCount;
  const signatureColumn = Math.max(2, totalColumn - 2);
  const cells = new Map<number, Map<number, ExcelCell>>();
  const merges: string[] = [];

  const put = (row: number, column: number, value: string | number, style = 0, formula?: string) => {
    const record = cells.get(row) || new Map<number, ExcelCell>();
    record.set(column, { value, style, ...(formula ? { formula } : {}) });
    cells.set(row, record);
  };

  const merge = (firstColumn: number, firstRow: number, endColumn: number, endRow: number) => {
    if (firstColumn === endColumn && firstRow === endRow) return;
    merges.push(`${plickerExcelColumnName(firstColumn)}${firstRow}:${plickerExcelColumnName(endColumn)}${endRow}`);
  };

  put(2, 0, `TRƯỜNG: ${settings.schoolName.trim() || '................................................'}`, 2);
  merge(0, 2, Math.min(3, totalColumn), 2);
  put(3, 0, `Ngày kiểm tra: ${formatExamDate(settings.examDate || report.completedAt)}`, 10);
  merge(0, 3, Math.min(3, totalColumn), 3);
  put(5, 0, `BÀI KIỂM TRA THƯỜNG XUYÊN ONLINE NĂM HỌC ${settings.schoolYear.trim() || inferPlickerSchoolYear()}`, 1);
  merge(0, 5, totalColumn, 5);
  put(6, 0, `Môn: ${settings.subject.trim() || report.setTitle || '........................'}     Lớp: ${report.className}`, 3);
  merge(0, 6, totalColumn, 6);

  for (let column = 0; column <= totalColumn; column += 1) {
    put(8, column, '', 5);
    put(9, column, '', 5);
  }
  put(8, 0, 'STT', 5);
  merge(0, 8, 0, 9);
  put(8, 1, 'Họ và tên', 5);
  merge(1, 8, 1, 9);
  put(8, 2, 'Điểm câu hỏi', 5);
  merge(2, 8, totalColumn - 1, 8);
  put(8, totalColumn, 'Tổng điểm', 5);
  merge(totalColumn, 8, totalColumn, 9);
  for (let index = 0; index < questionCount; index += 1) put(9, index + 2, index + 1, 5);

  for (let index = 0; index < displayRowCount; index += 1) {
    const excelRow = index + 10;
    const item = rows[index];
    put(excelRow, 0, item ? index + 1 : '', 7);
    put(excelRow, 1, item?.student.name || '', 6);
    for (let questionIndex = 0; questionIndex < questionCount; questionIndex += 1) {
      const score = item?.questionScores[questionIndex];
      put(excelRow, questionIndex + 2, score === undefined || score === null ? '' : score, 8);
    }
    if (item) {
      put(excelRow, totalColumn, item.totalScore, 8, `SUM(C${excelRow}:${lastQuestionColumn}${excelRow})`);
    } else {
      put(excelRow, totalColumn, '', 8);
    }
  }

  put(signatureRow, signatureColumn, 'Giáo viên bộ môn', 9);
  merge(signatureColumn, signatureRow, totalColumn, signatureRow);
  if (settings.teacherName.trim()) {
    put(signatureRow + 4, signatureColumn, settings.teacherName.trim(), 9);
    merge(signatureColumn, signatureRow + 4, totalColumn, signatureRow + 4);
  }

  const rowXml = [...cells.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rowNumber, rowCells]) => {
      const height = rowNumber === 5 ? 26 : rowNumber >= 8 && rowNumber <= 9 ? 24 : 21;
      const content = [...rowCells.entries()]
        .sort(([left], [right]) => left - right)
        .map(([column, cell]) => {
          const reference = `${plickerExcelColumnName(column)}${rowNumber}`;
          if (cell.formula) {
            return `<c r="${reference}" s="${cell.style}"><f>${escapeXml(cell.formula)}</f><v>${cell.value}</v></c>`;
          }
          if (typeof cell.value === 'number') {
            return `<c r="${reference}" s="${cell.style}"><v>${cell.value}</v></c>`;
          }
          return `<c r="${reference}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNumber}" ht="${height}" customHeight="1">${content}</row>`;
    })
    .join('');

  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map(reference => `<mergeCell ref="${reference}"/>`).join('')}</mergeCells>`
    : '';
  const printEndRow = signatureRow + (settings.teacherName.trim() ? 4 : 1);

  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A2:${lastColumn}${printEndRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="1"><pane ySplit="9" topLeftCell="A10" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="30" customWidth="1"/><col min="3" max="${totalColumn}" width="11" customWidth="1"/><col min="${totalColumn + 1}" max="${totalColumn + 1}" width="15" customWidth="1"/></cols><sheetData>${rowXml}</sheetData>${mergeXml}<printOptions horizontalCentered="1"/><pageMargins left="0.35" right="0.35" top="0.55" bottom="0.55" header="0.25" footer="0.25"/><pageSetup paperSize="9" orientation="${questionCount > 6 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function makeStylesXml(): string {
  const thin = '<left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/>';
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="165" formatCode="0.##"/></numFmts><fonts count="4"><font><sz val="12"/><name val="Times New Roman"/></font><font><b/><sz val="12"/><name val="Times New Roman"/></font><font><b/><sz val="15"/><name val="Times New Roman"/></font><font><b/><sz val="13"/><name val="Times New Roman"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${thin}</border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipExcelFiles(files: { path: string; content: string }[]): Uint8Array {
  const local: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = ENCODER.encode(file.path);
    const content = ENCODER.encode(file.content);
    const checksum = crc32(content);

    const header = new Uint8Array(30 + name.length);
    const localView = new DataView(header.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, content);

    const record = new Uint8Array(46 + name.length);
    const directoryView = new DataView(record.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(4, 20, true);
    directoryView.setUint16(6, 20, true);
    directoryView.setUint16(8, 0x0800, true);
    directoryView.setUint32(16, checksum, true);
    directoryView.setUint32(20, content.length, true);
    directoryView.setUint32(24, content.length, true);
    directoryView.setUint16(28, name.length, true);
    directoryView.setUint32(42, localOffset, true);
    record.set(name, 46);
    directory.push(record);
    localOffset += header.length + content.length;
  }

  const directorySize = directory.reduce((size, record) => size + record.length, 0);
  const ending = new Uint8Array(22);
  const endView = new DataView(ending.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, localOffset, true);

  const workbook = new Uint8Array(localOffset + directorySize + ending.length);
  let position = 0;
  for (const chunk of [...local, ...directory, ending]) {
    workbook.set(chunk, position);
    position += chunk.length;
  }
  return workbook;
}

export function createPlickerReportWorkbook(
  report: PlickerClassroomReport,
  currentStudents: PlickerReportStudent[],
  settings: PlickerReportSettings,
): Uint8Array {
  const scoreRows = buildPlickerStudentScoreRows(report, currentStudents);
  const createdAt = new Date(report.completedAt);
  const created = Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString();
  const sheetName = 'Bảng điểm';

  return zipExcelFiles([
    { path: '[Content_Types].xml', content: `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { path: '_rels/.rels', content: `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { path: 'docProps/core.xml', content: `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(`Bảng điểm lớp ${report.className}`)}</dc:title><dc:creator>${escapeXml(settings.teacherName || 'Thẻ tương tác lớp học')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>` },
    { path: 'docProps/app.xml', content: `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Thẻ tương tác lớp học</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${sheetName}</vt:lpstr></vt:vector></TitlesOfParts></Properties>` },
    { path: 'xl/workbook.xml', content: `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { path: 'xl/_rels/workbook.xml.rels', content: `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { path: 'xl/styles.xml', content: makeStylesXml() },
    { path: 'xl/worksheets/sheet1.xml', content: makeWorksheetXml(report, scoreRows, settings) },
  ]);
}
