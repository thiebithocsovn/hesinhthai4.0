import { cert, type AppOptions } from 'firebase-admin/app';
import firebaseConfig from '../firebase-applet-config.json';
import { createTeacherAdminFederation } from './teacherAdminFederation';

export class TeacherAdminConfigurationError extends Error {
  readonly code = 'teacher-admin/not-configured';
  constructor() { super('Teacher password API credentials are unavailable.'); }
}

// Server-only configuration. Never import this module into the browser application.
export function teacherAdminAppOptions(environment: NodeJS.ProcessEnv = process.env): AppOptions {
  const options: AppOptions = { projectId: firebaseConfig.projectId };
  try {
    const federation = createTeacherAdminFederation(environment);
    if (federation) return { ...options, credential: federation };
  } catch { throw new TeacherAdminConfigurationError(); }
  const value = environment.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (value) {
    try {
      const account = JSON.parse(value);
      if (account.type !== 'service_account' || account.project_id !== firebaseConfig.projectId ||
        typeof account.client_email !== 'string' ||
        !account.client_email.endsWith('@' + firebaseConfig.projectId + '.iam.gserviceaccount.com') ||
        typeof account.private_key !== 'string') throw new TeacherAdminConfigurationError();
      options.credential = cert({ projectId: account.project_id, clientEmail: account.client_email,
        privateKey: account.private_key.replace(/\\n/g, '\n') });
    } catch { throw new TeacherAdminConfigurationError(); }
  } else if (environment.VERCEL === '1' && !environment.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    // Vercel has no Google metadata server. Fail explicitly instead of attempting ADC discovery.
    throw new TeacherAdminConfigurationError();
  }
  return options;
}
