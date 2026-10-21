import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  examHasManualQuestions,
  canTeacherGradeQuestion,
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
import { buildExamReceiptHtml, receiptQuestionIsCorrect, receiptReadyToSign, receiptSignTiming, type ReceiptQuestion } from '../src/lib/examReceipt';
import { manualSubmissionCode } from '../src/lib/examManualGrading';
import { pendingTeacherPrintResults, type TeacherPrintResult } from '../src/lib/teacherExamPrinting';
import { toExamQuestion } from '../src/lib/questionExamBridge';
import { examQuestionHtml } from '../src/lib/examQuestionContent';

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

// Students sign one receipt per exam.
assert.equal(receiptSignTiming(legacy as never), 'at-submit', 'Objective-only exams still print at submission.');
assert.equal(receiptSignTiming(exam), 'after-grading', 'Essay/practical exams print once grading is complete by default.');
assert.equal(receiptSignTiming({ ...exam, receiptSettings: { signTiming: 'at-submit' } }), 'at-submit');
assert.equal(receiptReadyToSign(exam, { answers }), false);
const fullyGraded = { essay: gradeFromChecks(essay, ['e1']), practical: gradeFromChecks(practical, ['p1']) };
assert.equal(receiptReadyToSign(exam, { answers, manualGrades: fullyGraded }), true);

const since = '2026-10-15T08:00:00.000Z';
const base: TeacherPrintResult = { id: 'r1', examId: 'exam', studentId: 's1', teacherId: 't1', score: 1, totalQuestions: 5, submittedAt: '2026-10-15T08:05:00.000Z', answers };
const queued = (result: TeacherPrintResult, baseline: string[] = [], targetExam = exam) => pendingTeacherPrintResults([result], 't1', 'exam', since, Date.parse('2026-10-15T09:00:00.000Z'), baseline, targetExam).length;
assert.equal(queued(base), 0, 'Ungraded essay/practical work is not printed yet.');
assert.equal(queued({ ...base, manualGrades: fullyGraded, manualGradedAt: '2026-10-15T08:30:00.000Z' }), 1, 'The receipt prints once the last grade is saved.');
assert.equal(queued({ ...base, submittedAt: '2026-10-15T07:00:00.000Z', manualGrades: fullyGraded, manualGradedAt: '2026-10-15T08:30:00.000Z' }, ['r1']), 1, 'Work submitted before the station started prints when graded during the station.');
assert.equal(queued({ ...base, manualGrades: fullyGraded, manualGradedAt: '2026-10-15T07:30:00.000Z' }, ['r1']), 0, 'Work graded before the station started is printed from the results table instead.');
assert.equal(queued({ ...base, manualGrades: fullyGraded, manualGradedAt: '2026-10-15T08:30:00.000Z', receiptPrintedAt: '2026-10-15T08:31:00.000Z' }), 0, 'A signed receipt is never printed twice.');
assert.equal(queued({ ...base, manualGrades: fullyGraded, manualGradedAt: '2026-10-15T08:59:50.000Z' }), 0, 'While the teacher is still ticking, the receipt waits for grading to settle.');
assert.equal(queued({ ...base, manualGrades: fullyGraded, manualGradedAt: '2026-10-15T08:59:30.000Z' }), 1, 'Twenty quiet seconds after the last tick, it prints.');
assert.equal(queued({ ...base, manualGrades: fullyGraded, manualGradedAt: '2026-10-15T08:30:00.000Z', teacherPrint: { status: 'sent', stationId: 'x', claimedAt: since, updatedAt: since } }), 0);
const atSubmitExam = { ...exam, receiptSettings: { signTiming: 'at-submit' as const } };
assert.equal(queued(base, [], atSubmitExam), 1, 'At-submit exams print as soon as the work arrives.');
assert.equal(queued({ ...base, manualGrades: fullyGraded, manualGradedAt: '2026-10-15T08:30:00.000Z' }, ['r1'], atSubmitExam), 0, 'Grading later never triggers a second receipt for at-submit exams.');
assert.equal(pendingTeacherPrintResults([base], 't1', 'exam', since, Date.now(), []).length, 1, 'Callers without an exam keep the original behaviour.');

// Submission code binds the signed receipt to the work being graded.
const code = manualSubmissionCode(exam.questions, answers);
assert.match(code, /^[0-9A-F]{4}-[0-9A-F]{4}$/);
assert.equal(manualSubmissionCode(exam.questions, { ...answers }), code);
assert.notEqual(manualSubmissionCode(exam.questions, { ...answers, essay: 'Bài khác' }), code);
assert.equal(manualSubmissionCode(legacy.questions as never, {}), '');
const atSubmitReceipt = buildExamReceiptHtml(atSubmitExam, { id: 's1', name: 'Học sinh A' }, { id: 'r1', score: 2, totalQuestions: 5, submittedAt: since, answers });
assert.ok(atSubmitReceipt.includes(code) && atSubmitReceipt.includes('không cần ký lại'));
assert.ok(finalReceipt.includes('Phiếu có điểm cuối cùng; học sinh ký một lần.'));

console.log('Exam essay/practical grading checks passed.');

// Short answers may be overridden without making every older submission wait for grading.
const shortAnswer: ReceiptQuestion = { id: 'short', text: '<p>Nêu tác dụng của bàn phím.</p>', options: [], correctAnswer: -1, type: 'short_answer', correctTextAnswer: 'Nhập dữ liệu', points: 2 };
const shortExam = { ...exam, questions: [mc('choice', 0), shortAnswer] };
const shortResult = { id: 'short-result', score: 1, totalQuestions: 2, submittedAt: since, answers: { choice: 0, short: 'Dùng để gõ chữ' } };
assert.ok(canTeacherGradeQuestion(shortAnswer));
assert.equal(canTeacherGradeQuestion(mc('choice', 0)), false);
assert.equal(summarizeExamScore(shortExam, shortResult, receiptQuestionIsCorrect).complete, true);
assert.equal(summarizeExamScore(shortExam, shortResult, receiptQuestionIsCorrect).earned, 1);
const overridden = { ...shortResult, manualGrades: { short: { points: 1.5, checks: [], comment: 'Đúng ý, cần nói rõ nhập dữ liệu.', gradedAt: since } } };
const shortSummary = summarizeExamScore(shortExam, overridden, receiptQuestionIsCorrect);
assert.equal(shortSummary.earned, 2.5);
assert.equal(shortSummary.score10, 8.3);
assert.equal(shortSummary.objectiveCorrect, 1, 'Partial teacher credit is included in points, not counted as a fully correct answer.');
assert.equal(summarizeExamScore(shortExam, { ...overridden, manualGrades: { short: { ...overridden.manualGrades.short, points: 99 } } }, receiptQuestionIsCorrect).earned, 3);
const shortReceipt = buildExamReceiptHtml(shortExam, { id: 's1', name: 'Học sinh A' }, overridden);
assert.ok(shortReceipt.includes('Nêu tác dụng của bàn phím.') && shortReceipt.includes('Dùng để gõ chữ'));
assert.ok(shortReceipt.includes('1,5 / 2') && shortReceipt.includes('8,3 / 10') && shortReceipt.includes(overridden.manualGrades.short.comment));
const privateKeyReceipt = buildExamReceiptHtml({ ...shortExam, receiptSettings: { includeCorrectAnswers: false } }, { id: 's1', name: 'Học sinh A' }, overridden);
assert.ok(!privateKeyReceipt.includes('Nhập dữ liệu') && privateKeyReceipt.includes('Nêu tác dụng của bàn phím.') && privateKeyReceipt.includes('Dùng để gõ chữ'));
const withoutPrompt = buildExamReceiptHtml({ ...shortExam, receiptSettings: { includeWrittenQuestions: false } }, { id: 's1', name: 'Học sinh A' }, overridden);
assert.ok(!withoutPrompt.includes('Nêu tác dụng của bàn phím.') && withoutPrompt.includes('Dùng để gõ chữ'));
const longEssay = 'Dòng bài làm học sinh.\n'.repeat(120) + '<script>giữ nguyên như văn bản</script> KẾT THÚC BÀI';
const longReceipt = buildExamReceiptHtml({ ...exam, questions: [essay] }, { id: 's1', name: 'Học sinh A' }, { ...shortResult, answers: { essay: longEssay } });
assert.ok(longReceipt.includes('KẾT THÚC BÀI') && longReceipt.includes('&lt;script&gt;giữ nguyên như văn bản&lt;/script&gt;'));
assert.ok(!longReceipt.includes('<script>'), 'The complete written answer is escaped, never interpreted as HTML.');
const shuffledShortExam = { ...shortExam, shuffledVersions: [{ code: 'S1', questions: [shortAnswer, mc('choice', 1)] }] };
assert.ok(buildExamReceiptHtml(shuffledShortExam, { id: 's1', name: 'Học sinh A' }, { ...overridden, examVersion: 'S1', answers: { ...overridden.answers, choice: 1 } }).includes('Câu 1. Trả lời ngắn'));
const bankShort = toExamQuestion({ id: 'short', prompt: 'Giải thích ngắn gọn.', points: 1, payload: { type: 'short_answer', acceptedAnswers: ['Đáp án mẫu'] } });
assert.ok(canTeacherGradeQuestion(bankShort), 'Short answers from the question bank support the same teacher review.');
assert.equal(summarizeExamScore({ questions: [bankShort] }, { ...shortResult, manualGrades: { short: { ...overridden.manualGrades.short, points: 0.75 } } }, receiptQuestionIsCorrect).score10, 7.5);
const questionMarkup = examQuestionHtml('<p>H<sub>2</sub>O <img src="https://example.com/question.png" onerror="alert(1)"></p><table><tr><td>Ô dữ liệu</td></tr></table><script>alert(1)</script><img src="data:text/html;base64,abcd">');
assert.ok(questionMarkup.includes('<sub>2</sub>') && questionMarkup.includes('https://example.com/question.png') && questionMarkup.includes('<table>'));
assert.ok(!questionMarkup.includes('onerror') && !questionMarkup.includes('<script') && !questionMarkup.includes('data:text/html'));
console.log('Short-answer teacher overrides, partial points, full written receipts, question text, shuffled numbering and hidden answer keys passed.');
