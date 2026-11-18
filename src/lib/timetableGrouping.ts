import type { TeachingAssignment, TimetableScenario } from './smartTimetable';
import { assignmentClassIds, assignmentStudentGroupIds, assignmentTeacherIds } from './smartTimetableResources';

export function mergeTimetableAssignments(s: TimetableScenario, ids: string[], roomId: string): TimetableScenario {
  const selected = [...new Set(ids)].map(id => s.assignments.find(a => a.id === id));
  if (selected.length < 2 || selected.some(x => !x)) throw new Error('Chọn ít nhất hai phân công tồn tại.');
  const items = selected as TeachingAssignment[], first = items[0];
  const selectedGroups = items.flatMap(assignmentStudentGroupIds);
  const groupsOnly = items.every(a => assignmentStudentGroupIds(a).length > 0);
  if (selectedGroups.length && !groupsOnly) throw new Error('Chọn ghép toàn bộ lớp hoặc ghép các nhóm học; không trộn hai chế độ.');
  if (new Set(selectedGroups).size !== selectedGroups.length) throw new Error('Các phân công có nhóm học trùng nhau.');
  if (new Set(items.map(a => `${a.subjectId}:${a.periodsPerWeek}:${a.blockSize || 1}`)).size !== 1) throw new Error('Chỉ ghép các phân công cùng môn, số tiết/tuần và độ dài block.');
  if (new Set(items.map(a => JSON.stringify([a.startWeek ?? 1, a.endWeek ?? s.education?.weekCount, a.weekPattern || 'all', a.component || 'theory', a.courseSectionCode || '']))).size > 1) throw new Error('Chỉ ghép các phân công có cùng khoảng tuần, tuần chẵn/lẻ, hình thức và mã lớp học phần.');
  const classes = items.flatMap(assignmentClassIds);
  if (!groupsOnly && new Set(classes).size !== classes.length) throw new Error('Các phân công đã có lớp trùng nhau.');
  if ((s.lessonGroups || []).some(g => g.assignmentIds.some(id => ids.includes(id)))) throw new Error('Gỡ các nhóm song song/cùng buổi liên quan trước khi ghép.');
  const fixed = items.map(a => JSON.stringify(a.fixedStartSlots || []));
  if (new Set(fixed).size > 1) throw new Error('Các phân công phải có cùng các ô cố định.');
  const sessions = [...new Set(items.map(a => a.session || 'any').filter(x => x !== 'any'))];
  if (sessions.length > 1) throw new Error('Không thể ghép phân công chỉ học sáng với phân công chỉ học chiều.');
  const campuses = [...new Set(items.map(a => a.campusId).filter(Boolean))];
  if (campuses.length > 1) throw new Error('Chọn cùng cơ sở cho các phân công trước khi ghép.');
  const teachers = [...new Set(items.flatMap(assignmentTeacherIds))];
  const merged: TeachingAssignment = { ...first, additionalClassIds: [...new Set(classes)].filter(id => id !== first.classId),
    studentGroupId: selectedGroups[0], additionalStudentGroupIds: selectedGroups.slice(1), additionalTeacherIds: teachers.filter(id => id !== first.teacherId), roomId: roomId || undefined, campusId: campuses[0] || undefined, session: sessions[0] || 'any', avoidLastPeriod: items.some(a => a.avoidLastPeriod),
    preferredSlots: [...new Set(items.flatMap(a => a.preferredSlots || []))],
    forbiddenSlots: [...new Set(items.flatMap(a => a.forbiddenSlots || []))], maxPerDay: Math.min(...items.map(a => a.maxPerDay || a.blockSize || 1)),
  };
  return { ...s, assignments: s.assignments.filter(a => !ids.includes(a.id) || a.id === first.id).map(a => a.id === first.id ? merged : a) };
}

export function unmergeTimetableAssignment(s: TimetableScenario, id: string): TimetableScenario {
  const assignment = s.assignments.find(a => a.id === id);
  if (!assignment || !assignment.additionalClassIds?.length && !assignment.additionalStudentGroupIds?.length) return s;
  if ((s.lessonGroups || []).some(g => g.assignmentIds.includes(id))) throw new Error('Gỡ nhóm ràng buộc trước khi tách phân công ghép.');
  const groups = assignmentStudentGroupIds(assignment);
  const partitions = groups.length ? groups.map(id => ({ classId: s.studentGroups!.find(g => g.id === id)!.classId, studentGroupId: id })) : assignmentClassIds(assignment).map(classId => ({ classId, studentGroupId: undefined }));
  const separated = partitions.map((part, i) => ({ ...assignment, ...part, id: i === 0 ? assignment.id : `${assignment.id}-part-${i}`, additionalClassIds: [], additionalStudentGroupIds: [] }));
  if (separated.some(a => s.assignments.some(existing => existing.id === a.id && existing.id !== id))) throw new Error('Mã phân công tách bị trùng.');
  return { ...s, assignments: [...s.assignments.filter(a => a.id !== id), ...separated] };
}
