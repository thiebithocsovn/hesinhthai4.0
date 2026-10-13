import {
  normalizeTimetableScenario,
  timetableSlotKey,
  type SchoolLevel,
  type SessionPreference,
  type TeachingAssignment,
  type TimetableClass,
  type TimetableRoom,
  type TimetableScenario,
  type TimetableSubject,
  type TimetableTeacher,
} from './smartTimetable';

export type TimetableImportRow = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown): boolean {
  const normalized = text(value).toLowerCase();
  return ['1', 'true', 'x', 'có', 'co', 'yes', 'y', 'đúng', 'dung'].includes(normalized);
}

function normalizeLookupKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findColumn(row: TimetableImportRow, names: string[]): unknown {
  const entries = Object.entries(row);
  const accepted = new Set(names.map(normalizeLookupKey));
  const found = entries.find(([key]) => accepted.has(normalizeLookupKey(key)));
  return found?.[1];
}

export function timetableEntityId(prefix: string, name: string): string {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return `${prefix}-${normalized || Math.random().toString(36).slice(2, 8)}`;
}

function parseLevel(value: unknown, className: string): Exclude<SchoolLevel, 'Liên cấp'> {
  const normalized = normalizeLookupKey(text(value));
  if (normalized.includes('thcs') || normalized.includes('trung hoc co so')) return 'THCS';
  if (normalized.includes('tieu hoc')) return 'Tiểu học';
  const grade = Number(className.match(/\d+/)?.[0] || 0);
  return grade >= 6 ? 'THCS' : 'Tiểu học';
}

function parseTeacherLevel(value: unknown, fallback: Exclude<SchoolLevel, 'Liên cấp'>): SchoolLevel {
  const normalized = normalizeLookupKey(text(value));
  if (normalized.includes('lien cap')) return 'Liên cấp';
  if (normalized.includes('thcs') || normalized.includes('trung hoc co so')) return 'THCS';
  if (normalized.includes('tieu hoc')) return 'Tiểu học';
  return fallback;
}

function parseSession(value: unknown): SessionPreference {
  const normalized = normalizeLookupKey(text(value));
  if (normalized.includes('sang') || normalized === 'am') return 'morning';
  if (normalized.includes('chieu') || normalized === 'pm') return 'afternoon';
  return 'any';
}

function parseDayIndex(raw: string): number | null {
  const normalized = normalizeLookupKey(raw).replace(/\s+/g, '');
  const direct: Record<string, number> = {
    't2': 0, 'thu2': 0, 'thuhai': 0,
    't3': 1, 'thu3': 1, 'thuba': 1,
    't4': 2, 'thu4': 2, 'thutu': 2,
    't5': 3, 'thu5': 3, 'thunam': 3,
    't6': 4, 'thu6': 4, 'thusau': 4,
    't7': 5, 'thu7': 5, 'thubay': 5,
  };
  return direct[normalized] ?? null;
}

export function parseImportedSlots(value: unknown): string[] {
  const raw = text(value);
  if (!raw) return [];
  const slots: string[] = [];
  for (const part of raw.split(/[;,|]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/^\d+:\d+$/.test(trimmed)) {
      const [day, period] = trimmed.split(':').map(Number);
      if (day >= 0 && day <= 5 && period >= 1 && period <= 12) slots.push(timetableSlotKey(day, period));
      continue;
    }
    const match = trimmed.match(/(.+?)[\s\-_]*(?:ti[eế]t\s*)?(\d+)$/i);
    if (!match) continue;
    const dayIndex = parseDayIndex(match[1]);
    const period = Number(match[2]);
    if (dayIndex !== null && period >= 1 && period <= 12) slots.push(timetableSlotKey(dayIndex, period));
  }
  return [...new Set(slots)];
}

function upsertByName<T extends { id: string; name: string }>(items: T[], name: string, factory: () => T): T {
  const key = normalizeLookupKey(name);
  const existing = items.find(item => normalizeLookupKey(item.name) === key);
  if (existing) return existing;
  const created = factory();
  items.push(created);
  return created;
}

export function scenarioFromAssignmentRows(rows: TimetableImportRow[], base?: TimetableScenario): TimetableScenario {
  const seed = base ? normalizeTimetableScenario(base) : normalizeTimetableScenario({
    name: 'Thời khóa biểu nhập từ Excel',
    daysPerWeek: 5,
    periodsPerDay: 7,
    morningPeriods: 5,
    teachers: [], classes: [], subjects: [], rooms: [], assignments: [],
  });
  const teachers: TimetableTeacher[] = [];
  const classes: TimetableClass[] = [];
  const subjects: TimetableSubject[] = [];
  const rooms: TimetableRoom[] = [];
  const assignments: TeachingAssignment[] = [];

  rows.forEach((row, index) => {
    const className = text(findColumn(row, ['Lớp', 'Lop', 'Class']));
    const subjectName = text(findColumn(row, ['Môn', 'Mon', 'Môn học', 'Subject']));
    const teacherName = text(findColumn(row, ['Giáo viên', 'Giao vien', 'GV', 'Teacher']));
    if (!className || !subjectName || !teacherName) return;

    const classLevel = parseLevel(findColumn(row, ['Cấp', 'Cap', 'Cấp học', 'Level']), className);
    const classroom = upsertByName(classes, className, () => ({
      id: timetableEntityId('lop', className), name: className, level: classLevel, maxPeriodsPerDay: seed.periodsPerDay,
    }));
    const teacher = upsertByName(teachers, teacherName, () => ({
      id: timetableEntityId('gv', teacherName), name: teacherName,
      level: parseTeacherLevel(findColumn(row, ['Cấp GV', 'Cap GV', 'Teacher level']), classLevel),
      maxPeriodsPerDay: 6, maxConsecutivePeriods: 4,
    }));
    const subject = upsertByName(subjects, subjectName, () => ({
      id: timetableEntityId('mon', subjectName), name: subjectName,
      preferMorning: booleanValue(findColumn(row, ['Ưu tiên sáng', 'Uu tien sang', 'Prefer morning'])),
    }));
    const roomName = text(findColumn(row, ['Phòng', 'Phong', 'Phòng học', 'Room']));
    const room = roomName ? upsertByName(rooms, roomName, () => ({ id: timetableEntityId('phong', roomName), name: roomName })) : undefined;
    const homeroom = booleanValue(findColumn(row, ['GVCN', 'Chủ nhiệm', 'Chu nhiem', 'Homeroom']));
    if (homeroom) {
      classroom.homeroomTeacherId = teacher.id;
      teacher.homeroomClassId = classroom.id;
    }

    const periods = Math.max(1, Math.round(numberValue(findColumn(row, ['Tiết/tuần', 'Tiet/tuan', 'Số tiết', 'So tiet', 'Periods/week']), 1)));
    const blockRaw = findColumn(row, ['Tiết đôi', 'Tiet doi', 'Block', 'Block size']);
    const blockSize = booleanValue(blockRaw) ? 2 : Math.max(1, Math.min(3, Math.round(numberValue(blockRaw, 1)))) as 1 | 2 | 3;
    const maxPerDay = Math.max(blockSize, Math.round(numberValue(findColumn(row, ['Tối đa/ngày', 'Toi da/ngay', 'Max/day']), blockSize > 1 ? blockSize : 1)));
    const importedFixedSlots = parseImportedSlots(findColumn(row, ['Tiết cố định', 'Tiet co dinh', 'Ô cố định', 'O co dinh', 'Fixed slots']));
    // A fixed start consumes one full block. Ignore surplus fixed starts instead of allowing imported data
    // to place more periods than the assignment's declared weekly total.
    const maxFixedStarts = Math.floor(periods / blockSize);
    const fixedStartSlots = importedFixedSlots.slice(0, maxFixedStarts);

    assignments.push({
      id: `asg-import-${index + 1}-${classroom.id}-${subject.id}`,
      classId: classroom.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      roomId: room?.id,
      periodsPerWeek: periods,
      maxPerDay,
      blockSize,
      session: parseSession(findColumn(row, ['Buổi', 'Buoi', 'Session'])),
      avoidLastPeriod: booleanValue(findColumn(row, ['Tránh tiết cuối', 'Tranh tiet cuoi', 'Avoid last period'])),
      fixedStartSlots,
      forbiddenSlots: parseImportedSlots(findColumn(row, ['Tiết cấm', 'Tiet cam', 'Ô cấm', 'O cam', 'Forbidden slots'])),
      preferredSlots: parseImportedSlots(findColumn(row, ['Tiết ưu tiên', 'Tiet uu tien', 'Ô ưu tiên', 'O uu tien', 'Preferred slots'])),
    });
  });

  return normalizeTimetableScenario({
    ...seed,
    teachers,
    classes,
    subjects,
    rooms,
    assignments,
  });
}

export const TIMETABLE_IMPORT_COLUMNS = [
  'Cấp', 'Lớp', 'Môn', 'Giáo viên', 'Cấp GV', 'GVCN', 'Phòng', 'Tiết/tuần', 'Tối đa/ngày',
  'Tiết đôi', 'Buổi', 'Ưu tiên sáng', 'Tránh tiết cuối', 'Tiết cố định', 'Tiết cấm', 'Tiết ưu tiên',
] as const;
