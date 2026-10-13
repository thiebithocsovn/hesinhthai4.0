import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
let checks = 0;

function matches(source: string, pattern: RegExp, message: string) {
  assert.match(source, pattern, message);
  checks += 1;
}

function excludes(source: string, pattern: RegExp, message: string) {
  assert.doesNotMatch(source, pattern, message);
  checks += 1;
}

const firebase = read('../src/firebase.ts');
const wall = read('../src/components/LearningWall.tsx');
const omr = read('../src/components/OMRScanner.tsx');
const footer = read('../src/components/PlatformFooter.tsx');
const rules = read('../firestore.rules');
const worker = read('../public/service-worker.js');

matches(
  firebase,
  /VITE_FIRESTORE_CACHE_MODE\s*===\s*'persistent'/u,
  'Shared computers use volatile Firestore memory unless persistence is explicitly enabled.',
);
excludes(
  firebase,
  /VITE_FIRESTORE_CACHE_MODE\s*!==\s*'memory'/u,
  'Persistent Firestore storage is no longer the implicit default.',
);

matches(wall, /isPlickerSystemCategory/u, 'The learning wall identifies Plicker system documents.');
matches(
  wall,
  /filter\(item\s*=>\s*!isPlickerSystemCategory\(item\.id,\s*item\.data\(\)\)\)/u,
  'Plicker live-room documents never appear as ordinary learning-wall classes.',
);
matches(
  wall,
  /accessScope\.role\s*!==\s*'guest'\s*&&\s*\(/u,
  'Guests are not shown the learning-wall upload action.',
);
matches(
  wall,
  /categories\.find\(category\s*=>\s*category\.id\s*===\s*selectedCategoryId\)/u,
  'A post resolves its target from the current teacher-scoped category set.',
);
matches(
  wall,
  /canAccessTeacherOwnedRecord\(accessScope,\s*selectedCategory\)/u,
  'A learning-wall post rechecks ownership before writing.',
);

matches(
  omr,
  /examOwnerUid\s*=\s*isValidTeacherUid\(exam\?\.teacherId\)/u,
  'OMR derives the owner from the selected exam instead of the signed-in administrator.',
);
matches(omr, /where\('examId',\s*'==',\s*examId\)/u, 'OMR results are scoped to the selected exam.');
matches(omr, /where\('teacherId',\s*'==',\s*examOwnerUid\)/u, 'OMR result queries also require the exam owner UID.');
matches(
  omr,
  /s\.code\s*===\s*results\.sbd\s*&&\s*s\.teacherId\s*===\s*examOwnerUid/u,
  'Duplicate student codes cannot cross teacher workspaces during OMR lookup.',
);
matches(omr, /teacherId:\s*examOwnerUid/u, 'Administrator OMR scans are saved in the owning teacher workspace.');

for (const helper of ['guestStudentIsSafe', 'guestResultIsSafe', 'guestSessionIsSafe']) {
  matches(rules, new RegExp(`function ${helper}\\(`, 'u'), `${helper} validates anonymous exam writes.`);
  matches(rules, new RegExp(`!isSignedIn\\(\\)[\\s\\S]{0,180}${helper}\\(`, 'u'), `${helper} is enforced for anonymous writes.`);
}
matches(rules, /incoming\(\)\.keys\(\)\.hasOnly\(/u, 'Anonymous exam payloads reject unexpected fields.');
matches(rules, /match \/platform_stats\/\{statId\}/u, 'Public statistics use a separate aggregate collection.');
matches(rules, /allow get:\s*if publicPlatformStatsAreSafe\(statId,\s*existing\(\)\);/u, 'Only a validated aggregate overview is point-readable.');
matches(rules, /allow list:\s*if false;/u, 'Aggregate statistics cannot be enumerated.');
matches(rules, /isAdmin\(\)\s*&&\s*publicPlatformStatsAreSafe\(statId,\s*incoming\(\)\)/u, 'Only administrators publish validated totals.');
matches(footer, /getDoc\(doc\(db,\s*'platform_stats',\s*'overview'\)\)/u, 'The footer performs a single aggregate point read.');
matches(footer, /cachePublicPlatformSnapshot\(window\.localStorage,\s*published\)/u, 'The safe merged public snapshot is cached.');
matches(worker, /CACHE_PREFIX\}v\d+/u, 'The service worker cache version releases hardened assets immediately.');

console.info(`Ecosystem hardening: ${checks} checks passed.`);
