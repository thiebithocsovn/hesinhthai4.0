import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { EcosystemApplicationId } from '../ecosystem';
import TrialAccessGate from './TrialAccessGate';
import SmartTimetable from './SmartTimetable';

const APPLICATION_ID = 'smart-timetable' as EcosystemApplicationId;
const STORAGE_PREFIX = 'smartclass_timetable_v1';

type CloudState = 'local' | 'loading' | 'synced' | 'offline';

function navigateToLanding(): void {
  sessionStorage.setItem('currentView', JSON.stringify('landing'));
  window.location.assign(import.meta.env.BASE_URL);
}

function navigateToLibrary(): void {
  sessionStorage.setItem('currentView', JSON.stringify('admin'));
  window.location.assign(import.meta.env.BASE_URL);
}

function navigateToAuth(mode: 'login' | 'register'): void {
  sessionStorage.setItem('currentView', JSON.stringify('landing'));
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set('auth', mode);
  window.location.assign(url.toString());
}

function cloudSafeWorkspace(raw: string): { scenario: unknown; solution: unknown; versions: unknown[] } | null {
  try {
    const parsed = JSON.parse(raw) as { scenario?: unknown; solution?: unknown };
    if (!parsed.scenario || typeof parsed.scenario !== 'object') return null;
    return {
      scenario: parsed.scenario,
      solution: parsed.solution ?? null,
      // Cloud keeps only the working scenario + current solution. Full version history stays local/JSON,
      // avoiding Firestore's per-document size ceiling when a school has many classes and teachers.
      versions: [],
    };
  } catch {
    return null;
  }
}

export default function SmartTimetableEntry() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(Boolean(auth.currentUser));
  const [uid, setUid] = useState(auth.currentUser?.uid || 'guest');
  const [cloudState, setCloudState] = useState<CloudState>(auth.currentUser ? 'loading' : 'local');
  const storageKey = useMemo(() => `${STORAGE_PREFIX}:${uid}`, [uid]);

  useEffect(() => {
    let cancelled = false;
    return onAuthStateChanged(auth, user => {
      void (async () => {
        const nextUid = user?.uid || 'guest';
        setSignedIn(Boolean(user));
        setUid(nextUid);

        if (!user) {
          if (!cancelled) {
            setCloudState('local');
            setReady(true);
          }
          return;
        }

        setCloudState('loading');
        const nextStorageKey = `${STORAGE_PREFIX}:${nextUid}`;
        try {
          // Local data wins when it already exists, preventing an older cloud copy from overwriting recent offline work.
          if (!localStorage.getItem(nextStorageKey)) {
            const snapshot = await getDoc(doc(db, 'timetable_workspaces', nextUid));
            const workspace = snapshot.exists() ? snapshot.data().workspace : null;
            if (workspace && typeof workspace === 'object') {
              localStorage.setItem(nextStorageKey, JSON.stringify(workspace));
            }
          }
          if (!cancelled) setCloudState('synced');
        } catch (error) {
          console.info('Thời khóa biểu tiếp tục ở chế độ local-first; chưa tải được bản cloud.', error);
          if (!cancelled) setCloudState('offline');
        } finally {
          if (!cancelled) setReady(true);
        }
      })();
    });
  }, []);

  useEffect(() => {
    if (!ready || !signedIn || uid === 'guest') return undefined;
    let cancelled = false;
    let lastSuccessfulLocalRaw = '';
    let writing = false;

    const synchronize = async () => {
      if (cancelled || writing) return;
      const localRaw = localStorage.getItem(storageKey) || '';
      if (!localRaw || localRaw === lastSuccessfulLocalRaw) return;
      const workspace = cloudSafeWorkspace(localRaw);
      if (!workspace) return;

      writing = true;
      try {
        await setDoc(doc(db, 'timetable_workspaces', uid), {
          teacherId: uid,
          workspace,
          updatedAt: serverTimestamp(),
        });
        lastSuccessfulLocalRaw = localRaw;
        if (!cancelled) setCloudState('synced');
      } catch (error) {
        console.info('Chưa thể đồng bộ TKB lên cloud; dữ liệu local vẫn được giữ nguyên.', error);
        if (!cancelled) setCloudState('offline');
      } finally {
        writing = false;
      }
    };

    const initialTimer = window.setTimeout(() => void synchronize(), 1200);
    const interval = window.setInterval(() => void synchronize(), 5000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void synchronize();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ready, signedIn, storageKey, uid]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Đang mở bộ xếp thời khóa biểu...</div>;
  }

  const cloudLabel = cloudState === 'synced' ? 'Đã đồng bộ cloud' : cloudState === 'loading' ? 'Đang tải cloud' : cloudState === 'offline' ? 'Đang dùng local/offline' : 'Dữ liệu dùng thử trên máy';

  return (
    <TrialAccessGate
      applicationId={APPLICATION_ID}
      applicationName="Xếp thời khóa biểu thông minh"
      bypass={signedIn}
      onBack={navigateToLanding}
      onRegister={() => navigateToAuth('register')}
      onLogin={() => navigateToAuth('login')}
    >
      {signedIn && (
        <div className={`fixed right-3 top-20 z-[70] rounded-full border px-3 py-1.5 text-[11px] font-bold shadow-sm backdrop-blur ${cloudState === 'synced' ? 'border-emerald-200 bg-emerald-50/95 text-emerald-700' : cloudState === 'offline' ? 'border-amber-200 bg-amber-50/95 text-amber-700' : 'border-slate-200 bg-white/95 text-slate-600'}`}>
          {cloudLabel}
        </div>
      )}
      <SmartTimetable
        storageKey={storageKey}
        trialMode={!signedIn}
        onBack={signedIn ? navigateToLibrary : navigateToLanding}
      />
    </TrialAccessGate>
  );
}
