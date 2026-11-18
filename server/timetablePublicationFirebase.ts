import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { gzipSync, gunzipSync } from 'node:zlib';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { teacherAdminAppOptions } from './teacherAdminCredentials.js';
import { createTimetablePublicationApp, type PublicationRecord } from './timetablePublication.js';
import { createPublicationToken, decodePublicationToken } from './timetablePublicationToken.js';

/** Keep the existing server identity read-only. Writes use the owner's ID token and existing Firestore Rules. */
export function createFirebaseTimetablePublicationApp() {
  const app = () => getApps().find(x => x.name === 'timetable-publication') || initializeApp(teacherAdminAppOptions(), 'timetable-publication');
  const root = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;
  const secret = () => process.env.TIMETABLE_PUBLICATION_SECRET || '';
  const request = async (path: string, init: RequestInit = {}, ownerToken?: string) => {
    const accessToken = ownerToken || (await app().options.credential!.getAccessToken()).access_token;
    return fetch(`https://firestore.googleapis.com/v1/${root}/${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
  };
  return createTimetablePublicationApp({
    ready() { try { return /^[0-9a-f]{64}$/i.test(secret()) && Boolean(app().options.credential); } catch { return false; } },
    createId(uid) { return createPublicationToken(uid, secret()); },
    async verifyOwner(token) {
      const identity = await getAuth(app()).verifyIdToken(token, true);
      if (identity.firebase?.sign_in_provider === 'anonymous') throw new Error('Anonymous access');
      const adminEmails = (process.env.TEACHER_ADMIN_EMAILS || 'tuyenthcskimhy@gmail.com').split(',').map(x => x.trim().toLowerCase());
      const claimedAdmin = identity.admin === true || identity.role === 'admin' || identity.email_verified === true && adminEmails.includes((identity.email || '').toLowerCase());
      if (!claimedAdmin) {
        const admin = await request(`admins/${encodeURIComponent(identity.uid)}?mask.fieldPaths=id`);
        if (!admin.ok) {
          const response = await request(`teachers/${encodeURIComponent(identity.uid)}?mask.fieldPaths=id&mask.fieldPaths=status`);
          const data = response.ok ? await response.json() : null;
          if (data?.fields?.status?.stringValue !== 'active' || data?.fields?.id?.stringValue !== identity.uid) throw new Error('Inactive teacher');
        }
      }
      return identity.uid;
    },
    async read(id) {
      let address: { uid: string; key: string };
      try { address = decodePublicationToken(id, secret()); } catch { return null; }
      const field = `workspace.scenario.publicationSnapshots.${address.key}`;
      const response = await request(`timetable_workspaces/${address.uid}?mask.fieldPaths=${encodeURIComponent(field)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Publication read failed');
      const document = await response.json();
      const data = document.fields?.workspace?.mapValue?.fields?.scenario?.mapValue?.fields?.publicationSnapshots?.mapValue?.fields?.[address.key]?.mapValue?.fields;
      if (!data) return null;
      const snapshot = JSON.parse(gunzipSync(Buffer.from(data.snapshotGzip.stringValue, 'base64'), { maxOutputLength: 700000 }).toString('utf8'));
      return { ownerUid: address.uid, status: data.status.stringValue, snapshot, updateTime: document.updateTime } as PublicationRecord;
    },
    async write(id, record, ownerToken) {
      const address = decodePublicationToken(id, secret());
      if (address.uid !== record.ownerUid) throw new Error('Owner mismatch');
      const field = `workspace.scenario.publicationSnapshots.${address.key}`;
      const response = await request(`timetable_workspaces/${address.uid}?updateMask.fieldPaths=${encodeURIComponent(field)}&currentDocument.exists=true`, {
        method: 'PATCH', body: JSON.stringify({ fields: { workspace: { mapValue: { fields: { scenario: { mapValue: { fields: { publicationSnapshots: { mapValue: { fields: { [address.key]: { mapValue: { fields: {
          status: { stringValue: record.status }, snapshotGzip: { stringValue: gzipSync(JSON.stringify(record.snapshot)).toString('base64') }, updatedAt: { timestampValue: new Date().toISOString() },
        } } } } } } } } } } } } } }),
      }, ownerToken);
      if (!response.ok) throw new Error('Publication write failed');
    },
  }, new Set((process.env.ALLOWED_ORIGINS || 'https://thiebithocsovn.github.io,https://hesinhthai4-0.vercel.app,https://hesinhthai4-0-thietbihocso.vercel.app').split(',').map(x => x.trim()).filter(Boolean)));
}
