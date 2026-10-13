import JSZip from 'jszip';
import type { TeacherDraftSection } from './teacherDraftAi';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function runXml(text: string, bold = false, size = 24, breakBefore = false): string {
  const runProperties = `<w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
  return `<w:r>${runProperties}${breakBefore ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraphXml(text: string, options?: { bold?: boolean; center?: boolean; size?: number; after?: number }): string {
  const lines = text.split(/\r?\n/);
  const alignment = options?.center ? '<w:jc w:val="center"/>' : '';
  const spacing = `<w:spacing w:after="${options?.after ?? 120}" w:line="360" w:lineRule="auto"/>`;
  const runs = lines.map((line, index) => runXml(line || ' ', options?.bold, options?.size, index > 0)).join('');
  return `<w:p><w:pPr>${alignment}${spacing}</w:pPr>${runs}</w:p>`;
}

function documentXml(title: string, sections: readonly TeacherDraftSection[]): string {
  const body = [
    paragraphXml(title, { bold: true, center: true, size: 32, after: 240 }),
    ...sections.flatMap(section => [
      paragraphXml(section.heading, { bold: true, size: 26, after: 100 }),
      ...section.content.split(/\n{2,}/).map(block => paragraphXml(block.trim() || ' ', { size: 24, after: 120 })),
    ]),
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

export async function createSimpleDocx(title: string, sections: readonly TeacherDraftSection[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder('word')?.file('document.xml', documentXml(title, sections));

  return zip.generateAsync({
    type: 'blob',
    mimeType: DOCX_MIME,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function safeDocxFileName(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${normalized || fallback}.docx`;
}

export function downloadSimpleDocx(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
