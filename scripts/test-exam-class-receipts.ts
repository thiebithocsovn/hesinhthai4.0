import assert from 'node:assert/strict';
import { buildExamReceiptHtml } from '../src/lib/examReceipt';
import { classReceiptClasses, prepareClassExamReceipts, type ClassReceiptExam, type ClassReceiptResult } from '../src/lib/examClassReceipts';

const access = { role: 'teacher' as const, ownerUid: 'teacher-one' };
const questions = [
  { id: 'q1', text: 'Câu 1', options: ['A', 'B'], correctAnswer: 0 },
  { id: 'q2', text: 'Câu 2', options: ['C', 'D'], correctAnswer: 1 },
];
const exam: ClassReceiptExam = {
  id: 'exam-one', title: 'Kiểm tra giữa kỳ', teacherId: 'teacher-one', durationMinutes: 35, questions,
  classNames: { 'class-3a': 'Lớp 3A', 'class-3b': 'Lớp 3B', 'archived': 'Lớp 3C cũ' },
  shuffledVersions: [{ code: 'V2', questions: [...questions].reverse() }],
  studentDirectory: { deleted: { id: 'removed', classId: 'archived' } },
};
const classes = [
  { id: 'class-3a', name: '3A PH Yên Lạc', teacherId: 'teacher-one' },
  { id: 'class-3b', name: '3B', teacherId: 'teacher-one' },
  { id: 'foreign', name: '3D', teacherId: 'teacher-two' },
];
const students = [
  { id: 's1', name: 'Nguyễn Văn Bình', classId: 'class-3a', teacherId: 'teacher-one' },
  { id: 's2', name: 'Lý Minh Anh <script>alert(1)</script>', classId: 'class-3a', teacherId: 'teacher-one' },
  { id: 's3', name: 'Học sinh lớp khác', classId: 'class-3b', teacherId: 'teacher-one' },
];
const base = { examId: exam.id, teacherId: 'teacher-one', score: 99, totalQuestions: 2, submittedAt: '2026-10-29T01:00:00.000Z', answers: { q1: 0, q2: 1 } };
const results: ClassReceiptResult[] = [
  { ...base, id: 'old-s1', studentId: 's1', submittedAt: '2026-10-28T01:00:00.000Z', examVersion: 'OLD-INVALID' },
  { ...base, id: 'new-s1', studentId: 's1', examVersion: 'V2', receiptPrintedAt: '2026-10-29T01:01:00.000Z' },
  { ...base, id: 's2', studentId: 's2', answers: { q1: 1, q2: 1 } },
  { ...base, id: 's3', studentId: 's3' },
  { ...base, id: 'other-exam', studentId: 's1', examId: 'other-exam' },
  { ...base, id: 'other-teacher', studentId: 's1', teacherId: 'teacher-two' },
  { ...base, id: 'removed', studentId: 'removed' },
  { ...base, id: 'new-student', studentId: 'new-student', answers: { ...base.answers, __examEnrollment: { classId: 'class-3a' } } },
];
const sessions = [
  { examId: exam.id, studentId: 's1', teacherId: 'teacher-one', startTime: '2026-10-29T00:35:00.000Z' },
  { examId: 'other-exam', studentId: 's1', teacherId: 'teacher-one', startTime: '2000-01-01T00:00:00Z' },
  { examId: exam.id, studentId: 's2', teacherId: 'teacher-two', startTime: '2000-01-01T00:00:00Z' },
];
const unchanged = JSON.stringify({ exam, results, students, classes, sessions });
const document = prepareClassExamReceipts(exam, 'class-3a', results, students, classes, sessions, access);
assert.equal(document.entries.length, 3, 'Exactly one latest receipt for every student who submitted in the selected class.');
assert.deepEqual(document.entries.map(entry => entry.result.id).sort(), ['new-s1', 'new-student', 's2']);
assert.equal(document.entries.find(entry => entry.result.id === 'new-s1')?.result.score, 2, 'Recompute objective points from the submitted version, ignoring an untrusted saved score.');
assert.equal(document.entries.find(entry => entry.result.id === 's2')?.result.score, 1);
assert.equal(document.previouslyPrinted, 1);
assert.equal(document.pending, 0);
assert.equal(document.className, '3A PH Yên Lạc');
assert.equal(document.entries.find(entry => entry.result.id === 'new-s1')?.startedAt, sessions[0].startTime);
assert.equal(document.entries.find(entry => entry.result.id === 's2')?.startedAt, undefined, 'Other teachers and exams cannot supply metadata.');
assert.equal((document.html.match(/<html\b/g) || []).length, 1);
assert.equal((document.html.match(/<head>/g) || []).length, 1);
assert.equal((document.html.match(/<body>/g) || []).length, 1);
assert.equal((document.html.match(/<main class="sheet">/g) || []).length, 3);
assert.equal((document.html.match(/BIÊN BẢN LÀM BÀI KIỂM TRA/g) || []).length, 3);
assert.match(document.html, /@page\s*\{\s*size: A4 portrait/);
assert.match(document.html, /@media print\s*\{\s*\.sheet \+ \.sheet\s*\{\s*break-before: page/);
assert.match(document.html, /Mã đề: V2/);
assert.match(document.html, /Lớp: 3A PH Yên Lạc/);
assert.match(document.html, /Bắt đầu: 07:35:00 29\/10\/2026/);
assert.ok(!document.html.includes('<script>'));
assert.match(document.html, /&lt;script&gt;/);
assert.ok(!document.html.includes('Học sinh lớp khác'));
assert.ok(!document.html.includes('old-s1'));
assert.equal(JSON.stringify({ exam, results, students, classes, sessions }), unchanged, 'Export is read-only: no scores, print markers or source arrays are modified.');
assert.equal(prepareClassExamReceipts(exam, 'archived', results, students, classes, [], access).entries.length, 1, 'Archived roster classes remain exportable.');
assert.ok(!classReceiptClasses(exam, classes, access).some(item => item.id === 'foreign'));
assert.throws(() => prepareClassExamReceipts(exam, 'all', results, students, classes, [], access), /chọn một lớp/);
assert.throws(() => prepareClassExamReceipts(exam, 'class-3a', results, students, classes, [], { role: 'guest', ownerUid: '' }), /quyền/);
assert.throws(() => prepareClassExamReceipts(exam, 'class-3a', results, students, classes, [], { role: 'teacher', ownerUid: 'teacher-two' }), /quyền/);
assert.throws(() => prepareClassExamReceipts(exam, 'class-3a', [], students, classes, [], access), /chưa có bài nộp/);
assert.throws(() => prepareClassExamReceipts(exam, 'class-3a', [{ ...base, id: 'bad-version', studentId: 's1', examVersion: 'INVALID' }], students, classes, [], access), /Nguyễn Văn Bình.*mã đề/);
assert.throws(() => prepareClassExamReceipts(exam, 'class-3a', [{ ...base, id: 'bad-count', studentId: 's1', totalQuestions: 28 }], students, classes, [], access), /Số câu/);

const manualExam: ClassReceiptExam = { ...exam, questions: [
  ...questions, { id: 'essay', text: 'Trình bày cách sử dụng máy tính an toàn', options: [], correctAnswer: -1, type: 'essay', points: 2 },
] };
const manual = prepareClassExamReceipts(manualExam, 'class-3a', [{ ...base, id: 'manual', studentId: 's1', totalQuestions: 3, answers: { ...base.answers, essay: 'Giữ đúng tư thế.' } }], students, classes, [], access);
assert.equal(manual.pending, 1);
assert.match(manual.html, /Chờ chấm/);
assert.match(manual.html, /chờ giáo viên chấm/);
assert.match(manual.html, /Giữ đúng tư thế\./);
assert.match(manual.html, /Điểm: ……… \/ 10/);
const single = buildExamReceiptHtml(exam, document.entries[0].student, document.entries[0].result);
assert.equal((single.match(/<main class="sheet">/g) || []).length, 1, 'Individual receipt output remains supported.');
console.log('Class exam receipts passed: latest attempts, class/exam/teacher isolation, shuffled versions, scores, written answers, historical rosters, read-only export and one A4 document with per-student page breaks.');
