import JSZip from 'jszip';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type TeacherIntegrationMode =
  | 'digital-competency'
  | 'ai-competency'
  | 'digital-ai'
  | 'inclusive-education'
  | 'integrated'
  | 'ai-lesson-plan';

export type TeacherDocumentExportMode = 'integrated-document' | 'competency-table';

export interface TeacherDocumentRow {
  rowIndex: number;
  cells: string[];
  text: string;
}

export interface TeacherColumnDetection {
  index: number;
  label: string;
  confidence: 'high' | 'medium' | 'fallback';
}

export interface TeacherDocumentAnalysis {
  fileName: string;
  rows: TeacherDocumentRow[];
  columnDetection: Record<TeacherIntegrationMode, TeacherColumnDetection>;
}

export interface TeacherIntegrationSuggestion {
  id: string;
  rowIndex: number;
  lesson: string;
  requirement?: string;
  code: string;
  content: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  approved: boolean;
}

const MODE_COLUMN_PATTERNS: Record<TeacherIntegrationMode, Array<{ pattern: RegExp; score: number }>> = {
  'digital-competency': [
    { pattern: /năng lực số|nls|năng lực công nghệ số|năng lực số hóa/i, score: 120 },
    { pattern: /năng lực.*số|công nghệ số/i, score: 95 },
    { pattern: /nội dung tích hợp|tích hợp|ghi chú/i, score: 45 },
  ],
  'ai-competency': [
    { pattern: /năng lực ai|nl\s*ai|năng lực trí tuệ nhân tạo/i, score: 120 },
    { pattern: /trí tuệ nhân tạo|\bai\b/i, score: 95 },
    { pattern: /nội dung tích hợp|tích hợp|ghi chú/i, score: 45 },
  ],
  'digital-ai': [
    { pattern: /nls.*ai|ai.*nls|năng lực số.*ai|ai.*năng lực số/i, score: 125 },
    { pattern: /nội dung tích hợp|tích hợp|ghi chú/i, score: 55 },
    { pattern: /năng lực số|năng lực ai|trí tuệ nhân tạo/i, score: 40 },
  ],
  'inclusive-education': [
    { pattern: /giáo dục hòa nhập|hòa nhập|học sinh khuyết tật|khuyết tật/i, score: 120 },
    { pattern: /điều chỉnh|hỗ trợ học sinh|hỗ trợ đặc biệt/i, score: 85 },
    { pattern: /nội dung tích hợp|tích hợp|ghi chú/i, score: 45 },
  ],
  integrated: [
    { pattern: /nội dung tích hợp|tích hợp tổng hợp/i, score: 120 },
    { pattern: /tích hợp|lồng ghép|ghi chú/i, score: 90 },
  ],
  'ai-lesson-plan': [
    { pattern: /chuyên đề ai|hoạt động ai|giáo dục ai/i, score: 120 },
    { pattern: /nội dung tích hợp|tích hợp|ghi chú/i, score: 55 },
  ],
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getWordText(element: Element): string {
  return normalizeText(
    Array.from(element.getElementsByTagNameNS(WORD_NS, 't'))
      .map(node => node.textContent || '')
      .join(' '),
  );
}

function getRowCells(row: Element): Element[] {
  return Array.from(row.getElementsByTagNameNS(WORD_NS, 'tc'));
}

function getTableRows(table: Element): Element[] {
  return Array.from(table.children).filter(child => child.namespaceURI === WORD_NS && child.localName === 'tr');
}

function containingTable(row: Element): Element | null {
  let node: Node | null = row.parentNode;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    if (element.namespaceURI === WORD_NS && element.localName === 'tbl') return element;
    node = node.parentNode;
  }
  return null;
}

function scoreHeaderCell(text: string, mode: TeacherIntegrationMode): number {
  const clean = normalizeText(text);
  if (!clean) return 0;
  return MODE_COLUMN_PATTERNS[mode].reduce((best, candidate) => (
    candidate.pattern.test(clean) ? Math.max(best, candidate.score) : best
  ), 0);
}

function detectColumnInTable(table: Element, mode: TeacherIntegrationMode): TeacherColumnDetection {
  const rows = getTableRows(table).slice(0, 14);
  let best: { index: number; label: string; score: number } | null = null;

  for (const row of rows) {
    const cells = getRowCells(row);
    if (cells.length < 2) continue;
    for (let index = 0; index < cells.length; index += 1) {
      const label = getWordText(cells[index]);
      const score = scoreHeaderCell(label, mode);
      if (!best || score > best.score) best = { index, label, score };
    }
  }

  if (best && best.score >= 80) {
    return { index: best.index, label: best.label || `Cột ${best.index + 1}`, confidence: 'high' };
  }
  if (best && best.score > 0) {
    return { index: best.index, label: best.label || `Cột ${best.index + 1}`, confidence: 'medium' };
  }
  return { index: -1, label: 'Ô cuối của từng hàng (dự phòng)', confidence: 'fallback' };
}

function detectDocumentColumn(xml: XMLDocument, mode: TeacherIntegrationMode): TeacherColumnDetection {
  const tables = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'tbl'));
  let medium: TeacherColumnDetection | null = null;
  for (const table of tables) {
    const detection = detectColumnInTable(table, mode);
    if (detection.confidence === 'high') return detection;
    if (detection.confidence === 'medium' && !medium) medium = detection;
  }
  return medium || { index: -1, label: 'Ô cuối của từng hàng (dự phòng)', confidence: 'fallback' };
}

async function loadDocumentXml(file: File): Promise<{ zip: JSZip; xml: XMLDocument }> {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    throw new Error('Vui lòng chọn đúng tệp Microsoft Word định dạng .docx.');
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) {
    throw new Error('Không đọc được cấu trúc Word. Tệp có thể bị hỏng hoặc không phải DOCX chuẩn.');
  }

  const xmlText = await documentEntry.async('string');
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Không thể phân tích cấu trúc XML bên trong tệp Word.');
  }

  return { zip, xml };
}

export async function parseTeacherDocx(file: File): Promise<TeacherDocumentAnalysis> {
  const { xml } = await loadDocumentXml(file);
  const tableRows = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'tr'));

  const rows = tableRows
    .map((row, rowIndex): TeacherDocumentRow => {
      const cells = getRowCells(row).map(getWordText).map(normalizeText);
      return {
        rowIndex,
        cells,
        text: normalizeText(cells.join(' | ')),
      };
    })
    .filter(row => row.cells.length >= 2 && row.text.length >= 8);

  if (rows.length === 0) {
    throw new Error('Chưa tìm thấy bảng nội dung để phân tích. Hệ thống hỗ trợ tốt nhất KHGD/PPCT/Phụ lục/giáo án được trình bày bằng bảng.');
  }

  const modes: TeacherIntegrationMode[] = [
    'digital-competency',
    'ai-competency',
    'digital-ai',
    'inclusive-education',
    'integrated',
    'ai-lesson-plan',
  ];
  const columnDetection = Object.fromEntries(
    modes.map(mode => [mode, detectDocumentColumn(xml, mode)]),
  ) as Record<TeacherIntegrationMode, TeacherColumnDetection>;

  return { fileName: file.name, rows, columnDetection };
}

function createWordElement(xml: XMLDocument, localName: string): Element {
  return xml.createElementNS(WORD_NS, `w:${localName}`);
}

function buildIntegrationParagraph(
  xml: XMLDocument,
  targetCell: Element,
  suggestion: TeacherIntegrationSuggestion,
): Element {
  const paragraph = createWordElement(xml, 'p');
  const existingParagraphs = Array.from(targetCell.getElementsByTagNameNS(WORD_NS, 'p'));
  const lastParagraph = existingParagraphs.at(-1);
  const paragraphProperties = lastParagraph?.getElementsByTagNameNS(WORD_NS, 'pPr')[0];
  if (paragraphProperties) paragraph.appendChild(paragraphProperties.cloneNode(true));

  const run = createWordElement(xml, 'r');
  const text = createWordElement(xml, 't');
  text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  const codePrefix = suggestion.code.trim() ? `${suggestion.code.trim()}: ` : '';
  text.textContent = `${codePrefix}${suggestion.content.trim()}`;
  run.appendChild(text);
  paragraph.appendChild(run);
  return paragraph;
}

function resolveTargetCell(row: Element, mode: TeacherIntegrationMode): { cell: Element | null; detection: TeacherColumnDetection } {
  const cells = getRowCells(row);
  if (cells.length === 0) {
    return { cell: null, detection: { index: -1, label: 'Không có ô phù hợp', confidence: 'fallback' } };
  }
  const table = containingTable(row);
  const detection = table ? detectColumnInTable(table, mode) : { index: -1, label: 'Ô cuối của từng hàng (dự phòng)', confidence: 'fallback' as const };
  const resolvedIndex = detection.index >= 0 && detection.index < cells.length ? detection.index : cells.length - 1;
  return { cell: cells[resolvedIndex] || null, detection };
}

export async function createIntegratedTeacherDocx(
  originalFile: File,
  suggestions: readonly TeacherIntegrationSuggestion[],
  mode: TeacherIntegrationMode,
): Promise<Blob> {
  const { zip, xml } = await loadDocumentXml(originalFile);
  const rows = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'tr'));
  const approved = suggestions.filter(item => item.approved && item.content.trim());

  if (approved.length === 0) throw new Error('Hãy chọn ít nhất một đề xuất trước khi tạo file Word.');

  for (const suggestion of approved) {
    const row = rows[suggestion.rowIndex];
    if (!row) continue;
    const { cell } = resolveTargetCell(row, mode);
    if (!cell) continue;
    cell.appendChild(buildIntegrationParagraph(xml, cell, suggestion));
  }

  const documentXml = new XMLSerializer().serializeToString(xml);
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({
    type: 'blob',
    mimeType: DOCX_MIME,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tableCellXml(value: string, bold = false): string {
  const text = escapeXml(normalizeText(value));
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
}

function sourceRequirement(row: TeacherDocumentRow | undefined, suggestion: TeacherIntegrationSuggestion): string {
  if (suggestion.requirement?.trim()) return suggestion.requirement.trim();
  if (!row) return '';
  const candidate = row.cells
    .filter(cell => cell.length >= 20 && !suggestion.lesson.includes(cell))
    .sort((a, b) => b.length - a.length)[0];
  return (candidate || '').slice(0, 700);
}

export async function createAiCompetencyTableDocx(
  suggestions: readonly TeacherIntegrationSuggestion[],
  rows: readonly TeacherDocumentRow[],
  metadata: { book: string; subject: string; grade: string },
): Promise<Blob> {
  const approved = suggestions.filter(item => item.approved && item.content.trim());
  if (approved.length === 0) throw new Error('Hãy chọn ít nhất một đề xuất trước khi tạo bảng NL AI.');
  const rowMap = new Map(rows.map(row => [row.rowIndex, row]));
  const header = ['STT', 'Bài/chủ đề', 'Yêu cầu cần đạt (từ KHGD)', 'Mã NL AI', 'Nội dung tích hợp', 'Mức tin cậy'];
  const tableRows = [
    `<w:tr>${header.map(value => tableCellXml(value, true)).join('')}</w:tr>`,
    ...approved.map((item, index) => {
      const sourceRow = rowMap.get(item.rowIndex);
      const values = [
        String(index + 1),
        item.lesson,
        sourceRequirement(sourceRow, item),
        item.code,
        item.content,
        item.confidence === 'high' ? 'Cao' : item.confidence === 'low' ? 'Thấp' : 'Trung bình',
      ];
      return `<w:tr>${values.map(value => tableCellXml(value)).join('')}</w:tr>`;
    }),
  ].join('');

  const title = `BẢNG TÍCH HỢP NĂNG LỰC AI VÀO KHGD – ${metadata.subject} ${metadata.grade}`;
  const subtitle = `Bộ sách: ${metadata.book}`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}"><w:body>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${escapeXml(subtitle)}</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${tableRows}</w:tbl>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="850"/></w:sectPr>
</w:body></w:document>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word')?.file('document.xml', documentXml);
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function buildIntegratedFileName(originalName: string): string {
  const stem = originalName.replace(/\.docx$/i, '');
  return `${stem}_AI_tich_hop.docx`;
}

export function buildAiCompetencyTableFileName(originalName: string): string {
  const stem = originalName.replace(/\.docx$/i, '');
  return `${stem}_Bang_tich_hop_NL_AI.docx`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
