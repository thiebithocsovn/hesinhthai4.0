export interface ExamScheduleItem {
  id: string;
  title: string;
  durationMinutes: number;
  questions?: unknown[];
  questionCount?: number;
  status: 'draft' | 'published' | 'closed';
  startTime?: string;
}

export type ExamScheduleState = 'open' | 'upcoming';

export function getExamStartTimestamp(startTime?: string): number | null {
  if (!startTime) return null;
  const timestamp = new Date(startTime).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getExamScheduleState(exam: Pick<ExamScheduleItem, 'startTime'>, now = Date.now()): ExamScheduleState {
  const startTimestamp = getExamStartTimestamp(exam.startTime);
  return startTimestamp !== null && startTimestamp > now ? 'upcoming' : 'open';
}

export function canStudentEnterExam(
  exam: Pick<ExamScheduleItem, 'status' | 'startTime'>,
  now = Date.now(),
): boolean {
  return exam.status === 'published' && getExamScheduleState(exam, now) === 'open';
}

export function buildStudentExamSchedule<T extends ExamScheduleItem>(exams: readonly T[], now = Date.now()): T[] {
  return exams
    .filter(exam => exam.status === 'published')
    .sort((first, second) => {
      const firstState = getExamScheduleState(first, now);
      const secondState = getExamScheduleState(second, now);

      if (firstState !== secondState) return firstState === 'open' ? -1 : 1;

      const firstTimestamp = getExamStartTimestamp(first.startTime);
      const secondTimestamp = getExamStartTimestamp(second.startTime);

      if (firstState === 'upcoming') {
        return (firstTimestamp ?? Number.MAX_SAFE_INTEGER) - (secondTimestamp ?? Number.MAX_SAFE_INTEGER);
      }

      return (secondTimestamp ?? 0) - (firstTimestamp ?? 0);
    });
}

export function formatExamScheduleDate(startTime?: string): string {
  const timestamp = getExamStartTimestamp(startTime);
  if (timestamp === null) return 'Theo thông báo của giáo viên';

  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}
