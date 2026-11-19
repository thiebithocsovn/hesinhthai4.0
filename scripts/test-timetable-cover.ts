import assert from 'node:assert/strict';
import { optimizeTimetable, type TimetableScenario } from '../src/lib/smartTimetable';
import { auditTimetableSolution } from '../src/lib/smartTimetableAudit';
import { coverTargetEntries, proposeTimetableCover, timetableCoverSignature, validateTimetableCovers, type TimetableCover } from '../src/lib/timetableCover';

const scenario: TimetableScenario = {
  name: 'Fixture dạy thay', daysPerWeek: 5, periodsPerDay: 5, morningPeriods: 5,
  teachers: [
    { id: 't1', name: 'Giáo viên 1', level: 'THCS' },
    { id: 't2', name: 'Giáo viên 2', level: 'THCS' },
    { id: 't3', name: 'Giáo viên 3', level: 'THCS', maxPeriodsPerDay: 3 },
  ],
  classes: [
    { id: 'c1', name: '6A', level: 'THCS' }, { id: 'c2', name: '7A', level: 'THCS' },
    { id: 'c3', name: '8A', level: 'THCS' },
  ],
  subjects: [{ id: 'math', name: 'Toán' }], rooms: [],
  assignments: [
    { id: 'a1', classId: 'c1', subjectId: 'math', teacherId: 't1', periodsPerWeek: 2, blockSize: 2, maxPerDay: 2, fixedStartSlots: ['0:1'] },
    { id: 'a2', classId: 'c2', subjectId: 'math', teacherId: 't2', periodsPerWeek: 1, blockSize: 1, maxPerDay: 1, fixedStartSlots: ['0:1'] },
    { id: 'a3', classId: 'c3', subjectId: 'math', teacherId: 't3', periodsPerWeek: 1, blockSize: 1, maxPerDay: 1, fixedStartSlots: ['0:3'] },
  ],
};
const solution = optimizeTimetable(scenario, [], 90);
assert.ok(auditTimetableSolution(scenario, solution).valid, 'Fixture timetable must be valid.');
const target = solution.entries.find(e => e.assignmentId === 'a1')!;
const selected = coverTargetEntries(solution, target.id);
assert.equal(selected.length, 2, 'Double period must stay intact.');
const cover: TimetableCover = {
  date: '2026-11-23', entryIds: selected.map(e => e.id), substituteTeacherId: 't3',
  reason: 'Giáo viên nghỉ phép', createdAt: '2026-11-19T00:00:00Z',
};
assert.deepEqual(validateTimetableCovers(scenario, solution, [cover]), [], 'Teacher 3 covers valid block.');
assert.equal(proposeTimetableCover(scenario, solution, [], cover).covers.length, 1);
const wrongDate = { ...cover, date: '2026-11-24' };
assert.ok(validateTimetableCovers(scenario, solution, [wrongDate]).some(x => x.includes('không trùng thứ')));
const sameTeacher = { ...cover, substituteTeacherId: 't1' };
assert.ok(validateTimetableCovers(scenario, solution, [sameTeacher]).some(x => x.includes('đã là giáo viên')));
const collision = { ...cover, substituteTeacherId: 't2' };
assert.ok(validateTimetableCovers(scenario, solution, [collision]).some(x => x.includes('Trùng lịch')));
const unavailable: TimetableScenario = { ...scenario, teachers: scenario.teachers.map(t => t.id === 't3' ? { ...t, unavailableSlots: ['0:1'] } : t) };
assert.ok(validateTimetableCovers(unavailable, solution, [cover]).some(x => x.includes('đang bận')));
const overloaded: TimetableScenario = { ...scenario, teachers: scenario.teachers.map(t => t.id === 't3' ? { ...t, maxPeriodsPerDay: 2 } : t) };
assert.ok(validateTimetableCovers(overloaded, solution, [cover]).some(x => x.includes('tối đa/ngày')));
const partial = { ...cover, entryIds: [selected[0].id] };
assert.ok(validateTimetableCovers(scenario, solution, [partial]).some(x => x.includes('toàn bộ block')));
const mixedLevel: TimetableScenario = { ...scenario, teachers: scenario.teachers.map(t => t.id === 't3' ? { ...t, level: 'Tiểu học' as const } : t) };
assert.ok(validateTimetableCovers(mixedLevel, solution, [cover]).some(x => x.includes('đúng cấp học')));
const updated = { ...cover, reason: 'Nghỉ tập huấn' };
const replaced = proposeTimetableCover(scenario, solution, [cover], updated);
assert.equal(replaced.covers.length, 1);
assert.equal(replaced.covers[0].reason, 'Nghỉ tập huấn');
assert.equal(timetableCoverSignature(scenario, solution), timetableCoverSignature(scenario, solution));
console.info('Dạy thay: block, ngày, trùng GV, giờ bận, tải tiết, cấp học, cập nhật và lưu riêng đạt.');
