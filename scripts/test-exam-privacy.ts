import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createExamAccessDocumentId,
  createPublicExamSchedule,
  createPublicExamScheduleId,
  createSecureExamAccessCode,
  openProtectedExamAccess,
  protectExamForAccess,
  PUBLIC_EXAM_ACCESS_COLLECTION,
  PUBLIC_EXAM_SCHEDULES_COLLECTION,
} from '../src/lib/examPrivacy.ts';
import {
  filterTeacherOwnedRecords,
  resolveTeacherAccessScope,
} from '../src/lib/teacherIsolation.ts';

let checks = 0;
const verify = (condition: unknown, description: string) => {
  assert.ok(condition, description);
  checks += 1;
};

const privateExam = {
  id: '713849205164',
  teacherId: 'teacher-one',
  title: 'Kiểm tra Toán 8A',
  durationMinutes: 45,
  status: 'published' as const,
  createdAt: '2026-08-24T08:00:00.000Z',
  startTime: '2026-08-24T09:00:00.000Z',
  questions: [{
    id: 'secret-question',
    text: 'Nội dung câu hỏi tuyệt đối riêng tư',
    options: ['A', 'Đáp án mật', 'C', 'D'],
    correctAnswer: 1,
  }],
  studentDirectory: { confidential_lookup: { id: 'private-student-1', classId: 'private-class' } },
  shuffledVersions: [{ code: '9175038402', questions: [{ correctAnswer: 3 }] }],
};

const publicSchedule = await createPublicExamSchedule(privateExam);
const publicScheduleText = JSON.stringify(publicSchedule);
verify(publicSchedule.status === 'published', 'Students see published exam notices.');
verify(publicSchedule.questionCount === 1, 'A public notice shows the question count without question data.');
verify(publicSchedule.id !== privateExam.id, 'A public schedule never reveals its exam login code.');
verify(/^[a-f0-9]{64}$/.test(publicSchedule.id), 'Public schedule identifiers are SHA-256 digests.');
verify(!publicScheduleText.includes(privateExam.id), 'The login code never appears in a public notice.');
verify(!publicScheduleText.includes('correctAnswer'), 'Public notices never contain answer keys.');
verify(!publicScheduleText.includes('Đáp án mật'), 'Public notices never contain private question choices.');
verify(!publicScheduleText.includes('studentDirectory'), 'Public notices never expose student lookup data.');
verify(!publicScheduleText.includes('shuffledVersions'), 'Public notices never expose alternate exam versions.');

const otherTeacherScheduleId = await createPublicExamScheduleId('teacher-two', privateExam.id);
verify(otherTeacherScheduleId !== publicSchedule.id, 'Equal exam codes cannot merge different teachers’ schedules.');
await assert.rejects(() => createPublicExamSchedule({ ...privateExam, status: 'draft' }), RangeError);
checks += 1;
await assert.rejects(() => createPublicExamSchedule({ ...privateExam, teacherId: '../teacher-two' }), RangeError);
checks += 1;

const accessId = await createExamAccessDocumentId(privateExam.id);
verify(/^[a-f0-9]{64}$/.test(accessId), 'Encrypted exam payloads are addressed by an exam-code digest.');
verify(accessId !== publicSchedule.id, 'A public schedule cannot be reused to locate an encrypted exam.');
verify(accessId !== await createExamAccessDocumentId('713849205165'), 'Different codes never resolve the same exam payload.');
await assert.rejects(() => createExamAccessDocumentId('../private-exam'), RangeError);
checks += 1;

const protectedExam = await protectExamForAccess(privateExam, privateExam.id);
const protectedExamText = JSON.stringify(protectedExam);
verify(protectedExam.iterations >= 100_000, 'Exam codes are strengthened before deriving AES-256 keys.');
verify(!protectedExamText.includes('Nội dung câu hỏi tuyệt đối riêng tư'), 'Firestore never stores plaintext questions in public access documents.');
verify(!protectedExamText.includes('Đáp án mật'), 'Firestore never stores plaintext choices in public access documents.');
verify(!protectedExamText.includes('correctAnswer'), 'Firestore never stores plaintext answer keys in public access documents.');
verify(!protectedExamText.includes('private-student-1'), 'Firestore never stores plaintext class rosters in public access documents.');

const recoveredExam = await openProtectedExamAccess<typeof privateExam>(protectedExam, privateExam.id);
verify(recoveredExam.questions[0].correctAnswer === 1, 'The correct exam code decrypts the authorized student payload.');
verify(recoveredExam.teacherId === privateExam.teacherId, 'Decryption preserves the correct teacher ownership.');
await assert.rejects(() => openProtectedExamAccess(protectedExam, '713849205165'));
checks += 1;
await assert.rejects(() => openProtectedExamAccess({ ...protectedExam, teacherId: 'teacher-two' }, privateExam.id));
checks += 1;
await assert.rejects(() => openProtectedExamAccess({ ...protectedExam, examId: 'other-exam' }, privateExam.id));
checks += 1;

const secondProtection = await protectExamForAccess(privateExam, privateExam.id);
verify(secondProtection.salt !== protectedExam.salt, 'Each encrypted payload receives an independent key salt.');
verify(secondProtection.iv !== protectedExam.iv, 'Each encrypted payload receives an independent AES-GCM nonce.');
verify(secondProtection.ciphertext !== protectedExam.ciphertext, 'Identical exams never produce identical ciphertext.');

const generatedCodes = new Set(Array.from({ length: 5_000 }, () => createSecureExamAccessCode()));
verify(generatedCodes.size === 5_000, 'Five thousand generated exam codes stay unique.');
verify([...generatedCodes].every(code => /^\d{12}$/.test(code)), 'New exam codes use twelve cryptographically generated digits.');
assert.throws(() => createSecureExamAccessCode(6), RangeError);
checks += 1;

const accounts = Array.from({ length: 5_000 }, (_, index) => ({
  id: `private-document-${index}`,
  teacherId: `teacher-${index}`,
  authorId: `teacher-${index}`,
}));
const firstTeacher = resolveTeacherAccessScope({ id: 'teacher-0' }, 'teacher-0');
const lastTeacher = resolveTeacherAccessScope({ id: 'teacher-4999' }, 'teacher-4999');
const administrator = resolveTeacherAccessScope('admin', 'administrator-uid');
const guest = resolveTeacherAccessScope(null, null);
verify(filterTeacherOwnedRecords(firstTeacher, accounts).length === 1, 'The first teacher sees exactly one workspace among 5,000 accounts.');
verify(filterTeacherOwnedRecords(lastTeacher, accounts)[0]?.id === 'private-document-4999', 'The last teacher sees only their own workspace among 5,000 accounts.');
verify(filterTeacherOwnedRecords(administrator, accounts).length === 5_000, 'The administrator sees all 5,000 teacher workspaces.');
verify(filterTeacherOwnedRecords(guest, accounts).length === 0, 'Anonymous visitors never receive any of the 5,000 private teacher records.');
verify(filterTeacherOwnedRecords(firstTeacher, [{ teacherId: 'teacher-0', authorId: 'teacher-1' }]).length === 0,
  'A record with conflicting teacher ownership is rejected.');

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const privateExamRules = rules.match(/match \/exams\/\{examId\} \{([\s\S]*?)\n    \}/u)?.[1] || '';
verify(privateExamRules.includes("allow read: if mayAccess(existing(), 'teacherId');"),
  'Private exam documents are readable only by their owner or the administrator.');
verify(!privateExamRules.includes('!isSignedIn()'), 'Guests can never download private exam documents.');
verify(!privateExamRules.includes("status == 'published'"), 'Publishing an exam never makes its answer key public.');
verify(rules.includes(`match /${PUBLIC_EXAM_SCHEDULES_COLLECTION}/`), 'Public exam notices have a separate Firestore collection.');
verify(rules.includes(`match /${PUBLIC_EXAM_ACCESS_COLLECTION}/`), 'Encrypted exam payloads have a separate Firestore collection.');
verify(rules.includes('allow list: if isAdmin();'), 'Only the administrator can enumerate encrypted exam payloads.');
verify(rules.includes('publicScheduleIsSafe(scheduleId)'), 'Firestore rejects unexpected public schedule fields.');
verify(rules.includes('encryptedExamAccessIsSafe(accessId)'), 'Firestore rejects plaintext or malformed public exam payloads.');

const legacyExamManager = readFileSync(new URL('../src/components/ExamManagerLegacy.tsx', import.meta.url), 'utf8');
const studentRunner = readFileSync(new URL('../src/components/UnifiedStudentExamRunner.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const application = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
verify(studentRunner.includes('collection(db, PUBLIC_EXAM_SCHEDULES_COLLECTION)'),
  'The public student schedule reads only safe notices.');
verify(studentRunner.includes('getDoc(doc(db, PUBLIC_EXAM_ACCESS_COLLECTION, accessId))'),
  'Students request exactly one encrypted exam by its authorization code.');
verify(!studentRunner.includes("query(collection(db, 'exams'), where('status', '==', 'published'))"),
  'The student portal never enumerates teachers’ private exam documents.');
verify(legacyExamManager.includes('protectExamForAccess'), 'Teacher publishing still encrypts legacy and Question Engine exam payloads.');
verify(dashboard.includes('administratorCloudStudents'), 'The administrator can inspect synchronized rosters for all teachers.');
verify(dashboard.includes('administratorQuestionSets'), 'The administrator can inspect synchronized question libraries for all teachers.');
verify(application.includes('key={auth.currentUser.uid}'), 'Switching teachers remounts and clears the previous private workspace.');

console.info(`Encrypted exams, public-notice privacy and 5,000-teacher isolation: ${checks} checks passed.`);
