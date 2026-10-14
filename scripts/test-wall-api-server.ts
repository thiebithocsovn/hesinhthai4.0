import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createWallApiApp } from '../server/wallApiApp';

let calls = 0;
const origin = 'https://thiebithocsovn.github.io';
const teacherEmail = 'teacher@example.edu';
const app = createWallApiApp({
  apiKey: 'test-only-not-a-real-key', model: 'gpt-5.4-mini', origins: new Set([origin]),
  teacherUids: new Set(), teacherEmails: new Set([teacherEmail]),
}, {
  async verifyTeacher(token) {
    return { uid: token, email: token === 'other' ? 'other@example.edu' : teacherEmail.toUpperCase(),
      emailVerified: token !== 'unverified', anonymous: token === 'anonymous' };
  },
  async fetchImpl(_url, options) {
    calls++;
    const request = JSON.parse(String(options?.body));
    assert.equal(request.store, false);
    assert.equal(request.text.format.name, 'wall_connection');
    return new Response(JSON.stringify({ status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"status":"ok"}' }] }] }));
  },
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
async function connect(token = '', requestOrigin = origin) {
  return fetch(base + '/api/wall-ai/connection', { method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: '{}' });
}
try {
  const health = await fetch(base + '/healthz');
  assert.deepEqual(await health.json(), { status: 'ok', provider: 'learning-wall-ai', configured: true,
    providers: { openai: true, anthropic: false } });
  assert.equal(calls, 0, 'Health checks are not billable AI requests');
  assert.equal(health.headers.get('x-powered-by'), null);
  assert.equal((await connect()).status, 401);
  for (const token of ['other', 'unverified', 'anonymous']) assert.equal((await connect(token)).status, 403);
  assert.equal((await connect('verified', 'https://unknown.example')).status, 403);
  assert.equal(calls, 0, 'Only an approved verified teacher can spend API credit');
  assert.equal((await connect('verified')).status, 200);
  assert.equal(calls, 1);
  const missingClaude = await fetch(base + '/api/wall-claude/connection', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer verified' }, body: '{}' });
  assert.equal(missingClaude.status, 503);
  assert.match(await missingClaude.text(), /Claude/);
  assert.equal(calls, 1, 'An unconfigured Claude connection never calls OpenAI');
  for (const path of ['/', '/api/chat', '/api/scan', '/.env', '/firebase-service-account.json']) {
    assert.equal((await fetch(base + path)).status, 404, 'API-only server does not expose ' + path);
  }
  console.info('Private API server passed: readiness without AI calls, verified-email authorization, anonymous/unverified/other-user denial, private routes and no credential files.');
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
