import assert from 'node:assert/strict';
import { normalizeTimetableScenario, optimizeTimetable, type TimetableScenario } from '../src/lib/smartTimetable';
import { auditTimetableSolution } from '../src/lib/smartTimetableAudit';
import { assignmentClassIds, assignmentTeacherIds } from '../src/lib/smartTimetableResources';
import { mergeTimetableAssignments, unmergeTimetableAssignment } from '../src/lib/timetableGrouping';
import { moveTimetableBlock, swapTimetableBlocks } from '../src/lib/timetableAdmin';

const base: TimetableScenario = normalizeTimetableScenario({ name: 'Advanced test', daysPerWeek: 5, periodsPerDay: 7, morningPeriods: 4,
  teachers: ['t1', 't2', 't3'].map(id => ({ id, name: id, level: 'THCS' as const, maxPeriodsPerDay: 5, maxConsecutivePeriods: 4 })),
  classes: [{ id: '6a', name: '6A', level: 'THCS', studentCount: 30 }, { id: '6b', name: '6B', level: 'THCS', studentCount: 25 }],
  subjects: [{ id: 'math', name: 'Toán' }, { id: 'eng', name: 'Anh' }], rooms: [{ id: 'r1', name: 'Phòng lớn', capacity: 60 }, { id: 'r2', name: 'Phòng nhỏ', capacity: 20 }],
  assignments: [{ id: 'a', classId: '6a', teacherId: 't1', subjectId: 'math', periodsPerWeek: 4, maxPerDay: 2, blockSize: 2 }, { id: 'b', classId: '6b', teacherId: 't1', subjectId: 'math', periodsPerWeek: 4, maxPerDay: 2, blockSize: 2 }],
});
const solveAndAudit = (scenario: TimetableScenario) => {
  const solution = optimizeTimetable(scenario, [], 100);
  const audit = auditTimetableSolution(scenario, solution);
  assert.ok(audit.complete, JSON.stringify(solution.diagnostics));
  assert.ok(audit.valid, audit.errors.join('; '));
  return solution;
};
const merged = mergeTimetableAssignments(base, ['a', 'b'], 'r1');
assert.equal(merged.assignments.length, 1);
const mergeSolution = solveAndAudit(merged);
assert.equal(mergeSolution.entries.length, 4);
assert.ok(mergeSolution.entries.every(e => assignmentClassIds(e).length === 2));
assert.equal(unmergeTimetableAssignment(merged, 'a').assignments.length, 2);
const capacity = { ...merged, rooms: merged.rooms.map(r => r.id === 'r1' ? { ...r, capacity: 40 } : r) };
assert.ok(optimizeTimetable(capacity, [], 20).diagnostics.hardConflicts.length > 0, 'Merged classes require enough seats.');

const coTeaching = { ...merged, assignments: merged.assignments.map(a => ({ ...a, additionalTeacherIds: ['t2'] })) };
const coSolution = solveAndAudit(coTeaching);
assert.ok(coSolution.entries.every(e => assignmentTeacherIds(e).includes('t2')));
const forged = { ...coSolution, entries: coSolution.entries.map((e, i) => i ? e : { ...e, additionalTeacherIds: [] }) };
assert.ok(!auditTimetableSolution(coTeaching, forged).valid, 'Independent audit rejects missing co-teachers.');

const split: TimetableScenario = { ...base, studentGroups: [{ id: 'g1', classId: '6a', name: 'Nhóm 1', studentCount: 15 }, { id: 'g2', classId: '6a', name: 'Nhóm 2', studentCount: 15 }],
  assignments: [{ ...base.assignments[0], periodsPerWeek: 2, studentGroupId: 'g1', roomId: 'r2' }, { ...base.assignments[1], classId: '6a', teacherId: 't2', subjectId: 'eng', periodsPerWeek: 2, studentGroupId: 'g2', roomId: 'r1' }],
  lessonGroups: [{ id: 'parallel', name: 'Tách lớp', kind: 'parallel', assignmentIds: ['a', 'b'] }],
};
const splitSolution = solveAndAudit(split);
assert.equal(new Set(splitSolution.entries.map(e => `${e.dayIndex}:${e.period}`)).size, 2, 'Split lessons share the same clock slots.');
const first = splitSolution.entries[0];
let safeMove = false;
for (let day = 0; day < 5; day++) for (let period = 1; period < 4; period++) {
  if (day === first.dayIndex && period === first.period) continue;
  const result = moveTimetableBlock(split, splitSolution, first.id, day, period);
  if (result.solution) { assert.ok(auditTimetableSolution(split, result.solution).valid); assert.equal(new Set(result.solution.entries.map(e => e.parallelEventId)).size, 1); safeMove = true; break; }
}
assert.ok(safeMove, 'Manual moves carry every member of a parallel event.');
const ungrouped = { ...split, assignments: split.assignments.map(a => ({ ...a, studentGroupId: undefined })) };
assert.ok(optimizeTimetable(ungrouped, [], 10).diagnostics.unscheduled.length, 'Full-class lessons cannot overlap as split groups.');

const sameSession: TimetableScenario = { ...base, assignments: base.assignments.map((a, i) => ({ ...a, teacherId: `t${i + 1}`, periodsPerWeek: 2, blockSize: 1, maxPerDay: 1 })), lessonGroups: [{ id: 'same', name: 'Cùng buổi', kind: 'same-session', assignmentIds: ['a', 'b'] }] };
solveAndAudit(sameSession);
const limited: TimetableScenario = { ...sameSession, lessonGroups: [], subjects: base.subjects.map(x => ({ ...x, maxConcurrentClasses: 1 })) };
const limitSolution = solveAndAudit(limited);
assert.equal(new Set(limitSolution.entries.map(e => `${e.dayIndex}:${e.period}`)).size, limitSolution.entries.length);
const travel: TimetableScenario = { ...base, campuses: [{ id: 'c1', name: 'Cơ sở 1' }, { id: 'c2', name: 'Cơ sở 2' }], campusTravelPeriods: 1,
  assignments: base.assignments.map((a, i) => ({ ...a, periodsPerWeek: 1, blockSize: 1, maxPerDay: 1, campusId: `c${i + 1}`, fixedStartSlots: [`0:${i + 1}`] })) };
assert.ok(optimizeTimetable(travel, [], 10).diagnostics.unscheduled.length, 'A teacher needs a free travel period between campuses.');
const travelFeasible = { ...travel, assignments: travel.assignments.map((a, i) => ({ ...a, fixedStartSlots: [`0:${i * 2 + 1}`] })) };
solveAndAudit(travelFeasible);

const constrainedDays = { ...base, teachers: base.teachers.map(t => ({ ...t, maxTeachingDays: 1 })), assignments: base.assignments.map(a => ({ ...a, teacherId: 't1', periodsPerWeek: 2 })) };
const daysSolution = solveAndAudit(constrainedDays);
assert.equal(new Set(daysSolution.entries.map(e => e.dayIndex)).size, 1);
console.log('Advanced timetable: merged classes, co-teachers, parallel subgroups, session groups, capacities, concurrency, travel, teaching days and independent audit passed.');

// Groups from different classes may learn together without reserving their classmates.
const subgroupSource: TimetableScenario = { ...base, studentGroups: [
  { id: 'a1', classId: '6a', name: '6A Nhóm 1', studentCount: 15 }, { id: 'a2', classId: '6a', name: '6A Nhóm 2', studentCount: 15 },
  { id: 'b1', classId: '6b', name: '6B Nhóm 1', studentCount: 10 }, { id: 'b2', classId: '6b', name: '6B Nhóm 2', studentCount: 15 }],
  assignments: base.assignments.map((a, i) => ({ ...a, studentGroupId: i ? 'b1' : 'a1', periodsPerWeek: 2 })) };
const subgroupMerged = mergeTimetableAssignments(subgroupSource, ['a', 'b'], 'r1');
const subgroupResult = solveAndAudit(subgroupMerged);
assert.deepEqual(subgroupResult.entries[0].additionalStudentGroupIds, ['b1']);
assert.equal(unmergeTimetableAssignment(subgroupMerged, 'a').assignments.length, 2);
assert.ok(!auditTimetableSolution(subgroupMerged, { ...subgroupResult, entries: subgroupResult.entries.map(e => ({ ...e, additionalStudentGroupIds: [] })) }).valid);
const odd: TimetableScenario = { ...base, assignments: [{ ...base.assignments[0], periodsPerWeek: 3 }] };
const oddResult = solveAndAudit(odd);
assert.ok(!auditTimetableSolution(odd, { ...oddResult, entries: oddResult.entries.map((e, i) => ({ ...e, blockId: `fragment-${i}` })) }).valid, 'An odd total allows one remainder block, not fragmented double periods.');
const swapScenario: TimetableScenario = { ...base, assignments: [{ ...base.assignments[0], periodsPerWeek: 2 }, { ...base.assignments[1], classId: '6a', teacherId: 't2', subjectId: 'eng', periodsPerWeek: 2 }] };
const swapSource = solveAndAudit(swapScenario), sourceBlock = swapSource.entries.find(e => e.assignmentId === 'a')!, targetBlock = swapSource.entries.find(e => e.assignmentId === 'b')!;
const swapped = swapTimetableBlocks(swapScenario, swapSource, sourceBlock.id, targetBlock.id);
assert.ok(swapped.solution, swapped.errors.join('; '));
assert.ok(auditTimetableSolution(swapScenario, swapped.solution!).valid);
assert.equal(swapped.solution!.entries.find(e => e.id === sourceBlock.id)!.dayIndex, targetBlock.dayIndex);
assert.equal(swapTimetableBlocks(swapScenario, { ...swapSource, entries: swapSource.entries.map(e => e.id === sourceBlock.id ? { ...e, locked: true } : e) }, sourceBlock.id, targetBlock.id).solution, undefined);
// Deterministic load check with independent teachers; timing is evidence, not a service guarantee.
const large: TimetableScenario = { ...base, classes: Array.from({ length: 50 }, (_, i) => ({ id: `large-c${i}`, name: `Lớp ${i}`, level: 'THCS' as const, studentCount: 30 })), teachers: Array.from({ length: 50 }, (_, i) => ({ id: `large-t${i}`, name: `GV ${i}`, level: 'THCS' as const })), assignments: Array.from({ length: 50 }, (_, i) => ({ id: `large-a${i}`, classId: `large-c${i}`, teacherId: `large-t${i}`, subjectId: 'math', periodsPerWeek: 4, maxPerDay: 2, blockSize: 2 as const })) };
const started = performance.now(), largeSolution = solveAndAudit(large);
assert.equal(largeSolution.entries.length, 200);
console.log(`Additional cases: cross-class subgroups, complete blocks, validated swaps; 50 classes / 200 periods in ${Math.round(performance.now() - started)} ms.`);

const explicitCampus = mergeTimetableAssignments({ ...base, campuses: [{ id: 'campus-b', name: 'Điểm B' }], assignments: base.assignments.map((a, i) => ({ ...a, campusId: i ? 'campus-b' : undefined })) }, ['a', 'b'], 'r1');
assert.equal(explicitCampus.assignments[0].campusId, 'campus-b', 'Merge preserves the compatible explicit campus even when only a later source declares it.');
solveAndAudit(explicitCampus);
