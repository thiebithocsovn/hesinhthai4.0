import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createWallApiApp } from '../server/wallApiApp';
import { requestWallClaude, wallOpenAiEndpoint } from '../src/lib/wallOpenAiClient';
import { readWallAiProvider, rememberWallAiProvider } from '../src/lib/wallAiProvider';

const memory = new Map<string, string>();
const storage = { getItem: (key: string) => memory.get(key) || null, setItem: (key: string, value: string) => { memory.set(key, value); } };
rememberWallAiProvider('teacher-one', 'anthropic', storage);
rememberWallAiProvider('teacher-two', 'firebase-gemini', storage);
assert.equal(readWallAiProvider('teacher-one', storage), 'anthropic');
assert.equal(readWallAiProvider('teacher-two', storage), 'firebase-gemini');
assert.equal(readWallAiProvider('', storage), 'openai');
assert.equal(readWallAiProvider('teacher-one', { getItem: () => 'https://evil.example', setItem: () => {} }), 'openai');
assert.equal(readWallAiProvider('teacher-one', { getItem: () => { throw new Error('blocked'); }, setItem: () => {} }), 'openai');
assert.throws(() => wallOpenAiEndpoint('https://api.anthropic.com', 'https://school.example', 'anthropic'), /máy chủ riêng/);
assert.equal(wallOpenAiEndpoint('https://school-api.example', 'https://school.example', 'anthropic'), 'https://school-api.example/api/wall-claude');

const origin = 'https://thiebithocsovn.github.io';
const input = { kind: 'chat' as const, requestId: 'request-123', prompt: 'Đọc đúng bài làm.', media: [] as { mimeType: string; data: string }[] };
const servers: ReturnType<ReturnType<typeof createWallApiApp>['listen']>[] = [];
const calls: { url: string; body: any; init: RequestInit }[] = [];
let stopReason = 'end_turn';
let wrongId = false;
let failure = false;
async function start(perMinute = 100, openaiKey = 'test-only-openai') {
  const app = createWallApiApp({ apiKey: openaiKey, anthropicApiKey: 'test-only-claude',
    model: 'gpt-5.4-mini', anthropicModel: 'claude-sonnet-5-5', origins: new Set([origin]),
    teacherUids: new Set(['teacher']), perMinute }, {
    async verifyTeacher(token) { return { uid: token, anonymous: token === 'anonymous' }; },
    async fetchImpl(url, init) {
      const body = JSON.parse(String(init?.body)); calls.push({ url: String(url), body, init: init! });
      if (String(url).includes('anthropic')) {
        if (failure) return new Response(JSON.stringify({ error: { message: 'private diagnostic: credit balance too low' } }), { status: 400 });
        const schema = body.output_config.format.schema;
        const id = schema.properties.requestId?.enum[0];
        const text = JSON.stringify(id ? { requestId: wrongId ? 'wrong-request' : id, reply: 'Kiểm chứng nguyên nhân.', feedback: 'Sửa bước làm.' } : { status: 'ok' });
        return new Response(JSON.stringify({ model: body.model + '-resolved', stop_reason: stopReason, content: [{ type: 'text', text }] }));
      }
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"status":"ok"}' }] }] }));
    },
  });
  const server = app.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  return { base, post: (provider = 'anthropic', body: unknown = input, token = 'teacher', endpoint = 'generate') => fetch(base + (provider === 'anthropic' ? '/api/wall-claude/' : '/api/wall-ai/') + endpoint,
    { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }) };
}
try {
  const api = await start();
  for (const [token, expected] of [['', 401], ['other', 403], ['anonymous', 403]] as const) assert.equal((await api.post('anthropic', input, token)).status, expected);
  assert.equal(calls.length, 0);
  assert.equal((await api.post('anthropic', { ...input, model: 'unapproved' })).status, 400);
  const response = await api.post('anthropic', { ...input, media: [{ mimeType: 'image/png', data: 'YWJj' }, { mimeType: 'application/pdf', data: 'JVBERg==' }] });
  assert.equal(response.status, 200); assert.equal((await response.json()).source, 'anthropic');
  const sent = calls.at(-1)!;
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.init.redirect, 'error');
  assert.equal((sent.init.headers as any)['x-api-key'], 'test-only-claude');
  assert.equal((sent.init.headers as any).Authorization, undefined);
  assert.equal(sent.body.max_tokens, 8192);
  assert.deepEqual(sent.body.output_config.format.schema.properties.requestId.enum, ['request-123']);
  assert.equal(sent.body.messages[0].content[1].type, 'image');
  assert.equal(sent.body.messages[0].content[2].source.media_type, 'application/pdf');
  assert.doesNotMatch(JSON.stringify(sent.body), /test-only|Bearer|teacher/);
  await api.post('anthropic', { ...input, kind: 'analysis' });
  assert.doesNotMatch(JSON.stringify(calls.at(-1)!.body.output_config.format.schema), /maxItems/);
  await api.post('anthropic', { ...input, kind: 'practice' });
  assert.equal(calls.at(-1)!.body.output_config.format.schema.properties.exercises.minItems, 1);
  const connection = await api.post('anthropic', { studentName: 'PRIVATE_STUDENT', work: 'PRIVATE_WORK' }, 'teacher', 'connection');
  assert.equal(connection.status, 200); assert.doesNotMatch(JSON.stringify(calls.at(-1)!.body), /PRIVATE_/);
  wrongId = true; assert.equal((await api.post()).status, 502); wrongId = false;
  stopReason = 'max_tokens'; assert.equal((await api.post()).status, 502); stopReason = 'end_turn';
  failure = true; const billing = await api.post(); assert.equal(billing.status, 429);
  assert.match(await billing.text(), /Claude.*credit/); failure = false;
  const restricted = await start(1);
  assert.equal((await restricted.post('openai', {}, 'teacher', 'connection')).status, 200);
  const before = calls.length;
  assert.equal((await restricted.post('anthropic', {}, 'teacher', 'connection')).status, 429);
  assert.equal(calls.length, before, 'Changing provider cannot bypass the shared quota');
  const user = { uid: 'teacher', getIdToken: async () => 'teacher' };
  const fetched: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, Origin: origin } });
  const client = await requestWallClaude({ server: api.base, pageUrl: api.base, getUser: () => user, fetchImpl: fetched }, input);
  assert.equal(client.source, 'anthropic');
  assert.equal(client.model, 'claude-sonnet-5-5-resolved', 'History identifies the model reported by the provider');
  await assert.rejects(requestWallClaude({ server: api.base, pageUrl: api.base, getUser: () => user,
    fetchImpl: async () => new Response(JSON.stringify({ source: 'openai', model: 'gpt-5.4-mini', text: '{}' })) }, input), /không hợp lệ/);
  const claudeOnly = await start(100, '');
  const health = await (await fetch(claudeOnly.base + '/healthz')).json();
  assert.deepEqual(health.providers, { openai: false, anthropic: true });
  assert.equal(health.configured, true);
  assert.equal((await claudeOnly.post('openai', {}, 'teacher', 'connection')).status, 503);
  assert.equal((await claudeOnly.post('anthropic', {}, 'teacher', 'connection')).status, 200, 'Claude works independently of the OpenAI key');
  console.info('AI choices passed: teacher-scoped preferences, Claude auth/media/schema/errors, no cross-provider keys/results/fallback and shared usage limits.');
} finally { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); }
