import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { createExamAccessDocumentId, createPublicExamSchedule, protectExamForAccess, openProtectedExamAccess } from '../src/lib/examPrivacy';
import { describeExamAccessError } from '../src/lib/examAccessError';
import { loadExamRosterMetadata } from '../src/lib/examRoster';
import { buildExamReceiptHtml } from '../src/lib/examReceipt';
import { createStudentRosterLookupKey } from '../src/lib/teacherIsolation';
import { getSubmittedExamClassId, guestExamStudentRecord, withExamStudentClass } from '../src/lib/examStudentClasses';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run this test only in the Firestore emulator.');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const rulesFile = process.env.EXAM_RULES_FILE || 'firestore.rules';
const environment = await initializeTestEnvironment({ projectId: 'demo-learning-wall', firestore: { host, port: Number(port), rules: readFileSync(rulesFile, 'utf8') } });
try {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'teachers/teacher-one'), { id: 'teacher-one', status: 'active' });
    await setDoc(doc(context.firestore(), 'teachers/teacher-two'), { id: 'teacher-two', status: 'active' });
  });
  const teacher = environment.authenticatedContext('teacher-one').firestore();
  const other = environment.authenticatedContext('teacher-two').firestore();
  const guest = environment.unauthenticatedContext().firestore();
  const exam = { id: '123456789012', teacherId: 'teacher-one', title: 'Kiểm tra Toán 8', durationMinutes: 45, questions: [{ id: 'q1', text: 'Câu hỏi', options: ['A', 'B'], correctAnswer: 0 }], status: 'published' as const, createdAt: new Date().toISOString() };
  // Publishing from the Exams tab must work without an already-loaded Classes tab.
  await assertSucceeds(setDoc(doc(teacher, 'classes/class-8a'), { id: 'class-8a', teacherId: exam.teacherId, name: '8A' }));
  await assertSucceeds(setDoc(doc(teacher, 'students/roster-one'), { id: 'roster-one', teacherId: exam.teacherId, name: 'Nguyễn Văn An', code: '654321', classId: 'class-8a' }));
  await assertSucceeds(setDoc(doc(teacher, 'students/zz-old-guest'), { id: 'zz-old-guest', teacherId: exam.teacherId, name: 'Nguyễn Văn An', code: '123456', examId: exam.id }));
  await assertSucceeds(setDoc(doc(other, 'classes/class-9b'), { id: 'class-9b', teacherId: 'teacher-two', name: '9B' }));
  const rosterMetadata = await loadExamRosterMetadata(teacher, exam.teacherId, exam.id);
  assert.deepEqual(rosterMetadata.classNames, { 'class-8a': '8A' });
  const lookup = await createStudentRosterLookupKey(exam.teacherId, exam.id, 'Nguyễn Văn An');
  assert.equal(rosterMetadata.studentDirectory[lookup].classId, 'class-8a');
  assert.equal(rosterMetadata.studentDirectory[lookup].id, 'roster-one');
  const protectedRoster = await protectExamForAccess({ ...exam, ...rosterMetadata }, exam.id);
  const decoded = await openProtectedExamAccess<typeof exam & typeof rosterMetadata>(protectedRoster, exam.id);
  const receipt = buildExamReceiptHtml(decoded, { id: 'roster-one', name: 'Nguyễn Văn An', classId: decoded.studentDirectory[lookup].classId }, { id: 'receipt', score: 1, totalQuestions: 1, submittedAt: exam.createdAt });
  assert.ok(receipt.includes('<p>Lớp: 8A</p>') && !receipt.includes('Ảnh học sinh'));
  const schedule = await createPublicExamSchedule(exam);
  const accessId = await createExamAccessDocumentId(exam.id);
  const access = await protectExamForAccess(exam, exam.id);
  const publish = (notice = schedule) => {
    const batch = writeBatch(teacher);
    batch.set(doc(teacher, 'exams', exam.id), exam);
    batch.set(doc(teacher, 'public_exam_access', accessId), access);
    batch.set(doc(teacher, 'public_exam_schedules', schedule.id), notice);
    return batch.commit();
  };
  // A valid private exam plus a rejected notice must leave no partial publication.
  await assertFails(publish({ ...schedule, title: 'x'.repeat(241) }));
  await environment.withSecurityRulesDisabled(async context => {
    for (const path of [`exams/${exam.id}`, `public_exam_access/${accessId}`, `public_exam_schedules/${schedule.id}`]) {
      assert.equal((await getDoc(doc(context.firestore(), path))).exists(), false);
    }
  });
  // This also verifies getAfter: the exam does not exist before the batch commits.
  await assertSucceeds(publish());
  const notices = await assertSucceeds(getDocs(query(collection(guest, 'public_exam_schedules'), where('status', '==', 'published'))));
  assert.equal(notices.size, 1);
  assert.equal('questions' in notices.docs[0].data(), false);
  const encrypted = await assertSucceeds(getDoc(doc(guest, 'public_exam_access', accessId)));
  assert.equal((await openProtectedExamAccess(encrypted.data() as typeof access, exam.id)).id, exam.id);
  await assertFails(getDoc(doc(guest, 'exams', exam.id)));
  await assertFails(getDocs(collection(guest, 'public_exam_access')));
  await assertFails(updateDoc(doc(other, 'exams', exam.id), { title: 'Chiếm quyền' }));
  await assertFails(setDoc(doc(guest, 'public_exam_schedules', schedule.id), schedule));
  // Repair an older publication whose notice exists but encrypted access is missing.
  await environment.withSecurityRulesDisabled(async context => {
    const batch = writeBatch(context.firestore());
    batch.delete(doc(context.firestore(), 'public_exam_access', accessId));
    await batch.commit();
  });
  await assertSucceeds(publish());
  await assertSucceeds(getDoc(doc(guest, 'public_exam_access', accessId)));
  const student = { id: 'student-one', teacherId: exam.teacherId, name: 'Học sinh thử', code: '123456', examId: exam.id, classId: 'class-8a' };
  await assertFails(setDoc(doc(guest, 'students/wrong-class'), { ...student, id: 'wrong-class', classId: 'class-9b' }));
  await assertFails(setDoc(doc(guest, 'students/missing-class'), { ...student, id: 'missing-class', classId: 'does-not-exist' }));
  await assertSucceeds(setDoc(doc(guest, 'students', student.id), guestExamStudentRecord(student)));
  assert.equal((await getDoc(doc(teacher, 'students', student.id))).data()?.classId, undefined);
  assert.ok(buildExamReceiptHtml(decoded, student, { id: 'class-receipt', score: 1, totalQuestions: 1, submittedAt: exam.createdAt }).includes('<p>Lớp: 8A</p>'));
  const sessionId = `${student.id}_${exam.id}`;
  const timestamp = new Date().toISOString();
  const session = { id: sessionId, examId: exam.id, studentId: student.id, teacherId: exam.teacherId, startTime: timestamp, lastActive: timestamp, status: 'taking', examVersion: 'Gốc' };
  await assertSucceeds(setDoc(doc(guest, 'exam_sessions', sessionId), session));
  await assertSucceeds(updateDoc(doc(guest, 'exam_sessions', sessionId), { lastActive: new Date().toISOString() }));
  const result = { id: sessionId, examId: exam.id, studentId: student.id, teacherId: exam.teacherId, score: 1, totalQuestions: 1, submittedAt: timestamp, answers: withExamStudentClass({ q1: 0 }, student.classId), cheatEvents: { rightClicks: 0, tabChanges: 0, windowResizes: 0 }, examVersion: 'Gốc' };
  await assertFails(setDoc(doc(guest, 'results', sessionId), { ...result, totalQuestions: 99 }));
  await assertSucceeds(setDoc(doc(guest, 'results', sessionId), result));
  await assertFails(getDoc(doc(guest, 'results', sessionId)));
  const savedResult = (await assertSucceeds(getDoc(doc(teacher, 'results', sessionId)))).data() as typeof result;
  assert.equal(getSubmittedExamClassId(decoded, savedResult), 'class-8a');
  assert.ok(buildExamReceiptHtml(decoded, guestExamStudentRecord(student), savedResult).includes('<p>Lớp: 8A</p>'));
  await assertSucceeds(updateDoc(doc(guest, 'exam_sessions', sessionId), { status: 'submitted', lastActive: timestamp }));
  const close = writeBatch(teacher);
  close.set(doc(teacher, 'exams', exam.id), { ...exam, status: 'closed' });
  close.delete(doc(teacher, 'public_exam_schedules', schedule.id));
  close.delete(doc(teacher, 'public_exam_access', accessId));
  await assertSucceeds(close.commit());
  assert.equal((await getDocs(query(collection(guest, 'public_exam_schedules'), where('status', '==', 'published')))).size, 0);
  await assertFails(getDoc(doc(guest, 'public_exam_access', accessId)));
  assert.match(describeExamAccessError({ code: 'permission-denied' }, 'login'), /quyền Firebase/);
  assert.match(describeExamAccessError({ code: 'unavailable' }, 'login'), /kiểm tra mạng/);
  console.info(`Exam publication, access, submission, isolation and close tests passed: ${rulesFile}`);
} finally {
  await environment.cleanup();
}
