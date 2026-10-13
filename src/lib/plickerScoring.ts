export const PLICKER_DEFAULT_QUESTION_POINTS = 1;
export const PLICKER_MAX_QUESTION_POINTS = 100;

export function normalizePlickerQuestionPoints(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return PLICKER_DEFAULT_QUESTION_POINTS;
  }

  const numeric = typeof value === 'string'
    ? Number(value.trim().replace(',', '.'))
    : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric < 0) {
    return PLICKER_DEFAULT_QUESTION_POINTS;
  }

  return Math.min(PLICKER_MAX_QUESTION_POINTS, Math.round(numeric * 100) / 100);
}

export function sumPlickerScores(scores: readonly (number | null | undefined)[]): number {
  const hundredths = scores.reduce<number>((total, score) =>
    total + (typeof score === 'number' && Number.isFinite(score) ? Math.round(score * 100) : 0), 0);
  return hundredths / 100;
}

export function formatPlickerScore(score: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(score);
}
