import assert from 'node:assert/strict';
import { withExamStudentClass } from '../src/lib/examStudentClasses';
import { buildExamReceiptHtml, getExamReceiptSettings, receiptQuestionIsCorrect, type ReceiptExam, type ReceiptQuestion } from '../src/lib/examReceipt';
import { toExamQuestion } from '../src/lib/questionExamBridge';
import type { QuestionDefinition } from '../src/lib/questionEngine';

const exam: ReceiptExam = { id: 'exam-1', title: 'Kiểm tra Toán 8', durationMinutes: 45, classNames: { class1: '8A4' }, receiptSettings: { autoPrint: true, schoolName: 'TH & THCS Na Rì 1', subject: 'Toán 8' }, questions: Array.from({ length: 25 }, (_, index) => ({ id: `q${index}`, text: 'Câu hỏi', options: ['A', 'B', 'C', 'D'], correctAnswer: index % 4 })) };
const result = { id: 'student-1_exam-1', score: 24, totalQuestions: 25, submittedAt: '2026-10-04T14:00:00Z', answers: Object.fromEntries(exam.questions.slice(0, 24).map(q => [q.id, q.correctAnswer])), examVersion: 'Gốc' };
const student = { id: 'student-1', name: 'Nguyễn Văn An', classId: 'class1' };
const html = buildExamReceiptHtml(exam, student, result, '2026-10-04T13:15:00Z');
assert.equal((html.match(/class="answer-grid"/g) || []).length, 2);
assert.equal((html.match(/>×<\/td>/g) || []).length, 24);
assert.ok(html.includes('<th>25</th>') && html.includes('9,6 / 10'));
assert.ok(html.includes('8A4') && html.includes('21:00:00') && html.includes('18:45:00') === false);
assert.ok(html.includes('HỌC SINH') && html.includes('GIÁO VIÊN / GIÁM THỊ') && html.includes('size: A4 portrait'));
assert.ok(!html.includes('Ảnh học sinh') && !html.includes('class="photo"'));
assert.ok(html.includes('grid-template-columns: 1fr 1fr;'));
const recoveredClass = buildExamReceiptHtml({ ...exam, studentDirectory: { hashedName: { id: student.id, classId: 'class1' } } }, { id: student.id, name: student.name }, result);
assert.ok(recoveredClass.includes('<p>Lớp: 8A4</p>'));
const noClass = buildExamReceiptHtml(exam, { id: 'guest', name: 'Học sinh chưa có lớp' }, result);
assert.ok(noClass.includes('<p>Lớp: Chưa được gán lớp</p>') && !noClass.includes('<p>Lớp: 8A4</p>'));
const savedClass = buildExamReceiptHtml(exam, { id: 'new-guest', name: 'Học sinh chọn lớp' }, { ...result, answers: withExamStudentClass(result.answers, 'class1') });
assert.ok(savedClass.includes('<p>Lớp: 8A4</p>'));
const invalidClass = buildExamReceiptHtml(exam, { id: 'new-guest', name: 'Học sinh chọn lớp' }, { ...result, answers: withExamStudentClass(result.answers, 'other-teacher-class') });
assert.ok(invalidClass.includes('<p>Lớp: Chưa được gán lớp</p>'));
const escapedClass = buildExamReceiptHtml({ ...exam, classNames: { class1: '<b>8A4</b>' } }, student, result);
assert.ok(escapedClass.includes('<p>Lớp: &lt;b&gt;8A4&lt;/b&gt;</p>'));
const hidden = buildExamReceiptHtml({ ...exam, receiptSettings: { includeCorrectAnswers: false } }, student, result);
assert.ok(!hidden.includes('Đáp án đúng') && !hidden.includes('class="outcome"'));
const unsafe = buildExamReceiptHtml(exam, { ...student, name: '<script>alert(1)</script>' }, { ...result, id: '<img src=x onerror=alert(1)>' });
assert.ok(!unsafe.includes('<script>') && !unsafe.includes('<img src=x'));
assert.ok(unsafe.includes('&lt;script&gt;'));
assert.equal(getExamReceiptSettings({ ...exam, receiptSettings: undefined }).autoPrint, false);
assert.equal(getExamReceiptSettings(exam).invigilatorName, '');
const namedInvigilator = buildExamReceiptHtml({ ...exam, receiptSettings: { ...exam.receiptSettings, invigilatorName: '  Nguyễn Văn Bình  ' } }, student, result);
assert.ok(namedInvigilator.includes('<div class="signature-space"></div><b>Nguyễn Văn Bình</b>'));
const unsafeInvigilator = buildExamReceiptHtml({ ...exam, receiptSettings: { invigilatorName: '<img src=x onerror=alert(1)>' } }, student, result);
assert.ok(!unsafeInvigilator.includes('<img src=x') && unsafeInvigilator.includes('&lt;img src=x onerror=alert(1)&gt;'));
const shuffled = { ...exam, shuffledVersions: [{ code: '123', questions: [{ ...exam.questions[0], options: ['D', 'C', 'B', 'A'], correctAnswer: 3 }] }] };
assert.ok(buildExamReceiptHtml(shuffled, student, { ...result, examVersion: '123', answers: { q0: 3 } }).includes('<td class="answer-key">D</td>'));
assert.ok(buildExamReceiptHtml({ ...exam, questions: [] }, student, { ...result, totalQuestions: 0, score: 0 }).includes('0 / 10'));
const modes: [QuestionDefinition['payload'], unknown][] = [
  [{ type: 'single_choice', options: [{ id: 'a', text: '1', correct: true }, { id: 'b', text: '2' }] }, 'a'],
  [{ type: 'multiple_choice', options: [{ id: 'a', text: '1', correct: true }, { id: 'b', text: '2', correct: true }] }, ['a', 'b']],
  [{ type: 'true_false', correct: false }, false],
  [{ type: 'true_false_matrix', statements: [{ id: 'a', text: '1', correct: true }, { id: 'b', text: '2', correct: false }] }, [true, false]],
  [{ type: 'short_answer', acceptedAnswers: ['Đa thức'] }, 'đa thức'],
  [{ type: 'fill_blank', answers: ['x', 'y'] }, ['x', 'y']],
  [{ type: 'matching', pairs: [{ id: 'p', left: 'Vế trái', right: 'Vế phải' }] }, { p: 'Vế phải' }],
  [{ type: 'ordering', items: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }] }, ['a', 'b']],
  [{ type: 'classification', groups: [{ id: 'g', name: 'Nhóm A' }], items: [{ id: 'a', text: 'Một', groupId: 'g' }] }, { a: 'g' }],
  [{ type: 'image_hotspot', imageUrl: 'image.png', hotspots: [{ x: 0.5, y: 0.5, radius: 0.1 }] }, { x: 0.5, y: 0.5 }],
];
for (const [payload, answer] of modes) {
  const question = toExamQuestion({ id: 'engine', prompt: 'Câu hỏi', points: 1, payload });
  assert.ok(receiptQuestionIsCorrect(question, answer), payload.type);
  const receipt = buildExamReceiptHtml({ ...exam, questions: [question] }, student, { ...result, score: 1, totalQuestions: 1, answers: { engine: answer } });
  assert.ok(receipt.includes('Đúng') && receipt.includes('10 / 10'), payload.type);
}
const short: ReceiptQuestion = { id: 'short', text: '', type: 'short_answer', options: [], correctAnswer: 0, correctTextAnswer: 'Đa thức' };
assert.ok(receiptQuestionIsCorrect(short, ' đa thức '));
assert.ok(!receiptQuestionIsCorrect(short, undefined));
assert.ok(!receiptQuestionIsCorrect(exam.questions[0], undefined));
console.info('Exam receipt: A4 grids, 25 questions, 10 question types, shuffled answers, unanswered questions, privacy and escaping passed.');
