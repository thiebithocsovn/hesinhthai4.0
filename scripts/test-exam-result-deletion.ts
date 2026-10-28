import assert from 'node:assert/strict';
import {
  ALL_DELETION_EXAMS, RESULT_DELETE_BATCH_SIZE, classGrade, deleteExamResultBatches,
  ExamResultDeletionError, examResultDeletionClasses, selectExamResultsToDelete,
} from '../src/lib/examResultDeletion';
import type { TeacherAccessScope } from '../src/lib/teacherIsolation';

const access: TeacherAccessScope = { role: 'teacher', ownerUid: 'teacher-a' };
const classes = [
  { id: '3a', name: '3A PH Yên Lạc', teacherId: 'teacher-a' },
  { id: '3b', name: 'Lớp 3B', teacherId: 'teacher-a' },
  { id: '10a', name: '10A', teacherId: 'teacher-a' },
  { id: 'foreign', name: '3C', teacherId: 'teacher-b' },
];
const exams = [
  { id: 'e1', title: 'Bài 1', teacherId: 'teacher-a', classNames: { '3a': '3A', '3b': '3B', archived: 'Khối 3D' }, studentDirectory: { old: { id: 'removed', classId: 'archived' } } },
  { id: 'e2', title: 'Bài 2', teacherId: 'teacher-a' },
  { id: 'e3', title: 'Bài giáo viên khác', teacherId: 'teacher-b', classNames: { foreign: '3C' } },
];
const students = [
  { id: 's1', classId: '3a', teacherId: 'teacher-a' },
  { id: 's2', classId: '3b', teacherId: 'teacher-a' },
  { id: 's3', classId: '10a', teacherId: 'teacher-a' },
  { id: 'moved', classId: '10a', teacherId: 'teacher-a' },
];
const results = [
  { id: 'first', examId: 'e1', studentId: 's1', teacherId: 'teacher-a' },
  { id: 'retry', examId: 'e1', studentId: 's1', teacherId: 'teacher-a' },
  { id: 'other-exam', examId: 'e2', studentId: 's1', teacherId: 'teacher-a' },
  { id: 'other-class', examId: 'e1', studentId: 's2', teacherId: 'teacher-a' },
  { id: 'grade10', examId: 'e1', studentId: 's3', teacherId: 'teacher-a' },
  { id: 'removed', examId: 'e1', studentId: 'removed', teacherId: 'teacher-a' },
  { id: 'enrolled', examId: 'e1', studentId: 'moved', teacherId: 'teacher-a', answers: { __examEnrollment: { classId: '3b' } } },
  { id: 'foreign', examId: 'e1', studentId: 's1', teacherId: 'teacher-b' },
  { id: 'unowned', examId: 'e1', studentId: 's1' },
];
const ids = (scope: Parameters<typeof selectExamResultsToDelete>[4], owner = access) =>
  selectExamResultsToDelete(results, exams, students, classes, scope, owner).map(result => result.id);

assert.deepEqual(['3A PH Yên Lạc', 'Lớp 8A4', 'Khối 10', '11A', '12B', '1A', '2026 3A', 'A3', '13A'].map(classGrade), ['3', '8', '10', '11', '12', '1', undefined, undefined, undefined]);
assert.deepEqual(ids({ kind: 'exam', examId: 'e1' }), ['first', 'retry', 'other-class', 'grade10', 'removed', 'enrolled'], 'Delete all attempts, while preserving other exams and teachers.');
assert.deepEqual(ids({ kind: 'class', examId: 'e1', classId: '3a' }), ['first', 'retry']);
assert.deepEqual(ids({ kind: 'class', examId: ALL_DELETION_EXAMS, classId: '3a' }), ['first', 'retry', 'other-exam']);
assert.deepEqual(ids({ kind: 'grade', examId: 'e1', grade: '3' }), ['first', 'retry', 'other-class', 'removed', 'enrolled'], 'Historical enrollment wins over a student moved to grade 10.');
assert.deepEqual(ids({ kind: 'grade', examId: ALL_DELETION_EXAMS, grade: '3' }), ['first', 'retry', 'other-exam', 'other-class', 'removed', 'enrolled']);
assert.deepEqual(ids({ kind: 'grade', examId: 'e1', grade: '1' }), [], 'Grade 1 never matches grade 10.');
assert.deepEqual(ids({ kind: 'exam', examId: 'e3' }), []);
assert.deepEqual(ids({ kind: 'exam', examId: '' }), []);
assert.deepEqual(ids({ kind: 'exam', examId: ALL_DELETION_EXAMS }), []);
assert.deepEqual(ids({ kind: 'class', examId: 'e1', classId: '' }), []);
assert.deepEqual(ids({ kind: 'class', examId: ALL_DELETION_EXAMS, classId: 'foreign' }), []);
assert.deepEqual(ids({ kind: 'exam', examId: 'e1' }, { role: 'guest', ownerUid: '' }), []);
assert.ok(ids({ kind: 'exam', examId: 'e1' }, { role: 'administrator', ownerUid: 'admin' }).includes('foreign'));
assert.ok(examResultDeletionClasses(classes, exams, access).some(item => item.id === 'archived'));
assert.ok(!examResultDeletionClasses(classes, exams, access).some(item => item.id === 'foreign'));

const allIds = Array.from({ length: 1003 }, (_, index) => `result-${index}`);
const database = new Set([...allIds, 'new-arrival', 'other-teacher']);
const batches: string[][] = [];
const progress: number[] = [];
assert.equal(await deleteExamResultBatches([...allIds, allIds[0]], async batch => {
  batches.push([...batch]);
  for (const id of batch) database.delete(id);
}, count => progress.push(count)), 1003);
assert.deepEqual(batches.map(batch => batch.length), [RESULT_DELETE_BATCH_SIZE, RESULT_DELETE_BATCH_SIZE, 203]);
assert.deepEqual(progress, [0, 400, 800, 1003]);
assert.deepEqual([...database], ['new-arrival', 'other-teacher'], 'Only confirmed IDs are deleted, including during incoming submissions.');

let attempts = 0;
await assert.rejects(deleteExamResultBatches(allIds, async () => {
  if (++attempts === 2) throw { code: 'permission-denied' };
}), error => {
  assert.ok(error instanceof ExamResultDeletionError);
  assert.equal(error.deletedCount, 400);
  assert.equal(error.totalCount, 1003);
  assert.match(error.message, /400\/1003/);
  assert.match(error.message, /quyền/);
  return true;
});
assert.equal(attempts, 2, 'Stop immediately after a failed batch.');
await assert.rejects(deleteExamResultBatches(['valid', 'invalid/path'], async () => { assert.fail('Invalid IDs must be rejected before any write.'); }));
assert.equal(await deleteExamResultBatches([], async () => { assert.fail('An empty selection never writes.'); }), 0);
console.log('Exam result deletion: exam/class/grade scope, historical attempts, teacher isolation, bounded batches and partial failures passed.');
