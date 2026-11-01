// Essay (tự luận) and practical (thực hành) questions for the exam app.
//
// Students' work travels inside the existing `answers` map of their result, so
// the deployed Firestore rules for guest submissions stay unchanged. Teachers
// grade later by ticking rubric items; their grades live in `manualGrades` on
// the same result document, which only the owning teacher may update.

import type { QuestionDefinition } from './questionEngine';

export type ManualQuestionType = 'essay' | 'practical';
export type PracticalMode = 'file' | 'observe';

export interface RubricItem {
  id: string;
  text: string;
  points: number;
  /** Optional automatic check on the submitted practical file (a suggestion while grading). */
  auto?: { kind: string; value?: string };
}

export interface GradableQuestion {
  id: string;
  type?: string;
  points?: number;
  rubric?: RubricItem[];
  sampleAnswer?: string;
  practicalMode?: PracticalMode;
  acceptedFiles?: string;
  engineQuestion?: QuestionDefinition;
  correctTextAnswer?: string;
}

export interface ManualGrade {
  points: number;
  checks: string[];
  comment?: string;
  gradedAt: string;
}

export interface SubmittedPracticalFile {
  kind: 'practical-file';
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface ScoredExam<Q extends GradableQuestion = GradableQuestion> {
  questions: Q[];
  shuffledVersions?: { code: string; questions: Q[] }[];
  roundScoreToInteger?: boolean;
}

export interface ScoredResult {
  answers?: Record<string, unknown>;
  examVersion?: string;
  manualGrades?: Record<string, ManualGrade>;
}

export const PRACTICAL_FILE_PRESETS = [
  { id: 'any', label: 'Mọi loại tệp', accept: '' },
  { id: 'word', label: 'Word (.docx)', accept: '.doc,.docx' },
  { id: 'powerpoint', label: 'PowerPoint (.pptx)', accept: '.ppt,.pptx' },
  { id: 'excel', label: 'Excel (.xlsx)', accept: '.xls,.xlsx' },
  { id: 'scratch', label: 'Scratch (.sb3)', accept: '.sb3' },
  { id: 'image', label: 'Ảnh (Paint, ảnh chụp màn hình)', accept: 'image/*' },
] as const;

/** Raw size limit per practical file; Firestore stores the whole result in one ≤1 MiB document. */
export const MAX_PRACTICAL_FILE_BYTES = 500 * 1024;
/** Upper bound for the serialized answers of one submission, leaving room for the other fields. */
export const MAX_ANSWERS_PAYLOAD_BYTES = 900 * 1024;

export const QUICK_COMMENTS = [
  'Làm tốt, đủ ý!',
  'Đúng nhưng chưa đủ ý.',
  'Cần trình bày rõ ràng hơn.',
  'Chưa đúng yêu cầu của đề.',
  'Em cần lưu tệp đúng tên.',
];

export function isManualQuestion(question: Pick<GradableQuestion, 'type'>): boolean {
  return question.type === 'essay' || question.type === 'practical';
}

export function isShortAnswerQuestion(question: GradableQuestion): boolean {
  return question.type === 'short_answer' || (question.type === 'question_engine' && question.engineQuestion?.payload.type === 'short_answer');
}

/** Short answers retain automatic marking until a teacher saves an override. */
export function canTeacherGradeQuestion(question: GradableQuestion): boolean {
  return isManualQuestion(question) || isShortAnswerQuestion(question);
}

export function examHasManualQuestions(exam: Pick<ScoredExam, 'questions'>): boolean {
  return exam.questions.some(isManualQuestion);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function rubricTotal(question: Pick<GradableQuestion, 'rubric'>): number {
  return round2((question.rubric || []).reduce((sum, item) => sum + (Number.isFinite(item.points) && item.points > 0 ? item.points : 0), 0));
}

export function questionMaxPoints(question: GradableQuestion): number {
  if (isManualQuestion(question)) {
    const total = rubricTotal(question);
    if (total > 0) return total;
  }
  return Number.isFinite(question.points) && (question.points as number) > 0 ? round2(question.points as number) : 1;
}

/** Old exams (all objective, one point each) keep the original "correct / total" display. */
export function examUsesWeightedScoring(exam: Pick<ScoredExam, 'questions'>): boolean {
  return exam.questions.some(question => canTeacherGradeQuestion(question) || (question.points !== undefined && question.points !== 1));
}

export function examMaxPoints(exam: Pick<ScoredExam, 'questions'>): number {
  return round2(exam.questions.reduce((sum, question) => sum + questionMaxPoints(question), 0));
}

export interface ExamPointBreakdown { objective: number; essay: number; practical: number; total: number }

export function examPointBreakdown(exam: Pick<ScoredExam, 'questions'>): ExamPointBreakdown {
  const breakdown = { objective: 0, essay: 0, practical: 0, total: 0 };
  for (const question of exam.questions) {
    const points = questionMaxPoints(question);
    if (question.type === 'essay') breakdown.essay += points;
    else if (question.type === 'practical') breakdown.practical += points;
    else breakdown.objective += points;
  }
  return { objective: round2(breakdown.objective), essay: round2(breakdown.essay), practical: round2(breakdown.practical), total: round2(breakdown.objective + breakdown.essay + breakdown.practical) };
}

export interface ExamScoreSummary {
  earned: number;
  max: number;
  score10: number;
  objectiveEarned: number;
  objectiveMax: number;
  objectiveCorrect: number;
  objectiveCount: number;
  manualEarned: number;
  manualMax: number;
  manualCount: number;
  pendingManual: number;
  complete: boolean;
}

export function versionQuestions<Q extends GradableQuestion>(exam: ScoredExam<Q>, examVersion?: string): Q[] {
  if (!examVersion || examVersion === 'Gốc') return exam.questions;
  return exam.shuffledVersions?.find(version => version.code === examVersion)?.questions || exam.questions;
}

/**
 * Weighted score on the 10-point scale. Objective correctness is judged on the
 * submitted version (option order differs between versions); point weights and
 * rubrics always come from the teacher's original exam.
 */
export function summarizeExamScore<Q extends GradableQuestion>(
  exam: ScoredExam<Q>,
  result: ScoredResult,
  isCorrect: (question: Q, answer: unknown) => boolean,
): ExamScoreSummary {
  const originals = new Map(exam.questions.map(question => [question.id, question]));
  const summary: ExamScoreSummary = { earned: 0, max: 0, score10: 0, objectiveEarned: 0, objectiveMax: 0, objectiveCorrect: 0, objectiveCount: 0, manualEarned: 0, manualMax: 0, manualCount: 0, pendingManual: 0, complete: true };
  for (const question of versionQuestions(exam, result.examVersion)) {
    const original = originals.get(question.id) || question;
    const max = questionMaxPoints(original);
    if (isManualQuestion(original)) {
      summary.manualCount += 1;
      summary.manualMax += max;
      const grade = result.manualGrades?.[question.id];
      if (grade && Number.isFinite(grade.points)) summary.manualEarned += Math.min(max, Math.max(0, grade.points));
      else summary.pendingManual += 1;
    } else {
      summary.objectiveCount += 1;
      summary.objectiveMax += max;
      const override = isShortAnswerQuestion(original) ? result.manualGrades?.[question.id] : undefined;
      const earned = override && Number.isFinite(override.points)
        ? Math.min(max, Math.max(0, override.points))
        : isCorrect(question, result.answers?.[question.id]) ? max : 0;
      summary.objectiveEarned += earned;
      if (earned === max) {
        summary.objectiveCorrect += 1;
      }
    }
  }
  summary.objectiveEarned = round2(summary.objectiveEarned);
  summary.objectiveMax = round2(summary.objectiveMax);
  summary.manualEarned = round2(summary.manualEarned);
  summary.manualMax = round2(summary.manualMax);
  summary.earned = round2(summary.objectiveEarned + summary.manualEarned);
  summary.max = round2(summary.objectiveMax + summary.manualMax);
  summary.complete = summary.pendingManual === 0;
  const ratio = summary.max > 0 ? summary.earned / summary.max : 0;
  summary.score10 = exam.roundScoreToInteger ? Math.round(ratio * 10) : round2(ratio * 10);
  return summary;
}

export function formatPoints(value: number): string {
  return round2(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

export function gradeFromChecks(question: GradableQuestion, checks: string[], comment = ''): ManualGrade {
  const chosen = new Set(checks);
  const points = round2((question.rubric || []).filter(item => chosen.has(item.id)).reduce((sum, item) => sum + Math.max(0, item.points || 0), 0));
  return { points: Math.min(points, questionMaxPoints(question)), checks: [...chosen].filter(id => question.rubric?.some(item => item.id === id)), ...(comment.trim() ? { comment: comment.trim().slice(0, 500) } : {}), gradedAt: new Date().toISOString() };
}

export function isSubmittedPracticalFile(value: unknown): value is SubmittedPracticalFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<SubmittedPracticalFile>;
  return file.kind === 'practical-file' && typeof file.name === 'string' && typeof file.dataUrl === 'string' && file.dataUrl.startsWith('data:');
}

/** Short text used in tables, exports and printed receipts. */
export function describeManualAnswer(question: GradableQuestion, answer: unknown): string {
  if (question.type === 'practical') {
    if (question.practicalMode === 'observe') return 'Chấm trực tiếp tại lớp';
    return isSubmittedPracticalFile(answer) ? `Tệp: ${answer.name}` : 'Chưa nộp tệp';
  }
  const text = typeof answer === 'string' ? answer.trim() : '';
  return text || 'Không trả lời';
}

/**
 * Short code printed on the signed receipt and shown while grading, so the teacher can
 * confirm the essay/practical work being graded is exactly what the student submitted.
 */
export function manualSubmissionCode(questions: readonly GradableQuestion[], answers: Record<string, unknown> | undefined): string {
  const manual = questions.filter(isManualQuestion);
  if (!manual.length) return '';
  let hash = 0x811c9dc5;
  const source = JSON.stringify(manual.map(question => [question.id, answers?.[question.id] ?? null]));
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export function answersPayloadBytes(answers: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(answers)).length;
}

export function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không đọc được tệp. Em hãy chọn lại.'));
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Không mở được ảnh.'));
      element.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_PRACTICAL_FILE_BYTES) return blob;
    }
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads a student's practical file; photos and screenshots are shrunk to fit the submission. */
export async function readPracticalFile(file: File): Promise<SubmittedPracticalFile> {
  const isImage = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
  const blob = isImage ? await compressImage(file) : file;
  if (blob.size > MAX_PRACTICAL_FILE_BYTES) {
    throw new Error(`Tệp "${file.name}" nặng ${formatFileSize(file.size)}, vượt giới hạn ${formatFileSize(MAX_PRACTICAL_FILE_BYTES)}. Em hãy xóa bớt hình trong tệp, hoặc chụp ảnh màn hình bài làm rồi nộp ảnh.`);
  }
  const name = isImage && blob !== file ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
  return { kind: 'practical-file', name: name.slice(0, 160), type: (blob.type || file.type || 'application/octet-stream').slice(0, 120), size: blob.size, dataUrl: await readAsDataUrl(blob) };
}

/** Students receive the exam without teacher-only marking notes. */
export function stripTeacherOnlyFields<E extends { questions: GradableQuestion[]; shuffledVersions?: { questions: GradableQuestion[] }[] }>(exam: E): E {
  const clean = <Q extends GradableQuestion>(questions: Q[]) => questions.map(question => {
    if (!('sampleAnswer' in question)) return question;
    const { sampleAnswer: _hidden, ...rest } = question;
    return rest as Q;
  });
  return {
    ...exam,
    questions: clean(exam.questions),
    ...(exam.shuffledVersions ? { shuffledVersions: exam.shuffledVersions.map(version => ({ ...version, questions: clean(version.questions) })) } : {}),
  };
}

const STOP_WORDS = new Set(['những', 'được', 'trong', 'không', 'nhưng', 'cũng', 'hoặc', 'người', 'mình', 'chúng', 'này', 'khi', 'các', 'với', 'của', 'cho', 'một', 'là', 'và', 'thì', 'có', 'để', 'em', 'hãy', 'ý']);

function syllables(text: string): string[] {
  return text.toLocaleLowerCase('vi-VN').replace(/<[^>]*>/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Phrases from the rubric worth highlighting in a student's essay (a reading aid, never a score).
 * Vietnamese words are mostly two syllables, so pairs like "mật khẩu" are matched rather than
 * single syllables, which would light up almost every sentence. Long unaccented terms
 * (Word, Scratch, PowerPoint) are matched on their own.
 */
export function rubricKeywords(question: GradableQuestion): string[] {
  const keywords = new Set<string>();
  for (const source of [...(question.rubric || []).map(item => item.text), question.sampleAnswer || '']) {
    const words = syllables(source);
    words.forEach((word, index) => {
      const next = words[index + 1];
      if (next && !STOP_WORDS.has(word) && !STOP_WORDS.has(next)) keywords.add(`${word} ${next}`);
      if (word.length >= 4 && /^[a-z0-9]+$/.test(word)) keywords.add(word);
    });
  }
  return [...keywords].slice(0, 60);
}

/** Splits text into plain and highlighted runs using the phrases from `rubricKeywords`. */
export function highlightRuns(text: string, keywords: ReadonlySet<string>): { text: string; mark: boolean }[] {
  const parts = text.split(/(\p{L}[\p{L}\p{N}]*)/u);
  const marked = new Array(parts.length).fill(false);
  const wordIndexes = parts.map((part, index) => /^\p{L}/u.test(part) ? index : -1).filter(index => index >= 0);
  wordIndexes.forEach((index, position) => {
    const word = parts[index].toLocaleLowerCase('vi-VN');
    if (keywords.has(word)) marked[index] = true;
    const nextIndex = wordIndexes[position + 1];
    if (nextIndex !== undefined && /^\s+$/.test(parts.slice(index + 1, nextIndex).join('')) && keywords.has(`${word} ${parts[nextIndex].toLocaleLowerCase('vi-VN')}`)) {
      marked[index] = true; marked[nextIndex] = true;
      for (let between = index + 1; between < nextIndex; between++) marked[between] = true;
    }
  });
  const runs: { text: string; mark: boolean }[] = [];
  parts.forEach((part, index) => {
    if (!part) return;
    const last = runs[runs.length - 1];
    if (last && last.mark === marked[index]) last.text += part; else runs.push({ text: part, mark: marked[index] });
  });
  return runs;
}

export function newRubricItem(text = '', points = 0.5): RubricItem {
  return { id: Math.random().toString(36).slice(2, 10), text, points };
}
