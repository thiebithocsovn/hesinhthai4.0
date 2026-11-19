import { classDailyLimit, classPeriodInterval, educationScenarioIssues, entryInterval, entryTimeAtoms, normalBreak, scenarioForTeachingWeek, sessionForPeriod, teachingGap, travelMinimum } from './timetableEducation.js';
import {
  activeTimetableDays,
  normalizeTimetableScenario,
  parseTimetableSlot,
  timetableSlotKey,
  type ScheduleEntry,
  type TimetableScenario,
  type TimetableSolution,
} from './smartTimetable.js';
import { assignmentCampus, assignmentClassIds, assignmentStudentCount, assignmentStudentGroupIds, assignmentTeacherIds, classResourceAtoms } from './smartTimetableResources.js';

import { week12PlacementProblems, week12SoftWarnings } from './timetableWeek12';

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
  const normalized = normalizeTimetableScenario(raw);
  const scenario = scenarioForTeachingWeek(normalized);
  const entries = solution?.entries || [];
  const errors: string[] = educationScenarioIssues(normalized);
  if (scenario.education && solution && solution.teachingWeek !== scenario.education.activeWeek) errors.push('Phương án thuộc tuần khác hoặc thiếu tuần học. Hãy xếp lại tuần đang chọn.');
  const warnings: string[] = [];
  for (const [name, values] of Object.entries({ teachers: scenario.teachers, classes: scenario.classes, subjects: scenario.subjects, rooms: scenario.rooms, assignments: scenario.assignments, campuses: scenario.campuses || [], studentGroups: scenario.studentGroups || [], lessonGroups: scenario.lessonGroups || [] })) if (new Set(values.map(x => x.id)).size !== values.length) errors.push('Mã đối tượng bị trùng trong ' + name + '.');
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
  const dailySeen = new Set<string>();

  const reserve = (kind: string, id: string, entry: ScheduleEntry) => {
    for (const atom of entryTimeAtoms(scenario, entry)) {
      const key = kind + ':' + id + ':' + entry.dayIndex + ':' + atom;
      if (occupancy.has(key)) errors.push('Trùng ' + kind + ' ' + id + ' tại ' + activeTimetableDays(scenario)[entry.dayIndex] + ' tiết ' + entry.period + '.');
      occupancy.set(key, entry.id);
    }
  };
  const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) || 0) + 1);
  const countResource = (map: Map<string, number>, kind: string, id: string, entry: ScheduleEntry) => {
    const key = `${kind}:${id}:${entry.dayIndex}:${entryInterval(scenario, entry).start}`;
    if (!dailySeen.has(key)) { dailySeen.add(key); count(map, `${id}:${entry.dayIndex}`); }
  };

  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push('Mã tiết trùng: ' + entry.id + '.');
    ids.add(entry.id);
    const assignment = assignments.get(entry.assignmentId);
    if (!assignment) { errors.push('Tiết ' + entry.id + ' có phân công không tồn tại.'); continue; }
    if (entry.classId !== assignment.classId || entry.teacherId !== assignment.teacherId ||
      entry.subjectId !== assignment.subjectId || (entry.roomId || '') !== (assignment.roomId || '')) {
      errors.push('Tiết ' + entry.id + ' không khớp giáo viên/lớp/môn/phòng của phân công ' + assignment.id + '.');
    }
    const equalIds = (a: string[], b: string[]) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
    if (!equalIds(assignmentClassIds(entry), assignmentClassIds(assignment)) || !equalIds(assignmentTeacherIds(entry), assignmentTeacherIds(assignment)) || !equalIds(assignmentStudentGroupIds(entry), assignmentStudentGroupIds(assignment))) errors.push('Tiết ' + entry.id + ' không khớp lớp ghép, đồng giảng hoặc nhóm học.');
    if ((entry.campusId || '') !== assignmentCampus(scenario, assignment) && (entry.campusId || assignmentCampus(scenario, assignment))) errors.push('Tiết ' + entry.id + ' không khớp cơ sở của phân công.');
    if (assignmentClassIds(assignment).some(id => !classes.has(id)) || assignmentTeacherIds(assignment).some(id => !teachers.has(id))) errors.push('Phân công ' + assignment.id + ' tham chiếu lớp/giáo viên không tồn tại.');
    const selectedGroups = assignmentStudentGroupIds(assignment), owners = new Set(selectedGroups.map(id => scenario.studentGroups?.find(g => g.id === id)?.classId));
    if (selectedGroups.length && (owners.has(undefined) || assignmentClassIds(assignment).some(id => !owners.has(id)) || [...owners].some(id => !assignmentClassIds(assignment).includes(id!)))) errors.push('Nhóm học không thuộc đúng các lớp: ' + assignment.id + '.');
    if (!classes.has(entry.classId) || !teachers.has(entry.teacherId) || (entry.roomId && !rooms.has(entry.roomId))) {
      errors.push('Tiết ' + entry.id + ' tham chiếu tài nguyên không tồn tại.');
    }
    if (!Number.isInteger(entry.dayIndex) || entry.dayIndex < 0 || entry.dayIndex >= days ||
      !Number.isInteger(entry.period) || entry.period < 1 || entry.period > scenario.periodsPerDay) {
      errors.push('Tiết ' + entry.id + ' vượt ngoài khung học.');
      continue;
    }
    const time = entryInterval(scenario, entry);
    if (!entryTimeAtoms(scenario, entry).length) errors.push('Khung giờ không hợp lệ: ' + entry.id + '.');
    for (const id of assignmentClassIds(assignment)) {
      const level = classes.get(id)?.level;
      if (level) { const other = classPeriodInterval(scenario, level, entry.period); if (other.start !== time.start || other.end !== time.end) errors.push('Lớp ghép khác giờ thực tế: ' + entry.id + '.'); }
    }
    const slot = timetableSlotKey(entry.dayIndex, entry.period);
    for (const id of classResourceAtoms(scenario, assignment)) reserve('lớp', id, entry);
    for (const id of assignmentTeacherIds(assignment)) reserve('giáo viên', id, entry);
    if (entry.roomId) reserve('phòng', entry.roomId, entry);
    for (const id of assignmentTeacherIds(assignment)) if (teachers.get(id)?.unavailableSlots?.includes(slot)) errors.push('Giáo viên ' + id + ' bị xếp vào giờ bận ' + slot + '.');
    for (const id of assignmentClassIds(assignment)) if (classes.get(id)?.unavailableSlots?.includes(slot)) errors.push('Lớp ' + id + ' bị xếp vào giờ nghỉ ' + slot + '.');
    if (entry.roomId && rooms.get(entry.roomId)?.unavailableSlots?.includes(slot)) errors.push('Phòng ' + entry.roomId + ' bị xếp vào giờ bận ' + slot + '.');
    if (assignment.forbiddenSlots?.includes(slot)) errors.push('Phân công ' + assignment.id + ' bị xếp vào tiết cấm ' + slot + '.');
    if (assignment.session && assignment.session !== 'any' && sessionForPeriod(scenario, entry.period) !== assignment.session) errors.push('Phân công ' + assignment.id + ' bị xếp sai buổi học đã khai báo.');
    for (const id of assignmentClassIds(assignment)) countResource(dailyClass, 'class', id, entry);
    for (const id of assignmentTeacherIds(assignment)) countResource(dailyTeacher, 'teacher', id, entry);
    count(dailyAssignment, entry.assignmentId + ':' + entry.dayIndex);
    for (const id of assignmentTeacherIds(assignment)) { const teacherDayKey = id + ':' + entry.dayIndex; periodByTeacherDay.set(teacherDayKey, [...(periodByTeacherDay.get(teacherDayKey) || []), entry.period]); }
    const room = rooms.get(assignment.roomId || '');
    if (room?.capacity && assignmentStudentCount(scenario, assignment) > room.capacity) errors.push('Phòng ' + room.name + ' không đủ chỗ cho phân công ' + assignment.id + '.');
    byAssignment.set(entry.assignmentId, [...(byAssignment.get(entry.assignmentId) || []), entry]);
  }

  for (const assignment of scenario.assignments) {
    const placed = byAssignment.get(assignment.id) || [];
    if (!Number.isInteger(assignment.periodsPerWeek) || assignment.periodsPerWeek < 1 || !scenario.subjects.some(subject => subject.id === assignment.subjectId)) errors.push('Số tiết hoặc môn học không hợp lệ: ' + assignment.id + '.');
    const assignedRoom = rooms.get(assignment.roomId || '');
    if (assignedRoom?.campusId && assignment.campusId && assignedRoom.campusId !== assignment.campusId) errors.push('Phòng và phân công khác cơ sở: ' + assignment.id + '.');
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
        if ((assignment.blockSize || 1) > 1) errors.push('Tiết ' + entry.id + ' thiếu mã block để xác minh tiết đôi.');
      }
      groups.set(entry.blockId || entry.id, [...(groups.get(entry.blockId || entry.id) || []), entry]);
    }
    const expectedBlock = assignment.blockSize || 1;
    const lengths = [...groups.values()].map(group => group.length).sort((a, b) => a - b);
    const requiredLengths = Array.from({ length: Math.ceil(assignment.periodsPerWeek / expectedBlock) }, (_, i) => Math.min(expectedBlock, assignment.periodsPerWeek - i * expectedBlock)).sort((a, b) => a - b);
    if (JSON.stringify(lengths) !== JSON.stringify(requiredLengths)) errors.push('Số lượng hoặc độ dài block không khớp: ' + assignment.id + '.');
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
      if (sessionForPeriod(scenario, ordered[0].period) !== sessionForPeriod(scenario, ordered[ordered.length - 1].period)) errors.push('Block ' + ordered[0].blockId + ' vượt qua ranh giới buổi học.');
    }
  }

  for (const teacher of scenario.teachers) {
    const actualDays = new Set(entries.filter(entry => assignmentTeacherIds(assignments.get(entry.assignmentId) || entry).includes(teacher.id)).map(entry => entry.dayIndex));
    if (teacher.maxTeachingDays && actualDays.size > teacher.maxTeachingDays) errors.push('Giáo viên ' + teacher.name + ' vượt số ngày dạy tối đa.');
    for (let day = 0; day < days; day++) {
      const countForDay = dailyTeacher.get(teacher.id + ':' + day) || 0;
      if (teacher.maxPeriodsPerDay && countForDay > teacher.maxPeriodsPerDay) errors.push('Giáo viên ' + teacher.name + ' vượt tối đa/ngày.');
      if (scenario.education && teacher.maxConsecutivePeriods) {
        const intervals = entries.filter(e => e.dayIndex === day && assignmentTeacherIds(e).includes(teacher.id)).map(e => entryInterval(scenario, e)).sort((a,b) => a.start - b.start);
        let run = 0, lastEnd = -100;
        for (const interval of intervals) { run = interval.start - lastEnd <= normalBreak(scenario) ? run + 1 : 1; if (run > teacher.maxConsecutivePeriods) errors.push('Giáo viên ' + teacher.name + ' vượt số tiết liên tục theo giờ thực tế.'); lastEnd = interval.end; }
      }
      const periods = [...new Set(periodByTeacherDay.get(teacher.id + ':' + day) || [])].sort((a, b) => a - b);
      let streak = 0, previous = -99;
      for (const period of scenario.education ? [] : periods) {
        streak = period === previous + 1 ? streak + 1 : 1;
        if (teacher.maxConsecutivePeriods && streak > teacher.maxConsecutivePeriods) {
          errors.push('Giáo viên ' + teacher.name + ' vượt số tiết liên tục tại thứ ' + (day + 2) + '.');
          break;
        }
        previous = period;
      }
    }
  }

  const subjectSlots = new Map<string, Set<string>>();
  const resourceLocations = new Map<string, { entry: ScheduleEntry; campus: string }[]>();
  for (const entry of entries) {
    const assignment = assignments.get(entry.assignmentId); if (!assignment) continue;
    for (const atom of entryTimeAtoms(scenario, entry)) {
      const subjectKey = `${entry.subjectId}:${entry.dayIndex}:${atom}`, involvedClasses = subjectSlots.get(subjectKey) || new Set<string>();
      assignmentClassIds(assignment).forEach(id => involvedClasses.add(id)); subjectSlots.set(subjectKey, involvedClasses);
    }
    const campus = assignmentCampus(scenario, assignment);
    for (const id of [...assignmentTeacherIds(assignment).map(id => `GV:${id}`), ...classResourceAtoms(scenario, assignment).map(id => `Lớp:${id}`)]) {
      const resourceKey = `${id}:${entry.dayIndex}`;
      const previous = resourceLocations.get(resourceKey) || [];
      for (const other of previous) if (campus && other.campus && campus !== other.campus && teachingGap(scenario, other.entry, entry) < travelMinimum(scenario)) errors.push('Không đủ thời gian chuyển cơ sở: ' + id + '.');
      previous.push({ entry, campus }); resourceLocations.set(resourceKey, previous);
    }
  }
  for (const subject of scenario.subjects) if (subject.maxConcurrentClasses) {
    for (const [key, ids] of subjectSlots) if (key.startsWith(subject.id + ':') && ids.size > subject.maxConcurrentClasses) errors.push('Môn ' + subject.name + ' vượt số lớp đồng thời tại ' + key.slice(subject.id.length + 1) + '.');
  }
  for (const group of scenario.lessonGroups || []) {
    const members = group.assignmentIds.map(id => assignments.get(id));
    if (members.length < 2 || members.some(item => !item)) { errors.push('Nhóm ràng buộc ' + group.name + ' thiếu phân công.'); continue; }
    const meetingCounts = members.map(a => Math.ceil(a!.periodsPerWeek / (a!.blockSize || 1)));
    if (new Set(meetingCounts).size !== 1) errors.push('Nhóm ' + group.name + ' có số buổi không bằng nhau.');
    for (let index = 0; index < Math.max(...meetingCounts); index++) {
      const signatures: string[] = [];
      for (const member of members) {
        const meeting = (byAssignment.get(member!.id) || []).filter(e => e.meetingIndex === index).sort((a, b) => a.period - b.period);
        if (!meeting.length) { errors.push('Thiếu buổi ' + (index + 1) + ' của nhóm ' + group.name + '.'); continue; }
        if (group.kind === 'parallel') signatures.push(meeting.map(e => `${e.dayIndex}:${entryInterval(scenario, e).start}:${entryInterval(scenario, e).end}`).join('|'));
        else signatures.push(meeting.map(e => `${e.dayIndex}:${sessionForPeriod(scenario, e.period)}`).filter((x, i, list) => list.indexOf(x) === i).join('|'));
      }
      if (new Set(signatures).size > 1 || (group.kind === 'same-session' && signatures.some(x => x.includes('|')))) errors.push('Nhóm ' + group.name + ' không thỏa ' + (group.kind === 'parallel' ? 'học song song' : 'học cùng buổi') + '.');
    }
  }
  for (const classroom of scenario.classes) {
    for (let day = 0; day < days; day++) {
      const countForDay = dailyClass.get(classroom.id + ':' + day) || 0;
      if (classDailyLimit(scenario, classroom) && countForDay > classDailyLimit(scenario, classroom)!) errors.push('Lớp ' + classroom.name + ' vượt số tiết tối đa/ngày.');
    }
  }

  errors.push(...week12PlacementProblems(scenario, [], entries));
  warnings.push(...week12SoftWarnings(scenario, entries));
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
