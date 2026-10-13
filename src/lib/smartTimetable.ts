export const TIMETABLE_DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'] as const;
export type TimetableDay = (typeof TIMETABLE_DAYS)[number];
export type SchoolLevel = 'Tiểu học' | 'THCS' | 'Liên cấp';
export type SessionPreference = 'any' | 'morning' | 'afternoon';

export interface TimetableTeacher {
  id: string;
  name: string;
  level: SchoolLevel;
  unavailableSlots?: string[];
  preferredSlots?: string[];
  homeroomClassId?: string;
  maxPeriodsPerDay?: number;
  maxConsecutivePeriods?: number;
}

export interface TimetableClass {
  id: string;
  name: string;
  level: Exclude<SchoolLevel, 'Liên cấp'>;
  unavailableSlots?: string[];
  homeroomTeacherId?: string;
  maxPeriodsPerDay?: number;
}

export interface TimetableSubject {
  id: string;
  name: string;
  preferMorning?: boolean;
  avoidLastPeriod?: boolean;
}

export interface TimetableRoom {
  id: string;
  name: string;
  unavailableSlots?: string[];
}

export interface TeachingAssignment {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId?: string;
  periodsPerWeek: number;
  maxPerDay?: number;
  avoidLastPeriod?: boolean;
  blockSize?: 1 | 2 | 3;
  session?: SessionPreference;
  preferredSlots?: string[];
  forbiddenSlots?: string[];
  fixedStartSlots?: string[];
}

export interface TimetableScenario {
  name: string;
  daysPerWeek?: 5 | 6;
  periodsPerDay: number;
  morningPeriods?: number;
  teachers: TimetableTeacher[];
  classes: TimetableClass[];
  subjects: TimetableSubject[];
  rooms: TimetableRoom[];
  assignments: TeachingAssignment[];
}

export interface ScheduleEntry {
  id: string;
  assignmentId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId?: string;
  dayIndex: number;
  period: number;
  blockId?: string;
  locked?: boolean;
  fixed?: boolean;
}

export interface UnscheduledLesson {
  assignmentId: string;
  remaining: number;
  reason: string;
}

export interface TimetableQuality {
  teacherGaps: number;
  classGaps: number;
  lateCorePeriods: number;
  dailyImbalance: number;
}

export interface TimetableDiagnostics {
  hardConflicts: string[];
  warnings: string[];
  unscheduled: UnscheduledLesson[];
  teacherGaps: number;
  quality: TimetableQuality;
  preflight: string[];
}

export interface TimetableSolution {
  entries: ScheduleEntry[];
  score: number;
  diagnostics: TimetableDiagnostics;
  generatedAt: string;
}

interface SchedulingUnit {
  assignment: TeachingAssignment;
  size: number;
  fixedStartSlot?: string;
  ordinal: number;
}

interface CandidateStart {
  dayIndex: number;
  period: number;
  penalty: number;
}

export function timetableSlotKey(dayIndex: number, period: number): string {
  return `${dayIndex}:${period}`;
}

export function parseTimetableSlot(slot: string): { dayIndex: number; period: number } | null {
  const [dayRaw, periodRaw] = slot.split(':');
  const dayIndex = Number(dayRaw);
  const period = Number(periodRaw);
  return Number.isInteger(dayIndex) && Number.isInteger(period) ? { dayIndex, period } : null;
}

export function activeTimetableDays(scenario: TimetableScenario): readonly TimetableDay[] {
  return TIMETABLE_DAYS.slice(0, scenario.daysPerWeek === 6 ? 6 : 5);
}

export function normalizeTimetableScenario(input: TimetableScenario): TimetableScenario {
  return {
    ...input,
    daysPerWeek: input.daysPerWeek === 6 ? 6 : 5,
    periodsPerDay: Math.max(1, Math.min(12, Math.floor(input.periodsPerDay || 7))),
    morningPeriods: Math.max(1, Math.min(input.periodsPerDay || 7, Math.floor(input.morningPeriods || Math.min(5, input.periodsPerDay || 7)))),
    teachers: Array.isArray(input.teachers) ? input.teachers.map(item => ({
      ...item,
      unavailableSlots: Array.isArray(item.unavailableSlots) ? item.unavailableSlots : [],
      preferredSlots: Array.isArray(item.preferredSlots) ? item.preferredSlots : [],
      maxPeriodsPerDay: item.maxPeriodsPerDay ? Math.max(1, Number(item.maxPeriodsPerDay)) : undefined,
      maxConsecutivePeriods: item.maxConsecutivePeriods ? Math.max(1, Number(item.maxConsecutivePeriods)) : undefined,
    })) : [],
    classes: Array.isArray(input.classes) ? input.classes.map(item => ({
      ...item,
      unavailableSlots: Array.isArray(item.unavailableSlots) ? item.unavailableSlots : [],
      maxPeriodsPerDay: item.maxPeriodsPerDay ? Math.max(1, Number(item.maxPeriodsPerDay)) : undefined,
    })) : [],
    subjects: Array.isArray(input.subjects) ? input.subjects : [],
    rooms: Array.isArray(input.rooms) ? input.rooms.map(item => ({
      ...item,
      unavailableSlots: Array.isArray(item.unavailableSlots) ? item.unavailableSlots : [],
    })) : [],
    assignments: Array.isArray(input.assignments) ? input.assignments.map(item => ({
      ...item,
      periodsPerWeek: Math.max(1, Number(item.periodsPerWeek || 1)),
      maxPerDay: Math.max(1, Number(item.maxPerDay || Math.max(1, item.blockSize || 1))),
      blockSize: item.blockSize === 2 || item.blockSize === 3 ? item.blockSize : 1,
      session: item.session || 'any',
      preferredSlots: Array.isArray(item.preferredSlots) ? item.preferredSlots : [],
      forbiddenSlots: Array.isArray(item.forbiddenSlots) ? item.forbiddenSlots : [],
      fixedStartSlots: Array.isArray(item.fixedStartSlots) ? item.fixedStartSlots : [],
    })) : [],
  };
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function blockSlots(dayIndex: number, startPeriod: number, size: number): string[] {
  return Array.from({ length: size }, (_, offset) => timetableSlotKey(dayIndex, startPeriod + offset));
}

function staysInsideSession(scenario: TimetableScenario, startPeriod: number, size: number): boolean {
  const morningEnd = scenario.morningPeriods || Math.min(5, scenario.periodsPerDay);
  const endPeriod = startPeriod + size - 1;
  if (startPeriod <= morningEnd && endPeriod > morningEnd) return false;
  return endPeriod <= scenario.periodsPerDay;
}

function sessionAllows(scenario: TimetableScenario, assignment: TeachingAssignment, period: number, size: number): boolean {
  if (!staysInsideSession(scenario, period, size)) return false;
  const morningEnd = scenario.morningPeriods || Math.min(5, scenario.periodsPerDay);
  if (assignment.session === 'morning') return period + size - 1 <= morningEnd;
  if (assignment.session === 'afternoon') return period > morningEnd;
  return true;
}

function countGaps(entries: ScheduleEntry[], resource: 'teacherId' | 'classId'): number {
  const groups = new Map<string, number[]>();
  for (const entry of entries) {
    const key = `${entry[resource]}:${entry.dayIndex}`;
    const periods = groups.get(key) || [];
    periods.push(entry.period);
    groups.set(key, periods);
  }
  let gaps = 0;
  for (const periods of groups.values()) {
    const sorted = [...new Set(periods)].sort((a, b) => a - b);
    if (sorted.length < 2) continue;
    gaps += Math.max(0, sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length);
  }
  return gaps;
}

function maxConsecutiveWithCandidate(periods: number[], startPeriod: number, size: number): number {
  const combined = [...new Set([...periods, ...Array.from({ length: size }, (_, offset) => startPeriod + offset)])].sort((a, b) => a - b);
  let best = 0;
  let current = 0;
  let previous = -999;
  for (const period of combined) {
    current = period === previous + 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = period;
  }
  return best;
}

function dailyLoad(entries: ScheduleEntry[], field: 'teacherId' | 'classId', id: string, dayIndex: number): number {
  return entries.filter(entry => entry[field] === id && entry.dayIndex === dayIndex).length;
}

function splitAssignmentIntoUnits(assignment: TeachingAssignment, alreadyPlaced: number): SchedulingUnit[] {
  const remaining = Math.max(0, assignment.periodsPerWeek - alreadyPlaced);
  const preferredBlockSize = assignment.blockSize || 1;
  const units: SchedulingUnit[] = [];
  let left = remaining;
  let ordinal = 0;
  while (left > 0) {
    const size = Math.min(preferredBlockSize, left);
    units.push({ assignment, size, ordinal });
    ordinal += 1;
    left -= size;
  }
  return units;
}

function describeEntity<T extends { id: string; name: string }>(items: T[], id: string): string {
  return items.find(item => item.id === id)?.name || id;
}

export function analyzeTimetableScenario(rawScenario: TimetableScenario): string[] {
  const scenario = normalizeTimetableScenario(rawScenario);
  const issues: string[] = [];
  const days = activeTimetableDays(scenario).length;
  const totalSlots = days * scenario.periodsPerDay;
  const teacherIds = new Set(scenario.teachers.map(item => item.id));
  const classIds = new Set(scenario.classes.map(item => item.id));
  const subjectIds = new Set(scenario.subjects.map(item => item.id));
  const roomIds = new Set(scenario.rooms.map(item => item.id));

  for (const assignment of scenario.assignments) {
    if (!classIds.has(assignment.classId)) issues.push(`Phân công ${assignment.id} tham chiếu lớp không tồn tại: ${assignment.classId}.`);
    if (!teacherIds.has(assignment.teacherId)) issues.push(`Phân công ${assignment.id} tham chiếu giáo viên không tồn tại: ${assignment.teacherId}.`);
    if (!subjectIds.has(assignment.subjectId)) issues.push(`Phân công ${assignment.id} tham chiếu môn không tồn tại: ${assignment.subjectId}.`);
    if (assignment.roomId && !roomIds.has(assignment.roomId)) issues.push(`Phân công ${assignment.id} tham chiếu phòng không tồn tại: ${assignment.roomId}.`);
    if ((assignment.blockSize || 1) > (assignment.maxPerDay || 1)) issues.push(`Phân công ${assignment.id}: tiết đôi/block lớn hơn giới hạn tối đa trong ngày.`);
    if ((assignment.fixedStartSlots || []).length * (assignment.blockSize || 1) > assignment.periodsPerWeek) issues.push(`Phân công ${assignment.id}: số tiết cố định vượt số tiết/tuần.`);
  }

  for (const classroom of scenario.classes) {
    const required = scenario.assignments.filter(item => item.classId === classroom.id).reduce((sum, item) => sum + item.periodsPerWeek, 0);
    const available = totalSlots - (classroom.unavailableSlots || []).filter(slot => {
      const parsed = parseTimetableSlot(slot);
      return parsed && parsed.dayIndex < days && parsed.period <= scenario.periodsPerDay;
    }).length;
    if (required > available) issues.push(`Lớp ${classroom.name} cần ${required} tiết nhưng chỉ có ${available} ô khả dụng.`);
  }

  for (const teacher of scenario.teachers) {
    const required = scenario.assignments.filter(item => item.teacherId === teacher.id).reduce((sum, item) => sum + item.periodsPerWeek, 0);
    const available = totalSlots - (teacher.unavailableSlots || []).filter(slot => {
      const parsed = parseTimetableSlot(slot);
      return parsed && parsed.dayIndex < days && parsed.period <= scenario.periodsPerDay;
    }).length;
    if (required > available) issues.push(`Giáo viên ${teacher.name} được phân ${required} tiết nhưng chỉ có ${available} ô khả dụng.`);
    if (teacher.maxPeriodsPerDay && required > teacher.maxPeriodsPerDay * days) issues.push(`Giáo viên ${teacher.name} vượt tổng tải theo giới hạn ${teacher.maxPeriodsPerDay} tiết/ngày.`);
  }

  for (const room of scenario.rooms) {
    const required = scenario.assignments.filter(item => item.roomId === room.id).reduce((sum, item) => sum + item.periodsPerWeek, 0);
    const available = totalSlots - (room.unavailableSlots || []).length;
    if (required > available) issues.push(`Phòng ${room.name} có nhu cầu ${required} tiết nhưng chỉ có ${available} ô khả dụng.`);
  }
  return issues;
}

function validateEntries(scenario: TimetableScenario, entries: ScheduleEntry[]): string[] {
  const conflicts: string[] = [];
  const occupiedClasses = new Set<string>();
  const occupiedTeachers = new Set<string>();
  const occupiedRooms = new Set<string>();
  const teacherById = new Map(scenario.teachers.map(item => [item.id, item]));
  const classById = new Map(scenario.classes.map(item => [item.id, item]));
  const roomById = new Map(scenario.rooms.map(item => [item.id, item]));
  const days = activeTimetableDays(scenario).length;

  for (const entry of entries) {
    if (entry.dayIndex < 0 || entry.dayIndex >= days || entry.period < 1 || entry.period > scenario.periodsPerDay) {
      conflicts.push(`Tiết ${entry.id} nằm ngoài khung thời gian của trường.`);
      continue;
    }
    const slot = timetableSlotKey(entry.dayIndex, entry.period);
    const classKey = `${entry.classId}:${slot}`;
    const teacherKey = `${entry.teacherId}:${slot}`;
    const roomKey = entry.roomId ? `${entry.roomId}:${slot}` : '';
    if (occupiedClasses.has(classKey)) conflicts.push(`Lớp ${describeEntity(scenario.classes, entry.classId)} bị trùng ở ${TIMETABLE_DAYS[entry.dayIndex]} tiết ${entry.period}.`);
    if (occupiedTeachers.has(teacherKey)) conflicts.push(`Giáo viên ${describeEntity(scenario.teachers, entry.teacherId)} bị trùng ở ${TIMETABLE_DAYS[entry.dayIndex]} tiết ${entry.period}.`);
    if (roomKey && occupiedRooms.has(roomKey)) conflicts.push(`Phòng ${describeEntity(scenario.rooms, entry.roomId || '')} bị trùng ở ${TIMETABLE_DAYS[entry.dayIndex]} tiết ${entry.period}.`);
    if (teacherById.get(entry.teacherId)?.unavailableSlots?.includes(slot)) conflicts.push(`Giáo viên ${describeEntity(scenario.teachers, entry.teacherId)} bị xếp vào giờ đã khóa.`);
    if (classById.get(entry.classId)?.unavailableSlots?.includes(slot)) conflicts.push(`Lớp ${describeEntity(scenario.classes, entry.classId)} bị xếp vào giờ không học.`);
    if (entry.roomId && roomById.get(entry.roomId)?.unavailableSlots?.includes(slot)) conflicts.push(`Phòng ${describeEntity(scenario.rooms, entry.roomId)} bị xếp vào giờ không khả dụng.`);
    occupiedClasses.add(classKey);
    occupiedTeachers.add(teacherKey);
    if (roomKey) occupiedRooms.add(roomKey);
  }
  return [...new Set(conflicts)];
}

function explainUnscheduled(scenario: TimetableScenario, assignment: TeachingAssignment, size: number): string {
  const teacher = scenario.teachers.find(item => item.id === assignment.teacherId);
  const classroom = scenario.classes.find(item => item.id === assignment.classId);
  const room = assignment.roomId ? scenario.rooms.find(item => item.id === assignment.roomId) : undefined;
  const parts: string[] = [];
  if ((teacher?.unavailableSlots || []).length) parts.push(`GV có ${(teacher?.unavailableSlots || []).length} ô bận`);
  if ((classroom?.unavailableSlots || []).length) parts.push(`lớp có ${(classroom?.unavailableSlots || []).length} ô không học`);
  if ((room?.unavailableSlots || []).length) parts.push(`phòng có ${(room?.unavailableSlots || []).length} ô bận`);
  if ((assignment.forbiddenSlots || []).length) parts.push(`phân công khóa ${(assignment.forbiddenSlots || []).length} ô`);
  if (size > 1) parts.push(`cần ${size} tiết liền nhau cùng buổi`);
  if (assignment.session && assignment.session !== 'any') parts.push(`chỉ được xếp buổi ${assignment.session === 'morning' ? 'sáng' : 'chiều'}`);
  return `Không còn vị trí thỏa toàn bộ ràng buộc${parts.length ? ` (${parts.join('; ')})` : ''}. Hãy mở bớt giờ bận, tăng khung tiết, đổi phòng/GV hoặc nới giới hạn số tiết/ngày.`;
}

function buildCandidate(rawScenario: TimetableScenario, lockedEntries: ScheduleEntry[], seed: number): TimetableSolution {
  const scenario = normalizeTimetableScenario(rawScenario);
  const random = mulberry32(seed);
  const days = activeTimetableDays(scenario).length;
  const teacherById = new Map(scenario.teachers.map(item => [item.id, item]));
  const classById = new Map(scenario.classes.map(item => [item.id, item]));
  const subjectById = new Map(scenario.subjects.map(item => [item.id, item]));
  const roomById = new Map(scenario.rooms.map(item => [item.id, item]));
  const assignmentById = new Map(scenario.assignments.map(item => [item.id, item]));
  const entries: ScheduleEntry[] = [];
  const forcedConflicts: string[] = [];

  const classBusy = new Set<string>();
  const teacherBusy = new Set<string>();
  const roomBusy = new Set<string>();
  const assignmentDayCounts = new Map<string, number>();
  const placedByAssignment = new Map<string, number>();

  const registerEntry = (entry: ScheduleEntry): void => {
    entries.push(entry);
    const slot = timetableSlotKey(entry.dayIndex, entry.period);
    classBusy.add(`${entry.classId}:${slot}`);
    teacherBusy.add(`${entry.teacherId}:${slot}`);
    if (entry.roomId) roomBusy.add(`${entry.roomId}:${slot}`);
    const dailyKey = `${entry.assignmentId}:${entry.dayIndex}`;
    assignmentDayCounts.set(dailyKey, (assignmentDayCounts.get(dailyKey) || 0) + 1);
    placedByAssignment.set(entry.assignmentId, (placedByAssignment.get(entry.assignmentId) || 0) + 1);
  };

  const canOccupyBlock = (assignment: TeachingAssignment, dayIndex: number, startPeriod: number, size: number, ignoreDailyLimits = false): boolean => {
    if (dayIndex < 0 || dayIndex >= days || startPeriod < 1 || startPeriod + size - 1 > scenario.periodsPerDay) return false;
    if (!sessionAllows(scenario, assignment, startPeriod, size)) return false;
    const teacher = teacherById.get(assignment.teacherId);
    const classroom = classById.get(assignment.classId);
    const room = assignment.roomId ? roomById.get(assignment.roomId) : undefined;
    const slots = blockSlots(dayIndex, startPeriod, size);
    for (const slot of slots) {
      if (classBusy.has(`${assignment.classId}:${slot}`) || teacherBusy.has(`${assignment.teacherId}:${slot}`)) return false;
      if (assignment.roomId && roomBusy.has(`${assignment.roomId}:${slot}`)) return false;
      if (teacher?.unavailableSlots?.includes(slot) || classroom?.unavailableSlots?.includes(slot) || room?.unavailableSlots?.includes(slot)) return false;
      if (assignment.forbiddenSlots?.includes(slot)) return false;
    }
    if (ignoreDailyLimits) return true;
    const assignmentDaily = assignmentDayCounts.get(`${assignment.id}:${dayIndex}`) || 0;
    if (assignmentDaily + size > (assignment.maxPerDay || Math.max(1, size))) return false;
    if (teacher?.maxPeriodsPerDay && dailyLoad(entries, 'teacherId', assignment.teacherId, dayIndex) + size > teacher.maxPeriodsPerDay) return false;
    if (classroom?.maxPeriodsPerDay && dailyLoad(entries, 'classId', assignment.classId, dayIndex) + size > classroom.maxPeriodsPerDay) return false;
    if (teacher?.maxConsecutivePeriods) {
      const existingPeriods = entries.filter(entry => entry.teacherId === assignment.teacherId && entry.dayIndex === dayIndex).map(entry => entry.period);
      if (maxConsecutiveWithCandidate(existingPeriods, startPeriod, size) > teacher.maxConsecutivePeriods) return false;
    }
    return true;
  };

  const placeBlock = (assignment: TeachingAssignment, dayIndex: number, startPeriod: number, size: number, flags: { locked?: boolean; fixed?: boolean }, blockId: string): void => {
    for (let offset = 0; offset < size; offset += 1) {
      registerEntry({
        id: `${blockId}-${offset + 1}`,
        assignmentId: assignment.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        roomId: assignment.roomId,
        dayIndex,
        period: startPeriod + offset,
        blockId,
        locked: flags.locked,
        fixed: flags.fixed,
      });
    }
  };

  // User-locked entries from a previous solution are always registered first.
  for (const locked of lockedEntries) {
    const assignment = assignmentById.get(locked.assignmentId);
    if (!assignment) {
      forcedConflicts.push(`Tiết khóa ${locked.id} không còn phân công tương ứng.`);
      continue;
    }
    const slot = timetableSlotKey(locked.dayIndex, locked.period);
    if (classBusy.has(`${locked.classId}:${slot}`) || teacherBusy.has(`${locked.teacherId}:${slot}`) || (locked.roomId && roomBusy.has(`${locked.roomId}:${slot}`))) {
      forcedConflicts.push(`Tiết khóa ${locked.id} xung đột với một tiết khóa khác.`);
    }
    registerEntry({ ...locked, locked: true });
  }

  // Fixed lesson starts (chào cờ, sinh hoạt, tiết bắt buộc...) are hard constraints.
  for (const assignment of scenario.assignments) {
    const blockSize = assignment.blockSize || 1;
    for (const [index, fixedSlot] of (assignment.fixedStartSlots || []).entries()) {
      const parsed = parseTimetableSlot(fixedSlot);
      if (!parsed) {
        forcedConflicts.push(`Phân công ${assignment.id} có ô cố định không hợp lệ: ${fixedSlot}.`);
        continue;
      }
      const alreadyAtStart = entries.some(entry => entry.assignmentId === assignment.id && entry.dayIndex === parsed.dayIndex && entry.period === parsed.period);
      if (alreadyAtStart) continue;
      if (!canOccupyBlock(assignment, parsed.dayIndex, parsed.period, blockSize, true)) {
        forcedConflicts.push(`${describeEntity(scenario.classes, assignment.classId)} · ${describeEntity(scenario.subjects, assignment.subjectId)} không thể giữ ô cố định ${TIMETABLE_DAYS[parsed.dayIndex] || parsed.dayIndex} tiết ${parsed.period}.`);
        continue;
      }
      placeBlock(assignment, parsed.dayIndex, parsed.period, blockSize, { locked: true, fixed: true }, `fixed-${assignment.id}-${index}`);
    }
  }

  const units: SchedulingUnit[] = [];
  for (const assignment of scenario.assignments) units.push(...splitAssignmentIntoUnits(assignment, placedByAssignment.get(assignment.id) || 0));

  const scarcity = (unit: SchedulingUnit): number => {
    const assignment = unit.assignment;
    const teacher = teacherById.get(assignment.teacherId);
    const classroom = classById.get(assignment.classId);
    const room = assignment.roomId ? roomById.get(assignment.roomId) : undefined;
    const hardSlots = (teacher?.unavailableSlots?.length || 0) + (classroom?.unavailableSlots?.length || 0) + (room?.unavailableSlots?.length || 0) + (assignment.forbiddenSlots?.length || 0);
    return unit.size * 30 + hardSlots * 4 + assignment.periodsPerWeek + (assignment.session && assignment.session !== 'any' ? 20 : 0) + (assignment.roomId ? 6 : 0);
  };

  const orderedUnits = shuffled(units, random).sort((a, b) => scarcity(b) - scarcity(a));
  const unscheduledCount = new Map<string, number>();
  let placementPenalty = 0;

  for (const unit of orderedUnits) {
    const assignment = unit.assignment;
    const teacher = teacherById.get(assignment.teacherId);
    const classroom = classById.get(assignment.classId);
    const subject = subjectById.get(assignment.subjectId);
    const available: CandidateStart[] = [];

    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      for (let period = 1; period <= scenario.periodsPerDay; period += 1) {
        if (!canOccupyBlock(assignment, dayIndex, period, unit.size)) continue;
        const slots = blockSlots(dayIndex, period, unit.size);
        let penalty = 0;
        const morningEnd = scenario.morningPeriods || Math.min(5, scenario.periodsPerDay);
        if (subject?.preferMorning && period > morningEnd) penalty += 28 + (period - morningEnd) * 5;
        if ((subject?.avoidLastPeriod || assignment.avoidLastPeriod) && period + unit.size - 1 === scenario.periodsPerDay) penalty += 22;
        if (assignment.preferredSlots?.length && !slots.some(slot => assignment.preferredSlots?.includes(slot))) penalty += 10;
        if (teacher?.preferredSlots?.length && !slots.some(slot => teacher.preferredSlots?.includes(slot))) penalty += 5;

        const assignmentDaily = assignmentDayCounts.get(`${assignment.id}:${dayIndex}`) || 0;
        penalty += assignmentDaily * 20;
        const sameSubjectToday = entries.filter(entry => entry.classId === assignment.classId && entry.subjectId === assignment.subjectId && entry.dayIndex === dayIndex).length;
        if (sameSubjectToday > 0) penalty += 24 * sameSubjectToday;

        const teacherPeriods = entries.filter(entry => entry.teacherId === assignment.teacherId && entry.dayIndex === dayIndex).map(entry => entry.period);
        if (teacherPeriods.length > 0) {
          const min = Math.min(...teacherPeriods);
          const max = Math.max(...teacherPeriods);
          if (period === min - unit.size || period === max + 1) penalty -= 6;
          else if (period > min && period <= max + 1) penalty -= 3;
          else penalty += Math.min(10, Math.abs(period - max));
        }

        const classLoad = dailyLoad(entries, 'classId', assignment.classId, dayIndex);
        const targetDaily = scenario.assignments.filter(item => item.classId === assignment.classId).reduce((sum, item) => sum + item.periodsPerWeek, 0) / days;
        penalty += Math.max(0, classLoad + unit.size - targetDaily) * 2;

        if (classroom?.level === 'Tiểu học' && (teacher?.homeroomClassId === classroom.id || classroom.homeroomTeacherId === teacher?.id)) {
          if (period <= 2) penalty -= 7;
          if (period > morningEnd) penalty += 5;
        }
        penalty += random() * 2.5;
        available.push({ dayIndex, period, penalty });
      }
    }

    available.sort((a, b) => a.penalty - b.penalty);
    const choice = available[0];
    if (!choice) {
      unscheduledCount.set(assignment.id, (unscheduledCount.get(assignment.id) || 0) + unit.size);
      continue;
    }
    const blockId = `auto-${assignment.id}-${unit.ordinal}-${choice.dayIndex}-${choice.period}`;
    placeBlock(assignment, choice.dayIndex, choice.period, unit.size, {}, blockId);
    placementPenalty += Math.max(0, choice.penalty);
  }

  const unscheduled: UnscheduledLesson[] = [...unscheduledCount.entries()].map(([assignmentId, remaining]) => {
    const assignment = assignmentById.get(assignmentId)!;
    return {
      assignmentId,
      remaining,
      reason: explainUnscheduled(scenario, assignment, Math.min(assignment.blockSize || 1, remaining)),
    };
  });
  const teacherGaps = countGaps(entries, 'teacherId');
  const classGaps = countGaps(entries, 'classId');
  const morningEnd = scenario.morningPeriods || Math.min(5, scenario.periodsPerDay);
  const lateCorePeriods = entries.filter(entry => subjectById.get(entry.subjectId)?.preferMorning && entry.period > morningEnd).length;

  let dailyImbalance = 0;
  for (const classroom of scenario.classes) {
    const loads = Array.from({ length: days }, (_, dayIndex) => dailyLoad(entries, 'classId', classroom.id, dayIndex));
    if (loads.length) dailyImbalance += Math.max(...loads) - Math.min(...loads);
  }

  const hardConflicts = [...forcedConflicts, ...validateEntries(scenario, entries)];
  const preflight = analyzeTimetableScenario(scenario);
  const warnings: string[] = [];
  if (teacherGaps > 0) warnings.push(`Còn ${teacherGaps} tiết trống xen kẽ trong lịch giáo viên.`);
  if (classGaps > 0) warnings.push(`Còn ${classGaps} khoảng trống trong lịch lớp.`);
  if (lateCorePeriods > 0) warnings.push(`Có ${lateCorePeriods} tiết môn ưu tiên buổi sáng đang nằm sau khung sáng.`);
  if (unscheduled.length > 0) warnings.push(`Còn ${unscheduled.reduce((sum, item) => sum + item.remaining, 0)} tiết chưa xếp được.`);
  if (preflight.length > 0) warnings.push(`Dữ liệu đầu vào có ${preflight.length} cảnh báo khả thi cần kiểm tra.`);

  const unscheduledTotal = unscheduled.reduce((sum, item) => sum + item.remaining, 0);
  const score = hardConflicts.length * 1_000_000 + unscheduledTotal * 100_000 + placementPenalty + teacherGaps * 14 + classGaps * 5 + lateCorePeriods * 18 + dailyImbalance * 3;
  const quality: TimetableQuality = { teacherGaps, classGaps, lateCorePeriods, dailyImbalance };

  return {
    entries: entries.sort((a, b) => a.dayIndex - b.dayIndex || a.period - b.period || a.classId.localeCompare(b.classId)),
    score: Math.round(score),
    diagnostics: { hardConflicts: [...new Set(hardConflicts)], warnings, unscheduled, teacherGaps, quality, preflight },
    generatedAt: new Date().toISOString(),
  };
}

export function optimizeTimetable(rawScenario: TimetableScenario, lockedEntries: ScheduleEntry[] = [], iterations = 120): TimetableSolution {
  const scenario = normalizeTimetableScenario(rawScenario);
  const safeIterations = Math.max(1, Math.min(800, Math.floor(iterations)));
  let best = buildCandidate(scenario, lockedEntries, 1);
  for (let index = 2; index <= safeIterations; index += 1) {
    const candidate = buildCandidate(scenario, lockedEntries, index * 104729);
    if (candidate.score < best.score) best = candidate;
    if (best.score === 0) break;
  }
  return best;
}

export function createDefaultTimetableScenario(): TimetableScenario {
  return normalizeTimetableScenario({
    name: 'Trường liên cấp Tiểu học & THCS',
    daysPerWeek: 5,
    periodsPerDay: 7,
    morningPeriods: 5,
    teachers: [
      { id: 'gv-cn1', name: 'Cô Lan', level: 'Tiểu học', homeroomClassId: '1a', maxPeriodsPerDay: 5, maxConsecutivePeriods: 4 },
      { id: 'gv-cn5', name: 'Thầy Minh', level: 'Tiểu học', homeroomClassId: '5a', maxPeriodsPerDay: 5, maxConsecutivePeriods: 4 },
      { id: 'gv-toan', name: 'Thầy Nam', level: 'THCS', maxPeriodsPerDay: 5, maxConsecutivePeriods: 4 },
      { id: 'gv-van', name: 'Cô Hương', level: 'THCS', maxPeriodsPerDay: 5, maxConsecutivePeriods: 4 },
      { id: 'gv-tin', name: 'Thầy Tuấn', level: 'Liên cấp', maxPeriodsPerDay: 5, maxConsecutivePeriods: 4 },
      { id: 'gv-anh', name: 'Cô Mai', level: 'Liên cấp', maxPeriodsPerDay: 5, maxConsecutivePeriods: 4 },
    ],
    classes: [
      { id: '1a', name: '1A', level: 'Tiểu học', homeroomTeacherId: 'gv-cn1', maxPeriodsPerDay: 7 },
      { id: '3a', name: '3A', level: 'Tiểu học', maxPeriodsPerDay: 7 },
      { id: '5a', name: '5A', level: 'Tiểu học', homeroomTeacherId: 'gv-cn5', maxPeriodsPerDay: 7 },
      { id: '6a', name: '6A', level: 'THCS', maxPeriodsPerDay: 7 },
      { id: '7a', name: '7A', level: 'THCS', maxPeriodsPerDay: 7 },
      { id: '9a', name: '9A', level: 'THCS', maxPeriodsPerDay: 7 },
    ],
    subjects: [
      { id: 'tv', name: 'Tiếng Việt', preferMorning: true },
      { id: 'toan', name: 'Toán', preferMorning: true },
      { id: 'van', name: 'Ngữ văn', preferMorning: true },
      { id: 'tin', name: 'Tin học' },
      { id: 'anh', name: 'Tiếng Anh', preferMorning: true },
      { id: 'shl', name: 'Sinh hoạt lớp', avoidLastPeriod: false },
    ],
    rooms: [
      { id: 'phong-tin', name: 'Phòng Tin học' },
      { id: 'phong-ngoai-ngu', name: 'Phòng Ngoại ngữ' },
    ],
    assignments: [
      { id: 'a1', classId: '1a', subjectId: 'tv', teacherId: 'gv-cn1', periodsPerWeek: 5, maxPerDay: 1, session: 'morning' },
      { id: 'a2', classId: '1a', subjectId: 'toan', teacherId: 'gv-cn1', periodsPerWeek: 4, maxPerDay: 1, session: 'morning' },
      { id: 'a3', classId: '5a', subjectId: 'toan', teacherId: 'gv-cn5', periodsPerWeek: 4, maxPerDay: 1 },
      { id: 'a4', classId: '5a', subjectId: 'tin', teacherId: 'gv-tin', roomId: 'phong-tin', periodsPerWeek: 2, maxPerDay: 2, blockSize: 2 },
      { id: 'a5', classId: '5a', subjectId: 'anh', teacherId: 'gv-anh', roomId: 'phong-ngoai-ngu', periodsPerWeek: 3, maxPerDay: 1 },
      { id: 'a6', classId: '6a', subjectId: 'toan', teacherId: 'gv-toan', periodsPerWeek: 4, maxPerDay: 1 },
      { id: 'a7', classId: '6a', subjectId: 'van', teacherId: 'gv-van', periodsPerWeek: 4, maxPerDay: 2, blockSize: 2 },
      { id: 'a8', classId: '6a', subjectId: 'tin', teacherId: 'gv-tin', roomId: 'phong-tin', periodsPerWeek: 2, maxPerDay: 2, blockSize: 2 },
      { id: 'a9', classId: '7a', subjectId: 'toan', teacherId: 'gv-toan', periodsPerWeek: 4, maxPerDay: 1 },
      { id: 'a10', classId: '7a', subjectId: 'anh', teacherId: 'gv-anh', roomId: 'phong-ngoai-ngu', periodsPerWeek: 3, maxPerDay: 1 },
      { id: 'a11', classId: '9a', subjectId: 'van', teacherId: 'gv-van', periodsPerWeek: 4, maxPerDay: 2, blockSize: 2 },
      { id: 'a12', classId: '9a', subjectId: 'tin', teacherId: 'gv-tin', roomId: 'phong-tin', periodsPerWeek: 2, maxPerDay: 2, blockSize: 2 },
      { id: 'a13', classId: '1a', subjectId: 'shl', teacherId: 'gv-cn1', periodsPerWeek: 1, maxPerDay: 1, fixedStartSlots: ['4:5'] },
    ],
  });
}
