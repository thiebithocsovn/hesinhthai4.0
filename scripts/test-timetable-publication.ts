import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createDefaultTimetableScenario, optimizeTimetable } from '../src/lib/smartTimetable';
import { makePublicTimetable, publicTimetableHtml } from '../src/lib/timetablePublication';
import { createTimetablePublicationApp, type PublicationRecord } from '../server/timetablePublication';
import { createPublicationToken, decodePublicationToken } from '../server/timetablePublicationToken';
import { allocateExamRooms, verifyExamRoomPlan } from '../src/lib/timetableExamRooms';
import { createTimetableWorkbook } from '../src/lib/timetableExcel';
import { timetablePrintHtml } from '../src/lib/timetablePrint';
import { scenarioFromAssignmentRows } from '../src/lib/smartTimetableImport';

const scenario = createDefaultTimetableScenario(), solution = optimizeTimetable(scenario, [], 120);
const options = { title: 'Tuần 1 </script><script>alert(1)</script>', effectiveFrom: '2026-11-18', effectiveTo: '', notes: 'Kiểm tra', showTeacherNames: false };
const snapshot = makePublicTimetable(scenario, solution, options);
const serialized = JSON.stringify(snapshot);
assert.ok(!serialized.includes('unavailableSlots') && !serialized.includes('preferredSlots') && !serialized.includes('homeroomTeacherId'));
assert.ok(!serialized.includes(scenario.teachers[0].name));
assert.ok(snapshot.teachers.every(t => /^Giáo viên \d+$/.test(t.name)));
const html = publicTimetableHtml(snapshot);
assert.ok(!html.includes(options.title), 'Public HTML encodes script-like titles as data.');
assert.ok(html.includes('\\u003c/script\\u003e'));
assert.throws(() => makePublicTimetable(scenario, { ...solution, entries: solution.entries.slice(1) }, options));
assert.throws(() => makePublicTimetable(scenario, solution, { ...options, effectiveFrom: '2026-02-30' }));

const secret = 'ab'.repeat(32), token = createPublicationToken('owner-with-private-uid', secret), address = decodePublicationToken(token, secret);
assert.equal(address.uid, 'owner-with-private-uid'); assert.ok(!token.includes(address.uid));
assert.throws(() => decodePublicationToken(token.slice(0, 20) + (token[20] === 'A' ? 'B' : 'A') + token.slice(21), secret));
assert.throws(() => decodePublicationToken(token, 'cd'.repeat(32)));
assert.notEqual(createPublicationToken(address.uid, secret), token, 'Every new publication gets an unpredictable token.');

const records = new Map<string, PublicationRecord>(), writes: string[] = [];
const app = createTimetablePublicationApp({ ready: () => true,
  async verifyOwner(token) { if (token === 'owner-a' || token === 'owner-b') return token; throw new Error('Invalid user'); },
  async read(id) { return records.get(id) || null; },
  async write(id, record, ownerToken) { assert.equal(ownerToken, record.ownerUid, 'Writes carry the verified owner token, not a privileged runtime token.'); writes.push(id); records.set(id, record); },
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/timetable';
const request = (method: string, token?: string, id?: string, body?: unknown, origin = 'https://thiebithocsovn.github.io') => fetch(base + (id ? `?publicationId=${id}` : ''), { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
try {
  assert.equal((await fetch(base).then(r => r.json())).available, true);
  assert.equal((await request('POST', undefined, undefined, { scenario, solution, options })).status, 401);
  assert.equal((await request('POST', 'not-active', undefined, { scenario, solution, options })).status, 403);
  assert.equal((await request('POST', 'owner-a', undefined, { scenario, solution, options }, 'https://untrusted.example')).status, 403);
  assert.equal((await request('POST', 'owner-a', undefined, { scenario, solution: { ...solution, entries: [] }, options })).status, 422);
  assert.equal(writes.length, 0);
  const created = await request('POST', 'owner-a', undefined, { scenario, solution, options }); assert.equal(created.status, 201);
  const id = (await created.json()).publicationId;
  const read = await request('GET', undefined, id); assert.equal(read.status, 200); const publicData = await read.json(); assert.ok(publicData.snapshot); assert.equal(publicData.ownerUid, undefined);
  assert.equal((await request('POST', 'owner-b', id, { scenario, solution, options })).status, 403);
  assert.equal((await request('DELETE', 'owner-b', id)).status, 403);
  assert.equal((await request('POST', 'owner-a', id, { scenario, solution, options })).status, 200);
  assert.equal((await request('DELETE', 'owner-a', id)).status, 200);
  assert.equal((await request('GET', undefined, id)).status, 404);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }

const candidates = Array.from({ length: 43 }, (_, i) => ({ id: `HS${i + 1}`, name: `Thí sinh ${i + 1}`, className: `8A${i % 3 + 1}` }));
const plan = allocateExamRooms(candidates, [{ id: 'r1', name: 'P1', capacity: 25 }, { id: 'r2', name: 'P2', capacity: 20 }], 2026);
assert.deepEqual(verifyExamRoomPlan(plan), []); assert.equal(plan.seats.length, 43);
assert.deepEqual(plan.seats, allocateExamRooms(candidates, plan.rooms, 2026).seats);
assert.throws(() => allocateExamRooms([...candidates, candidates[0]], plan.rooms));
assert.throws(() => allocateExamRooms(candidates, [{ id: 'small', name: 'Nhỏ', capacity: 10 }]));
assert.ok(verifyExamRoomPlan({ ...plan, seats: [...plan.seats, plan.seats[0]] }).length);
const workbook = createTimetableWorkbook(scenario, solution); assert.ok(workbook.SheetNames.length >= scenario.classes.length + scenario.teachers.length + 2);
const print = timetablePrintHtml(scenario, solution, 'class', '*'); assert.equal((print.match(/<section>/g) || []).length, scenario.classes.length);
const imported = scenarioFromAssignmentRows([{ 'Lớp': '6A', 'Môn': 'Toán', 'Giáo viên': 'A', 'Tiết/tuần': 2, 'Tiết đôi': 1, 'Lớp ghép': '6B', 'Đồng giảng': 'B', 'Cơ sở': 'CS 1' }]);
assert.equal(imported.assignments[0].blockSize, 1); assert.equal(imported.assignments[0].additionalClassIds?.length, 1); assert.equal(imported.assignments[0].additionalTeacherIds?.length, 1);
console.log('Timetable publication: owner authorization, redaction, XSS-safe HTML, encrypted tokens, revocation, exam seating and exports passed.');
