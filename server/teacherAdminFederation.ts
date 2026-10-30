import type { Credential } from 'firebase-admin/app';
import { IdentityPoolClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

export interface FederatedTokenClient {
  getAccessToken(): Promise<{ token?: string | null }>;
  credentials: { expiry_date?: number };
}

export function federatedCredential(client: FederatedTokenClient): Credential {
  return {
    async getAccessToken() {
      const token = await client.getAccessToken();
      const expires = Math.floor(((client.credentials.expiry_date || 0) - Date.now()) / 1000);
      if (!token.token || expires <= 0) throw new Error('Federated Firebase credential is unavailable.');
      return { access_token: token.token, expires_in: expires };
    },
  };
}

export function createTeacherAdminFederation(environment: NodeJS.ProcessEnv): Credential | undefined {
  const provider = environment.TEACHER_ADMIN_WIF_PROVIDER?.trim();
  const account = environment.TEACHER_ADMIN_SERVICE_ACCOUNT?.trim();
  if (!provider && !account) return;
  if (environment.VERCEL !== '1' || environment.VERCEL_ENV !== 'production' ||
    provider !== 'projects/154715124810/locations/global/workloadIdentityPools/hesinhthai-teacher-password/providers/vercel-production' ||
    account !== 'teacher-password-api@' + firebaseConfig.projectId + '.iam.gserviceaccount.com') {
    throw new Error('Teacher password federation configuration is invalid.');
  }
  const client = new IdentityPoolClient({
    type: 'external_account',
    audience: '//iam.googleapis.com/' + provider,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + account + ':generateAccessToken',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    // Called inside the active request on refresh; never save or cache the Vercel JWT.
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  return federatedCredential(client);
}
