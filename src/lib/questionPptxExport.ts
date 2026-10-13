import PptxGenJSImport from 'pptxgenjs';
import { QUESTION_TYPE_LABELS, type QuestionDefinition } from './questionEngine';

export interface QuestionBankForPptx {
  id: string;
  title: string;
  questions: QuestionDefinition[];
}

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const COLORS = {
  navy: '172554',
  indigo: '4338CA',
  slate: '334155',
  muted: '64748B',
  line: 'CBD5E1',
  soft: 'F8FAFC',
  indigoSoft: 'EEF2FF',
  green: '059669',
  greenSoft: 'ECFDF5',
  amber: 'D97706',
  amberSoft: 'FFFBEB',
  red: 'DC2626',
  white: 'FFFFFF',
  black: '0F172A',
};

// `tsx`/Node can wrap the package ESM default in another `default` layer,
// while Vite/browser receives the constructor directly. Normalize both shapes.
type PptxGenJS = InstanceType<typeof PptxGenJSImport>;
const PptxGenJS = (((PptxGenJSImport as any)?.default ?? PptxGenJSImport) as typeof PptxGenJSImport);

type Slide = ReturnType<PptxGenJS['addSlide']>;
type Box = { x: number; y: number; w: number; h: number };

function safeFileName(value: string): string {
  const normalized = value
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return (normalized || 'Trac-nghiem-10-dang').slice(0, 120);
}

function fontSizeFor(text: string, large = 24): number {
  const length = text.trim().length;
  if (length <= 90) return large;
  if (length <= 180) return large - 3;
  if (length <= 320) return large - 6;
  return Math.max(14, large - 9);
}

function addSlideChrome(
  pptx: PptxGenJS,
  slide: Slide,
  question: QuestionDefinition,
  index: number,
  total: number,
  reveal: boolean,
): void {
  slide.background = { color: COLORS.soft };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.72,
    line: { color: reveal ? COLORS.green : COLORS.indigo, transparency: 100 },
    fill: { color: reveal ? COLORS.green : COLORS.indigo },
  });
  slide.addText(`CÂU ${index + 1} / ${total}`, {
    x: 0.55,
    y: 0.16,
    w: 1.8,
    h: 0.3,
    fontFace: 'Aptos Display',
    fontSize: 16,
    bold: true,
    color: COLORS.white,
    margin: 0,
  });
  slide.addText(QUESTION_TYPE_LABELS[question.payload.type], {
    x: 2.35,
    y: 0.16,
    w: 4.5,
    h: 0.3,
    fontFace: 'Aptos',
    fontSize: 15,
    bold: true,
    color: COLORS.white,
    margin: 0,
  });
  slide.addText(reveal ? 'ĐÁP ÁN' : `${question.points} điểm`, {
    x: 10.4,
    y: 0.16,
    w: 2.35,
    h: 0.3,
    fontFace: 'Aptos',
    fontSize: 15,
    bold: true,
    align: 'right',
    color: COLORS.white,
    margin: 0,
  });
  slide.addText(question.prompt, {
    x: 0.72,
    y: 0.95,
    w: 11.9,
    h: 1.08,
    fontFace: 'Aptos Display',
    fontSize: fontSizeFor(question.prompt, 25),
    bold: true,
    color: COLORS.black,
    margin: 0.04,
    valign: 'mid',
    breakLine: false,
    fit: 'shrink',
  });
}

function addFooter(slide: Slide, text: string): void {
  slide.addText(text, {
    x: 0.72,
    y: 7.12,
    w: 11.9,
    h: 0.2,
    fontFace: 'Aptos',
    fontSize: 9.5,
    color: COLORS.muted,
    align: 'center',
    margin: 0,
  });
}

function addButton(
  pptx: PptxGenJS,
  slide: Slide,
  label: string,
  box: Box,
  targetSlide: number,
  accent = COLORS.indigo,
): void {
  slide.addShape(pptx.ShapeType.rect, {
    ...box,
    fill: { color: accent },
    line: { color: accent },
    radius: 0.08,
  } as any);
  slide.addText(label, {
    ...box,
    fontFace: 'Aptos',
    fontSize: 15,
    bold: true,
    color: COLORS.white,
    align: 'center',
    valign: 'mid',
    margin: 0.04,
    hyperlink: { slide: targetSlide },
  });
}

function addCard(
  pptx: PptxGenJS,
  slide: Slide,
  text: string,
  box: Box,
  options: { fill?: string; line?: string; color?: string; bold?: boolean; prefix?: string } = {},
): void {
  const fill = options.fill || COLORS.white;
  const line = options.line || COLORS.line;
  slide.addShape(pptx.ShapeType.rect, {
    ...box,
    fill: { color: fill },
    line: { color: line, width: 1.1 },
  });
  slide.addText(`${options.prefix || ''}${text}`, {
    ...box,
    fontFace: 'Aptos',
    fontSize: fontSizeFor(text, 18),
    bold: options.bold,
    color: options.color || COLORS.slate,
    margin: 0.14,
    valign: 'mid',
    fit: 'shrink',
  });
}

function addChoicePayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  if (question.payload.type !== 'single_choice' && question.payload.type !== 'multiple_choice') return;
  const options = question.payload.options;
  const cols = options.length > 4 ? 2 : 1;
  const rows = Math.ceil(options.length / cols);
  const gap = 0.16;
  const area = { x: 0.9, y: 2.18, w: 11.55, h: 4.12 };
  const cardW = cols === 2 ? (area.w - gap) / 2 : area.w;
  const cardH = Math.min(0.9, (area.h - gap * Math.max(0, rows - 1)) / rows);

  options.forEach((option, optionIndex) => {
    const col = optionIndex % cols;
    const row = Math.floor(optionIndex / cols);
    const correct = Boolean(option.correct);
    const letter = String.fromCharCode(65 + optionIndex);
    addCard(pptx, slide, option.text, {
      x: area.x + col * (cardW + gap),
      y: area.y + row * (cardH + gap),
      w: cardW,
      h: cardH,
    }, reveal && correct ? {
      fill: COLORS.greenSoft,
      line: COLORS.green,
      color: COLORS.green,
      bold: true,
      prefix: `✓ ${letter}. `,
    } : {
      fill: COLORS.white,
      line: reveal ? COLORS.line : COLORS.indigo,
      prefix: `${letter}. `,
    });
  });
}

function addTrueFalsePayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  if (question.payload.type !== 'true_false') return;
  const entries = [
    { label: 'ĐÚNG', value: true },
    { label: 'SAI', value: false },
  ];
  entries.forEach((entry, index) => {
    const correct = entry.value === question.payload.correct;
    addCard(pptx, slide, entry.label, {
      x: 2.05 + index * 4.8,
      y: 2.72,
      w: 4.2,
      h: 2.05,
    }, reveal && correct ? {
      fill: COLORS.greenSoft,
      line: COLORS.green,
      color: COLORS.green,
      bold: true,
      prefix: '✓ ',
    } : {
      fill: COLORS.white,
      line: reveal ? COLORS.line : COLORS.indigo,
      bold: true,
    });
  });
}

function addMatrixPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  if (question.payload.type !== 'true_false_matrix') return;
  const statements = question.payload.statements.slice(0, 8);
  const h = Math.min(0.62, 3.95 / Math.max(1, statements.length));
  statements.forEach((statement, index) => {
    const y = 2.12 + index * (h + 0.08);
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.92,
      y,
      w: 9.55,
      h,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
    });
    slide.addText(`${String.fromCharCode(97 + index)}. ${statement.text}`, {
      x: 1.08,
      y: y + 0.03,
      w: 9.15,
      h: h - 0.06,
      fontFace: 'Aptos',
      fontSize: 15.5,
      color: COLORS.slate,
      margin: 0.04,
      valign: 'mid',
      fit: 'shrink',
    });
    addCard(pptx, slide, reveal ? (statement.correct ? 'ĐÚNG' : 'SAI') : '?', {
      x: 10.7,
      y,
      w: 1.55,
      h,
    }, reveal ? {
      fill: statement.correct ? COLORS.greenSoft : COLORS.amberSoft,
      line: statement.correct ? COLORS.green : COLORS.amber,
      color: statement.correct ? COLORS.green : COLORS.amber,
      bold: true,
    } : {
      fill: COLORS.indigoSoft,
      line: COLORS.indigo,
      color: COLORS.indigo,
      bold: true,
    });
  });
}

function addShortAnswerPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  if (question.payload.type !== 'short_answer') return;
  slide.addText(reveal ? 'Đáp án chấp nhận' : 'Học sinh trả lời', {
    x: 1.2,
    y: 2.45,
    w: 10.9,
    h: 0.35,
    fontFace: 'Aptos',
    fontSize: 15,
    bold: true,
    color: reveal ? COLORS.green : COLORS.muted,
    align: 'center',
    margin: 0,
  });
  addCard(pptx, slide,
    reveal ? question.payload.acceptedAnswers.join('  •  ') : '................................................................................',
    { x: 1.3, y: 3.05, w: 10.7, h: 1.75 },
    reveal ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true } : { fill: COLORS.white, line: COLORS.indigo },
  );
}

function addFillBlankPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  if (question.payload.type !== 'fill_blank') return;
  const answers = question.payload.answers.slice(0, 8);
  const cols = answers.length > 4 ? 2 : 1;
  const rows = Math.ceil(answers.length / cols);
  const cardW = cols === 2 ? 5.4 : 10.95;
  answers.forEach((answer, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    addCard(pptx, slide,
      reveal ? answer : '____________________________',
      {
        x: 1.05 + col * 5.62,
        y: 2.28 + row * (3.72 / Math.max(rows, 1)),
        w: cardW,
        h: Math.min(0.75, 3.25 / Math.max(rows, 1)),
      },
      reveal ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: `${index + 1}. ` } : { prefix: `${index + 1}. ` },
    );
  });
}

function addMatchingPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  if (question.payload.type !== 'matching') return;
  const pairs = question.payload.pairs.slice(0, 7);
  const rightItems = reveal ? pairs : [...pairs].reverse();
  pairs.forEach((pair, index) => {
    const y = 2.15 + index * 0.58;
    addCard(pptx, slide, pair.left, { x: 0.95, y, w: 5.25, h: 0.48 }, { prefix: `${index + 1}. ` });
    addCard(pptx, slide, rightItems[index]?.right || '', { x: 7.05, y, w: 5.25, h: 0.48 }, reveal ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true } : {});
    slide.addText(reveal ? '→' : '⋯', {
      x: 6.25,
      y: y + 0.02,
      w: 0.7,
      h: 0.35,
      fontFace: 'Aptos Display',
      fontSize: 20,
      bold: true,
      color: reveal ? COLORS.green : COLORS.muted,
      align: 'center',
      margin: 0,
    });
  });
}

function addOrderingPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  if (question.payload.type !== 'ordering') return;
  const items = question.payload.items.slice(0, 8);
  const display = reveal ? items : [...items].reverse();
  display.forEach((item, index) => {
    addCard(pptx, slide, item.text, {
      x: 1.55,
      y: 2.12 + index * 0.55,
      w: 10.2,
      h: 0.46,
    }, reveal ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: `${index + 1}. ` } : { prefix: `${String.fromCharCode(65 + index)}. ` });
  });
}

function addClassificationPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  if (question.payload.type !== 'classification') return;
  const groups = question.payload.groups.slice(0, 4);
  const items = question.payload.items.slice(0, 12);
  if (!reveal) {
    slide.addText('NHÓM', { x: 0.9, y: 2.08, w: 1.1, h: 0.3, fontFace: 'Aptos', fontSize: 13, bold: true, color: COLORS.muted, margin: 0 });
    groups.forEach((group, index) => addCard(pptx, slide, group.name, { x: 2.05 + index * 2.5, y: 1.98, w: 2.25, h: 0.55 }, { fill: COLORS.indigoSoft, line: COLORS.indigo, color: COLORS.indigo, bold: true }));
    items.forEach((item, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      addCard(pptx, slide, item.text, { x: 1.05 + col * 4.0, y: 2.85 + row * 0.78, w: 3.7, h: 0.62 });
    });
    return;
  }

  const columnW = 11.45 / Math.max(1, groups.length);
  groups.forEach((group, groupIndex) => {
    const x = 0.95 + groupIndex * columnW;
    addCard(pptx, slide, group.name, { x, y: 2.05, w: columnW - 0.12, h: 0.55 }, { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true });
    const groupItems = items.filter(item => item.groupId === group.id).slice(0, 6);
    groupItems.forEach((item, itemIndex) => addCard(pptx, slide, item.text, { x, y: 2.78 + itemIndex * 0.56, w: columnW - 0.12, h: 0.46 }, { fill: COLORS.white, line: COLORS.green }));
  });
}

async function imageUrlToDataUri(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Không đọc được hình ảnh.'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function addImageHotspotPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): Promise<void> {
  if (question.payload.type !== 'image_hotspot') return;
  const imageBox = { x: 2.2, y: 2.08, w: 8.95, h: 4.38 };
  const data = await imageUrlToDataUri(question.payload.imageUrl);
  if (data) {
    slide.addImage({ data, ...imageBox });
  } else {
    addCard(pptx, slide, 'Không thể nhúng hình do máy chủ ảnh chặn truy cập. Mở đường dẫn trong ghi chú của slide để bổ sung hình.', imageBox, { fill: COLORS.amberSoft, line: COLORS.amber, color: COLORS.amber, bold: true });
  }

  if (reveal) {
    question.payload.hotspots.forEach((hotspot, index) => {
      const cx = imageBox.x + imageBox.w * hotspot.x / 100;
      const cy = imageBox.y + imageBox.h * hotspot.y / 100;
      const radiusX = Math.max(0.14, imageBox.w * hotspot.radius / 100);
      const radiusY = Math.max(0.14, imageBox.h * hotspot.radius / 100);
      slide.addShape(pptx.ShapeType.ellipse, {
        x: cx - radiusX,
        y: cy - radiusY,
        w: radiusX * 2,
        h: radiusY * 2,
        fill: { color: COLORS.white, transparency: 100 },
        line: { color: COLORS.red, width: 3 },
      });
      if (hotspot.label) {
        slide.addText(`${index + 1}. ${hotspot.label}`, {
          x: Math.max(0.3, Math.min(SLIDE_W - 3.1, cx + 0.15)),
          y: Math.max(0.75, Math.min(SLIDE_H - 0.8, cy - 0.2)),
          w: 2.8,
          h: 0.35,
          fontFace: 'Aptos',
          fontSize: 12,
          bold: true,
          color: COLORS.red,
          fill: { color: COLORS.white, transparency: 10 },
          margin: 0.04,
        });
      }
    });
  }

  slide.addNotes(`Hình câu hỏi: ${question.payload.imageUrl}`);
}

async function addQuestionPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): Promise<void> {
  switch (question.payload.type) {
    case 'single_choice':
    case 'multiple_choice':
      addChoicePayload(pptx, slide, question, reveal);
      return;
    case 'true_false':
      addTrueFalsePayload(pptx, slide, question, reveal);
      return;
    case 'true_false_matrix':
      addMatrixPayload(pptx, slide, question, reveal);
      return;
    case 'short_answer':
      addShortAnswerPayload(pptx, slide, question, reveal);
      return;
    case 'fill_blank':
      addFillBlankPayload(pptx, slide, question, reveal);
      return;
    case 'matching':
      addMatchingPayload(pptx, slide, question, reveal);
      return;
    case 'ordering':
      addOrderingPayload(pptx, slide, question, reveal);
      return;
    case 'classification':
      addClassificationPayload(pptx, slide, question, reveal);
      return;
    case 'image_hotspot':
      await addImageHotspotPayload(pptx, slide, question, reveal);
      return;
  }
}

function addExplanation(slide: Slide, question: QuestionDefinition): void {
  if (!question.explanation?.trim()) return;
  slide.addText(`Giải thích: ${question.explanation.trim()}`, {
    x: 0.95,
    y: 6.42,
    w: 11.45,
    h: 0.48,
    fontFace: 'Aptos',
    fontSize: 11.5,
    italic: true,
    color: COLORS.slate,
    fill: { color: COLORS.greenSoft },
    margin: 0.08,
    fit: 'shrink',
  });
}

function addCover(pptx: PptxGenJS, bank: QuestionBankForPptx): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.navy };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.72,
    y: 0.75,
    w: 1.15,
    h: 0.15,
    fill: { color: '818CF8' },
    line: { color: '818CF8' },
  });
  slide.addText('BÀI GIẢNG TRẮC NGHIỆM TƯƠNG TÁC', {
    x: 0.75,
    y: 1.12,
    w: 11.8,
    h: 0.45,
    fontFace: 'Aptos',
    fontSize: 16,
    bold: true,
    color: 'A5B4FC',
    charSpacing: 1.4,
    margin: 0,
  });
  slide.addText(bank.title, {
    x: 0.72,
    y: 1.72,
    w: 11.85,
    h: 2.15,
    fontFace: 'Aptos Display',
    fontSize: fontSizeFor(bank.title, 34),
    bold: true,
    color: COLORS.white,
    margin: 0,
    valign: 'mid',
    fit: 'shrink',
  });
  slide.addText(`${bank.questions.length} câu hỏi • hỗ trợ đủ 10 dạng cơ bản`, {
    x: 0.76,
    y: 4.12,
    w: 8.7,
    h: 0.42,
    fontFace: 'Aptos',
    fontSize: 18,
    color: 'CBD5E1',
    margin: 0,
  });
  slide.addText('Lớp Học Thông Minh 4.0', {
    x: 0.76,
    y: 6.55,
    w: 5.2,
    h: 0.3,
    fontFace: 'Aptos',
    fontSize: 13,
    bold: true,
    color: 'A5B4FC',
    margin: 0,
  });
}

function addGuide(pptx: PptxGenJS, firstQuestionSlide: number): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.soft };
  slide.addText('Cách sử dụng khi trình chiếu', {
    x: 0.85,
    y: 0.7,
    w: 11.5,
    h: 0.65,
    fontFace: 'Aptos Display',
    fontSize: 30,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  });
  const steps = [
    ['1', 'Trình chiếu toàn màn hình', 'Mỗi câu hỏi được trình bày ở một slide riêng, chữ lớn phù hợp lớp học.'],
    ['2', 'Cho học sinh suy nghĩ', 'Dừng ở slide câu hỏi để học sinh trả lời hoặc thảo luận.'],
    ['3', 'Bấm HIỆN ĐÁP ÁN', 'Nút tương tác chuyển sang slide đáp án của chính câu đó, tạo hiệu ứng hiện đáp án từng bước.'],
    ['4', 'Tiếp tục câu kế tiếp', 'Từ slide đáp án bấm CÂU TIẾP THEO để chuyển đúng trình tự bài giảng.'],
  ];
  steps.forEach((step, index) => {
    const y = 1.62 + index * 1.22;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.98,
      y,
      w: 0.64,
      h: 0.64,
      fill: { color: COLORS.indigo },
      line: { color: COLORS.indigo },
    });
    slide.addText(step[0], { x: 0.98, y: y + 0.12, w: 0.64, h: 0.28, fontFace: 'Aptos', fontSize: 14, bold: true, color: COLORS.white, align: 'center', margin: 0 });
    slide.addText(step[1], { x: 1.92, y: y - 0.02, w: 4.1, h: 0.34, fontFace: 'Aptos Display', fontSize: 18, bold: true, color: COLORS.slate, margin: 0 });
    slide.addText(step[2], { x: 1.92, y: y + 0.38, w: 9.65, h: 0.48, fontFace: 'Aptos', fontSize: 13.5, color: COLORS.muted, margin: 0, fit: 'shrink' });
  });
  addButton(pptx, slide, 'BẮT ĐẦU BÀI GIẢNG  →', { x: 4.15, y: 6.48, w: 5.0, h: 0.58 }, firstQuestionSlide, COLORS.indigo);
}

function addEndSlide(pptx: PptxGenJS, coverSlide: number): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.navy };
  slide.addText('HOÀN THÀNH', {
    x: 0.9,
    y: 1.55,
    w: 11.5,
    h: 0.55,
    fontFace: 'Aptos',
    fontSize: 18,
    bold: true,
    color: 'A5B4FC',
    align: 'center',
    margin: 0,
  });
  slide.addText('Cảm ơn các em đã tham gia!', {
    x: 0.9,
    y: 2.35,
    w: 11.5,
    h: 1.15,
    fontFace: 'Aptos Display',
    fontSize: 36,
    bold: true,
    color: COLORS.white,
    align: 'center',
    valign: 'mid',
    margin: 0,
  });
  slide.addText('Có thể quay lại đầu bài giảng để sử dụng lại ngay.', {
    x: 1.4,
    y: 3.82,
    w: 10.5,
    h: 0.5,
    fontFace: 'Aptos',
    fontSize: 17,
    color: 'CBD5E1',
    align: 'center',
    margin: 0,
  });
  addButton(pptx, slide, '↺  QUAY LẠI TRANG ĐẦU', { x: 4.45, y: 5.25, w: 4.45, h: 0.62 }, coverSlide, COLORS.indigo);
}

export async function exportQuestionBankToPptx(bank: QuestionBankForPptx): Promise<string> {
  if (!bank.questions.length) {
    throw new Error('Bộ câu hỏi chưa có câu nào để xuất PowerPoint.');
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Lớp Học Thông Minh 4.0';
  pptx.company = 'Lớp Học Thông Minh 4.0';
  pptx.subject = 'Bài giảng trắc nghiệm tương tác 10 dạng';
  pptx.title = bank.title;
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'vi-VN',
  };

  const coverSlide = 1;
  const firstQuestionSlide = 3;
  const endSlide = firstQuestionSlide + bank.questions.length * 2;

  addCover(pptx, bank);
  addGuide(pptx, firstQuestionSlide);

  for (let index = 0; index < bank.questions.length; index += 1) {
    const question = bank.questions[index];
    const questionSlideNumber = firstQuestionSlide + index * 2;
    const answerSlideNumber = questionSlideNumber + 1;
    const nextSlideNumber = index === bank.questions.length - 1 ? endSlide : questionSlideNumber + 2;

    const questionSlide = pptx.addSlide();
    addSlideChrome(pptx, questionSlide, question, index, bank.questions.length, false);
    await addQuestionPayload(pptx, questionSlide, question, false);
    addButton(pptx, questionSlide, 'HIỆN ĐÁP ÁN  →', { x: 4.65, y: 6.46, w: 4.0, h: 0.55 }, answerSlideNumber, COLORS.indigo);
    addFooter(questionSlide, 'Trình chiếu: cho học sinh trả lời trước khi bấm “HIỆN ĐÁP ÁN”.');
    questionSlide.addNotes(`Câu ${index + 1}. ${question.prompt}${question.explanation ? `\nGiải thích: ${question.explanation}` : ''}`);

    const answerSlide = pptx.addSlide();
    addSlideChrome(pptx, answerSlide, question, index, bank.questions.length, true);
    await addQuestionPayload(pptx, answerSlide, question, true);
    addExplanation(answerSlide, question);
    addButton(pptx, answerSlide, '←  XEM LẠI CÂU HỎI', { x: 1.15, y: 6.46, w: 3.2, h: 0.55 }, questionSlideNumber, COLORS.slate);
    addButton(pptx, answerSlide, index === bank.questions.length - 1 ? 'KẾT THÚC  →' : 'CÂU TIẾP THEO  →', { x: 8.8, y: 6.46, w: 3.45, h: 0.55 }, nextSlideNumber, COLORS.green);
    addFooter(answerSlide, 'Đáp án được trình bày trên slide riêng để tạo hiệu ứng “bấm để hiện” ổn định trong PowerPoint.');
  }

  addEndSlide(pptx, coverSlide);

  const fileName = `${safeFileName(bank.title)} - Trac nghiem tuong tac.pptx`;
  await pptx.writeFile({ fileName, compression: true });
  return fileName;
}
