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
  navy: '172554', indigo: '4338CA', slate: '334155', muted: '64748B', line: 'CBD5E1', soft: 'F8FAFC',
  indigoSoft: 'EEF2FF', green: '059669', greenSoft: 'ECFDF5', red: 'DC2626', redSoft: 'FEF2F2',
  amber: 'D97706', amberSoft: 'FFFBEB', white: 'FFFFFF', black: '0F172A',
};

type PptxGenJS = InstanceType<typeof PptxGenJSImport>;
const PptxGenJS = (((PptxGenJSImport as any)?.default ?? PptxGenJSImport) as typeof PptxGenJSImport);
type Slide = ReturnType<PptxGenJS['addSlide']>;
type Box = { x: number; y: number; w: number; h: number };

type FeedbackSpec =
  | { kind: 'choice'; optionIndex: number; correct: boolean }
  | { kind: 'true_false'; value: boolean; correct: boolean }
  | { kind: 'matrix'; statementIndex: number; value: boolean; correct: boolean };

interface SlidePlan {
  question: number;
  answer: number;
  feedback: number[];
  next: number;
}

function safeFileName(value: string): string {
  return (value.normalize('NFC').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Trac-nghiem-10-dang').slice(0, 120);
}

function fontSizeFor(text: string, large = 24): number {
  const length = text.trim().length;
  if (length <= 90) return large;
  if (length <= 180) return large - 3;
  if (length <= 320) return large - 6;
  return Math.max(14, large - 9);
}

function feedbackSpecs(question: QuestionDefinition): FeedbackSpec[] {
  const payload = question.payload;
  if (payload.type === 'single_choice' || payload.type === 'multiple_choice') {
    return payload.options.map((option, optionIndex) => ({ kind: 'choice' as const, optionIndex, correct: Boolean(option.correct) }));
  }
  if (payload.type === 'true_false') {
    return [true, false].map(value => ({ kind: 'true_false' as const, value, correct: value === payload.correct }));
  }
  if (payload.type === 'true_false_matrix') {
    return payload.statements.flatMap((statement, statementIndex) => [true, false].map(value => ({
      kind: 'matrix' as const,
      statementIndex,
      value,
      correct: value === statement.correct,
    })));
  }
  return [];
}

function buildPlans(questions: QuestionDefinition[]): { plans: SlidePlan[]; endSlide: number } {
  let cursor = 3;
  const plans = questions.map(question => {
    const feedbackCount = feedbackSpecs(question).length;
    const questionSlide = cursor;
    const answerSlide = cursor + 1;
    const feedback = Array.from({ length: feedbackCount }, (_, index) => cursor + 2 + index);
    cursor += 2 + feedbackCount;
    return { question: questionSlide, answer: answerSlide, feedback, next: 0 };
  });
  const endSlide = cursor;
  plans.forEach((plan, index) => {
    plan.next = index === plans.length - 1 ? endSlide : plans[index + 1].question;
  });
  return { plans, endSlide };
}

function addSlideChrome(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, index: number, total: number, mode: 'question' | 'answer' | 'correct' | 'wrong'): void {
  const accent = mode === 'answer' || mode === 'correct' ? COLORS.green : mode === 'wrong' ? COLORS.red : COLORS.indigo;
  const label = mode === 'answer' ? 'ĐÁP ÁN' : mode === 'correct' ? '✓ ĐÚNG' : mode === 'wrong' ? '✕ CHƯA ĐÚNG' : `${question.points} điểm`;
  slide.background = { color: COLORS.soft };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: 0.72, line: { color: accent, transparency: 100 }, fill: { color: accent } });
  slide.addText(`CÂU ${index + 1} / ${total}`, { x: 0.55, y: 0.16, w: 1.8, h: 0.3, fontFace: 'Aptos Display', fontSize: 16, bold: true, color: COLORS.white, margin: 0 });
  slide.addText(QUESTION_TYPE_LABELS[question.payload.type], { x: 2.35, y: 0.16, w: 4.8, h: 0.3, fontFace: 'Aptos', fontSize: 15, bold: true, color: COLORS.white, margin: 0 });
  slide.addText(label, { x: 9.8, y: 0.16, w: 2.95, h: 0.3, fontFace: 'Aptos', fontSize: 15, bold: true, align: 'right', color: COLORS.white, margin: 0 });
  slide.addText(question.prompt, { x: 0.72, y: 0.95, w: 11.9, h: 1.08, fontFace: 'Aptos Display', fontSize: fontSizeFor(question.prompt, 25), bold: true, color: COLORS.black, margin: 0.04, valign: 'mid', fit: 'shrink' });
}

function addFooter(slide: Slide, text: string): void {
  slide.addText(text, { x: 0.72, y: 7.12, w: 11.9, h: 0.2, fontFace: 'Aptos', fontSize: 9.5, color: COLORS.muted, align: 'center', margin: 0 });
}

function addButton(pptx: PptxGenJS, slide: Slide, label: string, box: Box, targetSlide: number, accent = COLORS.indigo): void {
  slide.addShape(pptx.ShapeType.rect, { ...box, fill: { color: accent }, line: { color: accent }, hyperlink: { slide: targetSlide } } as any);
  slide.addText(label, { ...box, fontFace: 'Aptos', fontSize: 15, bold: true, color: COLORS.white, align: 'center', valign: 'mid', margin: 0.04, hyperlink: { slide: targetSlide } });
}

function addCard(pptx: PptxGenJS, slide: Slide, text: string, box: Box, options: { fill?: string; line?: string; color?: string; bold?: boolean; prefix?: string; targetSlide?: number } = {}): void {
  const fill = options.fill || COLORS.white;
  const line = options.line || COLORS.line;
  const hyperlink = options.targetSlide ? { slide: options.targetSlide } : undefined;
  slide.addShape(pptx.ShapeType.rect, { ...box, fill: { color: fill }, line: { color: line, width: 1.2 }, ...(hyperlink ? { hyperlink } : {}) } as any);
  slide.addText(`${options.prefix || ''}${text}`, { ...box, fontFace: 'Aptos', fontSize: fontSizeFor(text, 18), bold: options.bold, color: options.color || COLORS.slate, margin: 0.14, valign: 'mid', fit: 'shrink', ...(hyperlink ? { hyperlink } : {}) });
}

function choiceLayout(question: QuestionDefinition) {
  if (question.payload.type !== 'single_choice' && question.payload.type !== 'multiple_choice') return [];
  const options = question.payload.options;
  const cols = options.length > 4 ? 2 : 1;
  const rows = Math.ceil(options.length / cols);
  const gap = 0.16;
  const area = { x: 0.9, y: 2.18, w: 11.55, h: 4.12 };
  const cardW = cols === 2 ? (area.w - gap) / 2 : area.w;
  const cardH = Math.min(0.9, (area.h - gap * Math.max(0, rows - 1)) / rows);
  return options.map((option, optionIndex) => ({ option, optionIndex, letter: String.fromCharCode(65 + optionIndex), box: { x: area.x + (optionIndex % cols) * (cardW + gap), y: area.y + Math.floor(optionIndex / cols) * (cardH + gap), w: cardW, h: cardH } }));
}

function addChoicePayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean, targets: number[] = [], selectedIndex: number | null = null): void {
  if (question.payload.type !== 'single_choice' && question.payload.type !== 'multiple_choice') return;
  choiceLayout(question).forEach(({ option, optionIndex, letter, box }) => {
    const correct = Boolean(option.correct);
    const selected = selectedIndex === optionIndex;
    const feedbackStyle = selected ? (correct
      ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: `✓ ${letter}. ` }
      : { fill: COLORS.redSoft, line: COLORS.red, color: COLORS.red, bold: true, prefix: `✕ ${letter}. ` }) : null;
    const revealStyle = reveal && correct ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: `✓ ${letter}. ` } : null;
    addCard(pptx, slide, option.text, box, feedbackStyle || revealStyle || { fill: COLORS.white, line: reveal ? COLORS.line : COLORS.indigo, prefix: `${letter}. `, targetSlide: !reveal && selectedIndex === null ? targets[optionIndex] : undefined });
  });
}

function addTrueFalsePayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean, targets: number[] = [], selected: boolean | null = null): void {
  if (question.payload.type !== 'true_false') return;
  const entries = [{ label: 'ĐÚNG', value: true }, { label: 'SAI', value: false }];
  entries.forEach((entry, index) => {
    const correct = entry.value === question.payload.correct;
    const chosen = selected === entry.value;
    const style = chosen ? (correct
      ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: '✓ ' }
      : { fill: COLORS.redSoft, line: COLORS.red, color: COLORS.red, bold: true, prefix: '✕ ' })
      : reveal && correct ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: '✓ ' }
      : { fill: COLORS.white, line: reveal ? COLORS.line : COLORS.indigo, bold: true, targetSlide: !reveal && selected === null ? targets[index] : undefined };
    addCard(pptx, slide, entry.label, { x: 2.05 + index * 4.8, y: 2.72, w: 4.2, h: 2.05 }, style);
  });
}

function addMatrixPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean, targets: number[] = [], selected: { statementIndex: number; value: boolean } | null = null): void {
  if (question.payload.type !== 'true_false_matrix') return;
  const statements = question.payload.statements.slice(0, 8);
  const h = Math.min(0.62, 3.95 / Math.max(1, statements.length));
  statements.forEach((statement, index) => {
    const y = 2.12 + index * (h + 0.08);
    slide.addShape(pptx.ShapeType.rect, { x: 0.92, y, w: 8.2, h, fill: { color: COLORS.white }, line: { color: COLORS.line } });
    slide.addText(`${String.fromCharCode(97 + index)}. ${statement.text}`, { x: 1.08, y: y + 0.03, w: 7.82, h: h - 0.06, fontFace: 'Aptos', fontSize: 14.5, color: COLORS.slate, margin: 0.04, valign: 'mid', fit: 'shrink' });
    [true, false].forEach((value, valueIndex) => {
      const chosen = selected?.statementIndex === index && selected.value === value;
      const correct = value === statement.correct;
      const targetIndex = index * 2 + valueIndex;
      const style = chosen ? (correct
        ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: '✓ ' }
        : { fill: COLORS.redSoft, line: COLORS.red, color: COLORS.red, bold: true, prefix: '✕ ' })
        : reveal && correct ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: '✓ ' }
        : { fill: COLORS.white, line: reveal ? COLORS.line : COLORS.indigo, color: COLORS.slate, bold: true, targetSlide: !reveal && !selected ? targets[targetIndex] : undefined };
      addCard(pptx, slide, value ? 'ĐÚNG' : 'SAI', { x: 9.32 + valueIndex * 1.5, y, w: 1.32, h }, style);
    });
  });
}

function addSimplePayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): void {
  const payload = question.payload;
  if (payload.type === 'short_answer') {
    addCard(pptx, slide, reveal ? payload.acceptedAnswers.join(' • ') : '................................................................................', { x: 1.3, y: 3.05, w: 10.7, h: 1.75 }, reveal ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true } : { line: COLORS.indigo });
  } else if (payload.type === 'fill_blank') {
    payload.answers.slice(0, 8).forEach((answer, index) => addCard(pptx, slide, reveal ? answer : '____________________________', { x: 1.15, y: 2.28 + index * 0.52, w: 11.0, h: 0.43 }, reveal ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: `${index + 1}. ` } : { prefix: `${index + 1}. ` }));
  } else if (payload.type === 'matching') {
    const pairs = payload.pairs.slice(0, 7);
    const right = reveal ? pairs : [...pairs].reverse();
    pairs.forEach((pair, index) => {
      const y = 2.15 + index * 0.58;
      addCard(pptx, slide, pair.left, { x: 0.95, y, w: 5.25, h: 0.48 }, { prefix: `${index + 1}. ` });
      addCard(pptx, slide, right[index]?.right || '', { x: 7.05, y, w: 5.25, h: 0.48 }, reveal ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true } : {});
      slide.addText(reveal ? '→' : '⋯', { x: 6.25, y: y + 0.02, w: 0.7, h: 0.35, fontFace: 'Aptos Display', fontSize: 20, bold: true, color: reveal ? COLORS.green : COLORS.muted, align: 'center', margin: 0 });
    });
  } else if (payload.type === 'ordering') {
    const items = reveal ? payload.items : [...payload.items].reverse();
    items.slice(0, 8).forEach((item, index) => addCard(pptx, slide, item.text, { x: 1.55, y: 2.12 + index * 0.55, w: 10.2, h: 0.46 }, reveal ? { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true, prefix: `${index + 1}. ` } : { prefix: `${String.fromCharCode(65 + index)}. ` }));
  } else if (payload.type === 'classification') {
    const groups = payload.groups.slice(0, 4);
    const items = payload.items.slice(0, 12);
    if (!reveal) {
      groups.forEach((group, index) => addCard(pptx, slide, group.name, { x: 1.0 + index * 2.85, y: 2.05, w: 2.6, h: 0.55 }, { fill: COLORS.indigoSoft, line: COLORS.indigo, color: COLORS.indigo, bold: true }));
      items.forEach((item, index) => addCard(pptx, slide, item.text, { x: 1.05 + (index % 3) * 4.0, y: 2.85 + Math.floor(index / 3) * 0.78, w: 3.7, h: 0.62 }));
    } else {
      const columnW = 11.45 / Math.max(1, groups.length);
      groups.forEach((group, groupIndex) => {
        const x = 0.95 + groupIndex * columnW;
        addCard(pptx, slide, group.name, { x, y: 2.05, w: columnW - 0.12, h: 0.55 }, { fill: COLORS.greenSoft, line: COLORS.green, color: COLORS.green, bold: true });
        items.filter(item => item.groupId === group.id).slice(0, 6).forEach((item, itemIndex) => addCard(pptx, slide, item.text, { x, y: 2.78 + itemIndex * 0.56, w: columnW - 0.12, h: 0.46 }, { line: COLORS.green }));
      });
    }
  }
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
  } catch { return null; }
}

async function addImagePayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean): Promise<void> {
  if (question.payload.type !== 'image_hotspot') return;
  const box = { x: 2.2, y: 2.08, w: 8.95, h: 4.38 };
  const data = await imageUrlToDataUri(question.payload.imageUrl);
  if (data) slide.addImage({ data, ...box });
  else addCard(pptx, slide, 'Không thể nhúng hình do máy chủ ảnh chặn truy cập.', box, { fill: COLORS.amberSoft, line: COLORS.amber, color: COLORS.amber, bold: true });
  if (reveal) question.payload.hotspots.forEach(hotspot => {
    const cx = box.x + box.w * hotspot.x / 100;
    const cy = box.y + box.h * hotspot.y / 100;
    const rx = Math.max(0.14, box.w * hotspot.radius / 100);
    const ry = Math.max(0.14, box.h * hotspot.radius / 100);
    slide.addShape(pptx.ShapeType.ellipse, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, fill: { color: COLORS.white, transparency: 100 }, line: { color: COLORS.green, width: 3 } });
  });
  slide.addNotes(`Hình câu hỏi: ${question.payload.imageUrl}`);
}

async function addPayload(pptx: PptxGenJS, slide: Slide, question: QuestionDefinition, reveal: boolean, targets: number[] = []): Promise<void> {
  switch (question.payload.type) {
    case 'single_choice': case 'multiple_choice': addChoicePayload(pptx, slide, question, reveal, targets); return;
    case 'true_false': addTrueFalsePayload(pptx, slide, question, reveal, targets); return;
    case 'true_false_matrix': addMatrixPayload(pptx, slide, question, reveal, targets); return;
    case 'image_hotspot': await addImagePayload(pptx, slide, question, reveal); return;
    default: addSimplePayload(pptx, slide, question, reveal); return;
  }
}

function addExplanation(slide: Slide, question: QuestionDefinition): void {
  if (!question.explanation?.trim()) return;
  slide.addText(`Giải thích: ${question.explanation.trim()}`, { x: 0.95, y: 6.42, w: 11.45, h: 0.48, fontFace: 'Aptos', fontSize: 11.5, italic: true, color: COLORS.slate, fill: { color: COLORS.greenSoft }, margin: 0.08, fit: 'shrink' });
}

function addCover(pptx: PptxGenJS, bank: QuestionBankForPptx): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.navy };
  slide.addText('BÀI GIẢNG TRẮC NGHIỆM TƯƠNG TÁC', { x: 0.75, y: 1.12, w: 11.8, h: 0.45, fontFace: 'Aptos', fontSize: 16, bold: true, color: 'A5B4FC', margin: 0 });
  slide.addText(bank.title, { x: 0.72, y: 1.72, w: 11.85, h: 2.15, fontFace: 'Aptos Display', fontSize: fontSizeFor(bank.title, 34), bold: true, color: COLORS.white, margin: 0, valign: 'mid', fit: 'shrink' });
  slide.addText(`${bank.questions.length} câu hỏi • bấm đáp án để nhận phản hồi đúng/sai`, { x: 0.76, y: 4.12, w: 9.2, h: 0.42, fontFace: 'Aptos', fontSize: 18, color: 'CBD5E1', margin: 0 });
  slide.addText('Lớp Học Thông Minh 4.0', { x: 0.76, y: 6.55, w: 5.2, h: 0.3, fontFace: 'Aptos', fontSize: 13, bold: true, color: 'A5B4FC', margin: 0 });
}

function addGuide(pptx: PptxGenJS, firstQuestionSlide: number): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.soft };
  slide.addText('Cách sử dụng khi trình chiếu', { x: 0.85, y: 0.7, w: 11.5, h: 0.65, fontFace: 'Aptos Display', fontSize: 30, bold: true, color: COLORS.navy, margin: 0 });
  const steps = [
    ['1', 'Bấm trực tiếp vào phương án', 'Với Một đáp án, Nhiều đáp án và Đúng/Sai, mỗi lựa chọn là một nút tương tác.'],
    ['2', 'Đúng sẽ chuyển xanh', 'Khi chọn phương án đúng, PowerPoint chuyển sang phản hồi màu xanh.'],
    ['3', 'Sai sẽ chuyển đỏ', 'Khi chọn phương án sai, ô vừa chọn chuyển đỏ và có nút THỬ LẠI.'],
    ['4', 'Các dạng còn lại', 'Dùng HIỆN ĐÁP ÁN để xem lời giải theo đúng cấu trúc 10 dạng.'],
  ];
  steps.forEach((step, index) => {
    const y = 1.62 + index * 1.22;
    slide.addShape(pptx.ShapeType.ellipse, { x: 0.98, y, w: 0.64, h: 0.64, fill: { color: COLORS.indigo }, line: { color: COLORS.indigo } });
    slide.addText(step[0], { x: 0.98, y: y + 0.12, w: 0.64, h: 0.28, fontFace: 'Aptos', fontSize: 14, bold: true, color: COLORS.white, align: 'center', margin: 0 });
    slide.addText(step[1], { x: 1.92, y: y - 0.02, w: 4.1, h: 0.34, fontFace: 'Aptos Display', fontSize: 18, bold: true, color: COLORS.slate, margin: 0 });
    slide.addText(step[2], { x: 1.92, y: y + 0.38, w: 9.65, h: 0.48, fontFace: 'Aptos', fontSize: 13.5, color: COLORS.muted, margin: 0, fit: 'shrink' });
  });
  addButton(pptx, slide, 'BẮT ĐẦU BÀI GIẢNG  →', { x: 4.15, y: 6.48, w: 5.0, h: 0.58 }, firstQuestionSlide, COLORS.indigo);
}

function addEndSlide(pptx: PptxGenJS, coverSlide: number): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.navy };
  slide.addText('HOÀN THÀNH', { x: 0.9, y: 1.55, w: 11.5, h: 0.55, fontFace: 'Aptos', fontSize: 18, bold: true, color: 'A5B4FC', align: 'center', margin: 0 });
  slide.addText('Cảm ơn các em đã tham gia!', { x: 0.9, y: 2.35, w: 11.5, h: 1.15, fontFace: 'Aptos Display', fontSize: 36, bold: true, color: COLORS.white, align: 'center', valign: 'mid', margin: 0 });
  addButton(pptx, slide, '↺  QUAY LẠI TRANG ĐẦU', { x: 4.45, y: 5.25, w: 4.45, h: 0.62 }, coverSlide, COLORS.indigo);
}

async function addFeedbackSlide(pptx: PptxGenJS, question: QuestionDefinition, spec: FeedbackSpec, index: number, total: number, plan: SlidePlan): Promise<void> {
  const slide = pptx.addSlide();
  (slide as any).hidden = true;
  addSlideChrome(pptx, slide, question, index, total, spec.correct ? 'correct' : 'wrong');
  if (spec.kind === 'choice') addChoicePayload(pptx, slide, question, false, [], spec.optionIndex);
  else if (spec.kind === 'true_false') addTrueFalsePayload(pptx, slide, question, false, [], spec.value);
  else addMatrixPayload(pptx, slide, question, false, [], { statementIndex: spec.statementIndex, value: spec.value });

  slide.addText(spec.correct ? 'CHÍNH XÁC!' : 'CHƯA ĐÚNG — HÃY THỬ LẠI', {
    x: 4.0, y: 6.18, w: 5.35, h: 0.36, fontFace: 'Aptos Display', fontSize: 16, bold: true,
    color: spec.correct ? COLORS.green : COLORS.red, align: 'center', margin: 0,
  });

  if (spec.correct) {
    if (question.payload.type === 'multiple_choice' || question.payload.type === 'true_false_matrix') {
      addButton(pptx, slide, '←  CHỌN / KIỂM TRA TIẾP', { x: 1.0, y: 6.55, w: 3.8, h: 0.48 }, plan.question, COLORS.slate);
      addButton(pptx, slide, 'XEM ĐÁP ÁN  →', { x: 8.65, y: 6.55, w: 3.55, h: 0.48 }, plan.answer, COLORS.green);
    } else {
      addButton(pptx, slide, '←  XEM LẠI CÂU HỎI', { x: 1.0, y: 6.55, w: 3.6, h: 0.48 }, plan.question, COLORS.slate);
      addButton(pptx, slide, index === total - 1 ? 'KẾT THÚC  →' : 'CÂU TIẾP THEO  →', { x: 8.65, y: 6.55, w: 3.55, h: 0.48 }, plan.next, COLORS.green);
    }
  } else {
    addButton(pptx, slide, '↺  THỬ LẠI', { x: 2.0, y: 6.55, w: 3.2, h: 0.48 }, plan.question, COLORS.red);
    addButton(pptx, slide, 'XEM ĐÁP ÁN  →', { x: 8.1, y: 6.55, w: 3.2, h: 0.48 }, plan.answer, COLORS.slate);
  }
  addFooter(slide, spec.correct ? 'Đáp án đúng được tô xanh.' : 'Đáp án vừa chọn sai được tô đỏ; bấm THỬ LẠI để chọn lại.');
}

export async function exportQuestionBankToPptx(bank: QuestionBankForPptx): Promise<string> {
  if (!bank.questions.length) throw new Error('Bộ câu hỏi chưa có câu nào để xuất PowerPoint.');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Lớp Học Thông Minh 4.0';
  pptx.company = 'Lớp Học Thông Minh 4.0';
  pptx.subject = 'Bài giảng trắc nghiệm tương tác 10 dạng';
  pptx.title = bank.title;
  pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'vi-VN' };

  const coverSlide = 1;
  const { plans } = buildPlans(bank.questions);
  addCover(pptx, bank);
  addGuide(pptx, plans[0].question);

  for (let index = 0; index < bank.questions.length; index += 1) {
    const question = bank.questions[index];
    const plan = plans[index];
    const specs = feedbackSpecs(question);

    const questionSlide = pptx.addSlide();
    addSlideChrome(pptx, questionSlide, question, index, bank.questions.length, 'question');
    await addPayload(pptx, questionSlide, question, false, plan.feedback);
    addButton(pptx, questionSlide, 'HIỆN ĐÁP ÁN  →', { x: 4.65, y: 6.46, w: 4.0, h: 0.55 }, plan.answer, COLORS.indigo);
    addFooter(questionSlide, specs.length ? 'Bấm trực tiếp vào đáp án để kiểm tra: đúng = xanh, sai = đỏ.' : 'Cho học sinh trả lời rồi bấm “HIỆN ĐÁP ÁN”.');
    questionSlide.addNotes(`Câu ${index + 1}. ${question.prompt}${question.explanation ? `\nGiải thích: ${question.explanation}` : ''}`);

    const answerSlide = pptx.addSlide();
    addSlideChrome(pptx, answerSlide, question, index, bank.questions.length, 'answer');
    await addPayload(pptx, answerSlide, question, true);
    addExplanation(answerSlide, question);
    addButton(pptx, answerSlide, '←  XEM LẠI CÂU HỎI', { x: 1.15, y: 6.46, w: 3.2, h: 0.55 }, plan.question, COLORS.slate);
    addButton(pptx, answerSlide, index === bank.questions.length - 1 ? 'KẾT THÚC  →' : 'CÂU TIẾP THEO  →', { x: 8.8, y: 6.46, w: 3.45, h: 0.55 }, plan.next, COLORS.green);
    addFooter(answerSlide, 'Đáp án đúng được tô xanh; dùng các nút để tiếp tục đúng trình tự bài giảng.');

    for (const spec of specs) await addFeedbackSlide(pptx, question, spec, index, bank.questions.length, plan);
  }

  addEndSlide(pptx, coverSlide);
  const fileName = `${safeFileName(bank.title)} - Trac nghiem tuong tac.pptx`;
  await pptx.writeFile({ fileName, compression: true });
  return fileName;
}
