import { entryClockLabel } from './timetableEducation';
import { activeTimetableDays, type ScheduleEntry, type TimetableScenario, type TimetableSolution } from './smartTimetable';
import { assignmentClassIds, assignmentStudentGroupIds, assignmentTeacherIds } from './smartTimetableResources';
export type TimetableResourceView = 'class' | 'teacher' | 'room';
export function entryBelongsToResource(e: ScheduleEntry, mode: TimetableResourceView, id: string): boolean {
  return mode === 'class' ? assignmentClassIds(e).includes(id) : mode === 'teacher' ? assignmentTeacherIds(e).includes(id) : e.roomId === id;
}
export function timetableEntryLines(s: TimetableScenario, e: ScheduleEntry, mode: TimetableResourceView): string[] {
  const name = (items: { id: string; name: string }[], id: string) => items.find(x => x.id === id)?.name || id;
  return [name(s.subjects, e.subjectId), entryClockLabel(s, e), s.assignments.find(a => a.id === e.assignmentId)?.courseSectionCode || '', assignmentStudentGroupIds(e).map(id => name(s.studentGroups || [], id)).join(' + '), mode === 'class' ? '' : assignmentClassIds(e).map(id => name(s.classes, id)).join(' + '), mode === 'teacher' ? '' : assignmentTeacherIds(e).map(id => name(s.teachers, id)).join(' + '), e.roomId ? name(s.rooms, e.roomId) : '', e.campusId ? name(s.campuses || [], e.campusId) : ''].filter(Boolean);
}
export function timetableViewRows(s: TimetableScenario, solution: TimetableSolution, mode: TimetableResourceView, id: string): (string | number)[][] {
  const days = activeTimetableDays(s);
  return [['Tiết', ...days], ...Array.from({ length: s.periodsPerDay }, (_, i) => [i + 1, ...days.map((_, day) => solution.entries.filter(e => e.dayIndex === day && e.period === i + 1 && entryBelongsToResource(e, mode, id)).map(e => timetableEntryLines(s, e, mode).join(' · ')).join('\n\n'))])];
}
