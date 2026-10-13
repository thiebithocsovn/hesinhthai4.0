import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPlickerDevicePath,
  getPlickerDisplayActivationKey,
  createPlickerLiveRoomId,
  createPlickerLiveSession,
  createPlickerQuestionKey,
  getPlickerLiveResponses,
  isPlickerDeviceOnline,
  isPlickerLiveSessionRunning,
  PLICKER_DEVICE_HEARTBEAT_MS,
  PLICKER_DEVICE_STALE_MS,
  isPlickerSystemCategory,
  mergePlickerDeletedClasses,
  mergePlickerDeletedQuestionSets,
  mergePlickerCloudRosters,
  mergePlickerQuestionSets,
  movePlickerLiveQuestion,
  normalizePlickerLiveRoom,
  readPlickerDeviceRole,
  recordPlickerLiveResponse,
  sanitizePlickerQuestionSet,
  sanitizePlickerStudents,
  summarizePlickerLiveAnswers,
  type PlickerLiveQuestionSet,
  type PlickerLiveResponse,
  type PlickerLiveRoom,
  type PlickerLiveSession,
  type PlickerLiveStudent,
} from '../src/lib/plickerLive';

let checks = 0;

assert.equal(isPlickerLiveSessionRunning(null), false);
assert.equal(isPlickerLiveSessionRunning(undefined), false);
assert.equal(isPlickerLiveSessionRunning({ phase: 'launch' }), true);
assert.equal(isPlickerLiveSessionRunning({ phase: 'scanning' }), true);
assert.equal(isPlickerLiveSessionRunning({ phase: 'results' }), true);
assert.equal(isPlickerLiveSessionRunning({ phase: 'finished' }), false);
checks += 6;

assert.equal(createPlickerLiveRoomId('teacher_ABC-123'), 'plicker-live-teacher_ABC-123');
assert.throws(() => createPlickerLiveRoomId('../other-account'));
assert.throws(() => createPlickerLiveRoomId(''));
assert.equal(isPlickerSystemCategory('plicker-live-owner'), true);
assert.equal(isPlickerSystemCategory('class-8a', { kind: 'plicker_live_session' }), true);
assert.equal(isPlickerSystemCategory('class-8a', { title: 'Lớp 8A' }), false);
assert.equal(readPlickerDeviceRole('?app=plicker&role=scanner', 'Windows'), 'scanner');
assert.equal(readPlickerDeviceRole('?app=plicker&role=display', 'Android'), 'display');
assert.equal(readPlickerDeviceRole('?app=plicker', 'Mozilla/5.0 (Linux; Android 14)'), 'scanner');
assert.equal(readPlickerDeviceRole('?app=plicker', 'Mozilla/5.0 (Windows NT 10.0)'), 'display');
assert.equal(createPlickerDevicePath('/4.0/', 'scanner'), '/4.0/?app=plicker&role=scanner');
assert.equal(createPlickerDevicePath('/4.0', 'display'), '/4.0/?app=plicker&role=display');
assert.equal(PLICKER_DEVICE_HEARTBEAT_MS < PLICKER_DEVICE_STALE_MS, true);
assert.equal(isPlickerDeviceOnline(undefined, 1_000), false);
assert.equal(isPlickerDeviceOnline({ deviceId: 'phone', updatedAt: 950 }, 1_000, 100), true);
assert.equal(isPlickerDeviceOnline({ deviceId: 'phone', updatedAt: 800 }, 1_000, 100), false);
assert.equal(createPlickerQuestionKey('set-01', 2), 'set-01:2');
assert.throws(() => createPlickerQuestionKey('set.bad', 2));
checks += 18;

const roster: PlickerLiveStudent[] = [
  { id: 'student-an', classId: 'class-8a', name: 'An', cardId: 1 },
  { id: 'student-binh', classId: 'class-8a', name: 'Bình', cardId: 2 },
  { id: 'student-chau', classId: 'class-8a', name: 'Châu', cardId: 3 },
];
const questionSet: PlickerLiveQuestionSet = {
  id: 'set-math-8',
  title: 'Toán 8',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
  questions: [
    { id: 1, text: '2 + 2 = ?', options: { A: '3', B: '4', C: '5', D: '6' }, correctAnswer: 'B' },
    { id: 2, text: '3 × 3 = ?', options: { A: '6', B: '8', C: '9', D: '12' }, correctAnswer: 'C' },
  ],
};

const invalidRoster = [
  ...roster,
  { id: 'duplicate-id', classId: 'class-8a', name: 'Trùng mã', cardId: 2 },
  { id: 'invalid-card', classId: 'class-8a', name: 'Ngoài giới hạn', cardId: 64 },
  { id: 'empty-name', classId: 'class-8a', name: '  ', cardId: 4 },
];
assert.deepEqual(sanitizePlickerStudents(invalidRoster).map(student => student.cardId), [1, 2, 3]);
assert.deepEqual(sanitizePlickerQuestionSet(questionSet), questionSet);
assert.throws(() => createPlickerLiveSession({ sessionId: 's', ownerUid: 'owner', classId: 'class-8a', className: '8A', students: [], questionSet, controllerDeviceId: 'phone' }));
assert.throws(() => createPlickerLiveSession({ sessionId: 's', ownerUid: 'owner', classId: 'class-8a', className: '8A', students: roster, questionSet: { ...questionSet, questions: [] }, controllerDeviceId: 'phone' }));
checks += 4;

let computer: PlickerLiveSession = createPlickerLiveSession({
  sessionId: 'session-8a',
  ownerUid: 'owner-uid',
  classId: 'class-8a',
  className: 'Lớp 8A',
  students: roster,
  questionSet,
  controllerDeviceId: 'phone-device',
  now: 1_000,
});
let phone = structuredClone(computer);

assert.equal(computer.phase, 'launch');
assert.equal(computer.questionIndex, 0);
assert.equal(computer.showCorrect, false);
assert.equal(computer.showGraph, false);
assert.equal(computer.students.length, 3);
assert.equal(computer.questionSet.questions[0].text, '2 + 2 = ?');
checks += 6;

assert.equal(getPlickerDisplayActivationKey('display', computer, 'computer-device'), 'session-8a:0:play');
assert.equal(getPlickerDisplayActivationKey('scanner', computer, 'phone-device'), null);
assert.equal(getPlickerDisplayActivationKey('display', computer, 'phone-device'), null);
assert.equal(getPlickerDisplayActivationKey('display', null, 'computer-device'), null);
assert.equal(getPlickerDisplayActivationKey('display', { ...computer, phase: 'finished' }, 'computer-device'), null);
assert.equal(getPlickerDisplayActivationKey('display', { ...computer, controllerDeviceId: '' }, 'computer-device'), null);
checks += 6;

phone = { ...phone, phase: 'scanning', updatedAt: 1_010 };
computer = structuredClone(phone);
assert.equal(computer.phase, 'scanning', 'Computer immediately enters the accepting-answers state.');
assert.equal(getPlickerDisplayActivationKey('display', computer, 'computer-device'), 'session-8a:0:scan');
checks += 1;

const an: PlickerLiveResponse = { studentId: 'student-an', studentName: 'An', cardId: 1, answer: 'B', confidence: 0.98, timestamp: 1_020, source: 'camera' };
const binh: PlickerLiveResponse = { studentId: 'student-binh', studentName: 'Bình', cardId: 2, answer: 'A', confidence: 0.95, timestamp: 1_030, source: 'camera' };
const chau: PlickerLiveResponse = { studentId: 'student-chau', studentName: 'Châu', cardId: 3, answer: 'B', confidence: 0.99, timestamp: 1_040, source: 'camera' };

for (const response of [an, binh, chau]) {
  phone = recordPlickerLiveResponse(phone, response);
  computer = structuredClone(phone);
  assert.equal(getPlickerLiveResponses(computer).length, getPlickerLiveResponses(phone).length);
  assert.equal(getPlickerLiveResponses(computer).at(-1)?.studentId, response.studentId);
  checks += 2;
}
assert.deepEqual(summarizePlickerLiveAnswers(getPlickerLiveResponses(computer)), { A: 1, B: 2, C: 0, D: 0 });
assert.equal(getPlickerLiveResponses(computer).length, 3);
checks += 3;

const changedBinh: PlickerLiveResponse = { ...binh, answer: 'B', timestamp: 1_060 };
phone = recordPlickerLiveResponse(phone, changedBinh);
assert.equal(getPlickerLiveResponses(phone).length, 3, 'Changing a response replaces the student response rather than duplicating it.');
assert.equal(getPlickerLiveResponses(phone).find(answer => answer.studentId === 'student-binh')?.answer, 'B');
assert.deepEqual(summarizePlickerLiveAnswers(getPlickerLiveResponses(phone)), { A: 0, B: 3, C: 0, D: 0 });
assert.strictEqual(recordPlickerLiveResponse(phone, { ...binh, timestamp: 1_025 }), phone, 'Older network updates cannot overwrite newer answers.');
assert.strictEqual(recordPlickerLiveResponse(phone, { ...an, cardId: 62 }), phone, 'Unassigned cards are ignored.');
assert.strictEqual(recordPlickerLiveResponse(phone, { ...an, studentId: 'stranger' }), phone, 'Students from other classes are ignored.');
checks += 6;

phone = { ...phone, phase: 'results', showCorrect: true, showGraph: true, updatedAt: 1_100 };
computer = structuredClone(phone);
assert.equal(computer.phase, 'results');
assert.equal(computer.showCorrect, true);
assert.equal(computer.showGraph, true);
assert.equal(computer.questionSet.questions[computer.questionIndex].correctAnswer, 'B');
assert.equal(getPlickerDisplayActivationKey('display', computer, 'computer-device'), 'session-8a:0:play');
checks += 4;

phone = movePlickerLiveQuestion(phone, 1, 1_200);
computer = structuredClone(phone);
assert.equal(computer.questionIndex, 1);
assert.equal(computer.questionSet.questions[1].text, '3 × 3 = ?');
assert.equal(computer.phase, 'launch');
assert.equal(computer.showCorrect, false);
assert.equal(computer.showGraph, false);
assert.deepEqual(getPlickerLiveResponses(computer), []);
assert.equal(Object.values(computer.answersByQuestion['set-math-8:1']).length, 3, 'Earlier question results remain available for reports.');
assert.equal(movePlickerLiveQuestion(computer, 20).questionIndex, 1);
assert.equal(movePlickerLiveQuestion(computer, -10).questionIndex, 0);
assert.equal(getPlickerDisplayActivationKey('display', computer, 'computer-device'), 'session-8a:1:play');
checks += 10;

const newerSet = { ...questionSet, title: 'Toán 8 đã chỉnh sửa', updatedAt: '2026-08-23T02:00:00.000Z' };
assert.equal(mergePlickerQuestionSets([questionSet], [newerSet])[0].title, newerSet.title);
assert.equal(mergePlickerQuestionSets([newerSet], [questionSet])[0].title, newerSet.title);
assert.equal(mergePlickerQuestionSets([questionSet], [{ ...questionSet, id: 'set-2' }]).length, 2);
const deletedQuestionSetIds = mergePlickerDeletedQuestionSets({}, { [questionSet.id]: Date.parse('2026-08-24T00:00:00.000Z') });
assert.deepEqual(mergePlickerQuestionSets([questionSet], [questionSet], deletedQuestionSetIds), []);
assert.deepEqual(mergePlickerQuestionSets([], [questionSet], deletedQuestionSetIds), []);
const deletedClassIds = mergePlickerDeletedClasses(
  { 'class-8a': 1_000, '../invalid': 4_000 },
  { 'class-8a': 2_000, 'class-8b': 1_500 },
);
assert.deepEqual(deletedClassIds, { 'class-8a': 2_000, 'class-8b': 1_500 });
assert.strictEqual(mergePlickerDeletedClasses(deletedClassIds, { 'class-8a': 1_000 }), deletedClassIds);
const otherClass = { id: 'student-dung', classId: 'class-8b', name: 'Dung', cardId: 1 };
const updatedRosters = mergePlickerCloudRosters([...roster, otherClass], { 'class-8a': [roster[0], roster[2]] });
assert.deepEqual(updatedRosters.filter(student => student.classId === 'class-8a').map(student => student.id), ['student-an', 'student-chau']);
assert.ok(updatedRosters.some(student => student.id === 'student-dung'));
assert.deepEqual(mergePlickerCloudRosters(roster, { 'class-8a': [] }), []);
checks += 10;

const room: PlickerLiveRoom = {
  kind: 'plicker_live_session',
  ownerUid: 'owner-uid',
  authorId: 'owner-uid',
  librarySets: [questionSet],
  deletedQuestionSetIds: { 'set-deleted': 1_000 },
  deletedClassIds: { 'class-deleted': 1_100 },
  rosters: { 'class-8a': roster },
  devices: { scanner: { deviceId: 'phone-device', updatedAt: 1_200 }, display: { deviceId: 'computer-device', updatedAt: 1_200 } },
  activeSession: computer,
  updatedAt: 1_200,
};
assert.equal(normalizePlickerLiveRoom(room, 'owner-uid')?.activeSession?.sessionId, 'session-8a');
assert.equal(normalizePlickerLiveRoom(room, 'another-owner'), null);
assert.equal(normalizePlickerLiveRoom({ ...room, kind: 'different' }, 'owner-uid'), null);
assert.equal(normalizePlickerLiveRoom({ ...room, activeSession: { ...computer, ownerUid: 'another-owner' } }, 'owner-uid')?.activeSession, null);
assert.equal(normalizePlickerLiveRoom({ ...room, rosters: { 'class-8a': [...roster, { ...otherClass, cardId: 4 }] } }, 'owner-uid')?.rosters['class-8a'].length, 3);
assert.deepEqual(normalizePlickerLiveRoom(room, 'owner-uid')?.deletedQuestionSetIds, { 'set-deleted': 1_000 });
assert.deepEqual(normalizePlickerLiveRoom(room, 'owner-uid')?.deletedClassIds, { 'class-deleted': 1_100 });
assert.equal(normalizePlickerLiveRoom({ ...room, deletedClassIds: { 'class-8a': 1_300 } }, 'owner-uid')?.activeSession, null);
checks += 8;

const classroomSource = readFileSync(new URL('../src/components/PlickerClassroom.tsx', import.meta.url), 'utf8');
const displaySource = readFileSync(new URL('../src/components/PlickerDisplayScreen.tsx', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/plicker.webmanifest', import.meta.url), 'utf8')) as { start_url: string };
assert.match(classroomSource, /QRCode\.toDataURL\(scannerUrl/);
assert.match(classroomSource, /PLICKER_DEVICE_HEARTBEAT_MS/);
assert.match(classroomSource, /getOrCreatePlickerDeviceId/);
assert.match(classroomSource, /isPlickerDeviceOnline/);
checks += 4;
assert.match(classroomSource, /onSnapshot\(liveRoomReference/);
assert.match(classroomSource, /doc\(db, 'categories', createPlickerLiveRoomId\(ownerUid\)\)/);
assert.match(classroomSource, /activeSession\.answersByQuestion/);
assert.match(classroomSource, /'activeSession\.phase': 'scanning'/);
assert.match(classroomSource, /'activeSession\.phase': 'finished'/);
assert.match(classroomSource, /isPlickerLiveSessionRunning\(liveSession\)/);
assert.match(classroomSource, /onClick=\{sessionInProgress \? finishSession : startSession\}/);
assert.match(classroomSource, /data-session-action=\{sessionInProgress \? 'stop' : 'start'\}/);
assert.match(classroomSource, /Dừng buổi học/);
assert.match(classroomSource, /Đã dừng buổi học và lưu báo cáo/);
assert.match(classroomSource, /'activeSession\.showCorrect'/);
assert.match(classroomSource, /'activeSession\.showGraph'/);
assert.match(displaySource, /MÀN HÌNH LỚP HỌC/);
assert.match(displaySource, /Học sinh đã trả lời/);
assert.match(classroomSource, /Đáp án giáo viên/);
assert.match(classroomSource, /getPlickerDisplayActivationKey/);
assert.match(classroomSource, /setShowProjector\(true\)/);
assert.match(classroomSource, /<PlickerDisplayScreen/);
assert.match(dashboardSource, /isPlickerSystemCategory/);
assert.match(dashboardSource, /mergePlickerCloudRosters/);
assert.match(classroomSource, /Xóa lớp/);
assert.match(classroomSource, /confirmClassDeletion/);
assert.match(classroomSource, /deletedClassIds/);
assert.match(dashboardSource, /onDeleteClass/);
assert.match(dashboardSource, /deleteDoc\(doc\(db, 'categories', classId\)\)/);
assert.match(manifest.start_url, /role=scanner/);
checks += 26;

console.info(`Plicker phone/display realtime sync: ${checks} checks passed.`);
