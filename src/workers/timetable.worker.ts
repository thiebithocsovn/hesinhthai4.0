/// <reference lib="webworker" />

import { optimizeTimetable, type ScheduleEntry, type TimetableScenario } from '../lib/smartTimetable';

interface TimetableWorkerRequest {
  scenario: TimetableScenario;
  lockedEntries: ScheduleEntry[];
  iterations: number;
}

self.onmessage = (event: MessageEvent<TimetableWorkerRequest>) => {
  try {
    const { scenario, lockedEntries, iterations } = event.data;
    const solution = optimizeTimetable(scenario, lockedEntries, iterations);
    self.postMessage({ ok: true, solution });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Không thể tối ưu thời khóa biểu.',
    });
  }
};

export {};
