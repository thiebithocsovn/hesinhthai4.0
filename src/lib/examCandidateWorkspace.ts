import type { QuestionDefinition } from './questionEngine';

export const EXAM_PROFILES = {
  school: { label: 'Kiểm tra tại trường', description: 'Giao diện từng câu, điều hướng tự do, chấm điểm hiện hành.' },
  thpt: { label: 'Luyện thi THPT', description: 'Phân loại câu nhiều lựa chọn, đúng/sai nhiều ý và trả lời ngắn. Chấm theo cấu hình điểm hiện hành, chưa phải thang điểm chính thức của Bộ.' },
  academic: { label: 'Thi học thuật / tuyển sinh', description: 'Giao diện tập trung, hỗ trợ câu tự luận, thực hành và các dạng câu đã có.' },
  international: { label: 'Luyện thi quốc tế (tổng quát)', description: 'Giao diện từng câu kiểu khảo thí số. Không mô phỏng điểm chuẩn hóa, thích ứng hoặc quy tắc chính thức SAT/IELTS/TOEFL.' },
} as const;
export type ExamProfile = keyof typeof EXAM_PROFILES;
export function isExamProfile(value: unknown): value is ExamProfile {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EXAM_PROFILES, value);
}
export interface ProgressQuestion {
  id: string;
  type?: string;
  engineQuestion?: QuestionDefinition;
  matchingPairs?: readonly { id: string }[];
  practicalMode?: string;
  options?: readonly string[];
}
export type AnswerState = 'empty' | 'partial' | 'complete' | 'observed';
const present = (v: unknown): boolean => typeof v === 'string' ? v.trim().length > 0 : typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
function counts(done: number, total: number): AnswerState {
  return done === 0 || total === 0 ? 'empty' : done >= total ? 'complete' : 'partial';
}
export function answerState(q: ProgressQuestion, answer: unknown): AnswerState {
  if (q.type === 'practical' && q.practicalMode === 'observe') return 'observed';
  const p = q.engineQuestion?.payload;
  const list = Array.isArray(answer) ? answer : [];
  const map = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer as Record<string, unknown> : {};
  if (p) {
    switch (p.type) {
      case 'single_choice': return p.options.some(o => o.id === answer) ? 'complete' : 'empty';
      case 'multiple_choice': return list.some(id => p.options.some(o => o.id === id)) ? 'complete' : 'empty';
      case 'true_false': return typeof answer === 'boolean' ? 'complete' : 'empty';
      case 'true_false_matrix': return counts(p.statements.filter((_, i) => typeof list[i] === 'boolean').length, p.statements.length);
      case 'short_answer': return typeof answer === 'string' && present(answer) ? 'complete' : 'empty';
      case 'fill_blank': return counts(p.answers.filter((_, i) => present(list[i])).length, p.answers.length);
      case 'matching': return counts(p.pairs.filter(item => present(map[item.id])).length, p.pairs.length);
      case 'classification': return counts(p.items.filter(item => present(map[item.id])).length, p.items.length);
      case 'ordering': return counts(new Set(list.filter(id => p.items.some(item => item.id === id))).size, p.items.length);
      case 'image_hotspot': return typeof map.x === 'number' && Number.isFinite(map.x) && typeof map.y === 'number' && Number.isFinite(map.y) ? 'complete' : 'empty';
    }
  }
  if (q.type === 'matching') return counts((q.matchingPairs || []).filter(item => present(map[item.id])).length, q.matchingPairs?.length || 0);
  if (q.type === 'practical') return map.kind === 'practical-file' && present(map.name) && present(map.dataUrl) ? 'complete' : 'empty';
  if (q.type === 'essay' || q.type === 'short_answer') return typeof answer === 'string' && present(answer) ? 'complete' : 'empty';
  return typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < (q.options?.length || 0) ? 'complete' : 'empty';
}
export function examProgress(questions: readonly ProgressQuestion[], answers: Record<string, unknown>) {
  const states = questions.map(q => answerState(q, answers[q.id]));
  return {
    states,
    complete: states.filter(s => s === 'complete').length,
    partial: states.filter(s => s === 'partial').length,
    empty: states.filter(s => s === 'empty').length,
    observed: states.filter(s => s === 'observed').length,
  };
}
export function questionGroup(q: ProgressQuestion): string {
  const type = q.engineQuestion?.payload.type || q.type || 'multiple_choice';
  if (q.engineQuestion && type === 'multiple_choice') return 'Nhiều đáp án';
  switch (type) {
    case 'single_choice': case 'multiple_choice': return 'Một đáp án';
    case 'true_false': case 'true_false_matrix': return 'Đúng / Sai';
    case 'short_answer': case 'fill_blank': return 'Trả lời ngắn / Điền khuyết';
    case 'essay': return 'Tự luận';
    case 'practical': return 'Thực hành';
    default: return 'Dạng khác';
  }
}
