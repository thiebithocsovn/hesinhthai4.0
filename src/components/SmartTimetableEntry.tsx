import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithCredential, signOut, type User } from 'firebase/auth';
import { auth, db } from '../firebase';
import { AUTH_REQUEST_TIMEOUT_MS, describeAuthError, waitForAuthOperation } from '../lib/authFlow';
import { requestGoogleCredential } from '../lib/googleAuth';
import { isTimetableOwner } from '../lib/timetableOwner';
import { synchronizeTimetable, type AccountResult, type ConflictChoice } from '../lib/timetableAccountStore';
import { emptyWorkspace, readDeviceCopy, serializeDeviceCopy, workspaceSummary, type DeviceCopy, type TimetableWorkspace } from '../lib/timetableWorkspace';
import SmartTimetable from './SmartTimetable';

function goBack() {
  sessionStorage.setItem('currentView', JSON.stringify(auth.currentUser ? 'admin' : 'landing'));
  window.location.assign(import.meta.env.BASE_URL);
}

function GoogleLogin({ user }: { user: User | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function login() {
    setBusy(true);
    setError('');
    const attempt = new AbortController();
    controller.current = attempt;
    try {
      const credential = await requestGoogleCredential(auth, attempt.signal);
      await waitForAuthOperation(signInWithCredential(auth, credential), AUTH_REQUEST_TIMEOUT_MS, 'auth/request-timeout');
    } catch (cause) {
      if (!attempt.signal.aborted) setError(describeAuthError(cause));
    } finally {
      if (!attempt.signal.aborted) setBusy(false);
    }
  }
  return <main className="mx-auto max-w-lg space-y-4 p-8">
    <h1 className="text-2xl font-bold">Thời khóa biểu cá nhân</h1>
    <p>{user ? `Tài khoản ${user.email || 'hiện tại'} chưa có quyền sử dụng bản cá nhân.` : 'Đăng nhập tài khoản Google của thầy để mở thời khóa biểu đã lưu.'}</p>
    {error && <p role="alert">{error}</p>}
    <button className="tt-button primary" disabled={busy} onClick={() => void login()}>{busy ? 'Đang xác thực…' : user ? 'Chọn tài khoản Google khác' : 'Đăng nhập bằng Google'}</button>
    <button className="tt-button" onClick={goBack}>Về Hệ sinh thái</button>
  </main>;
}

interface SyncControls {
  edit: (workspace: TimetableWorkspace) => void;
  refresh: (choice?: ConflictChoice) => void;
  hasPending: () => boolean;
}
type Phase = 'loading' | 'saving' | 'saved' | 'empty' | 'error' | 'conflict';

function downloadCopy(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'Thoi-khoa-bieu-ban-du-phong.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PersonalWorkspace({ user }: { user: User }) {
  const key = 'smartclass_timetable_v1:' + user.uid;
  const [editor, setEditor] = useState<{ initial: TimetableWorkspace; generation: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [problem, setProblem] = useState('');
  const [cacheFailed, setCacheFailed] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ local: TimetableWorkspace; remote: AccountResult } | null>(null);
  const controls = useRef<SyncControls | null>(null);
  const changed = useCallback((workspace: TimetableWorkspace) => controls.current?.edit(workspace), []);

  useEffect(() => {
    let active = true;
    let displayed = false;
    let running = false;
    let requested = false;
    let device: DeviceCopy | null = null;
    let choice: ConflictChoice | undefined;
    const current = () => active && auth.currentUser?.uid === user.uid;
    const recoveryKey = key + ':recovery';
    function display(workspace: TimetableWorkspace) {
      displayed = true;
      setEditor(previous => ({ initial: workspace, generation: (previous?.generation || 0) + 1 }));
    }
    let lastLocalRaw: string | null = null;
    function saveDevice(copy: DeviceCopy) {
      device = copy;
      try {
        const disk = localStorage.getItem(key);
        if (disk && disk !== lastLocalRaw && readDeviceCopy(disk)?.pending && !preserve(disk)) return;
        const nextRaw = serializeDeviceCopy(copy);
        localStorage.setItem(key, nextRaw);
        lastLocalRaw = nextRaw;
        setCacheFailed(false);
      } catch {
        setCacheFailed(true);
      }
    }
    function preserve(raw: string) {
      setRecovery(raw);
      try {
        localStorage.setItem(recoveryKey, raw);
        return true;
      } catch {
        setCacheFailed(true);
        return false;
      }
    }

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
      lastLocalRaw = raw;
      device = readDeviceCopy(raw);
      setRecovery(localStorage.getItem(recoveryKey));
    } catch {
      if (raw) {
        preserve(raw);
      } else setCacheFailed(true);
    }

    async function sync() {
      requested = true;
      if (running) return;
      running = true;
      try {
        while (requested && current()) {
          requested = false;
          const starting = device;
          const selection = choice;
          choice = undefined;
          setPhase(starting?.pending ? 'saving' : 'loading');
          try {
            const result = await synchronizeTimetable(db, user.uid, starting, current, selection);
            if (!current()) return;
            // An edit made while a request was in flight must survive the acknowledgement.
            if (device !== starting) {
              if (device && (result.action === 'upload' || result.action === 'equal')) {
                saveDevice({ ...device, base: result.digest, pending: true });
              }
              requested = true;
              continue;
            }
            if (result.action === 'conflict' && starting) {
              displayed = false;
              setConflict({ local: starting.workspace, remote: result });
              setPhase('conflict');
              continue;
            }

            let workspace = starting?.workspace;
            const download = result.action === 'download';
            const empty = result.action === 'empty';
            if (download || empty) {
              if (starting && (selection || starting.base === undefined)) {
                const preserved = preserve(JSON.stringify(starting.workspace));
                if (!preserved && !selection) {
                  displayed = false;
                  setConflict({ local: starting.workspace, remote: result });
                  setPhase('conflict');
                  continue;
                }
              }
              workspace = download ? { ...result.account!, versions: starting?.workspace.versions || [] } : emptyWorkspace();
            }
            if (!workspace) throw new Error('Không đọc được dữ liệu thời khóa biểu.');
            saveDevice({ workspace, base: result.digest, pending: false });
            if (!displayed || download || (empty && selection)) display(workspace);
            setConflict(null);
            setPhase(empty ? 'empty' : 'saved');
          } catch (cause) {
            if (!current()) return;
            setProblem(describeAuthError(cause));
            setPhase('error');
            if (!displayed && device) display(device.workspace);
          }
        }
      } finally {
        running = false;
      }
    }
    controls.current = {
      edit(workspace) {
        if (!current()) return;
        saveDevice({ workspace, base: device?.base, pending: true });
        void sync();
      },
      hasPending: () => Boolean(device?.pending),
      refresh(selection) {
        choice = selection;
        void sync();
      },
    };
    const refresh = () => { if (document.visibilityState === 'visible') void sync(); };
    const leaving = (event: BeforeUnloadEvent) => {
      if (device?.pending) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('online', refresh);
    window.addEventListener('beforeunload', leaving);
    document.addEventListener('visibilitychange', refresh);
    void sync();
    return () => {
      active = false;
      controls.current = null;
      window.removeEventListener('online', refresh);
      window.removeEventListener('beforeunload', leaving);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [key, user.uid]);

  const labels: Record<Phase, string> = {
    loading: 'Đang đọc bản trên tài khoản…', saving: 'Đang lưu lên tài khoản…', saved: 'Đã lưu trên tài khoản',
    empty: 'Tài khoản chưa có bản lưu', conflict: 'Có hai bản khác nhau', error: 'Chưa đồng bộ được',
  };
  const status = <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
    <span className="break-all">{user.email}</span>
    <span role="status" className={phase === 'saved' ? 'text-emerald-700' : 'text-slate-700'}>{labels[phase]}</span>
    {phase === 'error' && <><span role="alert">{problem}</span><button className="underline" onClick={() => controls.current?.refresh()}>Thử đồng bộ lại</button></>}
    {cacheFailed && <span role="alert">Trình duyệt chưa lưu được bản dự phòng trên máy.</span>}
    {recovery && <button className="underline" onClick={() => downloadCopy(recovery)}>Tải bản dự phòng</button>}
    <button className="underline" disabled={phase === 'loading' || phase === 'saving'} onClick={() => {
      if (controls.current?.hasPending() && !window.confirm('Máy này còn thay đổi chưa lưu lên tài khoản. Máy khác sẽ thấy bản đã lưu trước đó. Vẫn đăng xuất?')) return;
      void signOut(auth).catch(cause => { setProblem(describeAuthError(cause)); setPhase('error'); });
    }}>Đăng xuất</button>
  </div>;

  if (conflict) {
    const choose = (use: ConflictChoice['use']) => {
      // Keep a recoverable copy of the displaced version before an explicit choice.
      if (use === 'device' && conflict.remote.account) {
        const raw = JSON.stringify(conflict.remote.account);
        try { localStorage.setItem(key + ':recovery', raw); setRecovery(raw); } catch { downloadCopy(raw); }
      }
      controls.current?.refresh({ use, observed: conflict.remote.digest });
    };
    return <main className="mx-auto max-w-2xl space-y-4 p-6">{status}
      <h1 className="text-xl font-bold">Chọn bản thời khóa biểu cần dùng</h1>
      <p>Bản trên máy và bản trên tài khoản có thay đổi khác nhau. Hãy chọn bản thầy muốn mở trên các máy.</p>
      <p><b>Trên máy này</b><br />{workspaceSummary(conflict.local)}</p>
      <p><b>Trên tài khoản</b><br />{workspaceSummary(conflict.remote.account)}</p>
      <div className="flex flex-wrap gap-2">
        <button className="tt-button primary" disabled={phase === 'loading' || phase === 'saving'} onClick={() => choose('account')}>Dùng bản trên tài khoản</button>
        <button className="tt-button" disabled={phase === 'loading' || phase === 'saving'} onClick={() => choose('device')}>Lưu bản máy này lên tài khoản</button>
        <button className="tt-button" onClick={() => downloadCopy(JSON.stringify(conflict.local))}>Tải bản máy này</button>
      </div></main>;
  }
  if (!editor) return <main className="mx-auto max-w-2xl p-6">{status}</main>;
  return <SmartTimetable key={editor.generation} agentUid={user.uid} storageKey={key} initialWorkspace={editor.initial} onWorkspaceChange={changed} accountStatus={status} onBack={goBack} />;
}

export default function SmartTimetableEntry() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <main role="status" className="p-8 text-center">Đang kiểm tra tài khoản Google…</main>;
  if (!user || !isTimetableOwner(user.email, user.emailVerified)) return <GoogleLogin user={user} />;
  return <PersonalWorkspace key={user.uid} user={user} />;
}
