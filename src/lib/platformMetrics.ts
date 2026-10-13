export const PLATFORM_VISITOR_STORAGE_KEY = 'smartclass_platform_visitor_v1';
export const PLATFORM_VISITS_STORAGE_KEY = 'smartclass_platform_visits_v1';
export const PLATFORM_SESSION_VISIT_KEY = 'smartclass_platform_session_visit_v1';
export const PLATFORM_CLOUD_VISIT_KEY = 'smartclass_platform_cloud_visit_v1';
export const PLATFORM_PRESENCE_STORAGE_KEY = 'smartclass_platform_presence_v1';
export const PLATFORM_REGISTRATION_STORAGE_KEY = 'smartclass_platform_registration_summary_v1';
export const PLATFORM_SNAPSHOT_STORAGE_KEY = 'smartclass_platform_public_snapshot_v1';

export const PLATFORM_HEARTBEAT_INTERVAL_MS = 45_000;
export const PLATFORM_PRESENCE_WINDOW_MS = 90_000;
export const PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS = 15 * 60_000;

export interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RegisteredTeacherSummaryInput {
  id?: string | null;
  email?: string | null;
  school?: string | null;
  status?: string | null;
}

export interface RegistrationMetrics {
  registeredTeachers: number;
  activeTeachers: number;
  registeredSchools: number;
}

export interface PublicPlatformMetrics extends RegistrationMetrics {
  totalVisits: number;
  onlineVisitors: number;
  classrooms: number | null;
  students: number | null;
  exams: number | null;
  hasRegistrationData: boolean;
  isFirebaseConnected: boolean;
}

export interface CachedPublicPlatformSnapshot {
  cachedAt: number;
  metrics: Partial<PublicPlatformMetrics>;
}

export function normalizeSchoolName(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi-VN');
}

export function summarizeTeacherRegistrations(
  profiles: readonly RegisteredTeacherSummaryInput[],
): RegistrationMetrics {
  const teachers = new Map<string, RegisteredTeacherSummaryInput>();

  for (const profile of profiles) {
    const identity = String(profile.id || profile.email || '').trim().toLocaleLowerCase('vi-VN');
    if (!identity || teachers.has(identity)) continue;
    teachers.set(identity, profile);
  }

  const schools = new Set<string>();
  let activeTeachers = 0;

  for (const profile of teachers.values()) {
    const school = normalizeSchoolName(profile.school);
    if (school) schools.add(school);
    if (profile.status === 'active') activeTeachers += 1;
  }

  return {
    registeredTeachers: teachers.size,
    activeTeachers,
    registeredSchools: schools.size,
  };
}

export function readNonNegativeInteger(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return fallback;
  return number;
}

export function formatPlatformCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN').format(readNonNegativeInteger(value));
}

function readStorage(storage: BrowserStorageLike | null | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(
  storage: BrowserStorageLike | null | undefined,
  key: string,
  value: string,
): boolean {
  try {
    storage?.setItem(key, value);
    return Boolean(storage);
  } catch {
    return false;
  }
}

function randomVisitorIdentifier(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2, 12);
  const timestamp = Date.now().toString(36);
  return `visitor-${timestamp}-${random}`;
}

export function getOrCreateVisitorIdentifier(storage?: BrowserStorageLike | null): string {
  const existing = readStorage(storage, PLATFORM_VISITOR_STORAGE_KEY);
  if (existing && /^[a-zA-Z0-9_-]{8,128}$/.test(existing)) return existing;

  const visitorId = randomVisitorIdentifier();
  writeStorage(storage, PLATFORM_VISITOR_STORAGE_KEY, visitorId);
  return visitorId;
}

export function recordLocalVisit(
  persistentStorage?: BrowserStorageLike | null,
  sessionStorage?: BrowserStorageLike | null,
): number {
  const existingVisits = readNonNegativeInteger(readStorage(persistentStorage, PLATFORM_VISITS_STORAGE_KEY));
  if (readStorage(sessionStorage, PLATFORM_SESSION_VISIT_KEY) === '1') {
    return Math.max(existingVisits, 1);
  }

  const nextVisits = existingVisits + 1;
  writeStorage(persistentStorage, PLATFORM_VISITS_STORAGE_KEY, String(nextVisits));
  writeStorage(sessionStorage, PLATFORM_SESSION_VISIT_KEY, '1');
  return nextVisits;
}

export function readTimestampMilliseconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();

  if (typeof value === 'object' && value !== null) {
    if ('toMillis' in value && typeof value.toMillis === 'function') {
      const milliseconds = value.toMillis();
      return typeof milliseconds === 'number' && Number.isFinite(milliseconds) ? milliseconds : null;
    }

    if ('seconds' in value && typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
      const nanoseconds = 'nanoseconds' in value && typeof value.nanoseconds === 'number'
        ? value.nanoseconds
        : 0;
      return value.seconds * 1000 + nanoseconds / 1_000_000;
    }
  }

  return null;
}

export function countRecentVisitors(
  sessions: readonly { visitorId?: unknown; lastSeen?: unknown }[],
  now = Date.now(),
  maxAge = PLATFORM_PRESENCE_WINDOW_MS,
): number {
  const visitors = new Set<string>();

  for (const session of sessions) {
    const visitorId = typeof session.visitorId === 'string' ? session.visitorId.trim() : '';
    const lastSeen = readTimestampMilliseconds(session.lastSeen);
    if (!visitorId || lastSeen === null || lastSeen > now + 5_000) continue;
    if (now - lastSeen <= maxAge) visitors.add(visitorId);
  }

  return visitors.size;
}

export function recordLocalPresence(
  storage: BrowserStorageLike | null | undefined,
  visitorId: string,
  now = Date.now(),
): number {
  let presence: Record<string, number> = {};

  try {
    const raw = readStorage(storage, PLATFORM_PRESENCE_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      for (const [id, timestamp] of Object.entries(parsed)) {
        if (typeof timestamp === 'number' && now - timestamp <= PLATFORM_PRESENCE_WINDOW_MS && timestamp <= now + 5_000) {
          presence[id] = timestamp;
        }
      }
    }
  } catch {
    presence = {};
  }

  presence[visitorId] = now;
  writeStorage(storage, PLATFORM_PRESENCE_STORAGE_KEY, JSON.stringify(presence));
  return Object.keys(presence).length;
}

export function readPublicRegistrationMetrics(value: unknown): RegistrationMetrics | null {
  if (typeof value !== 'object' || value === null) return null;

  const data = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(data.registeredTeachers)
    || !Number.isSafeInteger(data.activeTeachers)
    || !Number.isSafeInteger(data.registeredSchools)
  ) {
    return null;
  }

  const registeredTeachers = readNonNegativeInteger(data.registeredTeachers, -1);
  const activeTeachers = readNonNegativeInteger(data.activeTeachers, -1);
  const registeredSchools = readNonNegativeInteger(data.registeredSchools, -1);
  if (registeredTeachers < 0 || activeTeachers < 0 || registeredSchools < 0) return null;
  if (activeTeachers > registeredTeachers || registeredSchools > registeredTeachers) return null;

  return { registeredTeachers, activeTeachers, registeredSchools };
}

export function cacheRegistrationMetrics(
  storage: BrowserStorageLike | null | undefined,
  metrics: RegistrationMetrics,
): boolean {
  const safeMetrics = readPublicRegistrationMetrics(metrics);
  if (!safeMetrics) return false;
  return writeStorage(storage, PLATFORM_REGISTRATION_STORAGE_KEY, JSON.stringify(safeMetrics));
}

export function readCachedRegistrationMetrics(
  storage: BrowserStorageLike | null | undefined,
): RegistrationMetrics | null {
  try {
    const value = readStorage(storage, PLATFORM_REGISTRATION_STORAGE_KEY);
    return value ? readPublicRegistrationMetrics(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function readPublicPlatformSnapshot(value: unknown): Partial<PublicPlatformMetrics> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const data = value as Record<string, unknown>;
  const metrics: Partial<PublicPlatformMetrics> = {};
  const countFields = ['totalVisits', 'onlineVisitors', 'classrooms', 'students', 'exams'] as const;

  for (const field of countFields) {
    const count = data[field];
    if (count === undefined || count === null) continue;
    if (typeof count !== 'number' || readNonNegativeInteger(count, -1) < 0) return null;
    metrics[field] = count;
  }

  const registrationFields = ['registeredTeachers', 'activeTeachers', 'registeredSchools'] as const;
  const providedRegistrationFields = registrationFields.filter(field => data[field] !== undefined && data[field] !== null);

  if (providedRegistrationFields.length > 0) {
    if (providedRegistrationFields.length !== registrationFields.length) return null;
    const registration = readPublicRegistrationMetrics(data);
    if (!registration) return null;
    Object.assign(metrics, registration, { hasRegistrationData: true });
  }

  return metrics;
}

export function cachePublicPlatformSnapshot(
  storage: BrowserStorageLike | null | undefined,
  value: unknown,
  cachedAt = Date.now(),
): CachedPublicPlatformSnapshot | null {
  const metrics = readPublicPlatformSnapshot(value);
  if (!metrics || !Number.isSafeInteger(cachedAt) || cachedAt < 0) return null;

  const snapshot = { cachedAt, metrics };
  return writeStorage(storage, PLATFORM_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot)) ? snapshot : null;
}

export function readCachedPublicPlatformSnapshot(
  storage: BrowserStorageLike | null | undefined,
): CachedPublicPlatformSnapshot | null {
  try {
    const raw = readStorage(storage, PLATFORM_SNAPSHOT_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

    const candidate = parsed as Record<string, unknown>;
    if (!Number.isSafeInteger(candidate.cachedAt) || Number(candidate.cachedAt) < 0) return null;
    const metrics = readPublicPlatformSnapshot(candidate.metrics);
    if (!metrics) return null;

    return { cachedAt: candidate.cachedAt as number, metrics };
  } catch {
    return null;
  }
}

export function shouldRefreshPublicPlatformSnapshot(
  snapshot: CachedPublicPlatformSnapshot | null,
  now = Date.now(),
  maxAge = PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS,
): boolean {
  if (!snapshot) return true;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(maxAge) || maxAge < 0) return true;
  if (snapshot.cachedAt > now + 5_000) return true;
  return now - snapshot.cachedAt >= maxAge;
}
