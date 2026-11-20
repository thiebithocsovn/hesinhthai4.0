import assert from 'node:assert/strict';
import { createDefaultTimetableScenario, optimizeTimetable } from '../src/lib/smartTimetable';
import { isTimetableOwner } from '../src/lib/timetableOwner';
import { cloudWorkspace, decodeWorkspace, emptyWorkspace, readDeviceCopy, reconcileWorkspace, serializeDeviceCopy, workspaceDigest, type DeviceCopy, type TimetableWorkspace } from '../src/lib/timetableWorkspace';

assert.equal(isTimetableOwner('tuyenthcskimhy@gmail.com', true), true);
assert.equal(isTimetableOwner('tuyenthcskimhy@gmail.com', false), false);
assert.equal(isTimetableOwner('other@example.test', true), false);
const sample: TimetableWorkspace = { scenario: createDefaultTimetableScenario(), solution: null, versions: [] };
const empty = emptyWorkspace();
const plan = { ...sample, scenario: { ...sample.scenario, name: 'Trường thử', education: { ...empty.scenario.education!, activeWeek: 12 } } };
const schedule = { ...plan, solution: optimizeTimetable(sample.scenario, [], 2) };
const sampleDigest = await workspaceDigest(sample);

async function decide(device: DeviceCopy | null, remote: TimetableWorkspace | null) {
  return reconcileWorkspace(device, device && await workspaceDigest(device.workspace), remote, remote && await workspaceDigest(remote), sampleDigest);
}
const legacy = (workspace: TimetableWorkspace) => readDeviceCopy(JSON.stringify(workspace))!;
assert.equal(await decide(null, null), 'empty');
assert.equal(await decide(null, schedule), 'download', 'Fresh login on another computer loads its saved timetable');
assert.equal(await decide(legacy(empty), schedule), 'download', 'A pre-fix blank device cannot erase the school');
assert.equal(await decide(legacy(sample), schedule), 'download', 'Opening a default sample must not overwrite the account');
assert.equal(await decide(legacy(sample), null), 'empty', 'New accounts never upload the sample');
assert.equal(await decide(legacy(schedule), null), 'upload', 'Migrate the only existing legacy school to an unused account');
assert.equal(await decide(legacy(schedule), plan), 'conflict', 'Preserve existing unsaved legacy solutions');
const base = await workspaceDigest(plan);
const saved = { workspace: plan, base, pending: false };
assert.equal(await decide(saved, schedule), 'download', 'A previously synced but stale device refreshes');
const pending = readDeviceCopy(serializeDeviceCopy({ workspace: schedule, base, pending: true }))!;
assert.equal(await decide(pending, plan), 'upload', 'Offline edit survives sign-out and reconnect');
assert.equal(await decide(pending, schedule), 'equal', 'Retry after an interrupted acknowledgement');
assert.equal(await decide(pending, empty), 'conflict', 'Concurrent changes require an explicit choice');
assert.equal(await decide(saved, null), 'conflict', 'Do not silently discard or republish a deleted account record');
assert.equal(await decide(saved, empty), 'conflict', 'Protect a populated device from an older browser which uploaded an empty document');
const sparse = { ...schedule, scenario: { ...schedule.scenario, teachers: [{ id: 'new', name: 'New', level: 'THCS' as const }] } };
assert.equal(await workspaceDigest(sparse), await workspaceDigest(decodeWorkspace(cloudWorkspace(sparse))), 'Fresh editor rows and restored rows have the same revision');
const ordered = decodeWorkspace({ ...schedule, scenario: Object.fromEntries(Object.entries(schedule.scenario).reverse()) });
assert.equal(await workspaceDigest(ordered), await workspaceDigest(schedule), 'Firestore map order is immaterial');
const published = decodeWorkspace({ ...schedule, scenario: { ...schedule.scenario, publicationSnapshots: { old: {} } }, versions: [schedule.solution] });
assert.equal(await workspaceDigest(published), await workspaceDigest(schedule));
assert.deepEqual(cloudWorkspace(published).versions, []);
assert.equal('publicationSnapshots' in cloudWorkspace(published).scenario, false);
assert.equal(decodeWorkspace(cloudWorkspace(published)).scenario.education!.activeWeek, 12);
assert.deepEqual(decodeWorkspace(cloudWorkspace(published)).solution, JSON.parse(JSON.stringify(ordered.solution)));
assert.throws(() => decodeWorkspace({ scenario: {} }), /định dạng/);
console.log('Personal timetable: owner, two devices, scheduled entries, cached blank/sample, migration, offline restart, conflicts and retries passed.');
