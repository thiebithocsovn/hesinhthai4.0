import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PLATFORM_PRESENCE_STORAGE_KEY,
  PLATFORM_PRESENCE_WINDOW_MS,
  PLATFORM_REGISTRATION_STORAGE_KEY,
  PLATFORM_SESSION_VISIT_KEY,
  PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS,
  PLATFORM_SNAPSHOT_STORAGE_KEY,
  PLATFORM_VISITOR_STORAGE_KEY,
  PLATFORM_VISITS_STORAGE_KEY,
  cachePublicPlatformSnapshot,
  cacheRegistrationMetrics,
  countRecentVisitors,
  formatPlatformCount,
  getOrCreateVisitorIdentifier,
  normalizeSchoolName,
  readCachedPublicPlatformSnapshot,
  readCachedRegistrationMetrics,
  readNonNegativeInteger,
  readPublicPlatformSnapshot,
  readPublicRegistrationMetrics,
  readTimestampMilliseconds,
  recordLocalPresence,
  recordLocalVisit,
  shouldRefreshPublicPlatformSnapshot,
  summarizeTeacherRegistrations,
  type BrowserStorageLike,
} from '../src/lib/platformMetrics';

let checks = 0;

function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

function ok(value: unknown, message: string) {
  assert.ok(value, message);
  checks += 1;
}

class MemoryStorage implements BrowserStorageLike {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const inaccessibleStorage: BrowserStorageLike = {
  getItem() { throw new Error('Storage blocked'); },
  setItem() { throw new Error('Storage blocked'); },
};

equal(normalizeSchoolName('  Trường THCS Kim Hỷ  '), 'truong thcs kim hy', 'Vietnamese accents and surrounding spaces are normalized.');
equal(normalizeSchoolName('TRƯỜNG\tTHCS\nKIM HỶ'), 'truong thcs kim hy', 'Whitespace and capitalization do not create duplicate schools.');
equal(normalizeSchoolName('Đại học Sư phạm'), 'dai hoc su pham', 'Vietnamese đ is normalized consistently.');
equal(normalizeSchoolName(''), '', 'An empty school remains empty.');
equal(normalizeSchoolName(null), '', 'A missing school remains empty.');
equal(normalizeSchoolName(123), '', 'Non-string school values are ignored.');

equal(summarizeTeacherRegistrations([]), {
  registeredTeachers: 0,
  activeTeachers: 0,
  registeredSchools: 0,
}, 'Empty teacher collections publish exact zero counts.');

equal(summarizeTeacherRegistrations([
  { id: 'teacher-1', email: 'one@example.edu.vn', school: 'Trường THCS Kim Hỷ', status: 'active' },
  { id: 'teacher-2', email: 'two@example.edu.vn', school: '  TRƯỜNG thcs kim hỷ ', status: 'inactive' },
  { id: 'teacher-3', email: 'three@example.edu.vn', school: 'THCS Kim Lư', status: 'active' },
  { id: 'TEACHER-3', email: 'duplicate@example.edu.vn', school: 'Trường không hợp lệ', status: 'active' },
  { email: 'four@example.edu.vn', school: '', status: 'inactive' },
  { school: 'Không có tài khoản', status: 'active' },
]), {
  registeredTeachers: 4,
  activeTeachers: 2,
  registeredSchools: 2,
}, 'Teachers and schools are deduplicated without inventing missing identities or schools.');

equal(readNonNegativeInteger(12), 12, 'Positive integers remain unchanged.');
equal(readNonNegativeInteger('42'), 42, 'Numeric strings can be restored from browser storage.');
equal(readNonNegativeInteger(-1, 7), 7, 'Negative counts are rejected.');
equal(readNonNegativeInteger(1.5, 7), 7, 'Fractional counts are rejected.');
equal(readNonNegativeInteger(Number.NaN, 7), 7, 'NaN counts are rejected.');
equal(readNonNegativeInteger(Number.POSITIVE_INFINITY, 7), 7, 'Infinite counts are rejected.');
equal(readNonNegativeInteger(Number.MAX_SAFE_INTEGER + 1, 7), 7, 'Unsafe counts are rejected.');
equal(formatPlatformCount(1234567), '1.234.567', 'Large counts use Vietnamese number formatting.');
equal(formatPlatformCount(0), '0', 'A verified zero count is shown honestly.');
equal(formatPlatformCount(null), '—', 'Unknown public counts are not invented.');
equal(formatPlatformCount(undefined), '—', 'Missing public counts are not invented.');

const persistentStorage = new MemoryStorage();
const firstSession = new MemoryStorage();
const secondSession = new MemoryStorage();

const firstVisitor = getOrCreateVisitorIdentifier(persistentStorage);
ok(/^[a-zA-Z0-9_-]{8,128}$/.test(firstVisitor), 'Visitor identifiers are opaque and compatible with Firestore rules.');
equal(getOrCreateVisitorIdentifier(persistentStorage), firstVisitor, 'The same browser reuses its anonymous visitor ID.');
equal(persistentStorage.getItem(PLATFORM_VISITOR_STORAGE_KEY), firstVisitor, 'The visitor ID is persisted without personal information.');

persistentStorage.setItem(PLATFORM_VISITOR_STORAGE_KEY, '../../invalid');
const replacementVisitor = getOrCreateVisitorIdentifier(persistentStorage);
ok(replacementVisitor !== '../../invalid', 'Unsafe document identifiers are regenerated.');
ok(/^[a-zA-Z0-9_-]{8,128}$/.test(replacementVisitor), 'Regenerated visitor identifiers remain Firestore-safe.');
ok(getOrCreateVisitorIdentifier(inaccessibleStorage).length >= 8, 'Tracking degrades safely when browser storage is blocked.');

equal(recordLocalVisit(persistentStorage, firstSession), 1, 'The first real browser session increments visits once.');
equal(recordLocalVisit(persistentStorage, firstSession), 1, 'Reloading the same browser session does not inflate visits.');
equal(firstSession.getItem(PLATFORM_SESSION_VISIT_KEY), '1', 'The visit marker is session-scoped.');
equal(recordLocalVisit(persistentStorage, secondSession), 2, 'A new browser session adds exactly one visit.');
equal(persistentStorage.getItem(PLATFORM_VISITS_STORAGE_KEY), '2', 'Local visits remain available during network failures.');
equal(recordLocalVisit(inaccessibleStorage, inaccessibleStorage), 1, 'Unavailable browser storage never creates an invalid count.');

const timestamp = 1_700_000_000_000;
equal(readTimestampMilliseconds(timestamp), timestamp, 'Millisecond timestamps are supported.');
equal(readTimestampMilliseconds(new Date(timestamp)), timestamp, 'JavaScript dates are supported.');
equal(readTimestampMilliseconds({ toMillis: () => timestamp }), timestamp, 'Firestore Timestamp instances are supported.');
equal(readTimestampMilliseconds({ seconds: 1_700_000_000, nanoseconds: 500_000_000 }), timestamp + 500, 'Serialized Firestore timestamps are supported.');
equal(readTimestampMilliseconds({ seconds: Number.NaN }), null, 'Invalid serialized timestamps are rejected.');
equal(readTimestampMilliseconds('yesterday'), null, 'Timestamp strings are not guessed.');
equal(readTimestampMilliseconds({ toMillis: () => Number.NaN }), null, 'Invalid Timestamp conversion is rejected.');

equal(countRecentVisitors([
  { visitorId: 'a', lastSeen: timestamp },
  { visitorId: 'a', lastSeen: timestamp - 1_000 },
  { visitorId: 'b', lastSeen: timestamp - PLATFORM_PRESENCE_WINDOW_MS },
  { visitorId: 'c', lastSeen: timestamp - PLATFORM_PRESENCE_WINDOW_MS - 1 },
  { visitorId: 'future', lastSeen: timestamp + 5_001 },
  { visitorId: '', lastSeen: timestamp },
  { visitorId: 'missing' },
], timestamp), 2, 'Only unique visitors active within the 90-second window count as online.');
equal(countRecentVisitors([], timestamp), 0, 'No presence records produce zero active visitors.');
equal(countRecentVisitors([{ visitorId: 'soon', lastSeen: timestamp + 5_000 }], timestamp), 1, 'Small server-clock differences are tolerated.');

const presenceStorage = new MemoryStorage();
equal(recordLocalPresence(presenceStorage, 'browser-one', timestamp), 1, 'The current browser is counted as online.');
equal(recordLocalPresence(presenceStorage, 'browser-two', timestamp + 1_000), 2, 'Active local browser sessions are deduplicated by ID.');
equal(recordLocalPresence(presenceStorage, 'browser-one', timestamp + 2_000), 2, 'A heartbeat does not invent an extra online visitor.');
equal(recordLocalPresence(presenceStorage, 'browser-three', timestamp + PLATFORM_PRESENCE_WINDOW_MS + 2_001), 1, 'Expired sessions are removed from local presence.');
presenceStorage.setItem(PLATFORM_PRESENCE_STORAGE_KEY, '{invalid-json');
equal(recordLocalPresence(presenceStorage, 'recovered', timestamp), 1, 'Corrupt local presence recovers safely.');
equal(recordLocalPresence(inaccessibleStorage, 'offline-browser', timestamp), 1, 'Blocked local storage still counts the current browser once.');

equal(readPublicRegistrationMetrics({ registeredTeachers: 5, activeTeachers: 3, registeredSchools: 2 }), {
  registeredTeachers: 5,
  activeTeachers: 3,
  registeredSchools: 2,
}, 'Valid public aggregates contain only trustworthy numeric registration totals.');
equal(readPublicRegistrationMetrics({ registeredTeachers: 0, activeTeachers: 0, registeredSchools: 0 }), {
  registeredTeachers: 0,
  activeTeachers: 0,
  registeredSchools: 0,
}, 'Verified zero registrations are preserved.');
equal(readPublicRegistrationMetrics(null), null, 'A missing aggregate remains unavailable.');
equal(readPublicRegistrationMetrics({ registeredTeachers: 1, activeTeachers: 2, registeredSchools: 1 }), null, 'Active teachers cannot exceed registered teachers.');
equal(readPublicRegistrationMetrics({ registeredTeachers: 1, activeTeachers: 1, registeredSchools: 2 }), null, 'Registered schools cannot exceed participating teachers.');
equal(readPublicRegistrationMetrics({ registeredTeachers: -1, activeTeachers: 0, registeredSchools: 0 }), null, 'Negative public totals are rejected.');
equal(readPublicRegistrationMetrics({ registeredTeachers: '5', activeTeachers: 1, registeredSchools: 1 }), null, 'String totals are not silently accepted from Firestore.');
equal(readPublicRegistrationMetrics({ registeredTeachers: 1.5, activeTeachers: 1, registeredSchools: 1 }), null, 'Fractional registrations are rejected.');

const registrationStorage = new MemoryStorage();
equal(readCachedRegistrationMetrics(registrationStorage), null, 'Registration data remains unavailable before an authorized administrator signs in.');
equal(cacheRegistrationMetrics(registrationStorage, { registeredTeachers: 7, activeTeachers: 5, registeredSchools: 3 }), true, 'Verified registration totals can be cached without teacher profile data.');
equal(readCachedRegistrationMetrics(registrationStorage), { registeredTeachers: 7, activeTeachers: 5, registeredSchools: 3 }, 'The administrator device can show the last verified registration totals.');
const cachedRegistration = registrationStorage.getItem(PLATFORM_REGISTRATION_STORAGE_KEY) || '';
ok(!cachedRegistration.includes('@') && !cachedRegistration.includes('schoolName'), 'Cached registration summaries never contain names or email addresses.');
registrationStorage.setItem(PLATFORM_REGISTRATION_STORAGE_KEY, '{invalid-json');
equal(readCachedRegistrationMetrics(registrationStorage), null, 'Invalid cached registration totals are never displayed.');
equal(cacheRegistrationMetrics(inaccessibleStorage, { registeredTeachers: 2, activeTeachers: 1, registeredSchools: 1 }), false, 'Blocked storage cannot break registration summary handling.');

const snapshotStorage = new MemoryStorage();
const validSnapshot = {
  version: 1,
  totalVisits: 125,
  onlineVisitors: 12,
  registeredTeachers: 9,
  activeTeachers: 7,
  registeredSchools: 3,
  classrooms: 14,
  students: 420,
  exams: 18,
};

equal(readPublicPlatformSnapshot(validSnapshot), {
  totalVisits: 125,
  onlineVisitors: 12,
  classrooms: 14,
  students: 420,
  exams: 18,
  registeredTeachers: 9,
  activeTeachers: 7,
  registeredSchools: 3,
  hasRegistrationData: true,
}, 'A public CDN snapshot exposes only verified aggregate counters.');
equal(readPublicPlatformSnapshot({ version: 1, classrooms: null, students: null }), {}, 'Unavailable public totals remain unknown instead of becoming fake zeroes.');
equal(readPublicPlatformSnapshot({ students: '420' }), null, 'Untrusted numeric strings are rejected from the public snapshot.');
equal(readPublicPlatformSnapshot({ classrooms: -1 }), null, 'Negative public classroom totals are rejected.');
equal(readPublicPlatformSnapshot({ registeredTeachers: 2, registeredSchools: 1 }), null, 'Incomplete teacher registration aggregates are rejected.');
equal(readPublicPlatformSnapshot({ registeredTeachers: 2, activeTeachers: 3, registeredSchools: 1 }), null, 'Invalid registration totals cannot be published through the CDN snapshot.');
equal(readPublicPlatformSnapshot(null), null, 'A missing public snapshot fails safely.');

const cachedSnapshot = cachePublicPlatformSnapshot(snapshotStorage, validSnapshot, timestamp);
ok(Boolean(cachedSnapshot), 'Verified aggregate snapshots can be cached locally.');
equal(readCachedPublicPlatformSnapshot(snapshotStorage), cachedSnapshot, 'The last verified aggregate snapshot survives a reload.');
equal(shouldRefreshPublicPlatformSnapshot(cachedSnapshot, timestamp + PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS - 1), false, 'Fresh aggregate snapshots do not trigger another network request.');
equal(shouldRefreshPublicPlatformSnapshot(cachedSnapshot, timestamp + PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS), true, 'Aggregate snapshots refresh only after the fifteen-minute cache window.');
equal(shouldRefreshPublicPlatformSnapshot(null, timestamp), true, 'A missing snapshot is fetched once.');
equal(cachePublicPlatformSnapshot(inaccessibleStorage, validSnapshot, timestamp), null, 'Blocked storage never breaks public metric handling.');
snapshotStorage.setItem(PLATFORM_SNAPSHOT_STORAGE_KEY, '{invalid-json');
equal(readCachedPublicPlatformSnapshot(snapshotStorage), null, 'Corrupt cached snapshots are rejected safely.');

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../src/components/PlatformFooter.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

ok(rules.includes('allow list: if isAdmin();'), 'Existing Firestore rules continue to restrict teacher lists to administrators.');
ok(rules.includes('match /platform_stats/{statId}'), 'Public platform totals have a dedicated aggregate-only rule.');
ok(rules.includes('allow get: if publicPlatformStatsAreSafe(statId, existing());'), 'Guests can point-read only a validated overview document.');
ok(rules.includes('allow list: if false;'), 'Guests cannot enumerate platform statistic documents.');
ok(rules.includes('allow create, update: if isAdmin() && publicPlatformStatsAreSafe(statId, incoming());'), 'Only administrators can publish validated platform totals.');
ok(!rules.includes('match /platform_presence/{visitorId}'), 'Homepage statistics do not add public Firestore write permissions.');

for (const label of [
  'Lượt truy cập',
  'Trường đăng ký',
  'Giáo viên tham gia',
  'Đang trực tuyến',
  'Lớp học số',
  'Học sinh tham gia',
  'Kỳ thi đã tạo',
  'Ứng dụng giáo dục',
  'Giáo viên đăng ký miễn phí',
  'Cộng đồng giáo dục chuyển đổi số',
]) {
  ok(footer.includes(label), `The homepage footer displays the requested element: ${label}.`);
}

ok(!footer.includes("collection(db, 'teachers')"), 'The public footer never queries private teacher profiles.');
ok(!footer.includes('getCountFromServer('), 'The public footer never scans Firestore collections per visitor.');
ok(!footer.includes('runTransaction(db'), 'Public page views do not contend on a centralized Firestore counter.');
ok(!footer.includes("platform_presence', visitorId"), 'Anonymous page views do not create remote heartbeat writes.');
ok(!footer.includes('onSnapshot('), 'The homepage does not create per-visitor Firestore realtime listeners.');
ok(footer.includes('platform-stats.json'), 'Public aggregate data comes from a CDN-cacheable static snapshot.');
ok(footer.includes("getDoc(doc(db, 'platform_stats', 'overview'))"), 'Missing registration totals use one safe aggregate point read.');
ok(footer.includes('cachePublicPlatformSnapshot(window.localStorage, published)'), 'The merged aggregate is cached to avoid repeated point reads.');
ok(footer.includes('PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS'), 'Public aggregates use a bounded refresh schedule.');
ok(footer.includes('serverTimestamp()'), 'Authorized administrator publication keeps trusted server timestamps.');
ok(app.includes('publishPlatformRegistrationMetrics(profiles)'), 'Verified administrators publish aggregate-only registration statistics.');
ok(app.includes('<PlatformFooter'), 'The new community footer is rendered on the homepage.');
ok(!footer.includes('href="#"'), 'Footer actions use real navigation instead of dead placeholder links.');

console.info(`Privacy-safe homepage community statistics: ${checks} checks passed.`);
