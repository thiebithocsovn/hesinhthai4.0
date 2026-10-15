// Reads practical submissions (Word .docx, PowerPoint .pptx, Scratch .sb3) and checks
// the criteria a teacher linked to them. Results are suggestions shown while grading:
// the teacher always decides, because styles, templates or unusual files can fool
// any automatic reading.

import type { SubmittedPracticalFile } from './examManualGrading';

export type AutoCheckKind =
  | 'word-text' | 'word-bold' | 'word-center' | 'word-italic' | 'word-underline' | 'word-color' | 'word-image' | 'word-table'
  | 'ppt-slides' | 'ppt-text' | 'ppt-image' | 'ppt-transition' | 'ppt-animation'
  | 'sb-flag' | 'sb-loop' | 'sb-motion' | 'sb-say' | 'sb-sound' | 'sb-if' | 'sb-key' | 'sb-sprites'
  | 'file-name';

export interface AutoCheck {
  kind: AutoCheckKind;
  value?: string;
}

type FileGroup = 'word' | 'powerpoint' | 'scratch' | 'any';

export interface AutoCheckOption {
  kind: AutoCheckKind;
  group: FileGroup;
  label: string;
  /** Criterion text added by the quick-add buttons. */
  criterion: string;
  input?: 'text' | 'number';
  defaultValue?: string;
  placeholder?: string;
}

export const AUTO_CHECK_OPTIONS: AutoCheckOption[] = [
  { kind: 'word-text', group: 'word', label: 'Có đoạn chữ…', criterion: 'Gõ đúng nội dung yêu cầu', input: 'text', placeholder: 'Ví dụ: LỚP EM' },
  { kind: 'word-bold', group: 'word', label: 'Có chữ in đậm', criterion: 'Có chữ in đậm', input: 'text', placeholder: 'Chữ cần in đậm (để trống = bất kỳ)' },
  { kind: 'word-center', group: 'word', label: 'Có đoạn căn giữa', criterion: 'Căn giữa tiêu đề', input: 'text', placeholder: 'Đoạn cần căn giữa (để trống = bất kỳ)' },
  { kind: 'word-italic', group: 'word', label: 'Có chữ in nghiêng', criterion: 'Có chữ in nghiêng' },
  { kind: 'word-underline', group: 'word', label: 'Có chữ gạch chân', criterion: 'Có chữ gạch chân' },
  { kind: 'word-color', group: 'word', label: 'Có chữ màu / tô nền', criterion: 'Đổi màu chữ' },
  { kind: 'word-image', group: 'word', label: 'Có chèn hình (ít nhất …)', criterion: 'Chèn được hình ảnh', input: 'number', defaultValue: '1' },
  { kind: 'word-table', group: 'word', label: 'Có chèn bảng', criterion: 'Chèn được bảng' },
  { kind: 'ppt-slides', group: 'powerpoint', label: 'Có ít nhất … trang chiếu', criterion: 'Đủ số trang chiếu', input: 'number', defaultValue: '3' },
  { kind: 'ppt-text', group: 'powerpoint', label: 'Có đoạn chữ…', criterion: 'Có tiêu đề đúng yêu cầu', input: 'text', placeholder: 'Ví dụ: Gia đình em' },
  { kind: 'ppt-image', group: 'powerpoint', label: 'Có hình ảnh (ít nhất …)', criterion: 'Chèn được hình ảnh', input: 'number', defaultValue: '1' },
  { kind: 'ppt-transition', group: 'powerpoint', label: 'Có hiệu ứng chuyển trang', criterion: 'Có hiệu ứng chuyển trang' },
  { kind: 'ppt-animation', group: 'powerpoint', label: 'Có hiệu ứng cho đối tượng', criterion: 'Có hiệu ứng cho chữ / hình' },
  { kind: 'sb-flag', group: 'scratch', label: 'Có khối "Khi bấm vào lá cờ xanh"', criterion: 'Chương trình bắt đầu khi bấm cờ xanh' },
  { kind: 'sb-loop', group: 'scratch', label: 'Có vòng lặp (lặp lại / liên tục)', criterion: 'Dùng khối lặp' },
  { kind: 'sb-motion', group: 'scratch', label: 'Có khối chuyển động', criterion: 'Nhân vật di chuyển' },
  { kind: 'sb-say', group: 'scratch', label: 'Có khối nói / nghĩ', criterion: 'Nhân vật nói được lời thoại' },
  { kind: 'sb-sound', group: 'scratch', label: 'Có âm thanh', criterion: 'Có âm thanh' },
  { kind: 'sb-if', group: 'scratch', label: 'Có khối "nếu … thì"', criterion: 'Dùng khối điều kiện' },
  { kind: 'sb-key', group: 'scratch', label: 'Có khối "khi bấm phím"', criterion: 'Điều khiển bằng bàn phím' },
  { kind: 'sb-sprites', group: 'scratch', label: 'Có ít nhất … nhân vật', criterion: 'Đủ số nhân vật', input: 'number', defaultValue: '2' },
  { kind: 'file-name', group: 'any', label: 'Tên tệp có chữ…', criterion: 'Lưu tệp đúng tên', input: 'text', placeholder: 'Ví dụ: Lop' },
];

/** Options shown for a practical question accepting the given file preset. */
export function autoCheckOptionsFor(preset?: string): AutoCheckOption[] {
  const group: FileGroup | null = preset === 'word' ? 'word' : preset === 'powerpoint' ? 'powerpoint' : preset === 'scratch' ? 'scratch' : preset === 'image' || preset === 'excel' ? null : 'any';
  return AUTO_CHECK_OPTIONS.filter(option => option.group === 'any' || group === 'any' || option.group === group);
}

export function autoCheckOption(kind?: string): AutoCheckOption | undefined {
  return AUTO_CHECK_OPTIONS.find(option => option.kind === kind);
}

export function describeAutoCheck(check: AutoCheck): string {
  const option = autoCheckOption(check.kind);
  if (!option) return '';
  if (!option.input || !check.value?.trim()) return option.label;
  return option.input === 'number' ? option.label.replace('…', check.value.trim()) : `${option.label.replace('…', '')} "${check.value.trim()}"`;
}

export interface PracticalFileFacts {
  kind: 'word' | 'powerpoint' | 'scratch' | 'image' | 'other';
  error?: string;
  text: string;
  runs: { text: string; bold: boolean; italic: boolean; underline: boolean; colored: boolean }[];
  paragraphs: { text: string; centered: boolean; boldText: string }[];
  imageCount: number;
  hasTable: boolean;
  slideCount: number;
  hasTransition: boolean;
  hasAnimation: boolean;
  opcodes: string[];
  spriteCount: number;
}

const emptyFacts = (kind: PracticalFileFacts['kind'], error?: string): PracticalFileFacts => ({
  kind, ...(error ? { error } : {}), text: '', runs: [], paragraphs: [], imageCount: 0, hasTable: false, slideCount: 0, hasTransition: false, hasAnimation: false, opcodes: [], spriteCount: 0,
});

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** A Word on/off property such as <w:b/>; w:val="0"/"false"/"none" switches it off. */
function hasToggle(properties: string, tag: string): boolean {
  const match = new RegExp(`<w:${tag}(\\s[^>]*)?/>`).exec(properties);
  if (!match) return false;
  const value = /w:val="([^"]*)"/.exec(match[1] || '')?.[1];
  return !value || !['0', 'false', 'off', 'none'].includes(value.toLowerCase());
}

export function readWordXml(xml: string): Pick<PracticalFileFacts, 'text' | 'runs' | 'paragraphs' | 'imageCount' | 'hasTable'> {
  const runs: PracticalFileFacts['runs'] = [];
  const paragraphs: PracticalFileFacts['paragraphs'] = [];
  for (const paragraph of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    const paragraphProperties = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraph)?.[1] || '';
    const centered = /<w:jc w:val="center"\s*\/>/.test(paragraphProperties);
    let text = '';
    let boldText = '';
    for (const run of paragraph.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []) {
      const properties = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] || '';
      const runText = decodeXml((run.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map(item => item.replace(/<[^>]+>/g, '')).join('')) + (/<w:tab\/>/.test(run) ? ' ' : '');
      if (!runText) continue;
      const color = /<w:color w:val="([0-9A-Fa-f]{6}|auto)"/.exec(properties)?.[1]?.toUpperCase();
      const entry = {
        text: runText,
        bold: hasToggle(properties, 'b'),
        italic: hasToggle(properties, 'i'),
        underline: hasToggle(properties, 'u'),
        colored: Boolean(color && color !== 'AUTO' && color !== '000000') || /<w:highlight w:val="(?!none)/.test(properties) || /<w:shd [^>]*w:fill="(?!auto|FFFFFF)[0-9A-Fa-f]{6}"/.test(properties),
      };
      runs.push(entry);
      text += runText;
      if (entry.bold) boldText += runText;
    }
    paragraphs.push({ text, centered, boldText });
  }
  return {
    text: paragraphs.map(item => item.text).join('\n'),
    runs,
    paragraphs,
    imageCount: (xml.match(/<w:drawing>|<w:pict>/g) || []).length,
    hasTable: /<w:tbl>/.test(xml),
  };
}

function base64Of(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/** Reads a submitted file once; every criterion of the card is then checked against these facts. */
export async function analyzePracticalFile(file: Pick<SubmittedPracticalFile, 'name' | 'type' | 'dataUrl'>): Promise<PracticalFileFacts> {
  if (file.type.startsWith('image/')) return emptyFacts('image');
  let zip: import('jszip');
  try {
    const { default: JSZip } = await import('jszip');
    zip = await JSZip.loadAsync(base64Of(file.dataUrl), { base64: true });
  } catch {
    const legacy = /\.(doc|ppt)$/i.test(file.name);
    return emptyFacts('other', legacy ? 'Tệp định dạng cũ (.doc/.ppt) – máy không đọc được, thầy cô tải về để xem.' : 'Máy không đọc được tệp này – thầy cô tải về để xem.');
  }

  const word = zip.file('word/document.xml');
  if (word) {
    try {
      return { ...emptyFacts('word'), ...readWordXml(await word.async('string')) };
    } catch {
      return emptyFacts('word', 'Không đọc được nội dung Word.');
    }
  }

  const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  if (slides.length || zip.file('ppt/presentation.xml')) {
    const xml = (await Promise.all(slides.map(name => zip.file(name)!.async('string')))).join('\n');
    return {
      ...emptyFacts('powerpoint'),
      text: decodeXml((xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []).map(item => item.replace(/<[^>]+>/g, '')).join(' ')),
      slideCount: slides.length,
      imageCount: (xml.match(/<p:pic>/g) || []).length,
      hasTransition: /<p:transition[\s>/]/.test(xml),
      hasAnimation: /<p:timing>[\s\S]*<p:(anim|animEffect|animMotion|animScale|animRot|set)\b/.test(xml),
    };
  }

  const project = zip.file('project.json');
  if (project) {
    try {
      const data = JSON.parse(await project.async('string')) as { targets?: { isStage?: boolean; blocks?: Record<string, unknown> }[] };
      const targets = Array.isArray(data.targets) ? data.targets : [];
      const opcodes = new Set<string>();
      const texts: string[] = [];
      for (const target of targets) {
        for (const block of Object.values(target.blocks || {})) {
          if (block && typeof block === 'object' && !Array.isArray(block) && typeof (block as { opcode?: unknown }).opcode === 'string') {
            opcodes.add((block as { opcode: string }).opcode);
            texts.push(JSON.stringify((block as { inputs?: unknown }).inputs || {}));
          }
        }
      }
      return { ...emptyFacts('scratch'), opcodes: [...opcodes], spriteCount: targets.filter(target => !target.isStage).length, text: texts.join(' ') };
    } catch {
      return emptyFacts('scratch', 'Không đọc được dự án Scratch.');
    }
  }
  return emptyFacts('other', 'Máy chưa hỗ trợ loại tệp này – thầy cô tải về để xem.');
}

export type AutoCheckStatus = 'pass' | 'near' | 'fail' | 'unknown';
export interface AutoCheckResult { status: AutoCheckStatus; detail: string }

const normalize = (value: string) => value.normalize('NFC').toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ').trim();
const fold = (value: string) => normalize(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

function textCheck(haystack: string, needle: string, found: string, missing: string): AutoCheckResult {
  if (!needle.trim()) return { status: 'unknown', detail: 'Chưa nhập chữ cần tìm khi soạn đề.' };
  if (normalize(haystack).includes(normalize(needle))) return { status: 'pass', detail: found };
  if (fold(haystack).includes(fold(needle))) return { status: 'near', detail: `${found}, nhưng sai hoặc thiếu dấu` };
  return { status: 'fail', detail: missing };
}

const count = (value: string | undefined, fallback: number) => Math.max(1, Math.floor(Number(value) || fallback));

export function evaluateAutoCheck(check: AutoCheck, facts: PracticalFileFacts, fileName: string): AutoCheckResult {
  const option = autoCheckOption(check.kind);
  if (!option) return { status: 'unknown', detail: '' };
  if (check.kind === 'file-name') return textCheck(fileName.replace(/\.[^.]+$/, ''), check.value || '', `Tên tệp: ${fileName}`, `Tên tệp "${fileName}" chưa có "${check.value?.trim()}"`);
  if (facts.error) return { status: 'unknown', detail: facts.error };
  const expected = option.group === 'word' ? 'word' : option.group === 'powerpoint' ? 'powerpoint' : option.group === 'scratch' ? 'scratch' : facts.kind;
  if (facts.kind !== expected) return { status: 'unknown', detail: `Tệp nộp không phải ${expected === 'word' ? 'Word' : expected === 'powerpoint' ? 'PowerPoint' : 'Scratch'}.` };
  const value = check.value?.trim() || '';
  const flag = (ok: boolean, yes: string, no: string): AutoCheckResult => ({ status: ok ? 'pass' : 'fail', detail: ok ? yes : no });

  switch (check.kind) {
    case 'word-text': return textCheck(facts.text, value, `Có "${value}"`, `Không thấy "${value}"`);
    case 'word-bold':
      return value
        ? textCheck(facts.paragraphs.map(item => item.boldText).join('\n'), value, `"${value}" được in đậm`, `"${value}" chưa in đậm`)
        : flag(facts.runs.some(run => run.bold && run.text.trim()), 'Có chữ in đậm', 'Không thấy chữ in đậm');
    case 'word-center': {
      const centered = facts.paragraphs.filter(item => item.centered && item.text.trim());
      return value
        ? textCheck(centered.map(item => item.text).join('\n'), value, `"${value}" được căn giữa`, `"${value}" chưa căn giữa`)
        : flag(centered.length > 0, `Có ${centered.length} đoạn căn giữa`, 'Không thấy đoạn căn giữa');
    }
    case 'word-italic': return flag(facts.runs.some(run => run.italic && run.text.trim()), 'Có chữ in nghiêng', 'Không thấy chữ in nghiêng');
    case 'word-underline': return flag(facts.runs.some(run => run.underline && run.text.trim()), 'Có chữ gạch chân', 'Không thấy chữ gạch chân');
    case 'word-color': return flag(facts.runs.some(run => run.colored && run.text.trim()), 'Có chữ màu / tô nền', 'Chữ đều màu mặc định');
    case 'word-image': { const need = count(value, 1); return flag(facts.imageCount >= need, `Có ${facts.imageCount} hình`, `Có ${facts.imageCount}/${need} hình`); }
    case 'word-table': return flag(facts.hasTable, 'Có bảng', 'Không thấy bảng');
    case 'ppt-slides': { const need = count(value, 3); return flag(facts.slideCount >= need, `Có ${facts.slideCount} trang chiếu`, `Có ${facts.slideCount}/${need} trang chiếu`); }
    case 'ppt-text': return textCheck(facts.text, value, `Có "${value}"`, `Không thấy "${value}"`);
    case 'ppt-image': { const need = count(value, 1); return flag(facts.imageCount >= need, `Có ${facts.imageCount} hình`, `Có ${facts.imageCount}/${need} hình`); }
    case 'ppt-transition': return flag(facts.hasTransition, 'Có hiệu ứng chuyển trang', 'Không thấy hiệu ứng chuyển trang');
    case 'ppt-animation': return flag(facts.hasAnimation, 'Có hiệu ứng đối tượng', 'Không thấy hiệu ứng đối tượng');
    case 'sb-sprites': { const need = count(value, 2); return flag(facts.spriteCount >= need, `Có ${facts.spriteCount} nhân vật`, `Có ${facts.spriteCount}/${need} nhân vật`); }
    default: {
      const has = (test: (opcode: string) => boolean) => facts.opcodes.some(test);
      const scratch: Record<string, [boolean, string]> = {
        'sb-flag': [has(op => op === 'event_whenflagclicked'), 'khối "Khi bấm vào lá cờ xanh"'],
        'sb-loop': [has(op => ['control_repeat', 'control_forever', 'control_repeat_until'].includes(op)), 'khối lặp'],
        'sb-motion': [has(op => op.startsWith('motion_')), 'khối chuyển động'],
        'sb-say': [has(op => /^looks_(say|think)/.test(op)), 'khối nói / nghĩ'],
        'sb-sound': [has(op => op.startsWith('sound_') || op.startsWith('music_')), 'khối âm thanh'],
        'sb-if': [has(op => op === 'control_if' || op === 'control_if_else'), 'khối "nếu … thì"'],
        'sb-key': [has(op => op === 'event_whenkeypressed'), 'khối "khi bấm phím"'],
      };
      const [ok, name] = scratch[check.kind] || [false, ''];
      return flag(ok, `Có ${name}`, `Không thấy ${name}`);
    }
  }
}
