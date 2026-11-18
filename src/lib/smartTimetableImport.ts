import { EDUCATION_LEVELS, defaultLevelTiming } from './timetableEducation.js';
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
  type TimetableCampus,
  type TimetableStudentGroup,
  type TimetableLessonGroup,
  type TimetableGrade,
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

function parseLevel(value: unknown, className: string, fallback?: Exclude<SchoolLevel, 'Liên cấp'>): Exclude<SchoolLevel, 'Liên cấp'> {
  const normalized = normalizeLookupKey(text(value));
  if (normalized) {
    const aliases: Record<string, Exclude<SchoolLevel, 'Liên cấp'>> = { 'trung hoc co so': 'THCS', 'trung hoc pho thong': 'THPT', 'gdtx': 'GDTX THPT', 'giao duc thuong xuyen thcs': 'GDTX THCS', 'giao duc thuong xuyen thpt': 'GDTX THPT' };
    const level = EDUCATION_LEVELS.find(l => normalizeLookupKey(l) === normalized) || aliases[normalized];
    if (!level) throw new Error(`Cấp học không nhận diện: ${text(value)}. Dùng Tiểu học, THCS, THPT, GDTX THCS, GDTX THPT hoặc Đại học.`);
    return level;
  }
  if (fallback) return fallback;
  const grade = Number(className.match(/^\s*(\d{1,2})/)?.[1] || 0);
  if (grade > 12 || !grade) throw new Error(`Cần khai báo Cấp cho lớp ${className}.`);
  return grade >= 10 ? 'THPT' : grade >= 6 ? 'THCS' : 'Tiểu học';
}

function parseTeacherLevel(value: unknown, fallback: Exclude<SchoolLevel, 'Liên cấp'>): SchoolLevel {
  return normalizeLookupKey(text(value)).includes('lien cap') ? 'Liên cấp' : parseLevel(value, '', fallback);
}

function parseSession(value: unknown): SessionPreference {
  const normalized = normalizeLookupKey(text(value));
  if (normalized.includes('sang') || normalized === 'am') return 'morning';
  if (normalized.includes('toi') || normalized === 'evening') return 'evening';
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
    't7': 5, 'thu7': 5, 'thubay': 5, 'cn': 6, 'chunhat': 6, 'sunday': 6,
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
      if (day >= 0 && day <= 6 && period >= 1 && period <= 20) slots.push(timetableSlotKey(day, period));
      continue;
    }
    const match = trimmed.match(/(.+?)[\s\-_]*(?:ti[eế]t\s*)?(\d+)$/i);
    if (!match) continue;
    const dayIndex = parseDayIndex(match[1]);
    const period = Number(match[2]);
    if (dayIndex !== null && period >= 1 && period <= 20) slots.push(timetableSlotKey(dayIndex, period));
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
  const campuses: TimetableCampus[] = [];
  const studentGroups: TimetableStudentGroup[] = [];
  const lessonGroups: TimetableLessonGroup[] = [];
  const grades: TimetableGrade[] = [];

  rows.forEach((row, index) => {
    const className = text(findColumn(row, ['Lớp', 'Lop', 'Class']));
    const subjectName = text(findColumn(row, ['Môn', 'Mon', 'Môn học', 'Subject']));
    const teacherName = text(findColumn(row, ['Giáo viên', 'Giao vien', 'GV', 'Teacher']));
    if (!className || !subjectName || !teacherName) return;

    const classLevel = parseLevel(findColumn(row, ['Cấp', 'Cap', 'Cấp học', 'Level']), className, seed.education?.levels.length === 1 ? seed.education.levels[0] : undefined);
    const classroom = upsertByName(classes, className, () => ({
      id: timetableEntityId('lop', className), name: className, level: classLevel, maxPeriodsPerDay: defaultLevelTiming(classLevel).maxPeriodsPerDay,
    }));
    if (classroom.level !== classLevel) throw new Error(`Lớp ${className} được khai báo ở nhiều cấp khác nhau.`);
    const facultyName = text(findColumn(row, ['Khối / Khoa', 'Khoa', 'Khối']));
    if (facultyName) { let grade = grades.find(g => g.name === facultyName && g.level === classLevel); if (!grade) { grade = { id: timetableEntityId('khoi', classLevel + '-' + facultyName), name: facultyName, level: classLevel }; grades.push(grade); } classroom.gradeId = grade.id; }
    classroom.programme = text(findColumn(row, ['Ngành', 'Chương trình'])) || classroom.programme;
    classroom.cohort = text(findColumn(row, ['Khóa', 'Khóa học'])) || classroom.cohort;
    classroom.electiveCombination = text(findColumn(row, ['Tổ hợp', 'Tổ hợp lựa chọn'])) || classroom.electiveCombination;
    const teacher = upsertByName(teachers, teacherName, () => ({
      id: timetableEntityId('gv', teacherName), name: teacherName,
      level: parseTeacherLevel(findColumn(row, ['Cấp GV', 'Cap GV', 'Teacher level']), classLevel),
      maxPeriodsPerDay: 6, maxConsecutivePeriods: 4,
    }));
    const subject = upsertByName(subjects, subjectName, () => ({
      id: timetableEntityId('mon', subjectName), name: subjectName,
      preferMorning: booleanValue(findColumn(row, ['Ưu tiên sáng', 'Uu tien sang', 'Prefer morning'])),
    }));
    subject.code = text(findColumn(row, ['Mã học phần', 'Mã môn'])) || subject.code;
    const credits = text(findColumn(row, ['Tín chỉ']));
    if (credits) { const value = numberValue(credits, NaN); if (!Number.isFinite(value) || value <= 0) throw new Error(`Tín chỉ không hợp lệ: ${subjectName}.`); subject.credits = value; }
    const roomName = text(findColumn(row, ['Phòng', 'Phong', 'Phòng học', 'Room']));
    const room = roomName ? upsertByName<TimetableRoom>(rooms, roomName, () => ({ id: timetableEntityId('phong', roomName), name: roomName })) : undefined;
    const list = (names: string[]) => text(findColumn(row, names)).split(/[;,|]+/).map(x => x.trim()).filter(Boolean);
    const additionalClassIds = list(['Lớp ghép', 'Lop ghep']).map(name => upsertByName(classes, name, () => ({ id: timetableEntityId('lop', name), name, level: parseLevel('', name, seed.education?.levels.length === 1 ? seed.education.levels[0] : undefined), maxPeriodsPerDay: seed.periodsPerDay })).id).filter(id => id !== classroom.id);
    const additionalTeacherIds = list(['Đồng giảng', 'Dong giang']).map(name => upsertByName(teachers, name, () => ({ id: timetableEntityId('gv', name), name, level: teacher.level, maxPeriodsPerDay: 6, maxConsecutivePeriods: 4 })).id).filter(id => id !== teacher.id);
    const campusName = text(findColumn(row, ['Cơ sở', 'Co so', 'Campus']));
    const campus = campusName ? upsertByName(campuses, campusName, () => ({ id: timetableEntityId('campus', campusName), name: campusName })) : undefined;
    const count = numberValue(findColumn(row, ['Sĩ số', 'Si so', 'Student count']), 0);
    if (count > 0) classroom.studentCount = Math.floor(count);
    const capacity = numberValue(findColumn(row, ['Sức chứa', 'Suc chua', 'Room capacity']), 0);
    if (room && capacity > 0) room.capacity = Math.floor(capacity);
    if (room && campus) room.campusId = campus.id;
    const studentGroupName = text(findColumn(row, ['Nhóm', 'Nhom', 'Nhóm học']));
    let studentGroup = studentGroups.find(g => g.classId === classroom.id && g.name === studentGroupName);
    if (studentGroupName && !studentGroup) {
      studentGroup = { id: timetableEntityId('group', classroom.name + '-' + studentGroupName), classId: classroom.id, name: studentGroupName, studentCount: numberValue(findColumn(row, ['Sĩ số nhóm', 'Si so nhom']), 0) || undefined };
      studentGroups.push(studentGroup);
    }
    const additionalStudentGroupIds = list(['Nhóm ghép', 'Nhom ghep']).map(value => {
      const separator = value.indexOf(':');
      if (separator < 1 || !value.slice(separator + 1).trim() || !studentGroup) throw new Error(`Dòng ${index + 1}: Nhóm ghép dùng dạng Lớp:Nhóm và phải khai báo Nhóm chính.`);
      const name = value.slice(0, separator).trim(), groupName = value.slice(separator + 1).trim();
      const owner = upsertByName(classes, name, () => ({ id: timetableEntityId('lop', name), name, level: parseLevel('', name, seed.education?.levels.length === 1 ? seed.education.levels[0] : undefined), maxPeriodsPerDay: seed.periodsPerDay }));
      if (owner.id !== classroom.id && !additionalClassIds.includes(owner.id)) additionalClassIds.push(owner.id);
      let group = studentGroups.find(g => g.classId === owner.id && g.name === groupName);
      if (!group) { group = { id: timetableEntityId('group', owner.name + '-' + groupName), classId: owner.id, name: groupName }; studentGroups.push(group); }
      return group.id;
    });
    const homeroom = booleanValue(findColumn(row, ['GVCN', 'Chủ nhiệm', 'Chu nhiem', 'Homeroom']));
    if (homeroom) {
      classroom.homeroomTeacherId = teacher.id;
      teacher.homeroomClassId = classroom.id;
    }

    const periods = Math.max(1, Math.round(numberValue(findColumn(row, ['Tiết/tuần', 'Tiet/tuan', 'Số tiết', 'So tiet', 'Periods/week']), 1)));
    const blockRaw = findColumn(row, ['Tiết đôi', 'Tiet doi', 'Block', 'Block size']);
    const numericBlock = numberValue(blockRaw, NaN);
    const blockSize = Number.isFinite(numericBlock) && text(blockRaw) ? Math.max(1, Math.min(3, Math.round(numericBlock))) as 1 | 2 | 3 : booleanValue(blockRaw) ? 2 : 1;
    const maxPerDay = Math.max(blockSize, Math.round(numberValue(findColumn(row, ['Tối đa/ngày', 'Toi da/ngay', 'Max/day']), blockSize > 1 ? blockSize : 1)));
    const slots = (names: string[]) => {
      const raw = findColumn(row, names);
      for (const part of text(raw).split(/[;,|]+/).map(x => x.trim()).filter(Boolean)) if (!parseImportedSlots(part).length) throw new Error(`Dòng ${index + 1}: ô thời gian không hợp lệ: ${part}.`);
      return parseImportedSlots(raw);
    };
    // Keep every declared hard constraint. The preview reports surplus fixed starts for correction.
    const fixedStartSlots = slots(['Tiết cố định', 'Tiet co dinh', 'Ô cố định', 'O co dinh', 'Fixed slots']);

    assignments.push({
      id: `asg-import-${index + 1}-${classroom.id}-${subject.id}`,
      classId: classroom.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      roomId: room?.id,
      additionalClassIds, additionalTeacherIds, studentGroupId: studentGroup?.id, additionalStudentGroupIds, campusId: campus?.id,
      courseSectionCode: text(findColumn(row, ['Mã lớp học phần'])) || undefined,
      startWeek: text(findColumn(row, ['Từ tuần'])) ? numberValue(findColumn(row, ['Từ tuần']), NaN) : undefined,
      endWeek: text(findColumn(row, ['Đến tuần'])) ? numberValue(findColumn(row, ['Đến tuần']), NaN) : undefined,
      weekPattern: (() => { const raw = normalizeLookupKey(text(findColumn(row, ['Tuần học']))); if (!raw || ['tat ca', 'all', 'hang tuan'].includes(raw)) return 'all'; if (['chan', 'even'].includes(raw)) return 'even'; if (['le', 'odd'].includes(raw)) return 'odd'; throw new Error(`Dòng ${index + 1}: Tuần học dùng tất cả, chẵn hoặc lẻ.`); })(),
      periodsPerWeek: periods,
      maxPerDay,
      blockSize,
      session: parseSession(findColumn(row, ['Buổi', 'Buoi', 'Session'])),
      avoidLastPeriod: booleanValue(findColumn(row, ['Tránh tiết cuối', 'Tranh tiet cuoi', 'Avoid last period'])),
      fixedStartSlots,
      forbiddenSlots: slots(['Tiết cấm', 'Tiet cam', 'Ô cấm', 'O cam', 'Forbidden slots']),
      preferredSlots: slots(['Tiết ưu tiên', 'Tiet uu tien', 'Ô ưu tiên', 'O uu tien', 'Preferred slots']),
    });
    for (const [kind, column] of [['parallel', 'Nhóm song song'], ['same-session', 'Nhóm cùng buổi']] as const) {
      const name = text(findColumn(row, [column])); if (!name) continue;
      let group = lessonGroups.find(g => g.kind === kind && g.name === name);
      if (!group) { group = { id: timetableEntityId(kind, name), name, kind, assignmentIds: [] }; lessonGroups.push(group); }
      group.assignmentIds.push(assignments[assignments.length - 1].id);
    }
  });

  return normalizeTimetableScenario({
    ...seed,
    teachers,
    classes,
    subjects,
    rooms,
    assignments,
    campuses, studentGroups, lessonGroups, grades,
  });
}

export const TIMETABLE_IMPORT_COLUMNS = [
  'Cấp', 'Lớp', 'Môn', 'Giáo viên', 'Cấp GV', 'GVCN', 'Phòng', 'Tiết/tuần', 'Tối đa/ngày',
  'Tiết đôi', 'Buổi', 'Ưu tiên sáng', 'Tránh tiết cuối', 'Tiết cố định', 'Tiết cấm', 'Tiết ưu tiên',
  'Lớp ghép', 'Đồng giảng', 'Nhóm', 'Nhóm ghép', 'Sĩ số', 'Sĩ số nhóm', 'Cơ sở', 'Sức chứa', 'Nhóm song song', 'Nhóm cùng buổi', 'Khối / Khoa', 'Ngành', 'Khóa', 'Tổ hợp', 'Mã học phần', 'Tín chỉ', 'Mã lớp học phần', 'Từ tuần', 'Đến tuần', 'Tuần học',
] as const;
