import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { createTeacherAdminRouter } from '../server/teacherAdmin';
import { createTeacherPasswordApp } from '../server/teacherAdminApp';
import { teacherAdminAppOptions, TeacherAdminConfigurationError } from '../server/teacherAdminCredentials';
import vercelApp from '../api/admin/teachers/password';
import { federatedCredential } from '../server/teacherAdminFederation';
import { readTeacherAdminDocument } from '../server/teacherAdminDocuments';
import { createRequire } from 'node:module';

const origin = 'https://thiebithocsovn.github.io';
const payload = { teacherId: 'qa-teacher', email: 'teacher@example.edu', newPassword: 'QA-only-2026-pass!' };
const writes: unknown[] = [];
const testRouter = () => createTeacherAdminRouter({ origins: new Set([origin]), administratorEmails: new Set() }, {
  async verifyAdministrator(token) {
    return { uid: token, emailVerified: true, admin: token === 'qa-admin' };
  },
  async isStoredAdministrator() { return false; },
  async getTeacher(uid) { return { id: uid, email: payload.email }; },
  async getAccount() { return { email: payload.email }; },
  async updatePassword(uid, password) { writes.push({ uid, password }); },
});

async function withServer(app: express.Express, run: (url: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run('http://127.0.0.1:' + (server.address() as AddressInfo).port); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

const request = (url: string, token = 'qa-admin') => fetch(url + '/api/admin/teachers/password', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify(payload),
});

// Exercise the same app factory as the Vercel entry point, with raw and platform-parsed requests.
for (const parsed of [false, true]) {
  const app = express();
  if (parsed) app.use(express.json());
  app.use(createTeacherPasswordApp(testRouter()));
  await withServer(app, async url => {
    assert.equal((await request(url, 'qa-teacher')).status, 403);
    const result = await request(url);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { updated: true, teacherId: payload.teacherId });
    assert.equal(result.headers.get('cache-control'), 'no-store');
  });
}
assert.deepEqual(writes, [0, 1].map(() => ({ uid: payload.teacherId, password: payload.newPassword })));

assert.deepEqual(teacherAdminAppOptions({}), { projectId: firebaseConfig.projectId });
assert.throws(() => teacherAdminAppOptions({ VERCEL: '1' }), TeacherAdminConfigurationError);
const federation = { VERCEL: '1', VERCEL_ENV: 'production',
  TEACHER_ADMIN_WIF_PROVIDER: 'projects/154715124810/locations/global/workloadIdentityPools/hesinhthai-teacher-password/providers/vercel-production',
  TEACHER_ADMIN_SERVICE_ACCOUNT: 'teacher-password-api@' + firebaseConfig.projectId + '.iam.gserviceaccount.com' };
assert.ok(teacherAdminAppOptions(federation).credential);
for (const overrides of [{ VERCEL_ENV: 'preview' }, { VERCEL: '' }, { TEACHER_ADMIN_SERVICE_ACCOUNT: 'outside@other-project.iam.gserviceaccount.com' },
  { TEACHER_ADMIN_WIF_PROVIDER: 'projects/other/locations/global/workloadIdentityPools/untrusted/providers/other' }]) {
  assert.throws(() => teacherAdminAppOptions({ ...federation, ...overrides }), TeacherAdminConfigurationError);
}
const credential = federatedCredential({ credentials: { expiry_date: Date.now() + 60_000 }, async getAccessToken() { return { token: 'qa-only-oauth-token' }; } });
assert.ok((await credential.getAccessToken()).expires_in > 0);
await assert.rejects(federatedCredential({ credentials: {}, async getAccessToken() { return { token: null }; } }).getAccessToken(), /unavailable/);
const documentUrl = 'https://firestore.googleapis.com/v1/projects/' + firebaseConfig.projectId + '/databases/' + firebaseConfig.firestoreDatabaseId + '/documents/teachers/qa-teacher';
const fetchDocument = (async (url, options) => {
  assert.equal(String(url), documentUrl + '?mask.fieldPaths=id&mask.fieldPaths=email');
  assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer qa-only-oauth-token');
  assert.equal(options?.redirect, 'error');
  assert.equal(options?.cache, 'no-store');
  return Response.json({ name: documentUrl.replace('https://firestore.googleapis.com/v1/', ''),
    fields: { id: { stringValue: payload.teacherId }, email: { stringValue: payload.email } } });
}) as typeof fetch;
assert.deepEqual(await readTeacherAdminDocument(credential, 'teachers', payload.teacherId, fetchDocument), { id: payload.teacherId, email: payload.email });
assert.equal(await readTeacherAdminDocument(credential, 'teachers', payload.teacherId, async () => new Response('', { status: 404 })), null);
await assert.rejects(readTeacherAdminDocument(credential, 'teachers', payload.teacherId, async () => Response.json({ name: 'projects/wrong/documents/teachers/qa-teacher' })), /Invalid/);
await assert.rejects(readTeacherAdminDocument(credential, 'teachers', '../outside', fetchDocument), /Invalid/);
await assert.rejects(readTeacherAdminDocument(credential, 'teachers', payload.teacherId, async () => new Response('sensitive-provider-failure', { status: 403 })), /database is unavailable/);
const setup = createRequire(import.meta.url)('./configure-teacher-password-federation.cjs');
const oldPolicy = { version: 3, etag: 'qa-etag', bindings: [{ role: 'roles/viewer', members: ['user:owner@example.edu'], condition: { expression: 'true' } }] };
const newPolicy = setup.mergeBinding(oldPolicy, 'roles/iam.workloadIdentityUser', setup.MEMBER);
assert.deepEqual(newPolicy.bindings[0], oldPolicy.bindings[0]);
assert.equal(newPolicy.etag, oldPolicy.etag);
assert.equal(oldPolicy.bindings.length, 1, 'Policy updates preserve the input and all unrelated grants.');
assert.deepEqual(setup.mergeBinding(newPolicy, 'roles/iam.workloadIdentityUser', setup.MEMBER), newPolicy);
setup.validateRole({ includedPermissions: setup.PERMISSIONS, stage: 'GA' });
assert.throws(() => setup.validateRole({ includedPermissions: [...setup.PERMISSIONS, 'firebaseauth.users.delete'], stage: 'GA' }));
setup.validateProvider(setup.PROVIDER_CONFIG);
assert.throws(() => setup.validateProvider({ ...setup.PROVIDER_CONFIG, attributeCondition: 'true' }));
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const account = { type: 'service_account', project_id: firebaseConfig.projectId,
  client_email: 'qa-password-api@' + firebaseConfig.projectId + '.iam.gserviceaccount.com', private_key: privateKey };
for (const key of [privateKey, privateKey.replace(/\n/g, '\\n')]) {
  const result = teacherAdminAppOptions({ VERCEL: '1', FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...account, private_key: key }) });
  assert.equal(result.projectId, firebaseConfig.projectId);
  assert.ok(result.credential);
}
for (const value of ['sensitive-invalid-json', JSON.stringify({ ...account, project_id: 'different-project' }),
  JSON.stringify({ ...account, client_email: 'outside@different-project.iam.gserviceaccount.com' }),
  JSON.stringify({ ...account, private_key: 'sensitive-invalid-private-key' })]) {
  assert.throws(() => teacherAdminAppOptions({ VERCEL: '1', FIREBASE_SERVICE_ACCOUNT_JSON: value }),
    error => error instanceof TeacherAdminConfigurationError && !error.message.includes(value));
}

const previousVercel = process.env.VERCEL;
const previousCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const previousAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
try {
  process.env.VERCEL = '1';
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  await withServer(vercelApp, async url => {
    const preflight = await fetch(url + '/api/admin/teachers/password', { method: 'OPTIONS', headers: { Origin: origin } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    const denied = await fetch(url + '/api/admin/teachers/password', { method: 'POST', headers: { Origin: origin } });
    assert.equal(denied.status, 401);
    const untrusted = await fetch(url + '/api/admin/teachers/password', { method: 'POST', headers: { Origin: 'https://untrusted.example' } });
    assert.equal(untrusted.status, 403);
    const missingCredentials = await request(url);
    assert.equal(missingCredentials.status, 503);
    const message = await missingCredentials.text();
    assert.match(message, /chưa được cấu hình quyền Firebase/);
    assert.equal(message.includes(payload.newPassword), false);
  });
} finally {
  for (const [name, value] of [['VERCEL', previousVercel], ['FIREBASE_SERVICE_ACCOUNT_JSON', previousCredential],
    ['GOOGLE_APPLICATION_CREDENTIALS', previousAdc]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}
console.info('Serverless password API passed: exported Vercel handler, CORS/auth boundaries, parsed bodies, isolated Firebase credentials and sanitized configuration errors.');
