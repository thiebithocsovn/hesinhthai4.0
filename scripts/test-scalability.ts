import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  PLATFORM_HEARTBEAT_INTERVAL_MS,
  PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS,
  readPublicPlatformSnapshot,
} from '../src/lib/platformMetrics';

let checks = 0;

function check(condition: unknown, description: string): void {
  assert.ok(condition, description);
  checks += 1;
}

const firebase = readFileSync(new URL('../src/firebase.ts', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../src/components/PlatformFooter.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const legacyManager = readFileSync(new URL('../src/components/ExamManagerLegacy.tsx', import.meta.url), 'utf8');
const studentRunner = readFileSync(new URL('../src/components/UnifiedStudentExamRunner.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const routes = JSON.parse(readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8')) as {
  include: string[];
  exclude: string[];
};
const snapshot = JSON.parse(readFileSync(new URL('../public/platform-stats.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const packageFile = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};

check(firebase.includes('initializeFirestore('), 'Firestore is initialized with explicit local-first settings.');
check(firebase.includes('persistentLocalCache('), 'Supported browsers keep Firestore data in IndexedDB.');
check(firebase.includes('persistentMultipleTabManager()'), 'Multiple browser tabs share a synchronized persistent cache.');
check(firebase.includes('memoryLocalCache()'), 'Shared devices and unsupported browsers can fall back to memory-only storage.');
check(firebase.includes('VITE_FIRESTORE_CACHE_MODE'), 'School-managed deployments can disable persistent student-data storage.');
check(firebase.includes("VITE_FIRESTORE_CACHE_MODE === 'persistent'"), 'Persistent Firestore storage requires explicit opt-in on trusted personal devices.');

check(!footer.includes('getCountFromServer('), 'Anonymous visitors never trigger collection-wide count queries.');
check(!footer.includes('onSnapshot('), 'Anonymous visitors never open Firestore realtime streams.');
check(!footer.includes('runTransaction('), 'Anonymous visitors do not contend on shared visitor counters.');
check(!footer.includes("doc(db, 'platform_presence'"), 'Anonymous visitors never write remote presence heartbeats.');
check(footer.includes('platform-stats.json'), 'Footer metrics are delivered through CDN-cacheable static files.');
check(PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS >= 15 * 60_000, 'Public aggregates are refreshed no more than every fifteen minutes per device.');
check(PLATFORM_HEARTBEAT_INTERVAL_MS >= 45_000, 'Device-only presence avoids rapid browser-storage updates.');
check(readPublicPlatformSnapshot(snapshot) !== null, 'The bundled public aggregate snapshot is valid.');
check(snapshot.registeredTeachers === null && snapshot.registeredSchools === null, 'Unverified teachers and schools are never fabricated.');
check(!JSON.stringify(snapshot).includes('@'), 'The public snapshot contains no teacher emails.');

for (const application of [
  'LuckyDraw', 'PlickerClassroom', 'HeadShakeGame', 'AIChatbot', 'ExamManager',
  'SecretBoxGame', 'DragDropGame', 'ExcelMerger', 'PdfMerger', 'GestureClass',
]) {
  check(dashboard.includes(`lazy(() => import('./${application}'))`), `${application} loads only when the teacher opens it.`);
}

check(legacyManager.includes("if (teacherTab !== 'exams')"), 'The default exam list does not subscribe to student and classroom rosters.');
check(legacyManager.includes("if (teacherTab === 'results')"), 'Exam-result streams are opened only on the results screen.');
check(legacyManager.includes("if (teacherTab === 'monitoring')"), 'Live exam sessions are monitored only when the teacher opens monitoring.');
check(legacyManager.includes('EXAM_SESSION_HEARTBEAT_INTERVAL_MS = 60_000'), 'Legacy student heartbeat behavior remains bounded for backward compatibility.');
check(studentRunner.includes('const HEARTBEAT_MS = 60_000'), 'The unified ten-type student runner also limits session heartbeats to once per minute.');

check(worker.includes('smartclass.webmanifest'), 'The offline shell includes the complete educational ecosystem.');
check(worker.includes('plicker.webmanifest'), 'The existing dedicated Plicker installation remains available.');
check(worker.includes('gestureclass/app.js'), 'GestureClass remains usable after its assets are cached.');
check(worker.includes('projector-readable-v1'), 'Classroom displays receive the current large-type GestureClass assets.');
check(worker.includes("fetch(request, { cache: 'no-store' })"), 'GestureClass and navigation requests bypass obsolete browser caches.');
check(worker.includes('LEGACY_CACHE_PREFIX'), 'Outdated Plicker-only service-worker caches are cleaned safely.');
check(headers.includes('max-age=31536000, immutable'), 'Hashed assets are cached aggressively at the CDN.');
check(headers.includes('stale-while-revalidate'), 'Public counters tolerate temporary network interruptions.');
check(JSON.stringify(routes.include) === JSON.stringify(['/api/*']), 'Cloudflare Workers are not invoked for static application traffic.');
check(routes.exclude.length === 0, 'Static routes do not need a paid dynamic Worker.');
check(vite.includes("process.env.CF_PAGES === '1'"), 'Cloudflare Pages deploys correctly from the domain root.');
check(vite.includes("'/4.0/'"), 'The existing GitHub Pages URL remains unchanged.');
check(packageFile.scripts['build:static'] === 'vite build', 'Cloudflare can build only static assets without a Node server.');
check(existsSync(new URL('../wrangler.jsonc', import.meta.url)), 'Cloudflare Pages deployment settings are included in the repository.');
check(readFileSync(new URL('../.npmrc', import.meta.url), 'utf8').includes('legacy-peer-deps=true'), 'Cloudflare can install the existing React dependencies without manual npm flags.');

console.info(`Local-first scalability and static CDN deployment: ${checks} checks passed.`);
