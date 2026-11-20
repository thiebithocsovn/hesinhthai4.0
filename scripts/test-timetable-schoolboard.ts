import assert from 'node:assert/strict';
import { buildSchoolBoard, schoolBoardMatrix, schoolBoardPrintHtml } from '../src/lib/timetableSchoolBoard';
import type { TimetableScenario, TimetableSolution } from '../src/lib/smartTimetable';

const scenario: TimetableScenario = {
  name: '<Trường thử & kiểm tra>',
  daysPerWeek: 5, periodsPerDay: 10, morningPeriods: 5, afternoonPeriods: 5,
  teachers: [{ id: 't', name: 'GV Toán', level: 'THCS' }],
  classes: [
    { id: 'c1', name: '6A1', level: 'THCS', gradeId: 'g6' },
    { id: 'c2', name: '6A2', level: 'THCS', gradeId: 'g6' },
    { id: 'c3', name: '5A1', level: 'Tiểu học', gradeId: 'g5' },
  ],
  grades: [{ id: 'g6', name: 'Khối 6', level: 'THCS' }, { id: 'g5', name: 'Khối 5', level: 'Tiểu học' }],
  subjects: [{ id: 'm', name: 'Toán <nâng cao>' }], rooms: [],
  assignments: [],
};
const solution = {
  entries: [
    { id: 'a', assignmentId: 'a', classId: 'c1', additionalClassIds: ['c2'], subjectId: 'm', teacherId: 't', dayIndex: 0, period: 1 },
    { id: 'b', assignmentId: 'b', classId: 'c1', subjectId: 'm', teacherId: 't', dayIndex: 0, period: 6 },
    { id: 'c', assignmentId: 'c', classId: 'c3', subjectId: 'm', teacherId: 't', dayIndex: 1, period: 1 },
  ],
  score: 0, generatedAt: '2026-11-20T00:00:00Z',
  diagnostics: { hardConflicts: [], warnings: [], unscheduled: [], teacherGaps: 0, preflight: [], quality: { teacherGaps: 0, classGaps: 0, lateCorePeriods: 0, dailyImbalance: 0 } },
} satisfies TimetableSolution;

const filters = { day: 'all' as const, level: 'all', gradeId: 'all', session: 'all' as const, query: '' };
const all = buildSchoolBoard(scenario, solution, filters);
assert.equal(all.classes.length, 3);
assert.equal(all.rows.length, 50, 'Toàn tuần có 5 ngày, mỗi ngày 10 tiết.');
assert.equal(all.lessonCells, 4, 'Tiết ghép lớp phải hiện ở cả hai lớp.');
assert.equal(all.rows[0].cells.get('c2')?.[0].id, 'a');
assert.equal(schoolBoardMatrix(scenario, all)[0].length, 6);

const day = buildSchoolBoard(scenario, solution, { ...filters, day: 0 });
assert.equal(day.rows.length, 10);
assert.equal(day.lessonCells, 3);

const morning = buildSchoolBoard(scenario, solution, { ...filters, session: 'morning', day: 0 });
assert.equal(morning.rows.length, 5);
assert.equal(morning.lessonCells, 2);
assert.ok(morning.rows.every(row => row.period <= 5));

const afternoon = buildSchoolBoard(scenario, solution, { ...filters, session: 'afternoon', day: 0 });
assert.equal(afternoon.rows.length, 5);
assert.equal(afternoon.lessonCells, 1);

const classFilter = buildSchoolBoard(scenario, solution, {
  ...filters, level: 'THCS', gradeId: 'g6', query: '6a2', day: 0,
});
assert.deepEqual(classFilter.classes.map(c => c.id), ['c2']);
assert.equal(classFilter.lessonCells, 1);
assert.equal(buildSchoolBoard(scenario, solution, { ...filters, query: 'không có' }).classes.length, 0);

const html = schoolBoardPrintHtml(scenario, all, 12);
assert.match(html, /THỜI KHÓA BIỂU TOÀN TRƯỜNG/);
assert.match(html, /Tuần 12/);
assert.match(html, /&lt;Trường thử &amp; kiểm tra&gt;/);
assert.match(html, /Toán &lt;nâng cao&gt;/);
assert.ok(!html.includes('<nâng cao>'), 'HTML xuất phải escape tên môn.');
console.log('Timetable school board: full-week, day, session, level, grade, search, merged class, XLSX matrix, print safety passed.');
