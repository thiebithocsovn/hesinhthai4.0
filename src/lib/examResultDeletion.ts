import { getSubmittedExamClassId } from './examStudentClasses';
import {
  canAccessTeacherOwnedRecord,
  type PrivateStudentRosterEntry,
  type TeacherAccessScope,
  type TeacherOwnedRecord,
} from './teacherIsolation';

export interface DeletionExam extends TeacherOwnedRecord {
  id: string;
  title: string;
  classNames?: Record<string, string>;
  studentDirectory?: Record<string, PrivateStudentRosterEntry>;
}

export interface DeletionClass extends TeacherOwnedRecord { id: string; name: string }
export interface DeletionStudent extends TeacherOwnedRecord { id: string; classId?: string }
export interface DeletionResult extends TeacherOwnedRecord {
  id: string;
  examId: string;
  studentId: string;
  answers?: Record<string, unknown>;
}

export type ExamResultDeletionScope =
  | { kind: 'exam'; examId: string }
  | { kind: 'class'; examId: string; classId: string }
  | { kind: 'grade'; examId: string; grade: string };

export const ALL_DELETION_EXAMS = '__all_exams__';
export const RESULT_DELETE_BATCH_SIZE = 400;

/** Match 3A, 3A PH Yên Lạc, Lớp 3A or Khối 10, without confusing 1 with 10–12. */
export function classGrade(name: string): string | undefined {
  return name.normalize('NFKC').trim().match(/^(?:(?:lớp|khối)\s*)?(1[0-2]|[1-9])(?=$|\D)/iu)?.[1];
}

/** Retain classes saved with older exams, even after the current roster was removed. */
export function examResultDeletionClasses(
  classes: readonly DeletionClass[], exams: readonly DeletionExam[], access: TeacherAccessScope,
): DeletionClass[] {
  const directory = new Map<string, DeletionClass>();
  for (const exam of exams) {
    if (!canAccessTeacherOwnedRecord(access, exam)) continue;
    for (const [id, name] of Object.entries(exam.classNames || {})) {
      if (name.trim()) directory.set(id, { id, name, teacherId: exam.teacherId });
    }
  }
  for (const item of classes) {
    if (canAccessTeacherOwnedRecord(access, item)) directory.set(item.id, item);
  }
  return [...directory.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
}

export function selectExamResultsToDelete<T extends DeletionResult>(
  results: readonly T[], exams: readonly DeletionExam[], students: readonly DeletionStudent[],
  classes: readonly DeletionClass[], scope: ExamResultDeletionScope, access: TeacherAccessScope,
): T[] {
  if (access.role === 'guest') return [];
  const ownedExams = new Map(exams.filter(exam => canAccessTeacherOwnedRecord(access, exam)).map(exam => [exam.id, exam]));
  // An absent/invalid selection must never widen deletion to all exams or classes.
  if (scope.kind === 'exam' && scope.examId === ALL_DELETION_EXAMS) return [];
  if (scope.examId !== ALL_DELETION_EXAMS && !ownedExams.has(scope.examId)) return [];
  const directory = examResultDeletionClasses(classes, exams, access);
  const classIds = new Set(directory.filter(item => scope.kind === 'class'
    ? item.id === scope.classId : scope.kind === 'grade' && classGrade(item.name) === scope.grade).map(item => item.id));
  if (scope.kind !== 'exam' && !classIds.size) return [];
  const ownedStudents = new Map(students.filter(student => canAccessTeacherOwnedRecord(access, student)).map(student => [student.id, student]));

  // Deliberately keep every submission, including older attempts hidden by the results table.
  return results.filter(result => {
    if (!canAccessTeacherOwnedRecord(access, result)) return false;
    if (scope.examId !== ALL_DELETION_EXAMS && result.examId !== scope.examId) return false;
    if (scope.kind === 'exam') return true;
    const exam = ownedExams.get(result.examId);
    const classId = getSubmittedExamClassId(exam || {}, result) ||
      Object.values(exam?.studentDirectory || {}).find(entry => entry.id === result.studentId)?.classId ||
      ownedStudents.get(result.studentId)?.classId;
    return Boolean(classId && classIds.has(classId));
  });
}

export class ExamResultDeletionError extends Error {
  constructor(readonly deletedCount: number, readonly totalCount: number, readonly cause: unknown) {
    super(`Đã xoá ${deletedCount}/${totalCount} lượt nộp. ${deletionFailureMessage(cause)}`);
    this.name = 'ExamResultDeletionError';
  }
}

function deletionFailureMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code).replace(/^firestore\//, '') : '';
  if (code === 'permission-denied' || code === 'unauthenticated') return 'Tài khoản chưa được cấp quyền xoá các kết quả còn lại. Hãy kiểm tra tài khoản giáo viên và thử lại.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Chưa kết nối được máy chủ. Hãy kiểm tra mạng, tải lại danh sách rồi thử lại phần còn lại.';
  return 'Chưa thể hoàn tất. Hãy kiểm tra kết nối và quyền tài khoản, tải lại danh sách rồi thử lại phần còn lại.';
}

/** Delete a frozen list of confirmed IDs; never sweep up new submissions arriving mid-operation. */
export async function deleteExamResultBatches(
  confirmedIds: readonly string[], commit: (ids: readonly string[]) => Promise<void>,
  onProgress: (deleted: number, total: number) => void = () => {},
): Promise<number> {
  const ids = [...new Set(confirmedIds)];
  if (ids.some(id => !id || id.includes('/') || id === '.' || id === '..')) throw new Error('Mã kết quả không hợp lệ. Vui lòng tải lại danh sách.');
  let deleted = 0;
  onProgress(0, ids.length);
  for (let start = 0; start < ids.length; start += RESULT_DELETE_BATCH_SIZE) {
    const batch = ids.slice(start, start + RESULT_DELETE_BATCH_SIZE);
    try { await commit(batch); }
    catch (error) { throw new ExamResultDeletionError(deleted, ids.length, error); }
    deleted += batch.length;
    onProgress(deleted, ids.length);
  }
  return deleted;
}
