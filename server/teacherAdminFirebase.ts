import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { createTeacherAdminRouter } from './teacherAdmin';
import { teacherAdminAppOptions } from './teacherAdminCredentials';

export function createFirebaseTeacherAdminRouter(origins: Set<string>) {
  const app = () => getApps().find(item => item.name === 'teacher-account-admin') ||
    initializeApp(teacherAdminAppOptions(), 'teacher-account-admin');
  const accountAuth = () => getAuth(app());
  const database = () => getFirestore(app(), firebaseConfig.firestoreDatabaseId);
  // The default identity is the same verified administrator allowed by firestore.rules.
  const administratorEmails = new Set((process.env.TEACHER_ADMIN_EMAILS || 'tuyenthcskimhy@gmail.com')
    .split(',').map(email => email.trim().toLowerCase()).filter(Boolean));
  return createTeacherAdminRouter({ origins, administratorEmails }, {
    async verifyAdministrator(token) {
      const identity = await accountAuth().verifyIdToken(token, true);
      return { uid: identity.uid, email: identity.email, emailVerified: identity.email_verified === true,
        anonymous: identity.firebase?.sign_in_provider === 'anonymous', admin: identity.admin === true,
        role: typeof identity.role === 'string' ? identity.role : undefined };
    },
    async isStoredAdministrator(uid) { return (await database().collection('admins').doc(uid).get()).exists; },
    async getTeacher(uid) {
      const profile = await database().collection('teachers').doc(uid).get();
      if (!profile.exists) return null;
      const data = profile.data()!;
      return { id: data.id, email: data.email };
    },
    async getAccount(uid) {
      const account = await accountAuth().getUser(uid);
      return { email: account.email, customClaims: account.customClaims };
    },
    async updatePassword(uid, password) { await accountAuth().updateUser(uid, { password }); },
    audit(event) { console.info(JSON.stringify(event)); },
  });
}
