import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);

// Gemini API calls require a real production attestation provider; never disable App Check as a workaround.
// The reCAPTCHA Enterprise site key is public, but must be registered for this Web app and domain.
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY?.trim();
export const appCheck: AppCheck | null = (() => {
  if (!appCheckSiteKey || typeof window === 'undefined') return null;
  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('Không thể khởi tạo Firebase App Check.', error);
    return null;
  }
})();

// Shared school computers must not retain a previous teacher's Firestore cache.
// Persistent offline storage is opt-in for individually managed devices only.
const usePersistentFirestoreCache =
  typeof window !== 'undefined' &&
  typeof indexedDB !== 'undefined' &&
  import.meta.env.VITE_FIRESTORE_CACHE_MODE === 'persistent';

export const db = initializeFirestore(app, {
  localCache: usePersistentFirestoreCache
    ? persistentLocalCache({
      cacheSizeBytes: 64 * 1024 * 1024,
      tabManager: persistentMultipleTabManager(),
    })
    : memoryLocalCache(),
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
