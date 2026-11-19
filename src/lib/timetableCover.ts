import { activeTimetableDays, timetableSlotKey, type ScheduleEntry, type TimetableScenario, type TimetableSolution } from './smartTimetable.js';
import { auditTimetableSolution } from './smartTimetableAudit.js';
import { assignmentCampus, assignmentTeacherIds } from './smartTimetableResources.js';
import { entryInterval, entryTimeAtoms, normalBreak, teachingGap, travelMinimum } from './timetableEducation.js';

export interface TimetableCover {
  date: string;
  entryIds: string[];
  substituteTeacherId: string;
  reason: string;
  createdAt: string;
}

const formatDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
const key = (entry: ScheduleEntry) => entry.blockId ? entry.assignmentId + ':' + entry.blockId : entry.id;

export function coverTargetEntries(solution: TimetableSolution, selectedEntryId: string): ScheduleEntry[] {
  const selected = solution.entries.find(e => e.id === selectedEntryId);
  if (!selected) return [];
  return solution.entries.filter(e => key(e) === key(selected)).sort((a, b) => a.period - b.period);
}

/** Temporary substitutions never mutate or silently republish the approved master timetable. */
export function validateTimetableCovers(s: TimetableScenario, solution: TimetableSolution | null, covers: TimetableCover[]): string[] {
  const audit = auditTimetableSolution(s, solution);
  if (!solution || !audit.valid || !audit.complete) return ['Thời khóa biểu gốc chưa đủ tiết hoặc chưa vượt qua kiểm tra độc lập.'];
  const issues: string[] = [];
  const teacherMap = new Map(s.teachers.map(t => [t.id, t]));
  const entries = new Map(solution.entries.map(e => [e.id, e]));
  const grouped = new Map<string, TimetableCover[]>();
  for (const cover of covers) {
    if (!formatDate(cover.date)) { issues.push('Ngày dạy thay không hợp lệ.'); continue; }
    grouped.set(cover.date, [...(grouped.get(cover.date) || []), cover]);
    const substitute = teacherMap.get(cover.substituteTeacherId);
    if (!substitute) issues.push('Giáo viên dạy thay không có trong danh mục.');
    if (!cover.entryIds.length || new Set(cover.entryIds).size !== cover.entryIds.length) issues.push('Danh sách tiết dạy thay bị trống hoặc trùng.');
    const first = entries.get(cover.entryIds[0]);
    if (!first) { issues.push('Tiết dạy thay đã bị xóa hoặc thay đổi.'); continue; }
    const target = coverTargetEntries(solution, first.id);
    if (target.length !== cover.entryIds.length || target.some(e => !cover.entryIds.includes(e.id))) issues.push('Dạy thay phải áp dụng cho toàn bộ block tiết liên tiếp.');
    const weekday = (new Date(cover.date + 'T00:00:00Z').getUTCDay() + 6) % 7;
    if (first.dayIndex !== weekday || first.dayIndex >= activeTimetableDays(s).length) issues.push('Ngày dạy thay không trùng thứ của tiết được chọn.');
    if (target.some(e => e.dayIndex !== first.dayIndex || e.assignmentId !== first.assignmentId)) issues.push('Block không cùng ngày hoặc phân công.');
    if (target.some(e => e.parallelEventId || (e.additionalTeacherIds || []).length)) issues.push('Tiết học song song/đồng giảng cần xử lý riêng; chưa hỗ trợ dạy thay tự động.');
    if (substitute && target.some(e => s.classes.find(c => c.id === e.classId)?.level !== substitute.level && substitute.level !== 'Liên cấp')) {
      issues.push('Giáo viên dạy thay chưa được khai báo đúng cấp học; hãy chỉnh cấp hoặc chọn giáo viên liên cấp.');
    }
    if (substitute && target.some(e => e.teacherId === substitute.id)) issues.push('Giáo viên được chọn đã là giáo viên dạy tiết này.');
  }
  for (const [date, dailyCovers] of grouped) {
    const dayIndex = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const overrides = new Map<string, string>();
    for (const cover of dailyCovers) {
      for (const id of cover.entryIds) {
        if (overrides.has(id)) issues.push('Một tiết chỉ được có một giáo viên dạy thay trong cùng ngày.');
        overrides.set(id, cover.substituteTeacherId);
      }
    }
    const dayEntries = solution.entries.filter(e => e.dayIndex === dayIndex);
    const occupied = new Map<string, string>();
    const teacherDay = new Map<string, ScheduleEntry[]>();
    for (const entry of dayEntries) {
      const teachers = [overrides.get(entry.id) || entry.teacherId, ...(entry.additionalTeacherIds || [])];
      for (const teacherId of teachers) {
        const teacher = teacherMap.get(teacherId);
        if (!teacher) { issues.push('Lịch tham chiếu giáo viên không còn tồn tại.'); continue; }
        const slot = timetableSlotKey(entry.dayIndex, entry.period);
        if (teacher.unavailableSlots?.includes(slot)) issues.push(teacher.name + ' đang bận vào tiết ' + entry.period + ' ngày ' + date + '.');
        for (const minute of entryTimeAtoms(s, entry)) {
          const k = teacherId + ':' + minute;
          if (occupied.has(k) && occupied.get(k) !== entry.id) issues.push('Trùng lịch giáo viên ' + teacher.name + ' vào ' + date + ' tiết ' + entry.period + '.');
          occupied.set(k, entry.id);
        }
        teacherDay.set(teacherId, [...(teacherDay.get(teacherId) || []), entry]);
      }
    }
    for (const [teacherId, lessons] of teacherDay) {
      const teacher = teacherMap.get(teacherId)!;
      if (teacher.maxPeriodsPerDay && lessons.length > teacher.maxPeriodsPerDay) issues.push(teacher.name + ' vượt số tiết tối đa/ngày (' + teacher.maxPeriodsPerDay + ').');
      const sorted = [...lessons].sort((a, b) => entryInterval(s, a).start - entryInterval(s, b).start);
      let consecutive = 0;
      let previous: ScheduleEntry | null = null;
      for (const lesson of sorted) {
        if (previous && entryInterval(s, lesson).start - entryInterval(s, previous).end <= normalBreak(s)) consecutive++;
        else consecutive = 1;
        if (teacher.maxConsecutivePeriods && consecutive > teacher.maxConsecutivePeriods) issues.push(teacher.name + ' vượt số tiết liên tục.');
        if (previous) {
          const campusA = assignmentCampus(s, s.assignments.find(a => a.id === previous!.assignmentId) || previous);
          const campusB = assignmentCampus(s, s.assignments.find(a => a.id === lesson.assignmentId) || lesson);
          if (campusA && campusB && campusA !== campusB && teachingGap(s, previous, lesson) < travelMinimum(s)) issues.push(teacher.name + ' không đủ thời gian di chuyển giữa hai cơ sở.');
        }
        previous = lesson;
      }
      if (teacher.maxTeachingDays) {
        const normalDays = new Set(solution.entries.filter(e => e.dayIndex !== dayIndex && assignmentTeacherIds(e).includes(teacherId)).map(e => e.dayIndex));
        if (lessons.length) normalDays.add(dayIndex);
        if (normalDays.size > teacher.maxTeachingDays) issues.push(teacher.name + ' vượt số ngày dạy tối đa trong tuần.');
      }
    }
  }
  return [...new Set(issues)];
}

export function proposeTimetableCover(s: TimetableScenario, solution: TimetableSolution | null, existing: TimetableCover[], proposal: TimetableCover): { covers: TimetableCover[]; errors: string[] } {
  if (!solution) return { covers: existing, errors: ['Chưa có thời khóa biểu gốc.'] };
  const overlapping = existing.filter(c => c.date === proposal.date && c.entryIds.some(id => proposal.entryIds.includes(id)));
  const next = [...existing.filter(c => !overlapping.includes(c)), proposal];
  const errors = validateTimetableCovers(s, solution, next);
  return { covers: errors.length ? existing : next, errors };
}

export function timetableCoverSignature(s: TimetableScenario, solution: TimetableSolution | null): string {
  if (!solution) return 'none';
  // Compact deterministic non-cryptographic key for device-local scenarios only.
  const raw = JSON.stringify([s.name, s.education?.activeWeek, s.teachers, s.classes, s.assignments, solution.entries]);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
