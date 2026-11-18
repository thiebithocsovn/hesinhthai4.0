import type { ScheduleEntry, TeachingAssignment, TimetableScenario } from './smartTimetable';

type Participants = Pick<TeachingAssignment, 'classId' | 'teacherId' | 'additionalClassIds' | 'additionalTeacherIds' | 'studentGroupId' | 'additionalStudentGroupIds'>;
export const assignmentClassIds = (item: Participants): string[] => [...new Set([item.classId, ...(item.additionalClassIds || [])])];
export const assignmentTeacherIds = (item: Participants): string[] => [...new Set([item.teacherId, ...(item.additionalTeacherIds || [])])];
export const assignmentStudentGroupIds = (item: Pick<Participants, 'studentGroupId' | 'additionalStudentGroupIds'>): string[] => [...new Set([...(item.studentGroupId ? [item.studentGroupId] : []), ...(item.additionalStudentGroupIds || [])])];
export function classResourceAtoms(scenario: TimetableScenario, item: Participants): string[] {
  const selected = assignmentStudentGroupIds(item);
  if (selected.length) return selected.map(id => { const group = sGroup(scenario, id); return `${group?.classId || item.classId}#${id}`; });
  return assignmentClassIds(item).flatMap(id => {
    const groups = (scenario.studentGroups || []).filter(group => group.classId === id);
    return groups.length ? groups.map(group => `${id}#${group.id}`) : [id];
  });
}
const sGroup = (s: TimetableScenario, id: string) => (s.studentGroups || []).find(g => g.id === id);
export function assignmentCampus(scenario: TimetableScenario, item: Pick<TeachingAssignment, 'campusId' | 'roomId' | 'classId'>): string {
  return item.campusId || scenario.rooms.find(room => room.id === item.roomId)?.campusId || scenario.classes.find(classroom => classroom.id === item.classId)?.campusId || '';
}
export function assignmentStudentCount(scenario: TimetableScenario, item: Participants): number {
  const selected = assignmentStudentGroupIds(item);
  if (selected.length) return selected.reduce((sum, id) => sum + (sGroup(scenario, id)?.studentCount || 0), 0);
  return assignmentClassIds(item).reduce((sum, id) => sum + (scenario.classes.find(value => value.id === id)?.studentCount || 0), 0);
}
export function hasAdvancedTimetable(s: TimetableScenario): boolean {
  return Boolean(s.studentGroups?.length || s.lessonGroups?.length || s.campuses?.length || s.subjects.some(x => x.maxConcurrentClasses) || s.teachers.some(x => x.maxTeachingDays) || s.assignments.some(x => x.additionalClassIds?.length || x.additionalTeacherIds?.length || x.studentGroupId || x.additionalStudentGroupIds?.length || x.campusId) || s.rooms.some(x => x.capacity));
}
export function advancedScenarioIssues(s: TimetableScenario): string[] {
  const issues: string[] = [];
  const unique = (items: { id: string }[], label: string) => {
    const ids = items.map(item => item.id);
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) issues.push(`Mã ${label} trống hoặc trùng lặp.`);
  };
  for (const [name, values] of Object.entries({ teachers: s.teachers, classes: s.classes, subjects: s.subjects, rooms: s.rooms, assignments: s.assignments, campuses: s.campuses || [], studentGroups: s.studentGroups || [], lessonGroups: s.lessonGroups || [] })) unique(values, name);
  for (const item of [...s.rooms.map(x => ({ name: x.name, value: x.capacity })), ...s.classes.map(x => ({ name: x.name, value: x.studentCount })), ...(s.studentGroups || []).map(x => ({ name: x.name, value: x.studentCount })), ...s.subjects.map(x => ({ name: x.name, value: x.maxConcurrentClasses })), ...s.teachers.map(x => ({ name: x.name, value: x.maxTeachingDays }))]) if (item.value !== undefined && (!Number.isInteger(item.value) || item.value < 1)) issues.push(`${item.name}: số lượng/giới hạn phải là số nguyên dương.`);
  const campusIds = new Set((s.campuses || []).map(x => x.id));
  for (const item of [...s.classes, ...s.rooms, ...s.assignments]) if (item.campusId && !campusIds.has(item.campusId)) issues.push(`Cơ sở không tồn tại: ${item.campusId}.`);
  for (const group of s.studentGroups || []) if (!s.classes.some(x => x.id === group.classId)) issues.push(`Nhóm ${group.name} tham chiếu lớp không tồn tại.`);
  for (const classroom of s.classes) {
    const groups = (s.studentGroups || []).filter(x => x.classId === classroom.id);
    if (groups.length === 1) issues.push(`Lớp ${classroom.name}: cần ít nhất hai nhóm khi tách lớp.`);
    if (groups.length && classroom.studentCount && groups.every(x => x.studentCount) && groups.reduce((sum, x) => sum + (x.studentCount || 0), 0) !== classroom.studentCount) issues.push(`Lớp ${classroom.name}: tổng sĩ số nhóm khác sĩ số lớp.`);
  }
  for (const a of s.assignments) {
    if (!Number.isInteger(a.periodsPerWeek) || a.periodsPerWeek < 1) issues.push(`Phân công ${a.id}: số tiết/tuần phải là số nguyên dương.`);
    if (assignmentClassIds(a).some(id => !s.classes.some(x => x.id === id))) issues.push(`Phân công ${a.id}: lớp ghép không tồn tại.`);
    if (assignmentTeacherIds(a).some(id => !s.teachers.some(x => x.id === id))) issues.push(`Phân công ${a.id}: giáo viên đồng giảng không tồn tại.`);
    const groupIds = assignmentStudentGroupIds(a), owners = new Set(groupIds.map(id => sGroup(s, id)?.classId));
    if (groupIds.length && (owners.has(undefined) || assignmentClassIds(a).some(id => !owners.has(id)) || [...owners].some(id => !assignmentClassIds(a).includes(id!)))) issues.push(`Phân công ${a.id}: mọi nhóm ghép phải thuộc đúng các lớp tham gia.`);
    const room = s.rooms.find(x => x.id === a.roomId);
    if (room?.campusId && a.campusId && room.campusId !== a.campusId) issues.push(`Phân công ${a.id}: phòng thuộc cơ sở khác với cơ sở được chọn.`);
    if (room?.capacity && assignmentStudentCount(s, a) > room.capacity) issues.push(`Phòng ${room.name} thiếu chỗ cho phân công ${a.id}.`);
  }
  const membership = new Map<string, string>();
  for (const group of s.lessonGroups || []) {
    if (!['parallel', 'same-session'].includes(group.kind)) issues.push(`Nhóm ${group.name}: loại ràng buộc không hợp lệ.`);
    const ids = [...new Set(group.assignmentIds || [])];
    const assignments = ids.map(id => s.assignments.find(x => x.id === id));
    if (ids.length < 2 || assignments.some(x => !x)) { issues.push(`Nhóm ${group.name}: cần ít nhất hai phân công tồn tại.`); continue; }
    const count = assignments.map(a => Math.ceil(a!.periodsPerWeek / (a!.blockSize || 1)));
    if (new Set(count).size !== 1) issues.push(`Nhóm ${group.name}: số buổi học của các phân công phải bằng nhau.`);
    for (const id of ids) {
      const key = `${group.kind}:${id}`;
      if (membership.has(key)) issues.push(`Phân công ${id} thuộc nhiều nhóm ${group.kind}; hãy gộp các nhóm này.`);
      membership.set(key, group.id);
    }
    if (group.kind === 'parallel' && new Set(assignments.map(x => `${x!.periodsPerWeek}:${x!.blockSize || 1}`)).size !== 1) issues.push(`Nhóm ${group.name}: lịch song song phải có cùng số tiết và độ dài block.`);
  }
  return [...new Set(issues)];
}

export function timetableMetrics(s: TimetableScenario, entries: ScheduleEntry[]) {
  const groups = (kind: 'teacher' | 'class') => {
    const map = new Map<string, Set<number>>();
    for (const e of entries) for (const id of kind === 'teacher' ? assignmentTeacherIds(e) : assignmentClassIds(e)) {
      const key = `${id}:${e.dayIndex}`; const periods = map.get(key) || new Set<number>(); periods.add(e.period); map.set(key, periods);
    }
    return map;
  };
  const gaps = (map: Map<string, Set<number>>) => [...map.values()].reduce((sum, values) => sum + Math.max(...values) - Math.min(...values) + 1 - values.size, 0);
  const teacherGaps = gaps(groups('teacher')), classMap = groups('class'), classGaps = gaps(classMap);
  const lateCorePeriods = entries.filter(e => s.subjects.find(x => x.id === e.subjectId)?.preferMorning && e.period > (s.morningPeriods || 5)).length;
  const dailyImbalance = s.classes.reduce((sum, x) => { const loads = Array.from({ length: s.daysPerWeek === 6 ? 6 : 5 }, (_, d) => classMap.get(`${x.id}:${d}`)?.size || 0); return sum + Math.max(...loads) - Math.min(...loads); }, 0);
  return { teacherGaps, classGaps, lateCorePeriods, dailyImbalance };
}
