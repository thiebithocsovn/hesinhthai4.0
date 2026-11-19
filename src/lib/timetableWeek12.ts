import { assignmentClassIds, assignmentTeacherIds } from './smartTimetableResources.js';
import type { ScheduleEntry, TimetableScenario } from './smartTimetable.js';

/** All week-12 constraints are opt-in and leave earlier/later weeks unchanged. */
export function teacherNameKey(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function matchingTeacher(s: TimetableScenario, shortName: string) {
  const desired = teacherNameKey(shortName).replace(/^(co|thay|gv|giao vien)\s+/, '');
  const candidates = s.teachers.filter(t => {
    const value = teacherNameKey(t.name).replace(/^(co|thay|gv|giao vien)\s+/, '');
    return value === desired || value.endsWith(' ' + desired);
  });
  return candidates.length === 1 ? candidates[0] : null;
}
export function week12TeacherNameIssues(s: TimetableScenario): string[] {
  if (!s.week12RulesEnabled || s.education?.activeWeek !== 12) return [];
  return ['Huế', 'Cát', 'Hương', 'Tuyết'].flatMap(name => matchingTeacher(s, name) ? [] : [
    'Tuần 12: chưa xác định duy nhất giáo viên ' + name + '. Kiểm tra danh mục giáo viên (tránh trùng tên).',
  ]);
}
function captureMondayAfternoon(s: TimetableScenario, solution: { teachingWeek?: number; entries: ScheduleEntry[] }): Pick<TimetableScenario, 'week12MondayAfternoonSnapshot' | 'week12FrozenStarts'> {
  const morning = s.morningPeriods ?? 5;
  const pm = solution.entries.filter(e => e.dayIndex === 0 && e.period > morning);
  const snapshot = pm.map(e => ({ assignmentId: e.assignmentId, period: e.period }));
  const fixedByAssignment = new Map<string, Map<string, number>>();
  for (const e of pm) {
    const grouped = fixedByAssignment.get(e.assignmentId) || new Map<string, number>();
    const blockKey = e.blockId || e.id;
    grouped.set(blockKey, Math.min(e.period, grouped.get(blockKey) ?? Infinity));
    fixedByAssignment.set(e.assignmentId, grouped);
  }
  const fixed: Record<string, string[]> = {};
  for (const [assignmentId, grouped] of fixedByAssignment)
    fixed[assignmentId] = [...new Set([...grouped.values()].map(period => '0:' + period))];
  return { week12MondayAfternoonSnapshot: snapshot, week12FrozenStarts: fixed };
}

function isPhysicalEducation(s: TimetableScenario, subjectId: string): boolean {
  const subject = s.subjects.find(item => item.id === subjectId);
  const value = teacherNameKey((subject?.name || '') + ' ' + (subject?.code || ''));
  return /(?:^| )(?:gdtc|the duc|giao duc the chat)(?: |$)/.test(value);
}
function isMath(s: TimetableScenario, subjectId: string): boolean {
  const value = teacherNameKey(s.subjects.find(item => item.id === subjectId)?.name || '');
  return value === 'toan' || value === 'mon toan';
}
const containsTeacher = (e: ScheduleEntry, teacherId: string | undefined) => Boolean(teacherId && assignmentTeacherIds(e).includes(teacherId));
const sameClass = (a: ScheduleEntry, b: ScheduleEntry) => assignmentClassIds(a).some(id => assignmentClassIds(b).includes(id));

export function week12PlacementProblems(s: TimetableScenario, existing: ScheduleEntry[], proposed: ScheduleEntry[]): string[] {
  if (!s.week12RulesEnabled || s.education?.activeWeek !== 12 || !proposed.length) return [];
  const morning = s.morningPeriods ?? Math.min(5, s.periodsPerDay);
  const afternoonFirst = morning + 1;
  const huong = matchingTeacher(s, 'Hương')?.id;
  const tuyet = matchingTeacher(s, 'Tuyết')?.id;
  const hue = matchingTeacher(s, 'Huế')?.id;
  const cat = matchingTeacher(s, 'Cát')?.id;
  const all = [...existing, ...proposed];
  const problems = new Set<string>();
  const frozen = s.week12MondayAfternoonSnapshot;
  const fixed = frozen ? new Set(frozen.map(e => e.assignmentId + ':' + e.period)) : null;
  for (const e of proposed) {
    if ([1, 2, 3].includes(e.dayIndex) && e.period > morning)
      problems.add('Tuần 12: chiều thứ Ba, Tư, Năm phải trống.');
    if (isPhysicalEducation(s, e.subjectId) && (e.period > 3 || e.period > morning))
      problems.add('Tuần 12: GDTC/Thể dục chỉ được dạy buổi sáng từ tiết 1 đến tiết 3.');
    if (containsTeacher(e, huong) && !(e.dayIndex === 0 || (e.dayIndex === 1 && e.period <= morning)))
      problems.add('Tuần 12: cô Hương chỉ dạy cả ngày thứ Hai và sáng thứ Ba.');
    if (containsTeacher(e, tuyet) && e.period !== 1)
      problems.add('Tuần 12: cô Tuyết chỉ được dạy tiết 1 buổi sáng.');
    if (fixed && e.dayIndex === 0 && e.period > morning && !fixed.has(e.assignmentId + ':' + e.period))
      problems.add('Tuần 12: chiều thứ Hai đã cố định; không được thêm hoặc chuyển tiết vào các ô khác.');
  }
  for (const e of proposed) {
    for (const other of all) {
      if (other === e || e.dayIndex !== other.dayIndex) continue;
      if ((e.period === 1 || e.period === 5) && e.period === other.period &&
        ((containsTeacher(e, hue) && containsTeacher(other, cat)) ||
          (containsTeacher(e, cat) && containsTeacher(other, hue)))) {
        problems.add('Tuần 12: cô Huế và cô Cát không được cùng dạy tiết 1 hoặc tiết 5 trong một ngày.');
      }
      if (e.period <= morning && other.period <= morning && e.subjectId === other.subjectId &&
        Math.abs(e.period - other.period) === 1 && sameClass(e, other) &&
        !(isMath(s, e.subjectId) && containsTeacher(e, huong) && containsTeacher(other, huong))) {
        problems.add('Tuần 12: không xếp hai tiết cùng môn liên tục trong buổi sáng, trừ Toán cô Hương.');
      }
      if ((e.period === 5 && other.period === afternoonFirst || e.period === afternoonFirst && other.period === 5) &&
        assignmentTeacherIds(e).some(id => assignmentTeacherIds(other).includes(id))) {
        problems.add('Tuần 12: giáo viên dạy tiết 5 buổi sáng không được dạy tiết 1 buổi chiều cùng ngày.');
      }
    }
  }
  return [...problems];
}
function softScore(s: TimetableScenario, entries: ScheduleEntry[]): number {
  const morning = s.morningPeriods ?? Math.min(5, s.periodsPerDay);
  let score = 0;
  for (const teacher of s.teachers) for (let day = 0; day < (s.daysPerWeek || 5); day++) {
    const lessons = entries.filter(e => e.dayIndex === day && containsTeacher(e, teacher.id));
    // A teacher who only teaches PE is exempt from the consecutive-period preference.
    const peOnly = lessons.length > 0 && lessons.every(e => isPhysicalEducation(s, e.subjectId));
    for (const group of [lessons.filter(e => e.period <= morning), lessons.filter(e => e.period > morning)]) {
      const periods = [...new Set(group.map(e => e.period))].sort((a,b) => a-b);
      let streak = 0, previous = -2;
      for (const p of periods) {
        streak = p === previous + 1 ? streak + 1 : 1;
        if (streak >= 4 && !peOnly) score += 18;
        previous = p;
      }
    }
    if (lessons.some(e => e.period === 1) && lessons.some(e => e.period === 5)) score += 20;
  }
  return score;
}
export function week12SoftPenalty(s: TimetableScenario, existing: ScheduleEntry[], proposed: ScheduleEntry[]): number {
  if (!s.week12RulesEnabled || s.education?.activeWeek !== 12) return 0;
  return Math.max(0, softScore(s, [...existing, ...proposed]) - softScore(s, existing));
}
export function week12SoftWarnings(s: TimetableScenario, entries: ScheduleEntry[]): string[] {
  if (!s.week12RulesEnabled || s.education?.activeWeek !== 12) return [];
  const score = softScore(s, entries);
  return score ? ['Tuần 12 còn ' + score + ' điểm phạt ưu tiên mềm (4 tiết liên tục hoặc dạy cả tiết 1 và 5).'] : [];
}
export function enableWeek12Rules(s: TimetableScenario, solution: { teachingWeek?: number; entries: ScheduleEntry[] } | null): {
  next?: TimetableScenario; details: string[]; errors: string[];
} {
  if (s.education?.activeWeek !== 12) return { errors: ['Hãy chọn tuần 12 trước khi áp dụng bộ ràng buộc.'], details: [] };
  if (!s.assignments.length) return { errors: ['Tuần 12 đang thiếu phân công. Hãy nhập bảng phân công giảng dạy trước.'], details: [] };
  const nameIssues = week12TeacherNameIssues({ ...s, week12RulesEnabled: true });
  if (nameIssues.length) return { errors: nameIssues, details: [] };
  const hasSnapshot = Array.isArray(s.week12MondayAfternoonSnapshot) && Boolean(s.week12FrozenStarts);
  if (!hasSnapshot && (!solution || (solution.teachingWeek !== undefined && solution.teachingWeek !== 12))) return {
    errors: ['Chưa có phương án tuần 12 để cố định chiều thứ Hai. Hãy nhập/mở bản TKB tuần 12 trước khi áp dụng.'], details: [],
  };
  const frozen = hasSnapshot ? {
    week12MondayAfternoonSnapshot: s.week12MondayAfternoonSnapshot!,
    week12FrozenStarts: s.week12FrozenStarts!,
  } : captureMondayAfternoon(s, solution!);
  const snapshot = frozen.week12MondayAfternoonSnapshot || [];
  const fixed = frozen.week12FrozenStarts || {};
  return {
    next: {
      ...s, week12RulesEnabled: true,
      week12MondayAfternoonSnapshot: snapshot,
      week12FrozenStarts: fixed,
    },
    errors: [],
    details: [
      'Cố định ' + snapshot.length + ' tiết chiều thứ Hai theo phương án đang mở; không dời sang ô khác.',
      'Cô Huế/Cát không trùng tiết 1 hoặc tiết 5; Hương chỉ thứ Hai và sáng thứ Ba; Tuyết chỉ tiết 1.',
      'GDTC chỉ sáng tiết 1–3; cấm 2 tiết cùng môn liền nhau buổi sáng (trừ Toán cô Hương).',
      'Cấm sáng tiết 5 tiếp chiều tiết 1 cùng ngày; để trống chiều thứ Ba, Tư và Năm.',
      'Ưu tiên mềm: tránh 4 tiết liên tục (trừ giáo viên GDTC) và tránh cả tiết 1 lẫn tiết 5.',
    ],
  };
}
