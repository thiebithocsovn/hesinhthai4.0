import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createWallOpenAiRouter } from '../server/wallOpenAi';
import { requestWallOpenAi, wallOpenAiEndpoint } from '../src/lib/wallOpenAiClient';

const origin = 'https://thiebithocsovn.github.io';
const input = { kind: 'chat' as const, requestId: 'request-123', prompt: 'Nhận xét bài làm. Trả JSON đúng mã.', media: [] };
const apiResult = (text: unknown, status = 'completed') => new Response(JSON.stringify({
  status, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(text) }] }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });
const servers: ReturnType<express.Express['listen']>[] = [];
let calls: { url: string; init: RequestInit; body: any }[] = [];
let upstream: typeof fetch = async (url, init) => {
  const body = JSON.parse(String(init?.body));
  calls.push({ url: String(url), init: init!, body });
  const kind = body.text.format.name;
  const id = body.text.format.schema.properties.requestId?.enum[0];
  return apiResult(kind === 'wall_connection' ? { status: 'ok' } : { requestId: id, reply: 'Cần kiểm chứng nguyên nhân.', feedback: 'Hãy giải thích bước làm.' });
};
async function start(overrides: Record<string, unknown> = {}, clock?: () => number) {
  const app = express();
  app.use('/api/wall-ai', createWallOpenAiRouter({
    apiKey: 'test-only-not-a-real-key', model: 'gpt-5.4-mini',
    teacherUids: new Set(['teacher-ok', 'anonymous']), origins: new Set([origin, 'http://127.0.0.1']),
    perMinute: 100, perDay: 200, totalPerDay: 400, ...overrides,
  }, {
    now: clock,
    async verifyTeacher(token) {
      if (token === 'expired') throw Object.assign(new Error('private internal diagnostic'), { code: 'auth/id-token-expired' });
      if (token === 'verify-unavailable') throw Object.assign(new Error('private credential path'), { code: 'app/invalid-credential' });
      return { uid: token === 'teacher' ? 'teacher-ok' : token, anonymous: token === 'anonymous' };
    },
    fetchImpl: (url, init) => upstream(url, init),
  }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  return {
    base,
    post: (body: unknown = input, token = 'teacher', requestOrigin = origin, endpoint = 'generate') =>
      fetch(base + '/api/wall-ai/' + endpoint, { method: 'POST', headers: {
        'Content-Type': 'application/json', Origin: requestOrigin, ...(token ? { Authorization: 'Bearer ' + token } : {}),
      }, body: JSON.stringify(body) }),
  };
}
try {
  const proxy = await start();
  for (const [token, expected] of [['', 401], ['student', 403], ['anonymous', 403], ['expired', 401], ['verify-unavailable', 503]] as const) {
    const response = await proxy.post(input, token);
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /private|test-only-not-a-real-key/);
  }
  assert.equal(calls.length, 0, 'Unauthenticated, unapproved, anonymous and invalid sessions cannot spend API credit');
  assert.equal((await proxy.post(input, 'teacher', 'https://untrusted.example')).status, 403);
  assert.equal((await proxy.post({ ...input, model: 'unapproved' })).status, 400);
  assert.equal((await proxy.post({ ...input, requestId: '../wrong' })).status, 400);
  assert.equal((await proxy.post({ ...input, media: [{ mimeType: 'image/png', data: 'https://untrusted.example/image' }] })).status, 400);
  assert.equal((await proxy.post({ ...input, media: [{ mimeType: 'application/pdf', data: Buffer.alloc(2_000_000).toString('base64') }] })).status, 413);
  assert.equal(calls.length, 0, 'Malformed input and URLs cannot reach OpenAI');
  const missing = await start({ apiKey: '' });
  assert.equal((await missing.post()).status, 503);
  const noTeachers = await start({ teacherUids: new Set() });
  assert.equal((await noTeachers.post()).status, 503);
  assert.equal(calls.length, 0, 'Unconfigured proxy fails closed');
  const preflight = await fetch(proxy.base + '/api/wall-ai/generate', { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers') || '', /Authorization/);

  const media = [{ mimeType: 'image/png', data: 'YWJj' }, { mimeType: 'application/pdf', data: 'JVBERg==' }];
  const response = await proxy.post({ ...input, media });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source, 'openai');
  const request = calls.at(-1)!;
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.store, false);
  assert.equal(request.body.max_output_tokens, 8192);
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.strict, true);
  assert.deepEqual(request.body.text.format.schema.properties.requestId.enum, ['request-123']);
  assert.equal(request.body.input[0].content[1].image_url, 'data:image/png;base64,YWJj');
  assert.equal(request.body.input[0].content[2].file_data, 'data:application/pdf;base64,JVBERg==');
  assert.equal(request.body.input[0].content[2].filename, 'bai-lam-2.pdf');
  assert.doesNotMatch(JSON.stringify(request.body), /teacher-ok|Bearer|test-only-not-a-real-key/, 'Tokens and API key are absent from model input');
  for (const kind of ['analysis', 'practice']) {
    assert.equal((await proxy.post({ ...input, kind })).status, 200);
    assert.equal(calls.at(-1)!.body.text.format.name, 'wall_' + kind);
  }
  assert.equal((await proxy.post({ studentName: 'Must never be forwarded', workText: 'PRIVATE' }, 'teacher', origin, 'connection')).status, 200);
  assert.doesNotMatch(JSON.stringify(calls.at(-1)!.body), /Must never|PRIVATE|studentName/);
  assert.equal(calls.at(-1)!.body.text.format.schema.properties.status.enum[0], 'ok');

  const originalUpstream = upstream;
  for (const status of [400, 401, 403, 404, 429, 500]) {
    upstream = async () => new Response(JSON.stringify({ error: { message: 'test-only-not-a-real-key private work text' } }), { status });
    const failed = await proxy.post();
    assert.equal(failed.status, status === 429 ? 429 : status === 500 ? 502 : 503);
    assert.doesNotMatch(await failed.text(), /private work|test-only-not-a-real-key/);
  }
  upstream = async () => apiResult({ requestId: 'wrong-request', reply: 'Old work', feedback: '' });
  assert.equal((await proxy.post()).status, 502, 'Cross-request output is rejected');
  upstream = async () => apiResult({ requestId: input.requestId }, 'incomplete');
  assert.equal((await proxy.post()).status, 502, 'Truncated output is rejected');
  upstream = async () => { throw new Error('network failure'); };
  assert.equal((await proxy.post()).status, 504, 'No fake feedback after a network failure');
  upstream = originalUpstream;

  let time = 0;
  const limited = await start({ perMinute: 1, perDay: 2, totalPerDay: 2 }, () => time);
  assert.equal((await limited.post()).status, 200);
  const beforeLimit = calls.length;
  assert.equal((await limited.post()).status, 429);
  assert.equal(calls.length, beforeLimit, 'Local limit is enforced before billable requests');
  time = 61_000; assert.equal((await limited.post()).status, 200);
  time = 122_000; assert.equal((await limited.post()).status, 429);
  time = 86_400_000; assert.equal((await limited.post()).status, 200);

  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  upstream = async (url, init) => {
    started?.(); await new Promise<void>(resolve => { release = resolve; }); return originalUpstream(url, init);
  };
  const pending = proxy.post();
  await startedPromise;
  assert.equal((await proxy.post()).status, 429, 'A second teacher request cannot double-spend while the first is running');
  release!(); assert.equal((await pending).status, 200);
  upstream = originalUpstream;

  const user = { uid: 'teacher-ok', getIdToken: async () => 'teacher' };
  let current: typeof user | null = user;
  const options = { server: proxy.base, pageUrl: proxy.base, getUser: () => current };
  const clientFetch: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, Origin: origin } });
  const result = await requestWallOpenAi({ ...options, fetchImpl: clientFetch }, input);
  assert.equal(result.source, 'openai');
  assert.equal(result.model, 'gpt-5.4-mini');
  assert.equal(JSON.parse(result.text).requestId, input.requestId);
  assert.throws(() => wallOpenAiEndpoint('', origin), /chưa được thiết lập/);
  assert.throws(() => wallOpenAiEndpoint('http://127.0.0.1:3000', origin), /máy chủ riêng/);
  assert.throws(() => wallOpenAiEndpoint('https://api.openai.com', origin), /máy chủ riêng/);
  assert.throws(() => wallOpenAiEndpoint('https://example.com?key=bad', origin));
  assert.throws(() => wallOpenAiEndpoint('http://example.com', origin));
  assert.equal(wallOpenAiEndpoint('', 'http://localhost:3000/post'), 'http://localhost:3000/api/wall-ai');
  let fetchCalled = false;
  const silentFetch: typeof fetch = async () => { fetchCalled = true; throw new Error('Unexpected fetch'); };
  await assert.rejects(requestWallOpenAi({ ...options, server: '', pageUrl: origin, fetchImpl: silentFetch }, input), /chưa được thiết lập/);
  assert.equal(fetchCalled, false);
  current = null;
  await assert.rejects(requestWallOpenAi({ ...options, fetchImpl: silentFetch }, input), /đăng nhập/);
  assert.equal(fetchCalled, false);
  current = { uid: 'teacher-ok', getIdToken: async () => { current = null; return 'teacher'; } };
  await assert.rejects(requestWallOpenAi({ ...options, fetchImpl: silentFetch }, input), /Phiên giáo viên/);
  assert.equal(fetchCalled, false, 'Signing out while obtaining a token prevents sending');
  current = user;
  const changedFetch: typeof fetch = async () => { current = null; return new Response(JSON.stringify(result)); };
  await assert.rejects(requestWallOpenAi({ ...options, fetchImpl: changedFetch }, input), /Phiên giáo viên/);
  current = user;
  const timeoutFetch: typeof fetch = (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(requestWallOpenAi({ ...options, fetchImpl: timeoutFetch, timeoutMs: 5 }, input), /chưa phản hồi/);
  let captured: RequestInit | undefined;
  const captureFetch: typeof fetch = async (_url, init) => { captured = init; return new Response(JSON.stringify(result)); };
  await requestWallOpenAi({ ...options, fetchImpl: captureFetch }, input);
  assert.equal(captured?.redirect, 'error', 'A redirect cannot forward the teacher token to another host');
  assert.equal(captured?.credentials, 'omit');
  assert.deepEqual(Object.keys(JSON.parse(String(captured?.body))).sort(), ['kind', 'media', 'prompt', 'requestId']);
  console.info('OpenAI proxy/client passed: teacher authorization, revoked/anonymous denial, origin/size controls, strict Responses schemas, image/PDF inputs, private connection check, safe upstream failures, quotas/concurrency, no credential redirects, session changes and timeout.');
} finally {
  await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
}
