/**
 * Presentation-only helpers for the teacher exam workspace.
 * Do not change Firestore document IDs, field names, status values or writes here:
 * older exams, student rosters and results must remain backward compatible.
 */
export type TeacherExamStatusFilter = 'all' | 'draft' | 'upcoming' | 'open' | 'closed';

export interface TeacherWorkspaceExam {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'closed';
  createdAt?: string;
  startTime?: string;
  questions?: readonly unknown[];
  versionCodes?: readonly string[];
  shuffledVersions?: readonly { code: string }[];
}

export type TeacherWorkspaceExamState = Exclude<TeacherExamStatusFilter, 'all'>;

export function teacherExamState(exam: TeacherWorkspaceExam, now = Date.now()): TeacherWorkspaceExamState {
  if (exam.status === 'closed') return 'closed';
  if (exam.status !== 'published') return 'draft';
  const starts = exam.startTime ? Date.parse(exam.startTime) : NaN;
  return Number.isFinite(starts) && starts > now ? 'upcoming' : 'open';
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi-VN').replace(/đ/g, 'd').trim();
}

export function filterTeacherExams<T extends TeacherWorkspaceExam>(
  exams: readonly T[],
  query = '',
  filter: TeacherExamStatusFilter = 'all',
  now = Date.now(),
): T[] {
  const search = normalizeSearch(query);
  return exams.filter(exam => {
    if (filter !== 'all' && teacherExamState(exam, now) !== filter) return false;
    if (!search) return true;
    const tokens = [exam.title, exam.id, ...(exam.versionCodes || []), ...(exam.shuffledVersions || []).map(item => item.code)];
    return tokens.some(value => normalizeSearch(String(value || '')).includes(search));
  });
}

export function summarizeTeacherExams(exams: readonly TeacherWorkspaceExam[], now = Date.now()) {
  const summary = { all: exams.length, draft: 0, upcoming: 0, open: 0, closed: 0 };
  for (const exam of exams) summary[teacherExamState(exam, now)] += 1;
  return summary;
}
