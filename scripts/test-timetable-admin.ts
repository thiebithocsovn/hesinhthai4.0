import assert from 'node:assert/strict';
import { createDefaultTimetableScenario, normalizeTimetableScenario, optimizeTimetable, type TimetableScenario } from '../src/lib/smartTimetable';
import { auditTimetableSolution } from '../src/lib/smartTimetableAudit';
import { classGradeId, createBlankManualTimetable, moveTimetableBlock, placeManualTimetableBlock, removeManualTimetableBlock, setHomeroomTeacher, timetableGrades } from '../src/lib/timetableAdmin';
import { TIMETABLE_ADMIN_PAGES, TIMETABLE_SETUP_STEPS } from '../src/lib/timetableNavigation';

const old = createDefaultTimetableScenario();
const snapshot = JSON.stringify(old);
const grades = timetableGrades(old);
assert.ok(grades.length > 0);
assert.ok(old.classes.every(item => grades.some(grade => grade.id === classGradeId(item))));
assert.equal(JSON.stringify(old), snapshot, 'Opening old backups must not mutate school data.');
const custom = { ...old, grades: [{ id: 'custom', name: 'Khối ghép', level: 'Tiểu học' as const }], classes: old.classes.map((item, index) => index === 0 ? { ...item, gradeId: 'custom' } : item) };
assert.equal(normalizeTimetableScenario(custom).classes[0].gradeId, 'custom');
assert.equal(timetableGrades(normalizeTimetableScenario(custom)).find(item => item.id === 'custom')?.name, 'Khối ghép');

const originalTeacher = old.classes.find(item => item.homeroomTeacherId)!;
const teacherId = originalTeacher.homeroomTeacherId!;
const otherClass = old.classes.find(item => item.id !== originalTeacher.id)!;
const reassigned = setHomeroomTeacher(old, otherClass.id, teacherId);
assert.equal(reassigned.classes.find(item => item.id === originalTeacher.id)?.homeroomTeacherId, undefined);
assert.equal(reassigned.classes.find(item => item.id === otherClass.id)?.homeroomTeacherId, teacherId);
assert.equal(reassigned.teachers.find(item => item.id === teacherId)?.homeroomClassId, otherClass.id);
const removed = setHomeroomTeacher(reassigned, otherClass.id, '');
assert.equal(removed.teachers.find(item => item.id === teacherId)?.homeroomClassId, undefined);
assert.equal(JSON.stringify(old), snapshot, 'Homeroom edits must not mutate the prior state.');
assert.equal(setHomeroomTeacher(old, 'missing', teacherId), old);

const scenario: TimetableScenario = {
  name: 'Manual move regression', daysPerWeek: 5, periodsPerDay: 6, morningPeriods: 3,
  teachers: [{ id: 'ta', name: 'A', level: 'THCS', unavailableSlots: ['3:1'] }, { id: 'tb', name: 'B', level: 'THCS' }],
  classes: [{ id: 'ca', name: '6A', level: 'THCS' }, { id: 'cb', name: '6B', level: 'THCS' }],
  subjects: [{ id: 'math', name: 'Toán' }], rooms: [{ id: 'r', name: 'Phòng chung' }],
  assignments: [
    { id: 'a', classId: 'ca', teacherId: 'ta', subjectId: 'math', roomId: 'r', periodsPerWeek: 2, maxPerDay: 2, blockSize: 2 },
    { id: 'b', classId: 'cb', teacherId: 'tb', subjectId: 'math', roomId: 'r', periodsPerWeek: 1, maxPerDay: 1 },
    { id: 'c', classId: 'cb', teacherId: 'ta', subjectId: 'math', periodsPerWeek: 1, maxPerDay: 1 },
  ],
};
const solution = { ...optimizeTimetable(scenario, [], 2), entries: [
  { id: 'a1', assignmentId: 'a', classId: 'ca', teacherId: 'ta', subjectId: 'math', roomId: 'r', dayIndex: 0, period: 1, blockId: 'block-a' },
  { id: 'a2', assignmentId: 'a', classId: 'ca', teacherId: 'ta', subjectId: 'math', roomId: 'r', dayIndex: 0, period: 2, blockId: 'block-a' },
  { id: 'b1', assignmentId: 'b', classId: 'cb', teacherId: 'tb', subjectId: 'math', roomId: 'r', dayIndex: 1, period: 1, blockId: 'block-b' },
  { id: 'c1', assignmentId: 'c', classId: 'cb', teacherId: 'ta', subjectId: 'math', dayIndex: 1, period: 2, blockId: 'block-c' },
] };
assert.ok(auditTimetableSolution(scenario, solution).valid);
const initialSolution = JSON.stringify(solution);
const moved = moveTimetableBlock(scenario, solution, 'a1', 2, 1);
assert.ok(moved.solution, moved.errors.join('; '));
assert.deepEqual(moved.solution!.entries.filter(item => item.blockId === 'block-a').map(item => [item.dayIndex, item.period]), [[2, 1], [2, 2]]);
assert.ok(auditTimetableSolution(scenario, moved.solution!).complete);
assert.ok(auditTimetableSolution(scenario, moved.solution!).valid);
assert.ok(!moveTimetableBlock(scenario, solution, 'a1', 1, 1).solution, 'Reject shared-room and teacher collisions.');
assert.ok(!moveTimetableBlock(scenario, solution, 'a1', 0, 3).solution, 'Reject crossing the morning/afternoon boundary.');
assert.ok(!moveTimetableBlock(scenario, solution, 'a1', 3, 1).solution, 'Reject teacher unavailable slots.');
assert.ok(!moveTimetableBlock(scenario, solution, 'a1', 5, 1).solution, 'Reject days outside the school week.');
assert.ok(!moveTimetableBlock(scenario, { ...solution, entries: solution.entries.map(item => item.id === 'a2' ? { ...item, locked: true } : item) }, 'a1', 2, 1).solution, 'Keep a block if any member is locked.');
assert.ok(!moveTimetableBlock(scenario, { ...solution, entries: solution.entries.map(item => item.id === 'a1' ? { ...item, fixed: true } : item) }, 'a1', 2, 1).solution, 'Keep fixed lessons in place.');
assert.ok(!moveTimetableBlock(scenario, { ...solution, entries: solution.entries.map(item => ({ ...item, blockId: undefined })) }, 'a1', 2, 1).solution, 'Old backups without block IDs must not split consecutive lessons.');
assert.ok(!moveTimetableBlock({ ...scenario, assignments: scenario.assignments.map(item => item.id === 'a' ? { ...item, fixedStartSlots: ['0:1'] } : item) }, solution, 'a1', 2, 1).solution, 'Fixed-start constraints remain effective even without entry flags.');
assert.equal(JSON.stringify(solution), initialSolution, 'Rejected moves and previews never mutate the saved solution.');

const blank = createBlankManualTimetable(scenario);
assert.equal(blank.entries.length, 0, 'Manual scheduling must begin with an empty grid.');
const blankAudit = auditTimetableSolution(scenario, blank, { allowIncomplete: true });
assert.ok(blankAudit.valid && !blankAudit.complete, 'An empty manual draft is valid but incomplete.');
assert.ok(!auditTimetableSolution(scenario, blank).valid, 'Strict export/publication audit must still reject incomplete schedules.');
const manualA = placeManualTimetableBlock(scenario, blank, 'a', 0, 1);
assert.ok(manualA.solution, manualA.errors.join('; '));
assert.equal(manualA.solution!.entries.length, 2, 'Placing a double lesson creates an entire block.');
assert.ok(auditTimetableSolution(scenario, manualA.solution!, { allowIncomplete: true }).valid);
assert.ok(!placeManualTimetableBlock(scenario, manualA.solution!, 'b', 0, 1).solution, 'Room conflicts must be rejected immediately.');
assert.ok(!placeManualTimetableBlock(scenario, manualA.solution!, 'c', 0, 1).solution, 'Teacher conflicts must be rejected immediately.');
assert.ok(!placeManualTimetableBlock(scenario, manualA.solution!, 'a', 1, 1).solution, 'Do not place more than assigned weekly lessons.');
assert.ok(!placeManualTimetableBlock(scenario, blank, 'a', 0, 3).solution, 'Reject a double period that crosses morning/afternoon.');
assert.ok(!placeManualTimetableBlock(scenario, blank, 'a', 3, 1).solution, 'Reject unavailable teacher slots.');
const manualB = placeManualTimetableBlock(scenario, manualA.solution!, 'b', 1, 1);
assert.ok(manualB.solution, manualB.errors.join('; '));
const manualC = placeManualTimetableBlock(scenario, manualB.solution!, 'c', 1, 2);
assert.ok(manualC.solution, manualC.errors.join('; '));
const completeManual = auditTimetableSolution(scenario, manualC.solution!);
assert.ok(completeManual.valid && completeManual.complete, completeManual.errors.join('; '));
const removedManual = removeManualTimetableBlock(scenario, manualC.solution!, manualB.solution!.entries.find(entry => entry.assignmentId === 'b')!.id);
assert.ok(removedManual.solution, removedManual.errors.join('; '));
assert.ok(auditTimetableSolution(scenario, removedManual.solution!, { allowIncomplete: true }).valid);
assert.equal(auditTimetableSolution(scenario, removedManual.solution!).complete, false);
const movedPartial = moveTimetableBlock(scenario, removedManual.solution!, manualA.solution!.entries[0].id, 2, 1);
assert.ok(movedPartial.solution, movedPartial.errors.join('; '));
assert.ok(auditTimetableSolution(scenario, movedPartial.solution!, { allowIncomplete: true }).valid);
const fixedScenario = { ...scenario, assignments: scenario.assignments.map(item => item.id === 'a' ? { ...item, fixedStartSlots: ['0:1'] } : item) };
assert.ok(!placeManualTimetableBlock(fixedScenario, createBlankManualTimetable(fixedScenario), 'a', 1, 1).solution, 'Manual placement must honor fixed starts.');
const fixedManual = placeManualTimetableBlock(fixedScenario, createBlankManualTimetable(fixedScenario), 'a', 0, 1);
assert.ok(fixedManual.solution, fixedManual.errors.join('; '));
assert.ok(!removeManualTimetableBlock(fixedScenario, fixedManual.solution!, fixedManual.solution!.entries[0].id).solution, 'Fixed lessons cannot be deleted.');
assert.equal(JSON.stringify(blank.entries), '[]', 'Manual placement must not mutate the initial draft.');

assert.equal(new Set(TIMETABLE_ADMIN_PAGES.map(item => item.id)).size, TIMETABLE_ADMIN_PAGES.length);
assert.ok(TIMETABLE_SETUP_STEPS.every(id => TIMETABLE_ADMIN_PAGES.some(item => item.id === id)));
console.log('Timetable admin: legacy grades, homeroom reassignment, safe block moves, blank grids, manual placements and navigation passed.');
