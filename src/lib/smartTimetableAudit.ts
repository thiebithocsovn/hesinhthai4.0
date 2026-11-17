import {
  activeTimetableDays,
  normalizeTimetableScenario,
  parseTimetableSlot,
  timetableSlotKey,
  type ScheduleEntry,
  type TimetableScenario,
  type TimetableSolution,
} from './smartTimetable';

export interface TimetableAuditReport {
  expectedPeriods: number;
  placedPeriods: number;
  complete: boolean;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Independent audit of an output timetable (not a call into the solver's own validator). */
export function auditTimetableSolution(raw: TimetableScenario, solution: TimetableSolution | null): TimetableAuditReport {
  const scenario = normalizeTimetableScenario(raw);
  const entries = solution?.entries || [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const days = activeTimetableDays(scenario).length;
  const assignments = new Map(scenario.assignments.map(item => [item.id, item]));
  const teachers = new Map(scenario.teachers.map(item => [item.id, item]));
  const classes = new Map(scenario.classes.map(item => [item.id, item]));
  const rooms = new Map(scenario.rooms.map(item => [item.id, item]));
  const occupancy = new Map<string, string>();
  const byAssignment = new Map<string, ScheduleEntry[]>();
  const dailyClass = new Map<string, number>();
  const dailyTeacher = new Map<string, number>();
  const dailyAssignment = new Map<string, number>();
  const periodByTeacherDay = new Map<string, number[]>();
  const ids = new Set<string>();
  const morningEnd = scenario.morningPeriods || Math.min(5, scenario.periodsPerDay);

  const reserve = (kind: string, id: string, entry: ScheduleEntry) => {
    const key = kind + ':' + id + ':' + entry.dayIndex + ':' + entry.period;
    if (occupancy.has(key)) errors.push('Trùng ' + kind + ' ' + id + ' tại thứ ' + (entry.dayIndex + 2) + ' tiết ' + entry.period + '.');
    occupancy.set(key, entry.id);
  };
  const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) || 0) + 1);

  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push('Mã tiết trùng: ' + entry.id + '.');
    ids.add(entry.id);
    const assignment = assignments.get(entry.assignmentId);
    if (!assignment) { errors.push('Tiết ' + entry.id + ' có phân công không tồn tại.'); continue; }
    if (entry.classId !== assignment.classId || entry.teacherId !== assignment.teacherId ||
      entry.subjectId !== assignment.subjectId || (entry.roomId || '') !== (assignment.roomId || '')) {
      errors.push('Tiết ' + entry.id + ' không khớp giáo viên/lớp/môn/phòng của phân công ' + assignment.id + '.');
    }
    if (!classes.has(entry.classId) || !teachers.has(entry.teacherId) || (entry.roomId && !rooms.has(entry.roomId))) {
      errors.push('Tiết ' + entry.id + ' tham chiếu tài nguyên không tồn tại.');
    }
    if (!Number.isInteger(entry.dayIndex) || entry.dayIndex < 0 || entry.dayIndex >= days ||
      !Number.isInteger(entry.period) || entry.period < 1 || entry.period > scenario.periodsPerDay) {
      errors.push('Tiết ' + entry.id + ' vượt ngoài khung học.');
      continue;
    }
    const slot = timetableSlotKey(entry.dayIndex, entry.period);
    reserve('lớp', entry.classId, entry);
    reserve('giáo viên', entry.teacherId, entry);
    if (entry.roomId) reserve('phòng', entry.roomId, entry);
    if (teachers.get(entry.teacherId)?.unavailableSlots?.includes(slot)) errors.push('Giáo viên ' + entry.teacherId + ' bị xếp vào giờ bận ' + slot + '.');
    if (classes.get(entry.classId)?.unavailableSlots?.includes(slot)) errors.push('Lớp ' + entry.classId + ' bị xếp vào giờ nghỉ ' + slot + '.');
    if (entry.roomId && rooms.get(entry.roomId)?.unavailableSlots?.includes(slot)) errors.push('Phòng ' + entry.roomId + ' bị xếp vào giờ bận ' + slot + '.');
    if (assignment.forbiddenSlots?.includes(slot)) errors.push('Phân công ' + assignment.id + ' bị xếp vào tiết cấm ' + slot + '.');
    if (assignment.session === 'morning' && entry.period > morningEnd) errors.push('Phân công ' + assignment.id + ' chỉ học sáng nhưng nằm ở chiều.');
    if (assignment.session === 'afternoon' && entry.period <= morningEnd) errors.push('Phân công ' + assignment.id + ' chỉ học chiều nhưng nằm ở sáng.');
    count(dailyClass, entry.classId + ':' + entry.dayIndex);
    count(dailyTeacher, entry.teacherId + ':' + entry.dayIndex);
    count(dailyAssignment, entry.assignmentId + ':' + entry.dayIndex);
    const teacherDayKey = entry.teacherId + ':' + entry.dayIndex;
    periodByTeacherDay.set(teacherDayKey, [...(periodByTeacherDay.get(teacherDayKey) || []), entry.period]);
    byAssignment.set(entry.assignmentId, [...(byAssignment.get(entry.assignmentId) || []), entry]);
  }

  for (const assignment of scenario.assignments) {
    const placed = byAssignment.get(assignment.id) || [];
    if (placed.length !== assignment.periodsPerWeek) errors.push('Phân công ' + assignment.id + ': yêu cầu ' + assignment.periodsPerWeek + ' tiết, đã xếp ' + placed.length + '.');
    for (const slot of assignment.fixedStartSlots || []) {
      const start = parseTimetableSlot(slot);
      if (!start) { errors.push('Ô cố định không hợp lệ: ' + assignment.id + ' / ' + slot + '.'); continue; }
      for (let offset = 0; offset < (assignment.blockSize || 1); offset++) {
        if (!placed.some(item => item.dayIndex === start.dayIndex && item.period === start.period + offset)) {
          errors.push('Thiếu tiết cố định của ' + assignment.id + ' tại ' + slot + ', vị trí ' + (offset + 1) + '.');
        }
      }
    }
    for (let day = 0; day < days; day++) {
      const actual = dailyAssignment.get(assignment.id + ':' + day) || 0;
      if (actual > (assignment.maxPerDay || 1)) errors.push('Phân công ' + assignment.id + ' vượt số tiết tối đa/ngày ở thứ ' + (day + 2) + '.');
    }

    const groups = new Map<string, ScheduleEntry[]>();
    for (const entry of placed) {
      if (!entry.blockId) {
        if ((assignment.blockSize || 1) > 1) warnings.push('Tiết ' + entry.id + ' thiếu mã block để xác minh tiết đôi.');
        continue;
      }
      groups.set(entry.blockId, [...(groups.get(entry.blockId) || []), entry]);
    }
    for (const group of groups.values()) {
      const ordered = [...group].sort((a, b) => a.period - b.period);
      const expectedMax = assignment.blockSize || 1;
      if (ordered.length > expectedMax || (ordered.length < expectedMax && assignment.periodsPerWeek % expectedMax === 0)) {
        errors.push('Block ' + ordered[0].blockId + ' không đủ/đúng độ dài theo phân công ' + assignment.id + '.');
      }
      if (ordered.some(item => item.dayIndex !== ordered[0].dayIndex)) errors.push('Block ' + ordered[0].blockId + ' nằm trên nhiều ngày.');
      for (let i = 1; i < ordered.length; i++) {
        if (ordered[i].period !== ordered[i - 1].period + 1) errors.push('Block ' + ordered[0].blockId + ' không liên tiếp.');
      }
      if (ordered[0].period <= morningEnd && ordered[ordered.length - 1].period > morningEnd) errors.push('Block ' + ordered[0].blockId + ' vượt qua ranh giới sáng/chiều.');
    }
  }

  for (const teacher of scenario.teachers) {
    for (let day = 0; day < days; day++) {
      const countForDay = dailyTeacher.get(teacher.id + ':' + day) || 0;
      if (teacher.maxPeriodsPerDay && countForDay > teacher.maxPeriodsPerDay) errors.push('Giáo viên ' + teacher.name + ' vượt tối đa/ngày.');
      const periods = [...new Set(periodByTeacherDay.get(teacher.id + ':' + day) || [])].sort((a, b) => a - b);
      let streak = 0, previous = -99;
      for (const period of periods) {
        streak = period === previous + 1 ? streak + 1 : 1;
        if (teacher.maxConsecutivePeriods && streak > teacher.maxConsecutivePeriods) {
          errors.push('Giáo viên ' + teacher.name + ' vượt số tiết liên tục tại thứ ' + (day + 2) + '.');
          break;
        }
        previous = period;
      }
    }
  }
  for (const classroom of scenario.classes) {
    for (let day = 0; day < days; day++) {
      const countForDay = dailyClass.get(classroom.id + ':' + day) || 0;
      if (classroom.maxPeriodsPerDay && countForDay > classroom.maxPeriodsPerDay) errors.push('Lớp ' + classroom.name + ' vượt số tiết tối đa/ngày.');
    }
  }

  const expectedPeriods = scenario.assignments.reduce((sum, item) => sum + item.periodsPerWeek, 0);
  const uniqueErrors = [...new Set(errors)];
  return {
    expectedPeriods,
    placedPeriods: entries.length,
    complete: entries.length === expectedPeriods && !scenario.assignments.some(item => (byAssignment.get(item.id)?.length || 0) !== item.periodsPerWeek),
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    warnings: [...new Set(warnings)],
  };
}
