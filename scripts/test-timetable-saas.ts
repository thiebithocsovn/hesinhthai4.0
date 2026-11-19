import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { createDefaultTimetableScenario, optimizeTimetable } from '../src/lib/smartTimetable';
import { auditTimetableSolution } from '../src/lib/smartTimetableAudit';
import { createTimetableSchoolsApp, SchoolError, canSchoolRole, parseInvitationCode, verifyReviewSeparation, type TimetableSchool, type TimetableSchoolIdentity, type TimetableSchoolMembership, type TimetableSchoolInvite, type TimetableSchoolWorkspace, type TimetableSchoolReview, type TimetableSchoolPublicRecord, type TimetableSchoolAudit, type TimetableSchoolsStore } from '../server/timetableSchools';

const identities: Record<string, TimetableSchoolIdentity> = {
  'owner-a': { uid: 'owner-a', email: 'director@example.edu.vn', emailVerified: true },
  'reviewer-a': { uid: 'reviewer-a', email: 'review@example.edu.vn', emailVerified: true },
  'viewer-a': { uid: 'viewer-a', email: 'viewer@example.edu.vn', emailVerified: true },
  'owner-b': { uid: 'owner-b', email: 'another@example.edu.vn', emailVerified: true },
  'unverified': { uid: 'unverified', email: 'bad@example.edu.vn', emailVerified: false },
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const schools = new Map<string, TimetableSchool>();
const members = new Map<string, Map<string, TimetableSchoolMembership>>();
const invites = new Map<string, Map<string, TimetableSchoolInvite>>();
const workspaces = new Map<string, TimetableSchoolWorkspace>();
const reviews = new Map<string, Map<string, TimetableSchoolReview>>();
const publicRecords = new Map<string, Map<string, TimetableSchoolPublicRecord>>();
const events = new Map<string, TimetableSchoolAudit[]>();
const storage: TimetableSchoolsStore = {
  async list(uid) { return [...schools.values()].filter(s => members.get(s.id)?.has(uid)).map(clone); },
  async create(s, actor) { schools.set(s.id, clone(s)); members.set(s.id, new Map([[actor.uid, { uid: actor.uid, email: actor.email, role: 'owner', joinedAt: s.createdAt }]])); },
  async school(id) { return clone(schools.get(id) || null); },
  async member(id, uid) { return clone(members.get(id)?.get(uid) || null); },
  async members(id) { return clone([...(members.get(id)?.values() || [])]); },
  async invite(id, invite) { const map = invites.get(id) || new Map(); map.set(invite.codeHash, clone(invite)); invites.set(id, map); },
  async updateMember(id, targetUid, role, actorUid) {
    assert.ok(members.get(id)?.get(actorUid)?.role === 'owner');
    const item = members.get(id)?.get(targetUid);
    if (!item || item.role === 'owner') throw new SchoolError(409, 'Không thay đổi chủ trường.');
    if (role === null) members.get(id)!.delete(targetUid);
    else item.role = role;
  },
  async join(id, hash, actor) { const inv = invites.get(id)?.get(hash), school = schools.get(id); if (!inv || !school) throw new SchoolError(404, 'Không có lời mời.'); if (inv.email !== actor.email.toLowerCase() || inv.usedBy) throw new SchoolError(403, 'Lời mời không phù hợp.'); if ((members.get(id)?.size || 0) >= school.seatLimit) throw new SchoolError(409, 'Đã đủ số thành viên.'); if (members.get(id)?.has(actor.uid)) throw new SchoolError(409, 'Đã tham gia.'); inv.usedBy = actor.uid; const value: TimetableSchoolMembership = { uid: actor.uid, email: actor.email.toLowerCase(), role: inv.role, joinedAt: new Date().toISOString() }; members.get(id)!.set(actor.uid, value); return clone(value); },
  async readWorkspace(id) { return clone(workspaces.get(id) || null); },
  async saveWorkspace(id, data, expectedRevision) { const previous = workspaces.get(id), revision = previous?.revision || 0; if (revision !== expectedRevision) throw new SchoolError(409, 'Phiên bản cũ.'); workspaces.set(id, clone({ ...data, revision: revision + 1 })); return revision + 1; },
  async createReview(id, review) { const map = reviews.get(id) || new Map(); map.set(review.id, clone(review)); reviews.set(id, map); },
  async reviews(id) { return [...(reviews.get(id)?.values() || [])].map(v => ({ id: v.id, sourceRevision: v.sourceRevision, options: v.options, status: v.status, submittedBy: v.submittedBy, submittedAt: v.submittedAt, decidedAt: v.decidedAt, decidedBy: v.decidedBy, reason: v.reason })); },
  async review(id, reviewId) { return clone(reviews.get(id)?.get(reviewId) || null); },
  async decide(id, reviewId, status, actor, reason) { const item = reviews.get(id)?.get(reviewId); if (!item || item.status !== 'pending' || item.submittedBy === actor) throw new SchoolError(409, 'Không thể duyệt.'); item.status = status; item.decidedBy = actor; item.reason = reason; },
  async createPublication(id, publication) { const map = publicRecords.get(id) || new Map(); map.set(publication.id, clone(publication)); publicRecords.set(id, map); },
  async publication(id, publicId) { return clone(publicRecords.get(id)?.get(publicId) || null); },
  async publications(id) { return clone([...(publicRecords.get(id)?.values() || [])].map(p => ({ id: p.id, schoolId: p.schoolId, status: p.status, approvedReviewId: p.approvedReviewId, createdAt: p.createdAt }))); },
  async revoke(id, publicId) { const item = publicRecords.get(id)?.get(publicId); if (!item) throw new SchoolError(404, 'Không thấy bản công bố.'); item.status = 'revoked'; },
  async activity(id) { return clone(events.get(id) || []); },
  async audit(id, event) { events.set(id, [...(events.get(id) || []), clone(event)]); },
};
const app = createTimetableSchoolsApp({ ready: () => true, async verify(token) { if (!identities[token]) throw Error('Not verified'); return identities[token]; }, store: storage });
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/timetable/schools';
const req = async (action: string, who: string, value?: Record<string, unknown>, schoolId = '', origin = 'https://thiebithocsovn.github.io') => {
  const url = new URL(base);
  if (!value) { url.searchParams.set('action', action); if (schoolId) url.searchParams.set('schoolId', schoolId); }
  const response = await fetch(url, { method: value ? 'POST' : 'GET', headers: { Origin: origin, Authorization: 'Bearer ' + who, 'Content-Type': 'application/json' }, ...(value ? { body: JSON.stringify({ action, ...value }) } : {}) });
  return { status: response.status, body: await response.json() };
};
try {
  assert.equal((await fetch(base + '?action=health').then(r => r.json())).available, true);
  assert.equal((await req('list', 'unverified')).status, 403);
  assert.equal((await req('list', 'owner-a', undefined, '', 'https://untrusted.example')).status, 403);
  assert.equal((await req('create', 'owner-a', { name: 'Trường thí điểm' })).status, 201);
  const owned = (await req('list', 'owner-a')).body.schools[0] as TimetableSchool;
  assert.ok(owned?.id && owned.plan === 'pilot');
  assert.equal((await req('list', 'reviewer-a')).body.schools.length, 0, 'School listing is scoped to membership.');
  assert.equal((await req('detail', 'owner-b', undefined, owned.id)).status, 403, 'Cross-tenant access denied.');
  assert.equal((await req('create', 'owner-b', { name: 'Trường thứ hai' })).status, 201);
  const second = (await req('list', 'owner-b')).body.schools[0] as TimetableSchool;
  assert.equal((await req('detail', 'owner-a', undefined, second.id)).status, 403);
  assert.equal((await req('invite', 'owner-a', { schoolId: owned.id, email: 'review@example.edu.vn', role: 'reviewer' })).status, 201);
  const invitation = (await req('invite', 'owner-a', { schoolId: owned.id, email: 'viewer@example.edu.vn', role: 'viewer' })).body.code as string;
  assert.ok(parseInvitationCode(invitation).hash);
  assert.equal((await req('join', 'owner-b', { code: invitation })).status, 403, 'Invitation requires matching verified email.');
  const reviewerInvite = [...invites.get(owned.id)!.values()].find(v => v.email === 'review@example.edu.vn')!;
  assert.ok(reviewerInvite);
  // Invitation hashes are stored; only the response can reveal the one-time secret.
  const direct = (await req('invite', 'owner-a', { schoolId: owned.id, email: 'review@example.edu.vn', role: 'reviewer' })).body.code;
  assert.equal((await req('join', 'reviewer-a', { code: direct })).status, 200);
  assert.equal((await req('join', 'reviewer-a', { code: direct })).status, 403);
  assert.equal((await req('join', 'viewer-a', { code: invitation })).status, 200);
  assert.equal((await req('invite', 'reviewer-a', { schoolId: owned.id, email: 'fake@example.com', role: 'scheduler' })).status, 403);
  assert.equal((await req('changeRole', 'reviewer-a', { schoolId: owned.id, targetUid: 'viewer-a', role: 'scheduler' })).status, 403);
  assert.equal((await req('changeRole', 'owner-a', { schoolId: owned.id, targetUid: 'owner-a', role: 'viewer' })).status, 409);
  assert.equal((await req('changeRole', 'owner-a', { schoolId: owned.id, targetUid: 'viewer-a', role: 'scheduler' })).status, 200);
  assert.equal((await req('changeRole', 'owner-a', { schoolId: owned.id, targetUid: 'viewer-a', role: 'viewer' })).status, 200);
  assert.equal((await req('invite', 'owner-a', { schoolId: owned.id, email: 'admin@example.com', role: 'owner' })).status, 422);
  const scenario = createDefaultTimetableScenario(), solution = optimizeTimetable(scenario, [], 120);
  assert.ok(auditTimetableSolution(scenario, solution).valid);
  assert.equal((await req('save', 'viewer-a', { schoolId: owned.id, scenario, solution, expectedRevision: 0 })).status, 403);
  assert.equal((await req('save', 'owner-a', { schoolId: owned.id, scenario, solution, expectedRevision: 0 })).status, 200);
  assert.equal((await req('save', 'owner-a', { schoolId: owned.id, scenario, solution, expectedRevision: 0 })).status, 409, 'Optimistic revision lock.');
  assert.equal((await req('workspace', 'owner-b', undefined, owned.id)).status, 403);
  assert.equal((await req('submit', 'reviewer-a', { schoolId: owned.id, options: { title: 'Bản lịch số 1' } })).status, 403);
  assert.equal((await req('submit', 'owner-a', { schoolId: owned.id, options: { title: 'Bản lịch số 1' } })).status, 201);
  const submitted = (await req('reviews', 'owner-a', undefined, owned.id)).body.reviews[0] as TimetableSchoolReview;
  assert.equal(submitted.status, 'pending');
  assert.equal((await req('decide', 'owner-a', { schoolId: owned.id, reviewId: submitted.id, decision: 'approved' })).status, 409, 'Four eyes: author cannot self-approve.');
  assert.equal((await req('publish', 'owner-a', { schoolId: owned.id, reviewId: submitted.id })).status, 409, 'Cannot publish unapproved.');
  assert.equal((await req('decide', 'reviewer-a', { schoolId: owned.id, reviewId: submitted.id, decision: 'approved' })).status, 200);
  assert.equal((await req('decide', 'reviewer-a', { schoolId: owned.id, reviewId: submitted.id, decision: 'approved' })).status, 409);
  assert.equal((await req('publish', 'reviewer-a', { schoolId: owned.id, reviewId: submitted.id })).status, 403, 'Reviewer cannot publish.');
  const published = await req('publish', 'owner-a', { schoolId: owned.id, reviewId: submitted.id });
  assert.equal(published.status, 201);
  const index = await req('publications', 'owner-a', undefined, owned.id);
  assert.equal(index.status, 200);
  assert.equal(index.body.publications.length, 1);
  assert.equal(index.body.publications[0].snapshot, undefined, 'Publication inventory excludes sensitive payload.');
  assert.equal((await req('publications', 'viewer-a', undefined, owned.id)).status, 403);
  const url = base + '?action=public&code=' + encodeURIComponent(published.body.code);
  const publicHtml = await fetch(url);
  assert.equal(publicHtml.status, 200);
  const text = await publicHtml.text();
  assert.ok(text.includes('Tra cứu thời khóa biểu') && !text.includes('unavailableSlots'));
  assert.equal((await req('revoke', 'owner-a', { schoolId: owned.id, publicId: published.body.code.split('.').at(-1) })).status, 200);
  assert.equal((await fetch(url)).status, 404, 'Revoked URL must fail.');
  assert.equal((await req('solve', 'owner-a', { schoolId: owned.id })).status, 503, 'No fake server-side CP-SAT solver.');
  assert.ok(canSchoolRole('reviewer', 'review') && !canSchoolRole('viewer', 'edit') && !canSchoolRole('scheduler', 'publish'));
  assert.equal(verifyReviewSeparation(submitted, identities['owner-a'].uid) !== null, true);
  assert.equal((await req('activity', 'viewer-a', undefined, owned.id)).status, 403);
  assert.equal((await req('changeRole', 'owner-a', { schoolId: owned.id, targetUid: 'viewer-a', role: null })).status, 200);
  assert.equal((await req('workspace', 'viewer-a', undefined, owned.id)).status, 403);
  console.log('Timetable SaaS: tenant isolation, identity, one-time invitation, roles, optimistic locking, 4-eyes approval, publish/revoke, no fake solver passed.');
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}


// Vercel loads independently transformed ESM modules. This catches a route import
// that works with a bundler but fails at runtime due to a wrong relative .js path.
const folder = mkdtempSync(join(tmpdir(), 'timetable-saas-route-'));
try {
  const sources = [
    'api/timetable/schools.ts', 'server/timetableSchoolsFirebase.ts', 'server/timetableSchools.ts',
    'server/teacherAdminCredentials.ts', 'server/teacherAdminFederation.ts',
    'src/lib/timetableEducation.ts', 'src/lib/timetableWeek12.ts', 'src/lib/smartTimetable.ts', 'src/lib/smartTimetableAdvanced.ts',
    'src/lib/smartTimetableResources.ts', 'src/lib/smartTimetableAudit.ts', 'src/lib/timetablePublication.ts',
  ];
  for (const file of sources) {
    const target = join(folder, file.replace(/\.ts$/, '.js'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm', target: 'node24' }).code);
  }
  writeFileSync(join(folder, 'package.json'), '{"type":"module"}');
  writeFileSync(join(folder, 'firebase-applet-config.json'), readFileSync('firebase-applet-config.json'));
  symlinkSync(resolve('node_modules'), join(folder, 'node_modules'), 'dir');
  const js = [
    'import app from ' + JSON.stringify(join(folder, 'api/timetable/schools.js')) + ';',
    "const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));",
    "try { const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/timetable/schools?action=health');",
    "const data=await r.json(); if(r.status!==200 || data.available!==false || data.service!=='timetable-schools') throw Error('Serverless route smoke test failed');",
    "} finally {await new Promise(r=>server.close(r));}",
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', js], {
    encoding: 'utf8', timeout: 20000, env: { ...process.env, VERCEL: '1', TIMETABLE_SAAS_ENABLED: 'false' },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Serverless route failed');
  console.log('Timetable SaaS Vercel route: isolated ESM modules initialize safely while pilot is disabled.');
} finally {
  rmSync(folder, { recursive: true, force: true });
}
