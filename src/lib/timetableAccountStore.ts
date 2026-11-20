import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { createDefaultTimetableScenario } from './smartTimetable';
import { cloudWorkspace, decodeWorkspace, reconcileWorkspace, workspaceDigest, type DeviceCopy, type SyncDecision, type TimetableWorkspace } from './timetableWorkspace';

export interface ConflictChoice { use: 'device' | 'account'; observed: string | null }
export interface AccountResult {
  action: SyncDecision;
  account: TimetableWorkspace | null;
  digest: string | null;
}
let sampleDigest: Promise<string> | undefined;

// A read-only transaction also verifies that the server still has the version read.
// A retry recomputes the decision against the new account contents before any write.
export async function synchronizeTimetable(db: Firestore, uid: string, device: DeviceCopy | null, current: () => boolean, choice?: ConflictChoice): Promise<AccountResult> {
  const deviceDigest = device ? await workspaceDigest(device.workspace) : null;
  sampleDigest ??= workspaceDigest({ scenario: createDefaultTimetableScenario(), solution: null, versions: [] });
  const sample = await sampleDigest;
  const reference = doc(db, 'timetable_workspaces', uid);
  return runTransaction(db, async transaction => {
    if (!current()) throw new Error('Phiên đăng nhập đã thay đổi.');
    const snapshot = await transaction.get(reference);
    const stored = snapshot.data();
    if (stored && stored.teacherId !== uid) throw new Error('Chủ bản lưu không khớp với tài khoản đang mở.');
    const account = stored ? decodeWorkspace(stored.workspace) : null;
    const digest = account ? await workspaceDigest(account) : null;
    let action = reconcileWorkspace(device, deviceDigest, account, digest, sample);
    if (choice) {
      if (choice.observed !== digest) action = 'conflict';
      else if (choice.use === 'account') action = account ? 'download' : 'empty';
      else if (device) action = 'upload';
    }
    if (!current()) throw new Error('Phiên đăng nhập đã thay đổi.');
    if (action === 'upload' && device) {
      const workspace = cloudWorkspace(device.workspace);
      const publicationSnapshots = stored?.workspace?.scenario?.publicationSnapshots;
      const scenario = publicationSnapshots ? { ...workspace.scenario, publicationSnapshots } : workspace.scenario;
      transaction.set(reference, { teacherId: uid, workspace: { ...workspace, scenario }, updatedAt: serverTimestamp() });
      return { action, account: device.workspace, digest: deviceDigest };
    }
    return { action, account, digest };
  });
}
