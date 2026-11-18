import type { ScheduleEntry, TeachingAssignment, TimetableClass, TimetableScenario } from './smartTimetable.js';

export const EDUCATION_LEVELS = ['Tiểu học', 'THCS', 'THPT', 'GDTX THCS', 'GDTX THPT', 'Đại học'] as const;
export type EducationLevel = typeof EDUCATION_LEVELS[number];
export type EducationKind = 'primary' | 'lower-secondary' | 'upper-secondary' | 'continuing-lower' | 'continuing-upper' | 'university' | 'primary-lower' | 'secondary' | 'general' | 'custom';
export type TeachingSession = 'morning' | 'afternoon' | 'evening';
export interface LevelTiming {
  level: EducationLevel;
  periodMinutes: number;
  breakMinutes: number;
  morningStart: string;
  afternoonStart: string;
  eveningStart: string;
  maxPeriodsPerDay: number;
}
export interface TimetableEducation {
  kind: EducationKind;
  levels: EducationLevel[];
  academicYear: string;
  term: string;
  weekCount: number;
  activeWeek: number;
  timings: LevelTiming[];
}
export const EDUCATION_PROFILES: { id: EducationKind; name: string; levels: EducationLevel[]; description: string }[] = [
  { id: 'primary', name: 'Tiểu học', levels: ['Tiểu học'], description: 'Khối 1–5, giáo viên chủ nhiệm, môn chuyên; gợi ý tiết 35 phút.' },
  { id: 'lower-secondary', name: 'THCS', levels: ['THCS'], description: 'Khối 6–9, phân công theo môn, tiết đôi, phòng bộ môn; gợi ý 45 phút.' },
  { id: 'upper-secondary', name: 'THPT', levels: ['THPT'], description: 'Khối 10–12, tổ hợp lựa chọn, nhóm học và phòng bộ môn; gợi ý 45 phút.' },
  { id: 'continuing-lower', name: 'GDTX cấp THCS', levels: ['GDTX THCS'], description: 'Lớp học viên, phân công theo ca, học tối và cuối tuần.' },
  { id: 'continuing-upper', name: 'GDTX cấp THPT', levels: ['GDTX THPT'], description: 'Lớp học viên, nhóm môn lựa chọn, ca tối; gợi ý tối đa 5 tiết/ngày.' },
  { id: 'university', name: 'Đại học', levels: ['Đại học'], description: 'Khoa, khóa/ngành, học phần, lớp học phần, tuần chẵn/lẻ; gợi ý tiết trực tiếp 50 phút.' },
  { id: 'primary-lower', name: 'Tiểu học + THCS', levels: ['Tiểu học', 'THCS'], description: 'Hai cấp dùng chung giáo viên, phòng; kiểm tra trùng theo giờ thực tế.' },
  { id: 'secondary', name: 'THCS + THPT', levels: ['THCS', 'THPT'], description: 'Khối 6–12, xem lịch riêng từng cấp và lịch chung toàn trường.' },
  { id: 'general', name: 'Tiểu học + THCS + THPT', levels: ['Tiểu học', 'THCS', 'THPT'], description: 'Ba cấp với thời lượng tiết riêng, quản lý tài nguyên dùng chung.' },
  { id: 'custom', name: 'Liên cấp tùy chọn', levels: [...EDUCATION_LEVELS], description: 'Chọn các cấp/hệ đào tạo thực tế của đơn vị.' },
];

export function defaultLevelTiming(level: EducationLevel): LevelTiming {
  return { level, periodMinutes: level === 'Tiểu học' ? 35 : level === 'Đại học' ? 50 : 45,
    breakMinutes: level === 'Đại học' ? 10 : 5, morningStart: '07:00', afternoonStart: '13:00', eveningStart: '18:00',
    maxPeriodsPerDay: level.startsWith('GDTX') ? 5 : level === 'Đại học' ? 10 : 7 };
}
export function educationLevels(s: TimetableScenario): EducationLevel[] {
  return [...new Set([...(s.education?.levels || []), ...s.classes.map(c => c.level)])].filter(x => EDUCATION_LEVELS.includes(x));
}
export function inferEducationKind(s: TimetableScenario): EducationKind {
  if (s.education) return s.education.kind;
  const levels = educationLevels(s);
  return EDUCATION_PROFILES.find(p => p.id !== 'custom' && p.levels.length === levels.length && p.levels.every(l => levels.includes(l)))?.id || 'custom';
}
export function createEducationConfiguration(kind: EducationKind, levels?: EducationLevel[]): TimetableEducation {
  const selected = [...new Set(levels || EDUCATION_PROFILES.find(p => p.id === kind)!.levels)];
  return { kind, levels: selected, academicYear: '2026–2027', term: 'Học kỳ I', weekCount: kind === 'university' ? 15 : 18, activeWeek: 1, timings: selected.map(defaultLevelTiming) };
}
/** Applying a profile never reclassifies existing classes or discards teaching assignments. */
export function applyEducationConfiguration(s: TimetableScenario, education: TimetableEducation, reset = false): TimetableScenario {
  if (!reset && [...s.classes, ...(s.grades || [])].some(c => !education.levels.includes(c.level))) throw new Error('Loại đã chọn không chứa tất cả cấp của lớp/khối hiện có. Chọn liên cấp hoặc tạo kịch bản trống.');
  const extended = education.levels.some(l => l.startsWith('GDTX') || l === 'Đại học');
  const onlyPrimary = education.levels.length === 1 && education.levels[0] === 'Tiểu học';
  const next: TimetableScenario = { ...s, education, daysPerWeek: extended ? 6 : 5, periodsPerDay: extended ? 15 : onlyPrimary ? 7 : 10,
    morningPeriods: onlyPrimary ? 4 : 5, afternoonPeriods: extended ? 5 : onlyPrimary ? 3 : 5, campusTravelMinutes: s.campusTravelMinutes ?? 15 };
  if (!reset && s.education?.kind === education.kind && JSON.stringify(s.education.levels) === JSON.stringify(education.levels)) Object.assign(next, { daysPerWeek: s.daysPerWeek, periodsPerDay: s.periodsPerDay, morningPeriods: s.morningPeriods, afternoonPeriods: s.afternoonPeriods });
  if (reset) Object.assign(next, { teachers: [], classes: [], subjects: [], rooms: [], assignments: [], grades: [], campuses: [], studentGroups: [], lessonGroups: [], examRoomPlan: undefined });
  return next;
}
export function sessionForPeriod(s: TimetableScenario, p: number): TeachingSession {
  const morning = s.morningPeriods ?? Math.min(5, s.periodsPerDay);
  return p <= morning ? 'morning' : p <= morning + (s.afternoonPeriods ?? s.periodsPerDay - morning) ? 'afternoon' : 'evening';
}
export const SESSION_LABELS: Record<TeachingSession, string> = { morning: 'Sáng', afternoon: 'Chiều', evening: 'Tối' };
export function minuteOfDay(value: string): number {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [h, m] = value.split(':').map(Number);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
}
export function clockText(minutes: number): string { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
export interface LessonInterval { start: number; end: number }
export function classPeriodInterval(s: TimetableScenario, level: EducationLevel, period: number): LessonInterval {
  if (!s.education) return { start: period, end: period + 1 };
  const timing = s.education.timings.find(t => t.level === level);
  if (!timing) return { start: NaN, end: NaN };
  const session = sessionForPeriod(s, period), morning = s.morningPeriods ?? 5;
  const offset = period - 1 - (session === 'morning' ? 0 : session === 'afternoon' ? morning : morning + (s.afternoonPeriods ?? s.periodsPerDay - morning));
  const start = minuteOfDay(timing[`${session}Start`]) + offset * (timing.periodMinutes + timing.breakMinutes);
  return { start, end: start + timing.periodMinutes };
}
export function entryInterval(s: TimetableScenario, e: Pick<ScheduleEntry, 'classId' | 'period'>): LessonInterval {
  return classPeriodInterval(s, s.classes.find(c => c.id === e.classId)?.level || s.education?.levels[0] || 'THCS', e.period);
}
export function entryClockLabel(s: TimetableScenario, e: Pick<ScheduleEntry, 'classId' | 'period'>): string {
  if (!s.education) return '';
  const { start, end } = entryInterval(s, e);
  return Number.isFinite(start) && Number.isFinite(end) ? `${clockText(start)}–${clockText(end)}` : 'Chưa khai báo giờ';
}
/** Reservation atoms are minutes for explicit profiles and ordinal periods for legacy JSON. */
export function entryTimeAtoms(s: TimetableScenario, e: Pick<ScheduleEntry, 'classId' | 'period'>): number[] {
  const t = entryInterval(s, e);
  return Number.isFinite(t.start) && Number.isFinite(t.end) && t.start >= 0 && t.end <= (s.education ? 1440 : s.periodsPerDay + 1)
    ? Array.from({ length: Math.max(0, Math.min(240, t.end - t.start)) }, (_, i) => t.start + i) : [];
}
export function classDailyLimit(s: TimetableScenario, c: TimetableClass | undefined): number | undefined {
  const levelLimit = s.education?.timings.find(t => t.level === c?.level)?.maxPeriodsPerDay;
  return Math.min(c?.maxPeriodsPerDay || Infinity, levelLimit || Infinity) === Infinity ? undefined : Math.min(c?.maxPeriodsPerDay || Infinity, levelLimit || Infinity);
}
export function teachingGap(s: TimetableScenario, a: Pick<ScheduleEntry, 'classId' | 'period'>, b: Pick<ScheduleEntry, 'classId' | 'period'>): number {
  const x = entryInterval(s, a), y = entryInterval(s, b);
  return Math.max(x.start, y.start) - Math.min(x.end, y.end);
}
export function travelMinimum(s: TimetableScenario): number { return s.education ? s.campusTravelMinutes ?? 15 : s.campusTravelPeriods ?? 1; }
export function normalBreak(s: TimetableScenario): number { return s.education ? Math.max(0, ...s.education.timings.map(t => t.breakMinutes)) : 0; }
export function assignmentActiveInWeek(a: TeachingAssignment, week: number, weekCount: number): boolean {
  return week >= (a.startWeek ?? 1) && week <= (a.endWeek ?? weekCount) && (a.weekPattern !== 'odd' || week % 2 === 1) && (a.weekPattern !== 'even' || week % 2 === 0);
}
export function scenarioForTeachingWeek(s: TimetableScenario): TimetableScenario {
  if (!s.education) return s;
  const assignments = s.assignments.filter(a => assignmentActiveInWeek(a, s.education!.activeWeek, s.education!.weekCount));
  const ids = new Set(assignments.map(a => a.id));
  return { ...s, assignments, lessonGroups: s.lessonGroups?.filter(g => g.assignmentIds.some(id => ids.has(id))) };
}
export function educationScenarioIssues(s: TimetableScenario): string[] {
  const e = s.education;
  if (!e) return s.assignments.some(a => a.startWeek !== undefined || a.endWeek !== undefined || a.weekPattern === 'odd' || a.weekPattern === 'even') ? ['Chọn Loại thời khóa biểu và khai báo học kỳ trước khi dùng khoảng tuần hoặc tuần chẵn/lẻ.'] : [];
  const errors: string[] = [];
  if (s.afternoonPeriods !== undefined && (!Number.isInteger(s.afternoonPeriods) || s.afternoonPeriods < 0 || s.afternoonPeriods + (s.morningPeriods ?? 5) > s.periodsPerDay)) errors.push('Tổng số tiết sáng và chiều vượt khung ngày.');
  if (s.campusTravelMinutes !== undefined && (!Number.isInteger(s.campusTravelMinutes) || s.campusTravelMinutes < 0 || s.campusTravelMinutes > 240)) errors.push('Thời gian chuyển cơ sở phải từ 0 đến 240 phút.');
  if (s.subjects.some(m => m.credits !== undefined && (!Number.isFinite(m.credits) || m.credits <= 0))) errors.push('Số tín chỉ phải là số dương.');
  if (!EDUCATION_PROFILES.some(p => p.id === e.kind) || !e.levels.length || new Set(e.levels).size !== e.levels.length || e.levels.some(l => !EDUCATION_LEVELS.includes(l))) errors.push('Loại thời khóa biểu/cấp đào tạo không hợp lệ.');
  if (!e.academicYear.trim() || !e.term.trim()) errors.push('Cần khai báo năm học và học kỳ.');
  if (!Number.isInteger(e.weekCount) || e.weekCount < 1 || e.weekCount > 53 || !Number.isInteger(e.activeWeek) || e.activeWeek < 1 || e.activeWeek > e.weekCount) errors.push('Tuần học phải nằm trong học kỳ (1–53 tuần).');
  if ([...s.classes, ...(s.grades || [])].some(c => !e.levels.includes(c.level))) errors.push('Có lớp/khối thuộc cấp chưa chọn trong Loại thời khóa biểu.');
  if (new Set(e.timings.map(t => t.level)).size !== e.timings.length || e.timings.length !== e.levels.length) errors.push('Mỗi cấp cần đúng một khung giờ.');
  for (const level of e.levels) {
    const t = e.timings.find(x => x.level === level);
    if (!t || !Number.isInteger(t.periodMinutes) || t.periodMinutes < 15 || t.periodMinutes > 120 || !Number.isInteger(t.breakMinutes) || t.breakMinutes < 0 || t.breakMinutes > 60 || !Number.isInteger(t.maxPeriodsPerDay) || t.maxPeriodsPerDay < 1 || t.maxPeriodsPerDay > 20) { errors.push(`Khung giờ ${level} không hợp lệ.`); continue; }
    let previousEnd = -1;
    for (let p = 1; p <= s.periodsPerDay; p++) {
      const interval = classPeriodInterval(s, level, p);
      if (!Number.isFinite(interval.start) || interval.start < previousEnd || interval.end > 1440) { errors.push(`Giờ ${level} chồng lấn giữa các buổi hoặc vượt ngày.`); break; }
      previousEnd = interval.end;
    }
  }
  for (const a of s.assignments) {
    if (!Number.isInteger(a.startWeek ?? 1) || !Number.isInteger(a.endWeek ?? e.weekCount) || (a.startWeek ?? 1) < 1 || (a.endWeek ?? e.weekCount) > e.weekCount || (a.startWeek ?? 1) > (a.endWeek ?? e.weekCount) || !['all', 'odd', 'even'].includes(a.weekPattern ?? 'all')) errors.push(`Khoảng tuần không hợp lệ: ${a.id}.`);
    const members = s.classes.filter(c => [a.classId, ...(a.additionalClassIds || [])].includes(c.id));
    if (members.some(c => c.level !== members[0]?.level && Array.from({ length: s.periodsPerDay }, (_, i) => i + 1).every(p => {
      const x = classPeriodInterval(s, c.level, p), y = classPeriodInterval(s, members[0].level, p);
      return x.start !== y.start || x.end !== y.end;
    }))) errors.push(`Lớp ghép ${a.id} khác khung giờ; cần đồng bộ thời lượng và giờ bắt đầu trước khi ghép.`);
  }
  return [...new Set(errors)];
}
