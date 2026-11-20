import { createDefaultTimetableScenario, normalizeTimetableScenario, type TimetableScenario, type TimetableSolution } from './smartTimetable';
import { applyEducationConfiguration, createEducationConfiguration } from './timetableEducation';

export interface TimetableWorkspace {
  scenario: TimetableScenario;
  solution: TimetableSolution | null;
  versions: TimetableSolution[];
}

// undefined = old device or first offline session; null = server confirmed no document.
export interface DeviceCopy {
  workspace: TimetableWorkspace;
  base?: string | null;
  pending: boolean;
}

export function normalizeSolution(solution: TimetableSolution | null | undefined): TimetableSolution | null {
  if (!solution?.entries || !solution.diagnostics) return null;
  const teacherGaps = Number(solution.diagnostics.teacherGaps || 0);
  return {
    ...solution,
    diagnostics: {
      ...solution.diagnostics,
      hardConflicts: solution.diagnostics.hardConflicts || [],
      warnings: solution.diagnostics.warnings || [],
      unscheduled: solution.diagnostics.unscheduled || [],
      teacherGaps,
      preflight: solution.diagnostics.preflight || [],
      quality: solution.diagnostics.quality || { teacherGaps, classGaps: 0, lateCorePeriods: 0, dailyImbalance: 0 },
    },
  };
}

export function decodeWorkspace(value: unknown): TimetableWorkspace {
  const data = value as Partial<TimetableWorkspace> | null;
  const scenario = data?.scenario;
  if (!Array.isArray(scenario?.teachers) || !Array.isArray(scenario.classes) || !Array.isArray(scenario.assignments)) {
    throw new Error('Bản lưu thời khóa biểu không đúng định dạng.');
  }
  const clean = { ...scenario } as TimetableScenario & { publicationSnapshots?: unknown };
  delete clean.publicationSnapshots;
  const solution = normalizeSolution(data.solution);
  if (data.solution && !solution) throw new Error('Không đọc được phương án đã lưu.');
  return {
    scenario: normalizeTimetableScenario(clean),
    solution,
    versions: Array.isArray(data.versions) ? data.versions.map(normalizeSolution).filter(Boolean).slice(0, 8) as TimetableSolution[] : [],
  };
}

export function emptyWorkspace(): TimetableWorkspace {
  const scenario = applyEducationConfiguration(createDefaultTimetableScenario(), createEducationConfiguration('lower-secondary'), true);
  return { scenario: { ...scenario, name: 'Thời khóa biểu THCS' }, solution: null, versions: [] };
}

export function readDeviceCopy(raw: string | null): DeviceCopy | null {
  if (!raw) return null;
  const data = JSON.parse(raw);
  const base = data.accountSync?.base;
  return { workspace: decodeWorkspace(data), base: typeof base === 'string' || base === null ? base : undefined, pending: data.accountSync?.pending === true };
}

export function serializeDeviceCopy(copy: DeviceCopy): string {
  return JSON.stringify({ ...copy.workspace, accountSync: { base: copy.base, pending: copy.pending } });
}

export function cloudWorkspace(workspace: TimetableWorkspace): TimetableWorkspace {
  // JSON also removes optional undefined fields which the Firestore SDK rejects.
  const { scenario, solution } = decodeWorkspace({ ...workspace, versions: [] });
  return JSON.parse(JSON.stringify({ scenario, solution, versions: [] }));
}

export async function workspaceDigest(workspace: TimetableWorkspace): Promise<string> {
  // Firestore does not preserve map key insertion order. Array order is significant.
  const { scenario, solution } = decodeWorkspace({ ...workspace, versions: [] });
  const canonical = JSON.stringify({ scenario, solution }, (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function hasSchoolData({ scenario, solution }: TimetableWorkspace): boolean {
  return Boolean(solution || scenario.teachers.length || scenario.classes.length || scenario.assignments.length || scenario.subjects.length || scenario.rooms.length);
}

export type SyncDecision = 'empty' | 'download' | 'upload' | 'equal' | 'conflict';

export function reconcileWorkspace(device: DeviceCopy | null, deviceDigest: string | null, remote: TimetableWorkspace | null, remoteDigest: string | null, sampleDigest: string): SyncDecision {
  if (!device) return remote ? 'download' : 'empty';
  if (remote && deviceDigest === remoteDigest) return 'equal';
  if (device.base !== undefined) {
    if (device.pending) return device.base === remoteDigest ? 'upload' : 'conflict';
    if (remote) {
      // A still-open older release may have uploaded its initial blank or sample on another machine.
      if (hasSchoolData(device.workspace) && deviceDigest !== sampleDigest && (!hasSchoolData(remote) || remoteDigest === sampleDigest)) return 'conflict';
      return 'download';
    }
    return device.base === null ? 'empty' : 'conflict';
  }
  // Migration from the old poller: opening an empty or sample cache must never replace an existing school.
  if (!remote) return deviceDigest === sampleDigest && !device.pending ? 'empty' : 'upload';
  if (!device.pending && hasSchoolData(remote) && (!hasSchoolData(device.workspace) || deviceDigest === sampleDigest)) return 'download';
  return 'conflict';
}

export function workspaceSummary(workspace: TimetableWorkspace | null): string {
  if (!workspace) return 'Chưa có bản lưu';
  const { scenario, solution } = workspace;
  const week = scenario.education?.activeWeek;
  return [week && `Tuần ${week}`, `${scenario.classes.length} lớp`, `${scenario.teachers.length} giáo viên`, `${scenario.assignments.length} phân công`, `${solution?.entries.length ?? 0} tiết đã xếp`].filter(Boolean).join(' · ');
}
