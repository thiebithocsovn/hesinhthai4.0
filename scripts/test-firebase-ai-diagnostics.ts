import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIREBASE_AI_APP_CHECK_SETUP_MESSAGE, describeFirebaseAiFailure } from '../src/lib/firebaseAiDiagnostics';

assert.match(FIREBASE_AI_APP_CHECK_SETUP_MESSAGE, /VITE_FIREBASE_APP_CHECK_SITE_KEY/);
assert.match(FIREBASE_AI_APP_CHECK_SETUP_MESSAGE, /thiebithocsovn\.github\.io/);
const scenarios: [unknown, RegExp][] = [
  [{ code: 'ai/api-not-enabled', message: 'Service is disabled' }, /AI Logic API chưa được bật/],
  [{ code: 'ai/fetch-error', message: 'App Check attestation failed' }, /Firebase App Check chưa xác minh/],
  [{ status: 403, message: 'PERMISSION_DENIED' }, /từ chối quyền truy cập/],
  [{ status: 429, message: 'RESOURCE_EXHAUSTED' }, /hạn mức/],
  [{ status: 404, message: 'model not found' }, /Model Gemini/],
  [{ status: 400, message: 'API key not valid' }, /Khóa API/],
  [{ code: 'ai/fetch-error', message: 'Failed to fetch' }, /Không kết nối được/],
  [{ code: 'ai/error', message: 'unrecognized error' }, /Gemini chưa xử lý/],
];
for (const [error, expected] of scenarios) {
  const result = describeFirebaseAiFailure(error);
  assert.match(result.message, expected);
  assert.doesNotMatch(result.message, /secret_key|student_private_data/);
}
const wall = readFileSync(new URL('../src/lib/learningWallAi.ts', import.meta.url), 'utf-8');
const firebase = readFileSync(new URL('../src/firebase.ts', import.meta.url), 'utf-8');
assert.match(wall, /getToken\(appCheck, false\)/);
assert.match(wall, /if \(!appCheck\) throw new Error\(FIREBASE_AI_APP_CHECK_SETUP_MESSAGE\)/);
assert.match(wall, /describeFirebaseAiFailure\(error\)/);
assert.match(firebase, /new ReCaptchaEnterpriseProvider\(appCheckSiteKey\)/);
assert.match(firebase, /isTokenAutoRefreshEnabled: true/);
console.info('Firebase Gemini/App Check diagnosis: 8 error cases, token preflight, no bypass and privacy checks passed.');
