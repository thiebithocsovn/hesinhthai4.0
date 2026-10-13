import assert from 'node:assert/strict';
import {
  activeTimetableDays,
  analyzeTimetableScenario,
  createDefaultTimetableScenario,
  optimizeTimetable,
  timetableSlotKey,
} from '../src/lib/smartTimetable';
import { scenarioFromAssignmentRows } from '../src/lib/smartTimetableImport';

function assertNoResourceCollisions(entries: ReturnType<typeof optimizeTimetable>['entries']): void {
  const classSlots = new Set<string>();
  const teacherSlots = new Set<string>();
  const roomSlots = new Set<string>();
  for (const entry of entries) {
    const slot = timetableSlotKey(entry.dayIndex, entry.period);
    const classKey = `${entry.classId}:${slot}`;
    const teacherKey = `${entry.teacherId}:${slot}`;
    assert.ok(!classSlots.has(classKey), `Class collision at ${classKey}`);
    assert.ok(!teacherSlots.has(teacherKey), `Teacher collision at ${teacherKey}`);
    classSlots.add(classKey);
    teacherSlots.add(teacherKey);
    if (entry.roomId) {
      const roomKey = `${entry.roomId}:${slot}`;
      assert.ok(!roomSlots.has(roomKey), `Room collision at ${roomKey}`);
      roomSlots.add(roomKey);
    }
  }
}

const scenario = createDefaultTimetableScenario();
assert.equal(activeTimetableDays(scenario).length, 5, 'Default linked school uses five teaching days.');
assert.equal(analyzeTimetableScenario(scenario).length, 0, 'Default sample must pass preflight feasibility checks.');

const first = optimizeTimetable(scenario, [], 220);
assert.equal(first.diagnostics.unscheduled.reduce((sum, item) => sum + item.remaining, 0), 0, 'The linked-school sample should schedule every required lesson.');
assert.equal(first.diagnostics.hardConflicts.length, 0, 'The generated timetable must not contain hard conflicts.');
assertNoResourceCollisions(first.entries);

const fixedHomeroom = first.entries.find(entry => entry.assignmentId === 'a13');
assert.ok(fixedHomeroom, 'Fixed homeroom lesson must be present.');
assert.equal(fixedHomeroom?.dayIndex, 4, 'Fixed homeroom lesson remains on Friday.');
assert.equal(fixedHomeroom?.period, 5, 'Fixed homeroom lesson remains in period 5.');
assert.equal(fixedHomeroom?.fixed, true, 'Fixed lesson is marked as fixed.');

const ictBlock = first.entries.filter(entry => entry.assignmentId === 'a4').sort((a, b) => a.period - b.period);
assert.equal(ictBlock.length, 2, 'Primary ICT assignment produces a two-period block.');
assert.equal(ictBlock[0].dayIndex, ictBlock[1].dayIndex, 'Block lessons remain on the same day.');
assert.equal(ictBlock[1].period, ictBlock[0].period + 1, 'Block lessons are consecutive.');

const lockedBlockSeed = first.entries.find(entry => entry.blockId && !entry.fixed);
assert.ok(lockedBlockSeed, 'A generated block entry should exist for lock testing.');
const lockedBlockEntries = first.entries.filter(entry => entry.blockId === lockedBlockSeed?.blockId).map(entry => ({ ...entry, locked: true }));
const second = optimizeTimetable(scenario, lockedBlockEntries, 120);
for (const locked of lockedBlockEntries) {
  assert.ok(second.entries.some(entry => entry.assignmentId === locked.assignmentId && entry.dayIndex === locked.dayIndex && entry.period === locked.period && entry.locked === true), 'Locked block periods remain fixed after re-optimization.');
}
assertNoResourceCollisions(second.entries);

const constrainedScenario = createDefaultTimetableScenario();
const blockedTeacher = constrainedScenario.teachers.find(teacher => teacher.id === 'gv-tin');
assert.ok(blockedTeacher, 'Sample ICT teacher should exist.');
blockedTeacher.unavailableSlots = ['0:1', '0:2', '0:3', '1:1'];
const constrained = optimizeTimetable(constrainedScenario, [], 180);
for (const entry of constrained.entries.filter(item => item.teacherId === 'gv-tin')) {
  assert.ok(!blockedTeacher.unavailableSlots.includes(timetableSlotKey(entry.dayIndex, entry.period)), 'Teacher must never be scheduled in an unavailable slot.');
}
assertNoResourceCollisions(constrained.entries);

const sixDay = createDefaultTimetableScenario();
sixDay.daysPerWeek = 6;
assert.equal(activeTimetableDays(sixDay).length, 6, 'Six-day schools expose Saturday to the solver.');

const imported = scenarioFromAssignmentRows([
  {
    'Cấp': 'Tiểu học', 'Lớp': '5A', 'Môn': 'Tin học', 'Giáo viên': 'Thầy Tuấn', 'Cấp GV': 'Liên cấp',
    'Phòng': 'Phòng Tin học', 'Tiết/tuần': 2, 'Tối đa/ngày': 2, 'Tiết đôi': 'Có', 'Buổi': 'Sáng', 'Tiết ưu tiên': 'T3-2;T5-2',
  },
  {
    'Cấp': 'THCS', 'Lớp': '6A', 'Môn': 'Sinh hoạt lớp', 'Giáo viên': 'Cô Hương', 'GVCN': 'Có',
    'Tiết/tuần': 1, 'Tiết cố định': 'T6-5',
  },
  {
    'Cấp': 'THCS', 'Lớp': '7A', 'Môn': 'Hoạt động trải nghiệm', 'Giáo viên': 'Thầy Nam',
    'Tiết/tuần': 1, 'Tiết cố định': 'T2-1;T3-1;T4-1',
  },
]);
assert.equal(imported.classes.length, 3, 'Excel rows create three classes.');
assert.equal(imported.teachers.length, 3, 'Excel rows create three teachers.');
assert.equal(imported.assignments[0].blockSize, 2, 'Excel boolean block column becomes a double period.');
assert.deepEqual(imported.assignments[1].fixedStartSlots, ['4:5'], 'Vietnamese fixed-slot notation is parsed.');
assert.equal(imported.assignments[2].fixedStartSlots?.length, 1, 'Surplus fixed slots are trimmed to the declared weekly period total.');
assert.equal(imported.classes.find(item => item.name === '6A')?.homeroomTeacherId, imported.teachers.find(item => item.name === 'Cô Hương')?.id, 'GVCN import links class and homeroom teacher.');

console.info(`Smart timetable v2: ${first.entries.length} periods scheduled, score ${first.score}, ${first.diagnostics.quality.teacherGaps} teacher gaps.`);
