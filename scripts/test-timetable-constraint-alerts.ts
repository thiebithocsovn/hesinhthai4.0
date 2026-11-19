import assert from 'node:assert/strict';
import { collectTimetableConstraintAlerts } from '../src/lib/timetableConstraintAlerts';
import { createDefaultTimetableScenario, type TimetableScenario } from '../src/lib/smartTimetable';

const fixture: TimetableScenario = {
  name: 'Fixture kiểm tra cảnh báo',
  daysPerWeek: 5,
  periodsPerDay: 6,
  morningPeriods: 3,
  afternoonPeriods: 3,
  teachers: [
    { id: 't1', name: 'GV Một', level: 'THCS' },
    { id: 't2', name: 'GV Hai', level: 'THCS' },
  ],
  classes: [
    { id: 'c1', name: '6A', level: 'THCS' },
    { id: 'c2', name: '7A', level: 'THCS' },
  ],
  subjects: [{ id: 'math', name: 'Toán' }],
  rooms: [{ id: 'r1', name: 'Phòng 1' }, { id: 'r2', name: 'Phòng 2' }],
  assignments: [
    { id: 'a1', classId: 'c1', subjectId: 'math', teacherId: 't1', roomId: 'r1', periodsPerWeek: 2, maxPerDay: 2, blockSize: 1, fixedStartSlots: ['0:1'] },
    { id: 'a2', classId: 'c2', subjectId: 'math', teacherId: 't2', roomId: 'r2', periodsPerWeek: 2, maxPerDay: 2, blockSize: 1, fixedStartSlots: ['0:2'] },
  ],
};
const clone = (): TimetableScenario => structuredClone(fixture);
const has = (s: TimetableScenario, code: string) => collectTimetableConstraintAlerts(s).some(alert => alert.code === code);
const good = collectTimetableConstraintAlerts(fixture);
assert.deepEqual(good, [], 'Two independent fixed lessons must not produce warnings.');

let s = clone(); s.assignments[1].teacherId = 't1'; s.assignments[1].fixedStartSlots = ['0:1'];
assert.ok(has(s, 'FIXED_COLLISION'), 'Same teacher at the same time must be reported.');

s = clone(); s.assignments[1].classId = 'c1'; s.assignments[1].fixedStartSlots = ['0:1'];
assert.ok(has(s, 'FIXED_COLLISION'), 'Same class at the same time must be reported.');

s = clone(); s.assignments[1].roomId = 'r1'; s.assignments[1].fixedStartSlots = ['0:1'];
assert.ok(has(s, 'FIXED_COLLISION'), 'Same room at the same time must be reported.');

s = clone(); s.assignments[0].fixedStartSlots = ['0:7'];
assert.ok(has(s, 'FIXED_OUT_OF_RANGE'), 'Fixed slot outside day must be reported.');

s = clone(); s.assignments[0].blockSize = 2; s.assignments[0].fixedStartSlots = ['0:3'];
assert.ok(has(s, 'FIXED_CROSSES_SESSION'), 'Double period crossing morning/afternoon must be reported.');

s = clone(); s.assignments[0].session = 'afternoon';
assert.ok(has(s, 'FIXED_WRONG_SESSION'), 'Morning slot for afternoon-only lesson must be reported.');

s = clone(); s.teachers[0].unavailableSlots = ['0:1'];
assert.ok(has(s, 'TEACHER_UNAVAILABLE'), 'Fixed slot in unavailable teacher time must be reported.');

s = clone(); s.classes[0].unavailableSlots = ['0:1'];
assert.ok(has(s, 'CLASS_UNAVAILABLE'), 'Fixed slot in unavailable class time must be reported.');

s = clone(); s.rooms[0].unavailableSlots = ['0:1'];
assert.ok(has(s, 'ROOM_UNAVAILABLE'), 'Fixed slot in unavailable room time must be reported.');

s = clone(); s.assignments[0].forbiddenSlots = ['0:1'];
assert.ok(has(s, 'FIXED_FORBIDDEN'), 'Fixed and forbidden slots must not silently coexist.');

const defaultAlerts = collectTimetableConstraintAlerts(createDefaultTimetableScenario());
assert.equal(defaultAlerts.length, 0, 'Built-in linked-school sample must remain usable.');

console.info('Timetable instant constraint alerts: 11 checks passed.');
