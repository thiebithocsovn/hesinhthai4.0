import { deleteApp, initializeApp } from 'firebase/app';
import { browserPopupRedirectResolver, GoogleAuthProvider, initializeAuth, inMemoryPersistence, signInWithPopup, type Auth, type OAuthCredential } from 'firebase/auth';
import { AuthFlowError, GOOGLE_POPUP_TIMEOUT_MS, waitForAuthOperation } from './authFlow';

export async function requestGoogleCredential(auth: Auth, signal: AbortSignal): Promise<OAuthCredential> {
  if (signal.aborted) throw new AuthFlowError('auth/google-sign-in-cancelled');
  // An abandoned popup must never replace the account in the main application.
  const popupApp = initializeApp(auth.app.options, `google-login-${crypto.randomUUID()}`);
  try {
    const popupAuth = initializeAuth(popupApp, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await waitForAuthOperation(
      signInWithPopup(popupAuth, provider), GOOGLE_POPUP_TIMEOUT_MS, 'auth/google-popup-timeout', signal,
    );
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential) throw new AuthFlowError('auth/invalid-credential');
    return credential;
  } finally {
    await deleteApp(popupApp);
  }
}
