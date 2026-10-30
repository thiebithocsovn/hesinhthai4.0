import type { Credential } from 'firebase-admin/app';
import firebaseConfig from '../firebase-applet-config.json';

// REST accepts both ADC/certificate OAuth tokens and keyless Workload Identity credentials.
// Only point reads are needed; never expose the database or its credential to the browser.
export async function readTeacherAdminDocument(
  credential: Credential,
  collection: 'admins' | 'teachers',
  uid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id?: string; email?: string } | null> {
  if (!uid || uid.length > 128 || uid.includes('/')) throw new Error('Invalid document identity.');
  const token = await credential.getAccessToken();
  const path = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collection}/${encodeURIComponent(uid)}`;
  const response = await fetchImpl('https://firestore.googleapis.com/v1/' + path + '?mask.fieldPaths=id&mask.fieldPaths=email', {
    headers: { Authorization: 'Bearer ' + token.access_token },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Teacher account database is unavailable.');
  const data = await response.json();
  if (data?.name !== path) {
    throw new Error('Invalid teacher document response.');
  }
  return { id: data.fields?.id?.stringValue, email: data.fields?.email?.stringValue };
}
