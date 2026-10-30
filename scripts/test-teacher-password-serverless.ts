import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { createTeacherAdminRouter } from '../server/teacherAdmin';
import { createTeacherPasswordApp } from '../server/teacherAdminApp';
import { teacherAdminAppOptions, TeacherAdminConfigurationError } from '../server/teacherAdminCredentials';
import vercelApp from '../api/admin/teachers/password';

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
