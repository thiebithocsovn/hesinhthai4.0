import { sessionForPeriod, type TeachingSession } from './timetableEducation';
import { activeTimetableDays, type ScheduleEntry, type TimetableClass, type TimetableScenario, type TimetableSolution } from './smartTimetable';
import { assignmentClassIds, assignmentStudentGroupIds, assignmentTeacherIds } from './smartTimetableResources';

export type SchoolBoardSession = TeachingSession | 'all';
export interface SchoolBoardFilters {
  day: number | 'all';
  level: string;
  gradeId: string;
  session: SchoolBoardSession;
  query: string;
}
export interface SchoolBoardRow {
  dayIndex: number;
  dayName: string;
  period: number;
  session: TeachingSession;
  cells: Map<string, ScheduleEntry[]>;
}
export interface SchoolBoardData {
  classes: TimetableClass[];
  rows: SchoolBoardRow[];
  lessonCells: number;
}

export function buildSchoolBoard(s: TimetableScenario, solution: TimetableSolution, filters: SchoolBoardFilters): SchoolBoardData {
  const days = activeTimetableDays(s);
  const query = filters.query.trim().toLocaleLowerCase('vi');
  const classes = s.classes.filter(c =>
    (filters.level === 'all' || c.level === filters.level) &&
    (filters.gradeId === 'all' || c.gradeId === filters.gradeId) &&
    (!query || c.name.toLocaleLowerCase('vi').includes(query)));
  const classIds = new Set(classes.map(c => c.id));
  const dayIndexes = filters.day === 'all' ? days.map((_, index) => index) :
    days[filters.day] !== undefined ? [filters.day] : [];
  const wantedDays = new Set(dayIndexes);
  const index = new Map<string, ScheduleEntry[]>();

  for (const entry of solution.entries) {
    if (!wantedDays.has(entry.dayIndex) || filters.session !== 'all' && sessionForPeriod(s, entry.period) !== filters.session) continue;
    for (const classId of assignmentClassIds(entry)) {
      if (!classIds.has(classId)) continue;
      const key = `${entry.dayIndex}:${entry.period}:${classId}`;
      const entries = index.get(key) || [];
      entries.push(entry);
      index.set(key, entries);
    }
  }

  const rows: SchoolBoardRow[] = dayIndexes.flatMap(dayIndex =>
    Array.from({ length: s.periodsPerDay }, (_, i) => i + 1)
      .filter(period => filters.session === 'all' || sessionForPeriod(s, period) === filters.session)
      .map(period => ({
        dayIndex,
        dayName: days[dayIndex],
        period,
        session: sessionForPeriod(s, period),
        cells: new Map(classes.map(c => [c.id, index.get(`${dayIndex}:${period}:${c.id}`) || []])),
      })));
  return { classes, rows, lessonCells: [...index.values()].reduce((sum, entries) => sum + entries.length, 0) };
}

function name(items: { id: string; name: string }[] | undefined, id: string): string {
  return items?.find(item => item.id === id)?.name || id;
}
export function schoolBoardEntryText(s: TimetableScenario, entry: ScheduleEntry): string {
  return [
    name(s.subjects, entry.subjectId),
    assignmentTeacherIds(entry).map(id => name(s.teachers, id)).join(' + '),
    assignmentStudentGroupIds(entry).map(id => name(s.studentGroups, id)).join(' + '),
    entry.roomId ? name(s.rooms, entry.roomId) : '',
  ].filter(Boolean).join(' · ');
}
export function schoolBoardMatrix(s: TimetableScenario, board: SchoolBoardData): (string | number)[][] {
  return [
    ['Thứ', 'Buổi', 'Tiết', ...board.classes.map(c => c.name)],
    ...board.rows.map(row => [
      row.dayName, row.session === 'morning' ? 'Sáng' : row.session === 'afternoon' ? 'Chiều' : 'Tối', row.period,
      ...board.classes.map(c => (row.cells.get(c.id) || []).map(entry => schoolBoardEntryText(s, entry)).join('\n')),
    ]),
  ];
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function schoolBoardPrintHtml(s: TimetableScenario, board: SchoolBoardData, teachingWeek?: number): string {
  const [head, ...rows] = schoolBoardMatrix(s, board);
  const th = (value: string | number) => `<th>${escapeHtml(value)}</th>`;
  const td = (value: string | number) => `<td>${escapeHtml(value).replace(/\n/g, '<br>')}</td>`;
  const label = teachingWeek ?? s.education?.activeWeek;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thời khóa biểu toàn trường</title>
<style>@page{size:A3 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#152238;font-size:10px}
h1,h2,p{text-align:center}h1{font-size:17px;margin:5px}h2{font-size:14px;margin:5px}p{margin:7px}
table{border-collapse:collapse;width:100%;table-layout:auto}th,td{border:1px solid #94a3b8;padding:4px;text-align:center;vertical-align:top;overflow-wrap:anywhere;white-space:normal}th{background:#eff6ff}
tbody tr:nth-child(even){background:#f8fafc}tbody tr{break-inside:avoid}button{margin:10px 0;padding:8px}
@media print{button{display:none}}</style></head><body><h1>${escapeHtml(s.name)}</h1>
<h2>THỜI KHÓA BIỂU TOÀN TRƯỜNG</h2><p>${escapeHtml(s.education?.academicYear || '')} ${escapeHtml(s.education?.term || '')} ${label ? '· Tuần ' + escapeHtml(label) : ''}</p>
<table><thead><tr>${head.map(th).join('')}</tr></thead><tbody>${rows.map(row => '<tr>' + row.map(td).join('') + '</tr>').join('')}</tbody></table>
<p>Ngày in: ${escapeHtml(new Date().toLocaleString('vi-VN'))}</p><button onclick="window.print()">In / Lưu PDF</button></body></html>`;
}
