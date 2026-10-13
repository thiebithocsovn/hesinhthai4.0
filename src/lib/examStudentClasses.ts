import { isValidTeacherUid } from './teacherIsolation';

// Exam enrollment belongs to this submission, not the student's global profile.
// Keep it inside the existing submission map so old deployed rules remain compatible.
export const EXAM_ENROLLMENT_KEY = '__examEnrollment';

export function guestExamStudentRecord<T extends { classId?: string }>(student: T): Omit<T, 'classId'> {
  const { classId, ...record } = student;
  return record;
}

export function withExamStudentClass(answers: Record<string, unknown>, classId?: string): Record<string, unknown> {
  const saved = { ...answers };
  delete saved[EXAM_ENROLLMENT_KEY];
  if (classId && isValidTeacherUid(classId)) saved[EXAM_ENROLLMENT_KEY] = { classId };
  return saved;
}

export function getSubmittedExamClassId(exam: { classNames?: Record<string, string> }, result?: { answers?: Record<string, unknown> }): string | undefined {
  const enrollment = result?.answers?.[EXAM_ENROLLMENT_KEY];
  if (!enrollment || typeof enrollment !== 'object' || Array.isArray(enrollment)) return undefined;
  const classId = (enrollment as { classId?: unknown }).classId;
  return typeof classId === 'string' && getExamStudentClasses(exam).some(item => item.id === classId) ? classId : undefined;
}

export function getExamStudentClasses(exam: { classNames?: Record<string, string> }): { id: string; name: string }[] {
  return Object.entries(exam.classNames || {})
    .filter(([id, name]) => isValidTeacherUid(id) && typeof name === 'string' && Boolean(name.trim()))
    .map(([id, name]) => ({ id, name: name.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
}
