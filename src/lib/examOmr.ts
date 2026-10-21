import { choiceQuestionEntries } from './examQuestionLayout';
import { receiptAnswerText, receiptQuestionIsCorrect, type ReceiptExam, type ReceiptQuestion } from './examReceipt';

export function buildOmrScanRequest(exam: ReceiptExam) {
  const layouts = [{ code: 'Gốc', questions: exam.questions }, ...(exam.shuffledVersions || [])].map(version => ({
    code: version.code,
    numbers: choiceQuestionEntries(version.questions).map(entry => entry.number),
  }));
  const questionNumbers = [...new Set(layouts.flatMap(layout => layout.numbers))].sort((a, b) => a - b);
  if (!questionNumbers.length) throw new Error('Kỳ thi này chưa có câu trắc nghiệm để quét.');
  const prompt = `Đọc phiếu trả lời trắc nghiệm trong ảnh, tự căn chỉnh góc chụp.
Đọc đầy đủ số báo danh (sbd) và mã đề (maDe), giữ nguyên mọi chữ số và số 0 ở đầu.
Danh sách câu trắc nghiệm của từng mã đề: ${JSON.stringify(layouts)}.
Mã đề gốc có ${layouts[0].numbers.length} câu trắc nghiệm. Mỗi mã đề chỉ đọc đúng các số câu trong danh sách tương ứng.
Trả các lựa chọn học sinh đã tô (A, B, C, D hoặc chữ cái tương ứng trên phiếu) vào part1, dùng số câu trên đề làm khóa. Nếu chọn nhiều đáp án, ngăn cách bằng dấu phẩy. Câu bỏ trống trả chuỗi rỗng.
Không tự thêm câu hỏi, không dùng mẫu số câu cố định, không đọc phần tự luận hoặc trả lời ngắn vào part1. Không thấy mã đề thì trả maDe là Gốc.
Chỉ trả JSON gồm sbd, maDe, part1.`;
  return { prompt, questionNumbers };
}

function omrAnswer(question: ReceiptQuestion, marked: unknown): unknown {
  if (typeof marked !== 'string') return undefined;
  const letters = [...new Set(marked.trim().toUpperCase().split(/[\s,;/]+/).filter(Boolean))];
  if (!letters.length || letters.some(letter => !/^[A-H]$/.test(letter))) return undefined;
  const indexes = letters.map(letter => letter.charCodeAt(0) - 65);
  const payload = question.type === 'question_engine' ? question.engineQuestion?.payload : undefined;
  if (payload?.type === 'multiple_choice') return indexes.every(index => payload.options[index]) ? indexes.map(index => payload.options[index].id) : undefined;
  if (indexes.length !== 1) return undefined;
  if (payload?.type === 'single_choice') return payload.options[indexes[0]]?.id;
  if (payload?.type === 'true_false') return indexes[0] === 0 ? true : indexes[0] === 1 ? false : undefined;
  return question.options[indexes[0]] !== undefined ? indexes[0] : undefined;
}

export function gradeOmrResponse(exam: ReceiptExam, data: { maDe?: string; part1?: Record<string, unknown>; [key: string]: unknown }) {
  const code = String(data.maDe || 'Gốc').trim();
  const questions = code === 'Gốc' || code === exam.id ? exam.questions : exam.shuffledVersions?.find(version => version.code === code)?.questions;
  if (!questions) throw new Error('Mã đề trên phiếu không thuộc kỳ thi đang chọn.');
  const entries = choiceQuestionEntries(questions);
  if (!entries.length) throw new Error('Mã đề này chưa có câu trắc nghiệm để chấm.');
  let score = 0;
  const details = entries.map(({ question, number }) => {
    const marked = data.part1?.[number];
    const isCorrect = receiptQuestionIsCorrect(question, omrAnswer(question, marked));
    if (isCorrect) score += question.points || 0.25;
    return { question: number, studentAnswer: typeof marked === 'string' ? marked : '', correctAnswer: receiptAnswerText(question, undefined, true), isCorrect };
  });
  return { ...data, score: Math.round(score * 100) / 100, correctCount: details.filter(detail => detail.isCorrect).length, totalCount: details.length, details };
}

/** The OCR response schema contains exactly the question numbers requested by the selected exam. */
export function buildOmrResponseSchema(numbers: unknown) {
  if (!Array.isArray(numbers) || !numbers.length || numbers.length > 1000 || numbers.some(number => !Number.isSafeInteger(number) || number < 1 || number > 1000)) throw new Error('Danh sách câu trắc nghiệm không hợp lệ.');
  const questionNumbers = [...new Set(numbers as number[])].sort((a, b) => a - b);
  return {
    type: 'object',
    properties: {
      sbd: { type: 'string' },
      maDe: { type: 'string' },
      part1: { type: 'object', properties: Object.fromEntries(questionNumbers.map(number => [String(number), { type: 'string' }])), description: `Chỉ các câu trắc nghiệm: ${questionNumbers.join(', ')}` },
    },
    required: ['sbd', 'maDe', 'part1'],
  };
}
