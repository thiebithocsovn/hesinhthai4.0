/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ADMIN_EMAIL?: string;
  readonly VITE_APP_BASE_PATH?: string;
  readonly VITE_FIREBASE_APP_CHECK_SITE_KEY?: string;
  readonly VITE_FIRESTORE_CACHE_MODE?: 'persistent' | 'memory';
  readonly VITE_GOOGLE_AI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
