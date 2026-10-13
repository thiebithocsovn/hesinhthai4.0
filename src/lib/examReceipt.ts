import { evaluateQuestion, type QuestionDefinition, type QuestionResponse } from './questionEngine';
import { getSubmittedExamClassId } from './examStudentClasses';

export interface ExamReceiptSettings {
  autoPrint: boolean;
  includeCorrectAnswers: boolean;
  schoolName: string;
  subject: string;
  invigilatorName: string;
}

export const DEFAULT_EXAM_RECEIPT_SETTINGS: ExamReceiptSettings = {
  autoPrint: false,
  includeCorrectAnswers: true,
  schoolName: '',
  subject: '',
  invigilatorName: '',
};

export interface ReceiptQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  type?: string;
  correctTextAnswer?: string;
  matchingPairs?: { id: string; left: string; right: string }[];
  engineQuestion?: QuestionDefinition;
}

export interface ReceiptExam {
  id: string;
  title: string;
  durationMinutes: number;
  questions: ReceiptQuestion[];
  receiptSettings?: Partial<ExamReceiptSettings>;
  classNames?: Record<string, string>;
  studentDirectory?: Record<string, { id: string; classId?: string }>;
  shuffledVersions?: { code: string; questions: ReceiptQuestion[] }[];
}

export interface ReceiptStudent {
  id: string;
  name: string;
  classId?: string;
  code?: string;
}

export interface ReceiptResult {
  id: string;
  score: number;
  totalQuestions: number;
  submittedAt: string;
  answers?: Record<string, unknown>;
  examVersion?: string;
}

export function getExamReceiptSettings(exam: ReceiptExam): ExamReceiptSettings {
  return { ...DEFAULT_EXAM_RECEIPT_SETTINGS, ...exam.receiptSettings };
}

export function getReceiptStudentClassId(exam: Pick<ReceiptExam, 'classNames' | 'studentDirectory'>, student: Pick<ReceiptStudent, 'id' | 'classId'>, result?: Pick<ReceiptResult, 'answers'>): string | undefined {
  return student.classId || Object.values(exam.studentDirectory || {}).find(entry => entry.id === student.id)?.classId || getSubmittedExamClassId(exam, result);
}

const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const plain = (value: string): string => value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
const label = (index: number) => String.fromCharCode(65 + index);
const mapAnswer = (answer: unknown): Record<string, unknown> =>
  answer && typeof answer === 'object' && !Array.isArray(answer) ? answer as Record<string, unknown> : {};
const boolLabel = (value: unknown) => typeof value === 'boolean' ? value ? 'Đúng' : 'Sai' : '—';

export function receiptQuestionIsCorrect(question: ReceiptQuestion, answer: unknown): boolean {
  if (question.type === 'question_engine' && question.engineQuestion) {
    return evaluateQuestion(question.engineQuestion, answer as QuestionResponse).correct;
  }
  if (question.type === 'short_answer') {
    const expected = (question.correctTextAnswer || '').trim().toLocaleLowerCase('vi-VN');
    return Boolean(expected) && String(answer ?? '').trim().toLocaleLowerCase('vi-VN') === expected;
  }
  if (question.type === 'matching') {
    const values = mapAnswer(answer);
    return Boolean(question.matchingPairs?.length) && question.matchingPairs!.every(pair => values[pair.id] === pair.id);
  }
  return typeof answer === 'number' && answer === question.correctAnswer;
}

function questionOptions(question: ReceiptQuestion): string[] | null {
  const payload = question.engineQuestion?.payload;
  if (question.type === 'question_engine' && payload) {
    if (payload.type === 'single_choice' || payload.type === 'multiple_choice') return payload.options.map(option => option.text);
    if (payload.type === 'true_false') return ['Đúng', 'Sai'];
    return null;
  }
  if (question.type === 'short_answer' || question.type === 'matching') return null;
  return question.options;
}

function selectedOptions(question: ReceiptQuestion, answer: unknown): number[] {
  const payload = question.engineQuestion?.payload;
  if (question.type === 'question_engine' && payload) {
    if (payload.type === 'single_choice') return [payload.options.findIndex(option => option.id === answer)].filter(index => index >= 0);
    if (payload.type === 'multiple_choice') return payload.options.flatMap((option, index) => Array.isArray(answer) && answer.includes(option.id) ? [index] : []);
    if (payload.type === 'true_false') return typeof answer === 'boolean' ? [answer ? 0 : 1] : [];
  }
  return typeof answer === 'number' && question.options[answer] !== undefined ? [answer] : [];
}

function answerText(question: ReceiptQuestion, answer: unknown, correct = false): string {
  const payload = question.type === 'question_engine' ? question.engineQuestion?.payload : undefined;
  if (payload) {
    switch (payload.type) {
      case 'single_choice':
      case 'multiple_choice':
        return (correct ? payload.options.flatMap((option, index) => option.correct ? [index] : []) : selectedOptions(question, answer)).map(label).join(', ') || '—';
      case 'true_false': return boolLabel(correct ? payload.correct : answer);
      case 'true_false_matrix': return payload.statements.map((statement, index) => `${index + 1}: ${boolLabel(correct ? statement.correct : Array.isArray(answer) ? answer[index] : undefined)}`).join('; ');
      case 'short_answer': return correct ? payload.acceptedAnswers.join(' / ') : String(answer ?? '') || '—';
      case 'fill_blank': return (correct ? payload.answers : Array.isArray(answer) ? answer : []).map((value, index) => `${index + 1}: ${String(value) || '—'}`).join('; ') || '—';
      case 'matching': return payload.pairs.map((pair, index) => `${index + 1}: ${correct ? pair.right : String(mapAnswer(answer)[pair.id] ?? '—')}`).join('; ');
      case 'ordering': return (correct ? payload.items.map(item => item.id) : Array.isArray(answer) ? answer : []).map(id => plain(payload.items.find(item => item.id === id)?.text || '—')).join(' → ') || '—';
      case 'classification': return payload.items.map(item => `${plain(item.text)}: ${payload.groups.find(group => group.id === (correct ? item.groupId : mapAnswer(answer)[item.id]))?.name || '—'}`).join('; ');
      case 'image_hotspot': {
        if (correct) return payload.hotspots.map(point => `${point.label || 'Vị trí'} (${point.x}, ${point.y}), bán kính ${point.radius}`).join('; ');
        const point = mapAnswer(answer);
        return typeof point.x === 'number' && typeof point.y === 'number' ? `Vị trí (${point.x}, ${point.y})` : '—';
      }
    }
  }
  if (question.type === 'short_answer') return correct ? question.correctTextAnswer || '—' : String(answer ?? '') || '—';
  if (question.type === 'matching') return (question.matchingPairs || []).map((pair, index) => {
    const target = correct ? pair : question.matchingPairs?.find(item => item.id === mapAnswer(answer)[pair.id]);
    return `${index + 1}: ${target?.left || '—'} ↔ ${pair.right}`;
  }).join('; ');
  return correct ? label(question.correctAnswer) : selectedOptions(question, answer).map(label).join(', ') || '—';
}

export function buildExamReceiptHtml(exam: ReceiptExam, student: ReceiptStudent, result: ReceiptResult, startedAt?: string): string {
  const settings = getExamReceiptSettings(exam);
  const questions = exam.shuffledVersions?.find(version => version.code === result.examVersion)?.questions || exam.questions;
  const entries = questions.map((question, index) => ({ question, number: index + 1, answer: result.answers?.[question.id] }));
  const choices = entries.filter(entry => { const options = questionOptions(entry.question); return options && options.length > 0 && options.length <= 8; });
  const details = entries.filter(entry => !choices.includes(entry));
  const outcome = (question: ReceiptQuestion, answer: unknown) => receiptQuestionIsCorrect(question, answer) ? 'Đúng' : 'Sai';
  let tables = '';
  for (let offset = 0; offset < choices.length;) {
    const chunkSize = choices.length - offset <= 13 ? choices.length - offset : 12;
    const chunk = choices.slice(offset, offset + chunkSize);
    offset += chunkSize;
    const rows = Math.max(4, ...chunk.map(entry => questionOptions(entry.question)!.length));
    tables += `<table class="answer-grid"><thead><tr><th colspan="2" class="row-title">Câu hỏi</th>${chunk.map(entry => `<th>${entry.number}</th>`).join('')}</tr></thead><tbody>`;
    for (let row = 0; row < rows; row++) {
      tables += `<tr>${row === 0 ? `<th rowspan="${rows}" class="row-title">Trả<br>lời</th>` : ''}<th class="option-label">${row + 1}<small>(${label(row)})</small></th>${chunk.map(entry => `<td>${selectedOptions(entry.question, entry.answer).includes(row) ? '×' : ''}</td>`).join('')}</tr>`;
    }
    if (settings.includeCorrectAnswers) tables += `<tr><th colspan="2" class="row-title">Đáp án đúng</th>${chunk.map(entry => `<td class="answer-key">${escape(answerText(entry.question, entry.answer, true))}</td>`).join('')}</tr><tr><th colspan="2" class="row-title">Kết quả</th>${chunk.map(entry => `<td class="outcome">${outcome(entry.question, entry.answer)}</td>`).join('')}</tr>`;
    tables += '</tbody></table>';
  }
  if (details.length) tables += `<table class="detail-table"><thead><tr><th>Câu</th><th>Bài làm học sinh</th>${settings.includeCorrectAnswers ? '<th>Đáp án đúng</th><th>Kết quả</th>' : ''}</tr></thead><tbody>${details.map(entry => `<tr><td>${entry.number}</td><td>${escape(plain(answerText(entry.question, entry.answer)))}</td>${settings.includeCorrectAnswers ? `<td>${escape(plain(answerText(entry.question, entry.answer, true)))}</td><td>${outcome(entry.question, entry.answer)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '……………………';
  const grade = result.totalQuestions > 0 ? Math.round(result.score / result.totalQuestions * 100) / 10 : 0;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu nộp bài - ${escape(student.name)}</title><style>
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #000; background: #fff; font: 14px 'Times New Roman', serif; line-height: 1.35; }
    .sheet { max-width: 180mm; margin: 0 auto; padding: 6mm 0; } .sample { text-align: right; font-weight: bold; }
    .heading { display: grid; grid-template-columns: 35% 65%; text-align: center; gap: 4px; } .heading p { margin: 2px 0; } .rule { display: inline-block; border-bottom: 1px solid; padding-bottom: 3px; }
    h1 { font-size: 19px; text-align: center; margin: 12px 0; } .metadata { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; } .metadata p { margin: 0 0 5px; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; table-layout: fixed; break-inside: avoid; } th, td { border: 1px solid; padding: 5px 3px; text-align: center; overflow-wrap: anywhere; }
    .answer-grid .row-title { width: 24mm; } .answer-grid th.row-title { font-size: 12px; } .answer-grid th, .answer-grid td { padding: 3px; } .answer-grid tbody td { height: 7mm; font-weight: bold; font-size: 18px; line-height: 1; } .option-label { width: 10mm; } small { display: inline; margin-left: 2px; font-weight: normal; font-size: 10px; }
    .answer-grid td.answer-key { font-size: 12px; } .answer-grid td.outcome { font-size: 11px; } .detail-table { break-inside: auto; } .detail-table th:first-child { width: 12mm; } .detail-table td { text-align: left; font-size: 12px; } .detail-table tr { break-inside: avoid; }
    .summary { border: 1px solid; padding: 10px 12px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 15px; font-weight: bold; break-inside: avoid; }
    .confirmation { margin: 16px 0 8px; } .signatures { display: grid; grid-template-columns: 1fr 1fr; text-align: center; break-inside: avoid; } .signature-space { height: 25mm; } .record { font-size: 11px; margin-top: 4px; margin-bottom: 0; overflow-wrap: anywhere; } .legend { font-size: 12px; margin: 6px 0 12px; }
    @media screen { body { padding: 16px; background: #e5e7eb; } .sheet { background: white; padding: 12mm; max-width: 210mm; box-shadow: 0 2px 8px #0002; } }
    @media print { .sheet { padding: 0; } }
  </style></head><body><main class="sheet"><div class="sample">Mẫu số 01</div>
  <div class="heading"><div><p>${escape(settings.schoolName || 'TRƯỜNG ………………………')}</p><p><b>HỘI ĐỒNG KIỂM TRA</b></p><span class="rule">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div><div><p><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b></p><p><b class="rule">Độc lập – Tự do – Hạnh phúc</b></p></div></div>
  <h1>BIÊN BẢN LÀM BÀI KIỂM TRA</h1>
  <div class="metadata"><div><p>Họ và tên: <b>${escape(student.name)}</b></p><p>Lớp: ${escape(exam.classNames?.[getReceiptStudentClassId(exam, student, result) || ''] || 'Chưa được gán lớp')}</p><p>Mã học sinh / SBD: ${escape(student.id)}</p><p>Môn: ${escape(settings.subject || '……………………')}</p></div><div><p>Kỳ thi: ${escape(exam.title)}</p><p>Mã đề: ${escape(result.examVersion || 'Gốc')}</p><p>Thời gian làm bài: ${exam.durationMinutes} phút</p><p>Bắt đầu: ${escape(date(startedAt))}</p><p>Kết thúc: ${escape(date(result.submittedAt))}</p></div></div>
  ${tables}<p class="legend">Dấu ×: phương án học sinh đã chọn. Ô trống / dấu —: chưa trả lời. Câu đúng được tính theo cách chấm của kỳ thi.</p>
  <div class="summary"><span>Số câu đúng: ${result.score}/${result.totalQuestions}</span><span>Số câu chưa đúng: ${Math.max(0, result.totalQuestions - result.score)}</span><span>Điểm: ${grade.toLocaleString('vi-VN')} / 10</span></div>
  <p class="confirmation">Tôi xác nhận các câu trả lời trên là bài làm của tôi và đã nộp bài.</p>
  <div class="signatures"><div><b>HỌC SINH</b><div><i>(Ký và ghi rõ họ tên)</i></div><div class="signature-space"></div><b>${escape(student.name)}</b></div><div><b>GIÁO VIÊN / GIÁM THỊ</b><div><i>(Ký và ghi rõ họ tên)</i></div><div class="signature-space"></div>${settings.invigilatorName.trim() ? `<b>${escape(settings.invigilatorName.trim())}</b>` : '………………………………'}</div></div>
  <p class="record">Mã bài nộp: ${escape(result.id)} · Trạng thái: ĐÃ NỘP BÀI · Thời gian trên phiếu: giờ Việt Nam.</p></main></body></html>`;
}

/** Resolves after the browser finishes its print/preview cycle so jobs never overlap. */
export async function printExamReceipt(html: string): Promise<void> {
  if (document.getElementById('exam-receipt-print-frame')) throw new Error('Một phiếu đang mở lệnh in. Hãy đóng hộp thoại in trước.');
  const frame = document.createElement('iframe');
  frame.id = 'exam-receipt-print-frame';
  frame.title = 'In phiếu xác nhận nộp bài';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;';
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true; window.clearTimeout(watchdog); frame.remove();
      if (error) reject(error); else resolve();
    };
    const watchdog = window.setTimeout(() => finish(new Error('Trình duyệt chưa xác nhận kết thúc lệnh in. Kiểm tra hàng đợi máy in trước khi in lại.')), 90_000);
    frame.onload = async () => {
      try {
        const target = frame.contentWindow;
        if (!target || !frame.contentDocument) throw new Error('Không thể mở phiếu in.');
        await frame.contentDocument.fonts.ready;
        await Promise.race([
          new Promise<void>(done => target.requestAnimationFrame(() => done())),
          new Promise<void>(done => window.setTimeout(done, 100)),
        ]);
        if (settled) return;
        target.addEventListener('afterprint', () => finish(), { once: true });
        target.focus();
        target.print();
      } catch (error) { finish(error); }
    };
    frame.onerror = () => finish(new Error('Không thể tải phiếu in.'));
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
