import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createTeacherAdminRouter } from '../server/teacherAdmin';
import { changeTeacherPassword, teacherPasswordEndpoint, validateTeacherPassword } from '../src/lib/teacherPassword';

const origin = 'https://thiebithocsovn.github.io';
const secret = 'QA-only-Pass-2026!';
const writes: { uid: string; password: string }[] = [];
const audits: unknown[] = [];
let timestamp = 10_000;
let failure = '';
let lookups = 0;
const app = express();
app.use('/api/admin', createTeacherAdminRouter({ origins: new Set([origin]), administratorEmails: new Set(['admin@example.edu']) }, {
  async verifyAdministrator(token) {
    if (token === 'expired') throw new Error('revoked');
    return { uid: token, email: token === 'email-admin' ? 'ADMIN@example.edu' : 'user@example.edu',
      emailVerified: token !== 'unverified', anonymous: token === 'anonymous', admin: token === 'admin' || token === 'unverified' || token === 'anonymous',
      role: token === 'role-admin' ? 'admin' : undefined };
  },
  async isStoredAdministrator(uid) { return ['stored-admin', 'target-admin-record'].includes(uid); },
  async getTeacher(uid) {
    lookups++;
    if (uid === 'missing') return null;
    return { id: uid === 'legacy' ? 'wrong-uid' : uid, email: 'teacher@example.edu' };
  },
  async getAccount(uid) {
    if (uid === 'gone') throw { code: 'auth/user-not-found' };
    return { email: uid === 'mismatch' ? 'other@example.edu' : 'teacher@example.edu',
      customClaims: uid === 'target-admin-claim' ? { admin: true } : undefined };
  },
  async updatePassword(uid, password) {
    if (failure) throw { code: failure, message: 'SENSITIVE ' + password };
    writes.push({ uid, password });
  },
  audit(event) { audits.push(event); },
  now: () => timestamp,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
const body = { teacherId: 'teacher-one', email: 'teacher@example.edu', newPassword: secret };
const request = (token = 'admin', input: unknown = body, requestOrigin = origin) => fetch(base + '/api/admin/teachers/password', {
  method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(input),
});

try {
  assert.equal(validateTeacherPassword('short', 'short'), 'Mật khẩu giáo viên phải có ít nhất 8 ký tự.');
  assert.match(validateTeacherPassword(secret, 'different'), /chưa trùng/);
  assert.match(validateTeacherPassword('x'.repeat(129), 'x'.repeat(129)), /128/);
  assert.equal(validateTeacherPassword('a'.repeat(128), 'a'.repeat(128)), '');
  assert.throws(() => teacherPasswordEndpoint('', origin + '/hesinhthai4.0/'), /chưa được kết nối/);
  assert.throws(() => teacherPasswordEndpoint('http://localhost:3000', origin), /chưa hợp lệ/);
  assert.throws(() => teacherPasswordEndpoint('https://user:pass@example.edu', origin));
  assert.equal(teacherPasswordEndpoint('https://api.example.edu/', origin), 'https://api.example.edu/api/admin/teachers/password');
  assert.equal((await request('')).status, 401);
  assert.equal((await request('expired')).status, 401);
  for (const token of ['teacher', 'anonymous', 'unverified']) assert.equal((await request(token)).status, 403);
  assert.equal((await request('admin', body, 'https://untrusted.example')).status, 403);
  assert.equal((await request('admin', body, '')).status, 403);
  assert.equal(lookups, 0, 'Unauthorized callers cannot read teacher identities.');
  assert.equal(writes.length, 0);

  const preflight = await fetch(base + '/api/admin/teachers/password', { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /Authorization/);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  for (const input of [{ ...body, newPassword: 'short' }, { ...body, newPassword: 'x'.repeat(129) }, { ...body, teacherId: '../teacher' }, { ...body, role: 'admin' }, { ...body, email: 'invalid' }, null]) {
    assert.equal((await request('admin', input)).status, 400);
  }
  assert.equal((await request('admin', { ...body, newPassword: 'x'.repeat(5000) })).status, 413);
  const malformed = await fetch(base + '/api/admin/teachers/password', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  for (const [teacherId, status] of [['admin', 403], ['missing', 404], ['legacy', 404], ['gone', 404], ['mismatch', 409], ['target-admin-claim', 403], ['target-admin-record', 403]] as const) {
    assert.equal((await request('admin', { ...body, teacherId })).status, status, teacherId);
  }
  assert.equal(writes.length, 0, 'Invalid or protected identities never reach Firebase password updates.');
  timestamp += 10 * 60_000;
  for (const token of ['admin', 'email-admin', 'role-admin', 'stored-admin']) {
    const response = await request(token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { updated: true, teacherId: body.teacherId });
  }
  assert.equal(writes.length, 4);
  assert.equal(writes[0].password, secret, 'The password is passed without trimming or alteration.');
  assert.equal(JSON.stringify(audits).includes(secret), false, 'Audit events contain no passwords.');
  failure = 'auth/insufficient-permission';
  const failed = await request();
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes(secret), false, 'Provider failures never echo password-bearing errors.');
  failure = 'auth/password-does-not-meet-requirements';
  assert.equal((await request()).status, 400);
  failure = '';

  let tokenRefresh = false;
  const user = { uid: 'admin', async getIdToken(force?: boolean) { tokenRefresh = !!force; return 'admin'; } };
  const options = { server: base, pageUrl: 'http://127.0.0.1:3000', getUser: () => user,
    fetchImpl: ((url, init) => fetch(url, { ...init, headers: { ...init?.headers, Origin: origin } })) as typeof fetch };
  await changeTeacherPassword(options, { teacherId: body.teacherId, email: body.email, password: secret, confirmation: secret });
  assert.equal(tokenRefresh, true);
  let session: typeof user | null = user;
  const changedSession = { uid: 'admin', async getIdToken() { session = null; return 'admin'; } };
  session = changedSession;
  const before = writes.length;
  await assert.rejects(changeTeacherPassword({ ...options, getUser: () => session }, { teacherId: body.teacherId, email: body.email, password: secret, confirmation: secret }), /Phiên quản trị/);
  assert.equal(writes.length, before, 'A changed administrator session cannot dispatch the password request.');
  await assert.rejects(changeTeacherPassword({ ...options, getUser: () => null }, { teacherId: body.teacherId, email: body.email, password: secret, confirmation: secret }), /đăng nhập/);
  await assert.rejects(changeTeacherPassword({ ...options, fetchImpl: async () => new Response(JSON.stringify({ updated: true, teacherId: 'wrong' })) }, { teacherId: body.teacherId, email: body.email, password: secret, confirmation: secret }), /Chưa xác nhận/);
  timestamp += 10 * 60_000;
  for (let index = 0; index < 20; index++) assert.equal((await request()).status, 200);
  const limit = await request();
  assert.equal(limit.status, 429);
  assert.ok(Number(limit.headers.get('retry-after')) > 0);
  timestamp += 10 * 60_000;
  assert.equal((await request()).status, 200);
  console.info('Teacher passwords passed: real client→API requests, role/verified identity, protected accounts, validation, session isolation, rate limits, sanitized failures and password-free audit.');
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
