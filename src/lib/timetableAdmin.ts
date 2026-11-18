import { auditTimetableSolution } from './smartTimetableAudit';
import { activeTimetableDays, analyzeTimetableScenario, type TimetableClass, type TimetableGrade, type TimetableScenario, type TimetableSolution } from './smartTimetable';
import { timetableMetrics } from './smartTimetableResources';

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
  const audit = auditTimetableSolution(scenario, candidate);
  if (!audit.valid || !audit.complete) return { errors: audit.errors.length ? audit.errors : ['Phương án chưa đủ tiết để xác minh việc chuyển.'] };
  // Refresh displayed quality metrics only after the independent audit passes.
  const { teacherGaps, classGaps, lateCorePeriods, dailyImbalance } = timetableMetrics(scenario, entries);
  const diagnostics = { ...solution.diagnostics, hardConflicts: [], unscheduled: [], teacherGaps,
    quality: { teacherGaps, classGaps, lateCorePeriods, dailyImbalance }, preflight: analyzeTimetableScenario(scenario),
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
  const candidate = { ...solution, entries, generatedAt: new Date().toISOString() }, audit = auditTimetableSolution(s, candidate);
  if (!audit.valid || !audit.complete) return { errors: audit.errors };
  const quality = timetableMetrics(s, entries);
  return { solution: { ...candidate, score: quality.teacherGaps * 14 + quality.classGaps * 5 + quality.lateCorePeriods * 18 + quality.dailyImbalance * 3, diagnostics: { ...solution.diagnostics, quality, teacherGaps: quality.teacherGaps, hardConflicts: [], unscheduled: [], warnings: ['Đã đổi chỗ thủ công và kiểm tra độc lập.'] } }, errors: [] };
}
