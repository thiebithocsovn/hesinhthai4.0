import { auditTimetableSolution } from './smartTimetableAudit';
import { activeTimetableDays, analyzeTimetableScenario, type TimetableClass, type TimetableGrade, type TimetableScenario, type TimetableSolution } from './smartTimetable';
import { assignmentCampus, timetableMetrics } from './smartTimetableResources';
import { scenarioForTeachingWeek, sessionForPeriod } from './timetableEducation';

export function classGradeId(classroom: TimetableClass | undefined): string {
  if (!classroom) return '';
  return classroom.gradeId || `grade-${classroom.level}-${classroom.name.match(/^\s*(\d{1,2})/)?.[1] || 'other'}`;
}

/** Infer grades for old backups without changing the scenario schema version. */
export function timetableGrades(scenario: TimetableScenario): TimetableGrade[] {
  const grades = new Map((scenario.grades || []).map(grade => [grade.id, grade]));
  for (const classroom of scenario.classes) {
    const id = classGradeId(classroom);
    if (!grades.has(id)) {
      const number = classroom.name.match(/^\s*(\d{1,2})/)?.[1];
      grades.set(id, { id, name: number ? `Khối ${number}` : 'Chưa phân khối', level: classroom.level });
    }
  }
  return [...grades.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
}

export function setHomeroomTeacher(scenario: TimetableScenario, classId: string, teacherId: string): TimetableScenario {
  if (!scenario.classes.some(item => item.id === classId)) return scenario;
  if (teacherId && !scenario.teachers.some(item => item.id === teacherId)) return scenario;
  return {
    ...scenario,
    classes: scenario.classes.map(item => ({ ...item,
      homeroomTeacherId: item.id === classId ? teacherId || undefined : item.homeroomTeacherId === teacherId ? undefined : item.homeroomTeacherId,
    })),
    teachers: scenario.teachers.map(item => ({ ...item,
      homeroomClassId: item.id === teacherId ? classId : item.homeroomClassId === classId ? undefined : item.homeroomClassId,
    })),
  };
}

/** A manual move keeps the entire block and rejects any independently detected violation. */
export function moveTimetableBlock(scenario: TimetableScenario, solution: TimetableSolution, entryId: string, dayIndex: number, period: number): { solution?: TimetableSolution; errors: string[] } {
  const entry = solution.entries.find(item => item.id === entryId);
  if (!entry) return { errors: ['Không tìm thấy tiết học cần chuyển.'] };
  if (!entry.blockId && (scenario.assignments.find(item => item.id === entry.assignmentId)?.blockSize || 1) > 1) return { errors: ['Phương án cũ thiếu mã block. Xếp lại trước khi chuyển tiết đôi hoặc tiết ba.'] };
  const block = solution.entries.filter(item => entry.parallelEventId ? item.parallelEventId === entry.parallelEventId : entry.blockId ? item.blockId === entry.blockId : item.id === entryId);
  if (block.some(item => item.fixed || item.locked)) return { errors: ['Tiết cố định hoặc đang khóa không thể di chuyển. Hãy mở khóa trước.'] };
  const offset = period - Math.min(...block.map(item => item.period));
  const ids = new Set(block.map(item => item.id));
  const entries = solution.entries.map(item => ids.has(item.id) ? { ...item, dayIndex, period: item.period + offset } : item);
  const candidate = { ...solution, entries, generatedAt: new Date().toISOString() };
  const audit = auditTimetableSolution(scenario, candidate, { allowIncomplete: true });
  if (!audit.valid) return { errors: audit.errors };
  // Refresh displayed quality metrics only after the independent audit passes.
  const { teacherGaps, classGaps, lateCorePeriods, dailyImbalance } = timetableMetrics(scenario, entries);
  const diagnostics = { ...solution.diagnostics, hardConflicts: [], unscheduled: [], teacherGaps,
    quality: { teacherGaps, classGaps, lateCorePeriods, dailyImbalance }, preflight: analyzeTimetableScenario(scenario),
    unscheduled: remainingManualLessons(scenario, entries),
    warnings: ['Phương án đã tinh chỉnh thủ công; điểm phản ánh các chỉ số chất lượng sau chỉnh sửa.'],
  };
  return { solution: { ...candidate, diagnostics, score: teacherGaps * 14 + classGaps * 5 + lateCorePeriods * 18 + dailyImbalance * 3 }, errors: [] };
}

export function swapTimetableBlocks(s: TimetableScenario, solution: TimetableSolution, sourceId: string, targetId: string): { solution?: TimetableSolution; errors: string[] } {
  const source = solution.entries.find(e => e.id === sourceId), target = solution.entries.find(e => e.id === targetId);
  if (!source || !target) return { errors: ['Không tìm thấy hai tiết cần đổi chỗ.'] };
  const members = (entry: typeof source) => solution.entries.filter(e => entry.parallelEventId ? e.parallelEventId === entry.parallelEventId : entry.blockId ? e.blockId === entry.blockId : e.id === entry.id);
  const a = members(source), b = members(target), idsA = new Set(a.map(e => e.id)), idsB = new Set(b.map(e => e.id));
  if (a.some(e => idsB.has(e.id))) return { errors: ['Hai tiết nằm trong cùng một block hoặc cùng nhóm song song.'] };
  if ([...a, ...b].some(e => e.fixed || e.locked)) return { errors: ['Mở khóa các block trước khi đổi chỗ; không thể đổi tiết cố định.'] };
  const startA = Math.min(...a.map(e => e.period)), startB = Math.min(...b.map(e => e.period));
  const entries = solution.entries.map(e => idsA.has(e.id) ? { ...e, dayIndex: target.dayIndex, period: e.period + startB - startA } : idsB.has(e.id) ? { ...e, dayIndex: source.dayIndex, period: e.period + startA - startB } : e);
  const candidate = { ...solution, entries, generatedAt: new Date().toISOString() }, audit = auditTimetableSolution(s, candidate, { allowIncomplete: true });
  if (!audit.valid) return { errors: audit.errors };
  const quality = timetableMetrics(s, entries);
  return { solution: { ...candidate, score: quality.teacherGaps * 14 + quality.classGaps * 5 + quality.lateCorePeriods * 18 + quality.dailyImbalance * 3, diagnostics: { ...solution.diagnostics, quality, teacherGaps: quality.teacherGaps, hardConflicts: [], unscheduled: remainingManualLessons(s, entries), warnings: ['Đã đổi chỗ thủ công và kiểm tra độc lập.'] } }, errors: [] };
}


/** Keep the persisted draft shaped exactly like an automatic solution. */
export function remainingManualLessons(scenario: TimetableScenario, entries: TimetableSolution['entries']): TimetableSolution['diagnostics']['unscheduled'] {
  const weekly = scenarioForTeachingWeek(scenario);
  return weekly.assignments.flatMap(assignment => {
    const remaining = assignment.periodsPerWeek - entries.filter(entry => entry.assignmentId === assignment.id).length;
    return remaining > 0 ? [{ assignmentId: assignment.id, remaining, reason: 'Chưa xếp thủ công.' }] : [];
  });
}

export function createBlankManualTimetable(scenario: TimetableScenario): TimetableSolution {
  const quality = { teacherGaps: 0, classGaps: 0, lateCorePeriods: 0, dailyImbalance: 0 };
  return {
    teachingWeek: scenario.education?.activeWeek,
    entries: [],
    score: 0,
    generatedAt: new Date().toISOString(),
    diagnostics: {
      hardConflicts: [], warnings: ['Bản nháp xếp thủ công; chưa công bố khi chưa đủ tiết.'],
      unscheduled: remainingManualLessons(scenario, []), teacherGaps: 0, quality,
      preflight: analyzeTimetableScenario(scenario),
    },
  };
}

function verifyManualChange(
  scenario: TimetableScenario,
  solution: TimetableSolution,
  entries: TimetableSolution['entries'],
): { solution?: TimetableSolution; errors: string[] } {
  const candidate = { ...solution, entries, generatedAt: new Date().toISOString() };
  const report = auditTimetableSolution(scenario, candidate, { allowIncomplete: true });
  if (!report.valid) return { errors: report.errors };
  const quality = timetableMetrics(scenario, entries);
  const unscheduled = remainingManualLessons(scenario, entries);
  return {
    solution: {
      ...candidate,
      score: quality.teacherGaps * 14 + quality.classGaps * 5 + quality.lateCorePeriods * 18 + quality.dailyImbalance * 3,
      diagnostics: { ...solution.diagnostics, hardConflicts: [], quality, teacherGaps: quality.teacherGaps, unscheduled,
        warnings: unscheduled.length ? ['Bản nháp xếp thủ công chưa đủ tiết.'] : ['Đã xếp đủ số tiết và kiểm tra độc lập.'] },
    },
    errors: [],
  };
}

/** Place a complete 1–3 period unit from an existing teaching assignment. */
export function placeManualTimetableBlock(
  scenario: TimetableScenario,
  solution: TimetableSolution,
  assignmentId: string,
  dayIndex: number,
  period: number,
): { solution?: TimetableSolution; errors: string[] } {
  const weekly = scenarioForTeachingWeek(scenario);
  const assignment = weekly.assignments.find(item => item.id === assignmentId);
  if (!assignment) return { errors: ['Không tìm thấy phân công trong tuần đang chọn. Hãy khai báo phân công trước.'] };
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= activeTimetableDays(weekly).length ||
      !Number.isInteger(period) || period < 1 || period > weekly.periodsPerDay) return { errors: ['Ô tiết nằm ngoài khung thời khóa biểu.'] };
  const placed = solution.entries.filter(entry => entry.assignmentId === assignmentId);
  const remaining = assignment.periodsPerWeek - placed.length;
  if (remaining <= 0) return { errors: ['Môn học và giáo viên này đã xếp đủ số tiết trong tuần.'] };
  const size = Math.min(assignment.blockSize || 1, remaining);
  if (period + size - 1 > weekly.periodsPerDay || sessionForPeriod(weekly, period) !== sessionForPeriod(weekly, period + size - 1)) {
    return { errors: ['Không đủ ô liên tiếp cùng buổi để xếp trọn tiết đôi hoặc tiết ba.'] };
  }
  const placedStarts = new Set(placed.map(entry => entry.dayIndex + ':' + entry.period));
  const fixedPending = (assignment.fixedStartSlots || []).find(slot => !placedStarts.has(slot));
  const start = dayIndex + ':' + period;
  if (fixedPending && start !== fixedPending) return { errors: ['Hãy xếp tiết cố định ' + fixedPending + ' trước các tiết còn lại của phân công này.'] };
  const meetingIndex = new Set(placed.map(entry => entry.blockId || entry.id)).size;
  const parallelGroup = weekly.lessonGroups?.find(group => group.kind === 'parallel' && group.assignmentIds.includes(assignment.id));
  const blockId = 'manual-' + assignment.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const entries = [...solution.entries, ...Array.from({ length: size }, (_, offset) => ({
    id: blockId + '-' + (offset + 1), blockId, meetingIndex,
    assignmentId: assignment.id, classId: assignment.classId, teacherId: assignment.teacherId,
    subjectId: assignment.subjectId, roomId: assignment.roomId,
    additionalClassIds: assignment.additionalClassIds, additionalTeacherIds: assignment.additionalTeacherIds,
    studentGroupId: assignment.studentGroupId, additionalStudentGroupIds: assignment.additionalStudentGroupIds,
    campusId: assignmentCampus(weekly, assignment) || undefined,
    parallelEventId: parallelGroup ? parallelGroup.id + ':' + meetingIndex : undefined,
    dayIndex, period: period + offset,
    fixed: Boolean(fixedPending), locked: Boolean(fixedPending),
  }))];
  return verifyManualChange(scenario, solution, entries);
}

export function removeManualTimetableBlock(
  scenario: TimetableScenario,
  solution: TimetableSolution,
  entryId: string,
): { solution?: TimetableSolution; errors: string[] } {
  const selected = solution.entries.find(entry => entry.id === entryId);
  if (!selected) return { errors: ['Không tìm thấy tiết học.'] };
  const block = solution.entries.filter(entry => selected.parallelEventId ? entry.parallelEventId === selected.parallelEventId :
    selected.blockId ? entry.blockId === selected.blockId : entry.id === selected.id);
  if (block.some(entry => entry.fixed || entry.locked)) return { errors: ['Không thể xóa tiết cố định hoặc đang khóa.'] };
  const ids = new Set(block.map(entry => entry.id));
  return verifyManualChange(scenario, solution, solution.entries.filter(entry => !ids.has(entry.id)));
}
