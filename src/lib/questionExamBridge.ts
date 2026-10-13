import { createSecureExamAccessCode } from './examPrivacy';
import type { QuestionDefinition } from './questionEngine';
import { isValidTeacherUid } from './teacherIsolation';

export interface QuestionBankSnapshot {
  id: string;
  title: string;
  questions: QuestionDefinition[];
}

export interface QuestionEngineExamQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  type: 'question_engine';
  engineQuestion: QuestionDefinition;
}

export interface QuestionEngineExamPayload {
  id: string;
  title: string;
  durationMinutes: number;
  questions: QuestionEngineExamQuestion[];
  status: 'draft' | 'published' | 'closed';
  createdAt: string;
  startTime?: string;
  teacherId: string;
  sourceQuestionBankId: string;
  questionSchemaVersion: 2;
}

export interface CreateQuestionBankExamOptions {
  teacherId: string;
  durationMinutes?: number;
  status?: 'draft' | 'published';
  startTime?: string;
  title?: string;
  examId?: string;
}

function cloneQuestion(question: QuestionDefinition): QuestionDefinition {
  return JSON.parse(JSON.stringify(question)) as QuestionDefinition;
}

export function toExamQuestion(question: QuestionDefinition): QuestionEngineExamQuestion {
  const payload = question.payload;
  let options: string[] = [];
  let correctAnswer = 0;

  if (payload.type === 'single_choice' || payload.type === 'multiple_choice') {
    options = payload.options.map(option => option.text);
    const firstCorrect = payload.options.findIndex(option => option.correct);
    correctAnswer = firstCorrect >= 0 ? firstCorrect : 0;
  } else if (payload.type === 'true_false') {
    options = ['Đúng', 'Sai'];
    correctAnswer = payload.correct ? 0 : 1;
  }

  return {
    id: question.id,
    text: question.prompt,
    options,
    correctAnswer,
    type: 'question_engine',
    engineQuestion: cloneQuestion(question),
  };
}

export function createExamFromQuestionBank(
  bank: QuestionBankSnapshot,
  options: CreateQuestionBankExamOptions,
): QuestionEngineExamPayload {
  if (!isValidTeacherUid(options.teacherId)) {
    throw new RangeError('Tài khoản giáo viên chưa hợp lệ để tạo bài kiểm tra.');
  }
  if (!bank.id || !bank.title.trim() || !bank.questions.length) {
    throw new RangeError('Bộ câu hỏi phải có tên và ít nhất một câu hỏi.');
  }

  const durationMinutes = Math.max(1, Math.min(300, Math.round(options.durationMinutes || 45)));
  const status = options.status || 'draft';
  const examId = options.examId || createSecureExamAccessCode();
  const title = (options.title || bank.title).trim().slice(0, 240) || 'Bài kiểm tra';

  return {
    id: examId,
    title,
    durationMinutes,
    questions: bank.questions.map(toExamQuestion),
    status,
    createdAt: new Date().toISOString(),
    ...(options.startTime ? { startTime: options.startTime } : {}),
    teacherId: options.teacherId,
    sourceQuestionBankId: bank.id,
    questionSchemaVersion: 2,
  };
}

export function isQuestionEngineExamQuestion(value: unknown): value is QuestionEngineExamQuestion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<QuestionEngineExamQuestion>;
  return candidate.type === 'question_engine' && Boolean(candidate.engineQuestion?.payload?.type);
}
