import assert from 'node:assert/strict';
import { createDefaultTimetableScenario, optimizeTimetable, timetableSlotKey } from '../src/lib/smartTimetable';
import { planTimetableAgentCommand } from '../src/lib/timetableAgent';
import { auditTimetableSolution } from '../src/lib/smartTimetableAudit';

const base = createDefaultTimetableScenario();
const noMutation = JSON.stringify(base);
const teacherPlan = planTimetableAgentCommand('Cô Hương nghỉ thứ Ba tiết 2', base, null);
assert.equal(teacherPlan.status, 'ready');
assert.ok(teacherPlan.nextScenario);
assert.ok(teacherPlan.nextScenario?.teachers.find(x => x.name === 'Cô Hương')?.unavailableSlots?.includes('1:2'));
assert.equal(JSON.stringify(base), noMutation, 'Preview must not mutate scenario.');

const afterTeacher = teacherPlan.nextScenario!;
const unlock = planTimetableAgentCommand('Mở khóa Cô Hương thứ Ba tiết 2', afterTeacher, null);
assert.equal(unlock.status, 'ready');
assert.ok(!unlock.nextScenario?.teachers.find(x => x.name === 'Cô Hương')?.unavailableSlots?.includes('1:2'));

const roomPlan = planTimetableAgentCommand('Phòng Tin học bận sáng thứ Tư', base, null);
assert.equal(roomPlan.status, 'ready');
assert.deepEqual(roomPlan.nextScenario?.rooms.find(x => x.name === 'Phòng Tin học')?.unavailableSlots?.sort(), [
  timetableSlotKey(2, 1), timetableSlotKey(2, 2), timetableSlotKey(2, 3), timetableSlotKey(2, 4), timetableSlotKey(2, 5),
]);

const classPlan = planTimetableAgentCommand('Lớp 6A không học Toán thứ Sáu tiết 5', base, null);
assert.equal(classPlan.status, 'ready');
assert.ok(classPlan.nextScenario?.assignments.find(x => x.id === 'a6')?.forbiddenSlots?.includes('4:5'));

for (const command of ['Cô Hương nghỉ thứ Tám tiết 2', 'Thay tất cả các giáo viên', 'Xếp lớp 6A', '']) {
  const result = planTimetableAgentCommand(command, base, null);
  assert.notEqual(result.status, 'ready', 'Ambiguous command must not mutate: ' + command);
  assert.equal(result.nextScenario, undefined);
}

const information = planTimetableAgentCommand('Thống kê thời khóa biểu', base, null);
assert.equal(information.status, 'information');

const solution = optimizeTimetable(base, [], 220);
const audit = auditTimetableSolution(base, solution);
assert.equal(audit.valid, true, audit.errors.join('\n'));
assert.equal(audit.complete, true, 'Default sample must be fully scheduled.');
assert.equal(audit.placedPeriods, audit.expectedPeriods);

const altered = {
  ...solution,
  entries: [...solution.entries, { ...solution.entries[0], id: 'injected-collision' }],
};
const invalid = auditTimetableSolution(base, altered);
assert.equal(invalid.valid, false, 'Independent audit must reject colliding / extra lessons.');
assert.ok(invalid.errors.some(x => x.includes('Trùng')));

const missing = auditTimetableSolution(base, { ...solution, entries: solution.entries.slice(1) });
assert.equal(missing.complete, false, 'Independent audit must detect missing lessons.');
assert.equal(missing.valid, false);

console.info('AITHEROVA timetable agent and independent audit: all tests passed; ' + audit.placedPeriods + ' periods audited.');
