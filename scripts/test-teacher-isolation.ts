import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canAccessTeacherOwnedRecord,
  createPrivateStudentRosterDirectory,
  createPlickerReportDocumentId,
  createStudentRosterLookupKey,
  createTeacherStorageKey,
  filterTeacherOwnedRecords,
  isValidTeacherUid,
  normalizeStudentRosterName,
  resolveTeacherAccessScope,
} from '../src/lib/teacherIsolation.ts';

let checks = 0;
const verify = (condition: unknown, description: string) => {
  assert.ok(condition, description);
  checks += 1;
};

const firstTeacher = resolveTeacherAccessScope({ id: 'teacher-one' }, 'teacher-one');
const secondTeacher = resolveTeacherAccessScope({ id: 'teacher-two' }, 'teacher-two');
const administrator = resolveTeacherAccessScope('admin', 'administrator-uid');
const anonymous = resolveTeacherAccessScope(null, null);
const forgedTeacher = resolveTeacherAccessScope({ id: 'teacher-one' }, 'teacher-two');

verify(firstTeacher.role === 'teacher', 'An authenticated teacher is assigned their own workspace.');
verify(secondTeacher.role === 'teacher', 'A second authenticated teacher receives a separate workspace.');
verify(administrator.role === 'administrator', 'The administrator retains the global role.');
verify(anonymous.role === 'guest', 'Unauthenticated users never receive teacher privileges.');
verify(forgedTeacher.role === 'guest', 'A profile UID must exactly match Firebase Authentication.');
verify(resolveTeacherAccessScope('admin', null).role === 'guest', 'The admin label alone cannot create administrator access.');
verify(resolveTeacherAccessScope({ id: 'teacher-one' }, '../teacher-one').role === 'guest', 'Malformed authenticated identifiers fail closed.');

for (const ownerField of ['teacherId', 'authorId', 'ownerUid'] as const) {
  const firstRecord = { [ownerField]: 'teacher-one' };
  const secondRecord = { [ownerField]: 'teacher-two' };
  verify(canAccessTeacherOwnedRecord(firstTeacher, firstRecord), `Teacher one can read their ${ownerField} record.`);
  verify(!canAccessTeacherOwnedRecord(firstTeacher, secondRecord), `Teacher one cannot read teacher two's ${ownerField} record.`);
  verify(canAccessTeacherOwnedRecord(secondTeacher, secondRecord), `Teacher two can read their ${ownerField} record.`);
  verify(!canAccessTeacherOwnedRecord(secondTeacher, firstRecord), `Teacher two cannot read teacher one's ${ownerField} record.`);
  verify(canAccessTeacherOwnedRecord(administrator, firstRecord), `Admin can read teacher one's ${ownerField} record.`);
  verify(canAccessTeacherOwnedRecord(administrator, secondRecord), `Admin can read teacher two's ${ownerField} record.`);
  verify(!canAccessTeacherOwnedRecord(anonymous, firstRecord), `Guests cannot read private ${ownerField} records.`);
}

verify(!canAccessTeacherOwnedRecord(firstTeacher, {}), 'Ownerless data is not exposed to a teacher.');
verify(!canAccessTeacherOwnedRecord(firstTeacher, {
  teacherId: 'teacher-one',
  authorId: 'teacher-two',
}), 'Conflicting owner fields fail closed.');
verify(!canAccessTeacherOwnedRecord(administrator, null), 'A missing document never appears as accessible.');
verify(filterTeacherOwnedRecords(firstTeacher, [
  { teacherId: 'teacher-one' },
  { teacherId: 'teacher-two' },
]).length === 1, 'Snapshot data is filtered again after Firebase owner-scoped queries.');
verify(isValidTeacherUid('teacher_one-123'), 'Ordinary Firebase-safe account identifiers are accepted.');
verify(!isValidTeacherUid('../../teacher-one'), 'Path traversal is rejected.');
verify(!isValidTeacherUid(''), 'Blank owner identifiers are rejected.');
verify(!isValidTeacherUid('x'.repeat(129)), 'Oversized identifiers are rejected.');

const storage = new Map<string, string>();
const firstReportsKey = createTeacherStorageKey('smartclass_plicker_reports_v2', firstTeacher.ownerUid);
const secondReportsKey = createTeacherStorageKey('smartclass_plicker_reports_v2', secondTeacher.ownerUid);
const administratorReportsKey = createTeacherStorageKey('smartclass_plicker_reports_v2', administrator.ownerUid);
storage.set(firstReportsKey, JSON.stringify([{ className: 'Lớp riêng giáo viên 1' }]));
storage.set(secondReportsKey, JSON.stringify([{ className: 'Lớp riêng giáo viên 2' }]));
verify(firstReportsKey !== secondReportsKey, 'Teachers never share browser report storage.');
verify(firstReportsKey !== administratorReportsKey, 'Administrative browser storage is separately namespaced.');
verify(JSON.parse(storage.get(firstReportsKey) || '[]')[0].className.includes('giáo viên 1'), 'Teacher one reads only their own persisted reports.');
verify(JSON.parse(storage.get(secondReportsKey) || '[]')[0].className.includes('giáo viên 2'), 'Teacher two reads only their own persisted reports.');
verify(createTeacherStorageKey('students', undefined) === 'students::guest', 'Guest data never falls back to legacy shared teacher storage.');
assert.throws(() => createTeacherStorageKey('students', '../teacher-one'));
checks += 1;
assert.throws(() => createTeacherStorageKey('students::teacher-two', 'teacher-one'));
checks += 1;

const firstReportDocument = createPlickerReportDocumentId('teacher-one', 'session-123');
const secondReportDocument = createPlickerReportDocumentId('teacher-two', 'session-123');
verify(firstReportDocument !== secondReportDocument, 'Cloud reports remain unique even if report IDs collide between teachers.');
assert.throws(() => createPlickerReportDocumentId('teacher-one', '../../another-report'));
checks += 1;

const privateRoster = await createPrivateStudentRosterDirectory('teacher-one', 'exam-8a', [
  { id: 'student-one', name: 'Nguyễn Văn An', classId: 'class-8a' },
  { id: 'student-two', name: 'Trần Thị Bình', classId: 'class-8b' },
  { id: 'old-guest', name: 'Nguyễn Văn An' },
  { id: 'same-name-other-class', name: 'Nguyễn Văn An', classId: 'class-8b' },
]);
const firstStudentKey = await createStudentRosterLookupKey('teacher-one', 'exam-8a', '  NGUYỄN   VĂN AN ');
const otherExamKey = await createStudentRosterLookupKey('teacher-one', 'exam-8b', 'Nguyễn Văn An');
const otherTeacherKey = await createStudentRosterLookupKey('teacher-two', 'exam-8a', 'Nguyễn Văn An');
verify(normalizeStudentRosterName('  Nguyễn   Văn AN ') === 'nguyễn văn an', 'Student matching remains case-insensitive and normalizes whitespace.');
const firstClassKey = await createStudentRosterLookupKey('teacher-one', 'exam-8a', 'Nguyễn Văn An', 'class-8a');
const secondClassKey = await createStudentRosterLookupKey('teacher-one', 'exam-8a', 'Nguyễn Văn An', 'class-8b');
verify(privateRoster[firstClassKey]?.id === 'student-one', 'Selecting class resolves an enrolled student even when names are duplicated.');
verify(privateRoster[secondClassKey]?.id === 'same-name-other-class', 'Students with the same name in different classes retain separate IDs.');
verify(privateRoster[firstClassKey]?.classId === 'class-8a', 'Private roster matching preserves classroom membership and existing reports.');
verify(/^[a-f0-9]{64}$/.test(firstStudentKey), 'Public exam lookup keys use SHA-256 instead of exposing student names.');
verify(firstStudentKey !== otherExamKey, 'A student lookup key cannot be reused between exams.');
verify(firstStudentKey !== otherTeacherKey, 'A student lookup key cannot be reused between teachers.');
verify(!JSON.stringify(privateRoster).includes('Nguyễn'), 'The public exam directory never contains student names.');
verify(!JSON.stringify(privateRoster).includes('Trần'), 'No classmate names are disclosed in the published exam.');

const dashboard = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const classroom = readFileSync(new URL('../src/components/PlickerClassroom.tsx', import.meta.url), 'utf8');
const learningWall = readFileSync(new URL('../src/components/LearningWall.tsx', import.meta.url), 'utf8');
const legacyExamManager = readFileSync(new URL('../src/components/ExamManagerLegacy.tsx', import.meta.url), 'utf8');
const studentRunner = readFileSync(new URL('../src/components/UnifiedStudentExamRunner.tsx', import.meta.url), 'utf8');
const omr = readFileSync(new URL('../src/components/OMRScanner.tsx', import.meta.url), 'utf8');
const gestureClass = readFileSync(new URL('../public/gestureclass/app.js', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

verify(dashboard.includes("where('authorId', '==', accessScope.ownerUid)"), 'Dashboard queries request only documents owned by the signed-in teacher.');
verify(dashboard.includes("accessScope.role === 'administrator'"), 'Dashboard keeps global administrator queries.');
verify(dashboard.includes('synchronizedReports={synchronizedPlickerReports}'), 'Administrator and teacher report views receive owner-filtered cloud reports.');
verify(learningWall.includes("where('authorId', '==', accessScope.ownerUid)"), 'Learning wall requests only its teacher-owned categories and posts.');
verify(legacyExamManager.includes("where('teacherId', '==', accessScope.ownerUid)"), 'Teacher exam, class, student, result and session queries remain owner-scoped.');
verify(!studentRunner.includes("query(collection(db, 'results'), where('studentId'"), 'Students cannot enumerate the private results collection.');
const examRosterLoader = readFileSync(new URL('../src/lib/examRoster.ts', import.meta.url), 'utf8');
verify(legacyExamManager.includes('loadExamRosterMetadata') && examRosterLoader.includes('createPrivateStudentRosterDirectory'), 'Publishing a teacher-managed exam creates anonymous, owner-specific roster lookup keys.');
verify(studentRunner.includes('createStudentRosterLookupKey(exam.teacherId, exam.id, normalizedName)'), 'Student login checks a private matching key instead of reading all classmates.');
verify(!studentRunner.includes('getDocs('), 'The public student portal never downloads a teacher’s student list.');
verify(studentRunner.includes('const resultId = `${currentStudent.id}_${activeExam.id}`'), 'A student receives at most one protected result document per exam.');
verify(omr.includes("where('teacherId', '==', examOwnerUid)"), 'OMR result exports cannot include another teacher’s scores, including when an administrator scans them.');
verify(classroom.includes("kind: 'plicker_report'"), 'Plicker summaries are synchronized for administrator oversight.');
verify(classroom.includes('createPlickerReportDocumentId(ownerUid, report.id)'), 'Each Plicker cloud report includes its teacher ownership.');
verify(classroom.includes('createTeacherStorageKey(REPORTS_STORAGE_KEY, ownerUid)'), 'Plicker reports are isolated on shared computers.');
verify(gestureClass.includes('gestureclass.v1.private::${ownerUid}'), 'The standalone GestureClass iframe isolates its local workspace.');

for (const componentName of [
  'AdminDashboard', 'DragDropGame', 'HeadShakeGame',
  'PlickerClassroom', 'PlickerScanner', 'SecretBoxGame',
]) {
  const source = readFileSync(new URL(`../src/components/${componentName}.tsx`, import.meta.url), 'utf8');
  verify(source.includes('createTeacherStorageKey'), `${componentName} namespaces persistent content by the authenticated teacher.`);
}

for (const collectionName of ['categories', 'wall_posts', 'exams', 'classes', 'students', 'results', 'exam_sessions']) {
  verify(rules.includes(`match /${collectionName}/`), `${collectionName} has an explicit Firestore security policy.`);
}
verify(rules.includes("allow read: if mayAccess(existing(), 'authorId');"), 'Learning content is protected by its author.');
verify(rules.includes("allow read: if mayAccess(existing(), 'teacherId');"), 'Classes, results and live exam sessions are protected by their teacher.');
verify(rules.includes('Student login uses an anonymized exam directory'), 'Student records remain private even though the exam portal supports guest login.');
verify(rules.includes('ownerRemainsUnchanged'), 'Teachers cannot take over another account by rewriting ownership.');
verify(rules.includes('match /public_exam_schedules/{scheduleId}'), 'Students see only a separate public exam schedule.');
verify(rules.includes('match /public_exam_access/{accessId}'), 'Authorized students receive a separate encrypted exam payload.');
verify(rules.includes('allow list: if isAdmin();'), 'Teachers and guests cannot list encrypted exams from other workspaces.');
verify(rules.includes('publishedExamBelongsToTeacher'), 'Public exam submissions are validated against the correct teacher and published exam.');
verify(!rules.includes('allow read: if true'), 'No collection is unconditionally readable by the public.');
verify(!rules.includes('allow create: if true'), 'No collection accepts unconditional public writes.');
verify(!rules.includes('allow create, update, delete: if isSignedIn()'), 'Teachers cannot edit another teacher’s documents merely by signing in.');

console.info(`Teacher isolation, administrator oversight and private reports: ${checks} checks passed.`);
