export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'true_false_matrix',
  'short_answer',
  'fill_blank',
  'matching',
  'ordering',
  'classification',
  'image_hotspot',
] as const;

export type QuestionType = typeof QUESTION_TYPES[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: 'Một đáp án đúng',
  multiple_choice: 'Nhiều đáp án đúng',
  true_false: 'Đúng / Sai',
  true_false_matrix: 'Đúng / Sai nhiều ý',
  short_answer: 'Trả lời ngắn',
  fill_blank: 'Điền khuyết',
  matching: 'Ghép đôi',
  ordering: 'Sắp xếp thứ tự',
  classification: 'Phân loại / Kéo thả',
  image_hotspot: 'Chọn vị trí trên hình',
};

export interface ChoiceOption {
  id: string;
  text: string;
  correct?: boolean;
}

export interface TrueFalseStatement {
  id: string;
  text: string;
  correct: boolean;
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface ClassificationItem {
  id: string;
  text: string;
  groupId: string;
}

export interface ClassificationGroup {
  id: string;
  name: string;
}

export interface ImageHotspot {
  x: number;
  y: number;
  radius: number;
  label?: string;
}

export type QuestionPayload =
  | { type: 'single_choice'; options: ChoiceOption[] }
  | { type: 'multiple_choice'; options: ChoiceOption[] }
  | { type: 'true_false'; correct: boolean }
  | { type: 'true_false_matrix'; statements: TrueFalseStatement[] }
  | { type: 'short_answer'; acceptedAnswers: string[]; caseSensitive?: boolean }
  | { type: 'fill_blank'; answers: string[]; caseSensitive?: boolean }
  | { type: 'matching'; pairs: MatchingPair[] }
  | { type: 'ordering'; items: { id: string; text: string }[] }
  | { type: 'classification'; groups: ClassificationGroup[]; items: ClassificationItem[] }
  | { type: 'image_hotspot'; imageUrl: string; hotspots: ImageHotspot[] };

export interface QuestionDefinition {
  id: string;
  prompt: string;
  points: number;
  payload: QuestionPayload;
  explanation?: string;
  tags?: string[];
}

export type QuestionResponse =
  | string
  | string[]
  | boolean
  | boolean[]
  | Record<string, string>
  | { x: number; y: number }
  | null
  | undefined;

export interface QuestionEvaluation {
  score: number;
  maxScore: number;
  correct: boolean;
  details?: string;
}

const makeId = (prefix = 'q') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function normalizeAnswer(value: string, caseSensitive = false): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('vi-VN');
}

function ratioScore(correctCount: number, total: number, points: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, Math.min(correctCount, total)) / total) * points * 100) / 100;
}

function setEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

export function evaluateQuestion(question: QuestionDefinition, response: QuestionResponse): QuestionEvaluation {
  const maxScore = Math.max(0, Number(question.points) || 0);
  const payload = question.payload;

  switch (payload.type) {
    case 'single_choice': {
      const selectedId = typeof response === 'string' ? response : '';
      const correctId = payload.options.find(option => option.correct)?.id || '';
      const correct = Boolean(correctId) && selectedId === correctId;
      return { score: correct ? maxScore : 0, maxScore, correct };
    }
    case 'multiple_choice': {
      const selected = Array.isArray(response) ? response.map(String) : [];
      const correctIds = payload.options.filter(option => option.correct).map(option => option.id);
      const correct = setEquals(selected, correctIds);
      return { score: correct ? maxScore : 0, maxScore, correct };
    }
    case 'true_false': {
      const correct = typeof response === 'boolean' && response === payload.correct;
      return { score: correct ? maxScore : 0, maxScore, correct };
    }
    case 'true_false_matrix': {
      const answers = Array.isArray(response) ? response : [];
      const correctCount = payload.statements.reduce((count, statement, index) =>
        count + (typeof answers[index] === 'boolean' && answers[index] === statement.correct ? 1 : 0), 0);
      const correct = payload.statements.length > 0 && correctCount === payload.statements.length;
      return { score: ratioScore(correctCount, payload.statements.length, maxScore), maxScore, correct };
    }
    case 'short_answer': {
      const answer = typeof response === 'string' ? normalizeAnswer(response, payload.caseSensitive) : '';
      const accepted = payload.acceptedAnswers.map(item => normalizeAnswer(item, payload.caseSensitive)).filter(Boolean);
      const correct = Boolean(answer) && accepted.includes(answer);
      return { score: correct ? maxScore : 0, maxScore, correct };
    }
    case 'fill_blank': {
      const answers = Array.isArray(response) ? response.map(String) : [];
      const correctCount = payload.answers.reduce((count, expected, index) => {
        const actual = normalizeAnswer(answers[index] || '', payload.caseSensitive);
        return count + (actual && actual === normalizeAnswer(expected, payload.caseSensitive) ? 1 : 0);
      }, 0);
      const correct = payload.answers.length > 0 && correctCount === payload.answers.length;
      return { score: ratioScore(correctCount, payload.answers.length, maxScore), maxScore, correct };
    }
    case 'matching': {
      const answers = response && typeof response === 'object' && !Array.isArray(response) && !('x' in response)
        ? response as Record<string, string>
        : {};
      const correctCount = payload.pairs.reduce((count, pair) => count + (answers[pair.id] === pair.right ? 1 : 0), 0);
      const correct = payload.pairs.length > 0 && correctCount === payload.pairs.length;
      return { score: ratioScore(correctCount, payload.pairs.length, maxScore), maxScore, correct };
    }
    case 'ordering': {
      const answerIds = Array.isArray(response) ? response.map(String) : [];
      const expected = payload.items.map(item => item.id);
      const correctPositions = expected.reduce((count, id, index) => count + (answerIds[index] === id ? 1 : 0), 0);
      const correct = expected.length > 0 && correctPositions === expected.length;
      return { score: ratioScore(correctPositions, expected.length, maxScore), maxScore, correct };
    }
    case 'classification': {
      const answers = response && typeof response === 'object' && !Array.isArray(response) && !('x' in response)
        ? response as Record<string, string>
        : {};
      const correctCount = payload.items.reduce((count, item) => count + (answers[item.id] === item.groupId ? 1 : 0), 0);
      const correct = payload.items.length > 0 && correctCount === payload.items.length;
      return { score: ratioScore(correctCount, payload.items.length, maxScore), maxScore, correct };
    }
    case 'image_hotspot': {
      if (!response || typeof response !== 'object' || Array.isArray(response) || !('x' in response) || !('y' in response)) {
        return { score: 0, maxScore, correct: false };
      }
      const point = response as { x: number; y: number };
      const correct = payload.hotspots.some(hotspot => {
        const distance = Math.hypot(point.x - hotspot.x, point.y - hotspot.y);
        return distance <= hotspot.radius;
      });
      return { score: correct ? maxScore : 0, maxScore, correct };
    }
  }
}

export function validateQuestion(question: QuestionDefinition): string[] {
  const errors: string[] = [];
  if (!question.prompt.trim()) errors.push('Chưa nhập nội dung câu hỏi.');
  if (!Number.isFinite(question.points) || question.points <= 0) errors.push('Điểm phải lớn hơn 0.');

  const payload = question.payload;
  switch (payload.type) {
    case 'single_choice':
      if (payload.options.length < 2) errors.push('Cần ít nhất 2 phương án.');
      if (payload.options.filter(option => option.correct).length !== 1) errors.push('Phải có đúng 1 đáp án đúng.');
      break;
    case 'multiple_choice':
      if (payload.options.length < 2) errors.push('Cần ít nhất 2 phương án.');
      if (!payload.options.some(option => option.correct)) errors.push('Cần chọn ít nhất 1 đáp án đúng.');
      break;
    case 'true_false_matrix':
      if (payload.statements.length < 2) errors.push('Cần ít nhất 2 nhận định.');
      break;
    case 'short_answer':
      if (!payload.acceptedAnswers.some(answer => answer.trim())) errors.push('Cần ít nhất 1 đáp án chấp nhận.');
      break;
    case 'fill_blank':
      if (!payload.answers.length || payload.answers.some(answer => !answer.trim())) errors.push('Mỗi chỗ trống cần có đáp án.');
      break;
    case 'matching':
      if (payload.pairs.length < 2) errors.push('Cần ít nhất 2 cặp ghép.');
      break;
    case 'ordering':
      if (payload.items.length < 2) errors.push('Cần ít nhất 2 mục để sắp xếp.');
      break;
    case 'classification':
      if (payload.groups.length < 2) errors.push('Cần ít nhất 2 nhóm phân loại.');
      if (!payload.items.length) errors.push('Cần ít nhất 1 đối tượng để phân loại.');
      break;
    case 'image_hotspot':
      if (!payload.imageUrl.trim()) errors.push('Cần đường dẫn hình ảnh.');
      if (!payload.hotspots.length) errors.push('Cần ít nhất 1 vùng đáp án đúng trên hình.');
      break;
    case 'true_false':
      break;
  }
  return errors;
}

export function createQuestionTemplate(type: QuestionType): QuestionDefinition {
  const base = { id: makeId(), prompt: '', points: 1 };
  switch (type) {
    case 'single_choice':
      return { ...base, payload: { type, options: [
        { id: makeId('o'), text: 'Phương án A', correct: true },
        { id: makeId('o'), text: 'Phương án B' },
        { id: makeId('o'), text: 'Phương án C' },
        { id: makeId('o'), text: 'Phương án D' },
      ] } };
    case 'multiple_choice':
      return { ...base, payload: { type, options: [
        { id: makeId('o'), text: 'Phương án A', correct: true },
        { id: makeId('o'), text: 'Phương án B', correct: true },
        { id: makeId('o'), text: 'Phương án C' },
        { id: makeId('o'), text: 'Phương án D' },
      ] } };
    case 'true_false':
      return { ...base, payload: { type, correct: true } };
    case 'true_false_matrix':
      return { ...base, payload: { type, statements: [
        { id: makeId('s'), text: 'Nhận định a', correct: true },
        { id: makeId('s'), text: 'Nhận định b', correct: false },
        { id: makeId('s'), text: 'Nhận định c', correct: true },
        { id: makeId('s'), text: 'Nhận định d', correct: false },
      ] } };
    case 'short_answer':
      return { ...base, payload: { type, acceptedAnswers: ['Đáp án'] } };
    case 'fill_blank':
      return { ...base, prompt: 'Điền vào chỗ trống: ____', payload: { type, answers: ['Đáp án'] } };
    case 'matching':
      return { ...base, payload: { type, pairs: [
        { id: makeId('p'), left: 'Nội dung 1', right: 'Ghép với 1' },
        { id: makeId('p'), left: 'Nội dung 2', right: 'Ghép với 2' },
      ] } };
    case 'ordering':
      return { ...base, payload: { type, items: [
        { id: makeId('i'), text: 'Bước 1' },
        { id: makeId('i'), text: 'Bước 2' },
        { id: makeId('i'), text: 'Bước 3' },
      ] } };
    case 'classification': {
      const groupA = { id: makeId('g'), name: 'Nhóm A' };
      const groupB = { id: makeId('g'), name: 'Nhóm B' };
      return { ...base, payload: { type, groups: [groupA, groupB], items: [
        { id: makeId('i'), text: 'Đối tượng 1', groupId: groupA.id },
        { id: makeId('i'), text: 'Đối tượng 2', groupId: groupB.id },
      ] } };
    }
    case 'image_hotspot':
      return { ...base, payload: { type, imageUrl: '', hotspots: [{ x: 50, y: 50, radius: 10, label: 'Vùng đúng' }] } };
  }
}
