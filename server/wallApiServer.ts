import dotenv from 'dotenv';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { createWallApiApp } from './wallApiApp';
import { createFirebaseTeacherAdminRouter } from './teacherAdminFirebase';

dotenv.config({ quiet: true });
const values = (input: string | undefined) => new Set((input || '').split(',').map(value => value.trim()).filter(Boolean));
const origins = values(process.env.ALLOWED_ORIGINS || 'https://thiebithocsovn.github.io');
const app = createWallApiApp({
  apiKey: process.env.OPENAI_API_KEY?.trim() || '',
  model: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
  anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
  teacherUids: values(process.env.OPENAI_TEACHER_UIDS),
  teacherEmails: values(process.env.OPENAI_TEACHER_EMAILS?.toLowerCase()),
  origins,
}, {
  async verifyTeacher(token) {
    const admin = getApps().find(item => item.name === 'wall-api-auth') || initializeApp({
      projectId: firebaseConfig.projectId,
    }, 'wall-api-auth');
    const user = await getAuth(admin).verifyIdToken(token, true);
    return { uid: user.uid, anonymous: user.firebase?.sign_in_provider === 'anonymous',
      email: user.email, emailVerified: user.email_verified === true };
  },
}, createFirebaseTeacherAdminRouter(origins));
app.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.info('Learning-wall private API server started.');
});
