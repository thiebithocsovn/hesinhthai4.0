import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  examHasManualQuestions,
  examMaxPoints,
  examPointBreakdown,
  examUsesWeightedScoring,
  gradeFromChecks,
  highlightRuns,
  questionMaxPoints,
  rubricKeywords,
  stripTeacherOnlyFields,
  summarizeExamScore,
  type GradableQuestion,
} from '../src/lib/examManualGrading';
import { buildExamReceiptHtml, receiptQuestionIsCorrect, type ReceiptQuestion } from '../src/lib/examReceipt';

const mc = (id: string, correctAnswer: number, points?: number): ReceiptQuestion & GradableQuestion => ({ id, text: id, options: ['A', 'B', 'C', 'D'], correctAnswer, type: 'multiple_choice', ...(points ? { points } : {}) });
const essay: ReceiptQuestion & GradableQuestion = { id: 'essay', text: 'Nêu 2 cách giữ an toàn mật khẩu', options: [], correctAnswer: -1, type: 'essay', sampleAnswer: 'Không chia sẻ mật khẩu', rubric: [{ id: 'e1', text: 'Không chia sẻ mật khẩu', points: 1 }, { id: 'e2', text: 'Đặt mật khẩu khó đoán', points: 1 }] };
const practical: ReceiptQuestion & GradableQuestion = { id: 'practical', text: 'Soạn văn bản', options: [], correctAnswer: -1, type: 'practical', practicalMode: 'file', rubric: [{ id: 'p1', text: 'Tiêu đề in đậm', points: 2 }, { id: 'p2', text: 'Chèn hình', points: 2 }] };

// Old exams keep the original one-point-per-question display.
const legacy = { questions: [mc('q1', 0), mc('q2', 1)] };
assert.equal(examUsesWeightedScoring(legacy), false);
assert.equal(examHasManualQuestions(legacy), false);

// 4 objective points (2 × 1 + 1 × 2) + 2 essay + 4 practical = 10.
const exam = { id: 'exam', title: 'Kiểm tra Tin học', durationMinutes: 35, questions: [mc('q1', 0), mc('q2', 1), mc('q3', 2, 2), essay, practical] };
assert.equal(examUsesWeightedScoring(exam), true);
assert.equal(examMaxPoints(exam), 10);
assert.deepEqual(examPointBreakdown(exam), { objective: 4, essay: 2, practical: 4, total: 10 });
assert.equal(questionMaxPoints(essay), 2);
assert.equal(questionMaxPoints({ id: 'x', type: 'essay' }), 1, 'An essay without rubric defaults to one point.');

const answers = { q1: 0, q2: 3, q3: 2, essay: 'Không chia sẻ mật khẩu cho bạn' };
const pending = summarizeExamScore(exam, { answers }, receiptQuestionIsCorrect);
assert.equal(pending.objectiveEarned, 3, 'q1 (1đ) and q3 (2đ) are correct.');
assert.equal(pending.pendingManual, 2);
assert.equal(pending.complete, false);

const graded = summarizeExamScore(exam, { answers, manualGrades: {
  essay: gradeFromChecks(essay, ['e1']),
  practical: gradeFromChecks(practical, ['p1', 'p2', 'unknown']),
} }, receiptQuestionIsCorrect);
assert.equal(graded.complete, true);
assert.equal(graded.manualEarned, 5);
assert.equal(graded.earned, 8);
assert.equal(graded.score10, 8);
assert.deepEqual(gradeFromChecks(practical, ['p1', 'unknown']).checks, ['p1'], 'Unknown rubric ids are ignored.');

const rounded = summarizeExamScore({ ...exam, roundScoreToInteger: true }, { answers, manualGrades: { essay: gradeFromChecks(essay, ['e1']), practical: { points: 2.5, checks: [], gradedAt: '' } } }, receiptQuestionIsCorrect);
assert.equal(rounded.earned, 6.5);
assert.equal(rounded.score10, 7, 'Rounding to an integer follows Thông tư 27 style reporting.');
const overGraded = summarizeExamScore(exam, { answers, manualGrades: { essay: { points: 99, checks: [], gradedAt: '' }, practical: { points: -3, checks: [], gradedAt: '' } } }, receiptQuestionIsCorrect);
assert.equal(overGraded.manualEarned, 2, 'Manual points are clamped to each question maximum.');

// Shuffled versions: correctness on the submitted version, weights from the original.
const version = { code: 'V1', questions: [{ ...mc('q3', 0), points: undefined }, mc('q1', 3), mc('q2', 1), essay, practical] };
const shuffled = summarizeExamScore({ ...exam, shuffledVersions: [version] }, { examVersion: 'V1', answers: { q3: 0, q1: 3, q2: 0 } }, receiptQuestionIsCorrect);
assert.equal(shuffled.objectiveEarned, 3, 'q3 keeps its 2-point weight from the original exam.');

// Students never receive the marking guide.
const forStudents = stripTeacherOnlyFields({ questions: [essay, practical], shuffledVersions: [{ code: 'V1', questions: [essay] }] });
assert.equal('sampleAnswer' in forStudents.questions[0], false);
assert.equal('sampleAnswer' in forStudents.shuffledVersions![0].questions[0], false);
assert.equal(forStudents.questions[1].rubric?.length, 2, 'Practical criteria stay visible as requirements.');
assert.ok(rubricKeywords(essay).includes('mật khẩu'));
assert.ok(!rubricKeywords(essay).includes('mật'), 'Single Vietnamese syllables are not highlighted on their own.');
const runs = highlightRuns('Em không cho bạn biết mật khẩu, và đặt mật  khẩu dài.', new Set(rubricKeywords(essay)));
assert.deepEqual(runs.filter(run => run.mark).map(run => run.text), ['mật khẩu', 'đặt mật  khẩu'], 'Phrases from the rubric ("đặt mật", "mật khẩu") are highlighted together.');

// Printed receipts show essay text and pending status instead of a wrong "Sai".
const receipt = buildExamReceiptHtml(exam, { id: 's1', name: 'Học sinh A' }, { id: 'r1', score: 2, totalQuestions: 5, submittedAt: new Date().toISOString(), answers });
assert.match(receipt, /Chờ chấm/);
assert.match(receipt, /chờ giáo viên chấm/);
assert.match(receipt, /Không chia sẻ mật khẩu cho bạn/);
const finalReceipt = buildExamReceiptHtml(exam, { id: 's1', name: 'Học sinh A' }, { id: 'r1', score: 2, totalQuestions: 5, submittedAt: new Date().toISOString(), answers, manualGrades: { essay: gradeFromChecks(essay, ['e1']), practical: gradeFromChecks(practical, ['p1', 'p2']) } });
assert.match(finalReceipt, /Điểm: 8 \/ 10/);

// Wiring: publication strips teacher notes; students' results keep the rule-approved shape.
const manager = readFileSync(new URL('../src/components/ExamManagerLegacy.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../src/components/UnifiedStudentExamRunner.tsx', import.meta.url), 'utf8');
assert.ok(manager.includes('protectExamForAccess(stripTeacherOnlyFields(authorized.exam)'), 'Encrypted student payloads omit sample answers.');
assert.ok(manager.includes('`manualGrades.${questionId}`') || readFileSync(new URL('../src/components/ExamManualGradingPanel.tsx', import.meta.url), 'utf8').includes('`manualGrades.${questionId}`'), 'Grades are saved per question on the result.');
assert.ok(!/manualGrades/.test(runner.slice(runner.indexOf("await setDoc(doc(db, 'results'"), runner.indexOf('cheatEvents,', runner.indexOf("await setDoc(doc(db, 'results'")))), 'Student submissions never write teacher-only grade fields.');
assert.ok(runner.includes('MAX_ANSWERS_PAYLOAD_BYTES'), 'Submissions stay below the Firestore document limit.');

console.log('Exam essay/practical grading checks passed.');
