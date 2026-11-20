import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDocFromServer, updateDoc, type Firestore } from 'firebase/firestore';
import { synchronizeTimetable } from '../src/lib/timetableAccountStore';
import { emptyWorkspace, readDeviceCopy, serializeDeviceCopy, type DeviceCopy } from '../src/lib/timetableWorkspace';
import { optimizeTimetable } from '../src/lib/smartTimetable';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('This test needs the Firestore emulator.');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-learning-wall', firestore: {
  host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8'),
} });
const uid = 'test-personal-timetable';
const claims = { email: 'tuyenthcskimhy@gmail.com', email_verified: true };
const session = () => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
const sync = (db: Firestore, copy: DeviceCopy | null) => synchronizeTimetable(db, uid, copy, () => true);
try {
  const first = session();
  const initial = await sync(first, null);
  assert.equal(initial.action, 'empty');
  assert.equal((await getDocFromServer(doc(first, 'timetable_workspaces', uid))).exists(), false, 'Opening an account must not create demo data');
  const workspace = emptyWorkspace();
  workspace.scenario.education!.activeWeek = 12;
  workspace.scenario.teachers = [{ id: 't', name: 'A', level: 'THCS', unavailableSlots: ['2:1'] }];
  workspace.scenario.classes = [{ id: 'c', name: '6A', level: 'THCS' }];
  workspace.scenario.subjects = [{ id: 's', name: 'Công nghệ' }];
  workspace.scenario.assignments = [{ id: 'a', teacherId: 't', subjectId: 's', classId: 'c', periodsPerWeek: 2, maxPerDay: 1 }];
  workspace.solution = optimizeTimetable(workspace.scenario, [], 2);
  const saved = await sync(first, { workspace, base: null, pending: true });
  assert.equal(saved.action, 'upload');
  const second = session();
  const opened = await sync(second, null);
  assert.equal(opened.action, 'download');
  assert.equal(opened.digest, saved.digest);
  assert.equal(opened.account!.scenario.education!.activeWeek, 12);
  assert.deepEqual(opened.account!.scenario.teachers[0].unavailableSlots, ['2:1']);
  assert.equal(opened.account!.solution!.entries.length, 2);
  const staleEmpty = await sync(second, readDeviceCopy(JSON.stringify(emptyWorkspace())));
  assert.equal(staleEmpty.action, 'download');

  await updateDoc(doc(first, 'timetable_workspaces', uid), { 'workspace.scenario.publicationSnapshots': { old: { status: 'revoked' } } });
  const edit = (name: string): DeviceCopy => ({ base: opened.digest, pending: true, workspace: {
    ...opened.account!, scenario: { ...opened.account!.scenario, name },
  } });
  const a = edit('Device A'), b = edit('Device B');
  const changes = await Promise.all([sync(first, a), sync(second, b)]);
  assert.deepEqual(changes.map(x => x.action).sort(), ['conflict', 'upload']);
  const loser = changes[0].action === 'conflict' ? a : b;
  const collision = changes.find(x => x.action === 'conflict')!;
  const reloadedOffline = readDeviceCopy(serializeDeviceCopy(loser));
  assert.equal((await sync(second, reloadedOffline)).action, 'conflict');
  assert.equal((await synchronizeTimetable(second, uid, loser, () => true, { use: 'device', observed: saved.digest })).action, 'conflict');
  assert.equal((await synchronizeTimetable(second, uid, loser, () => true, { use: 'device', observed: collision.digest })).action, 'upload');
  const refreshed = await sync(session(), null);
  assert.equal(refreshed.account!.scenario.name, loser.workspace.scenario.name);
  assert.equal(refreshed.account!.solution!.entries.length, 2);
  assert.deepEqual((await getDocFromServer(doc(first, 'timetable_workspaces', uid))).data()!.workspace.scenario.publicationSnapshots, { old: { status: 'revoked' } });
  await assert.rejects(synchronizeTimetable(first, uid, loser, () => false), /Phiên đăng nhập/);
  console.log('Firestore: two independent authenticated clients, stale empty cache, simultaneous edits, conflict choice and persisted week 12 all passed.');
} finally {
  await env.cleanup();
}
