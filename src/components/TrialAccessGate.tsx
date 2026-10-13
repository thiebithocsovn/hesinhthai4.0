import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, LogIn, Sparkles, UserPlus } from 'lucide-react';
import type { EcosystemApplicationId } from '../ecosystem';

export const APPLICATION_TRIAL_DURATION_MS = 10 * 60 * 1000;
const TRIAL_STORAGE_PREFIX = 'smartclass_trial_started_v1';

function trialStorageKey(applicationId: EcosystemApplicationId): string {
  return `${TRIAL_STORAGE_PREFIX}::${applicationId}`;
}

function readOrStartTrial(applicationId: EcosystemApplicationId): number {
  const now = Date.now();
  try {
    const key = trialStorageKey(applicationId);
    const stored = Number(localStorage.getItem(key));
    if (Number.isFinite(stored) && stored > 0 && stored <= now) return stored;
    localStorage.setItem(key, String(now));
  } catch {
    // If browser storage is unavailable, keep the current in-memory trial session usable.
  }
  return now;
}

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface TrialAccessGateProps {
  applicationId: EcosystemApplicationId;
  applicationName: string;
  bypass?: boolean;
  onBack: () => void;
  onRegister: () => void;
  onLogin: () => void;
  children: React.ReactNode;
}

export default function TrialAccessGate({
  applicationId,
  applicationName,
  bypass = false,
  onBack,
  onRegister,
  onLogin,
  children,
}: TrialAccessGateProps) {
  const [startedAt] = useState(() => readOrStartTrial(applicationId));
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (bypass) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [bypass]);

  const remaining = useMemo(
    () => Math.max(0, APPLICATION_TRIAL_DURATION_MS - (now - startedAt)),
    [now, startedAt],
  );

  if (bypass) return <>{children}</>;

  if (remaining <= 0) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-white flex items-center justify-center">
        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-7 md:p-10 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300">
            <Sparkles className="h-8 w-8" />
          </div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Đã kết thúc dùng thử</p>
          <h1 className="text-2xl md:text-3xl font-bold">Tiếp tục với {applicationName}</h1>
          <p className="mx-auto mt-4 max-w-md text-sm md:text-base leading-7 text-slate-300">
            Bạn đã trải nghiệm 10 phút trên thiết bị này. Đăng ký tài khoản giáo viên để tiếp tục sử dụng đầy đủ và lưu dữ liệu lâu dài.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onRegister}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white transition hover:bg-indigo-400"
            >
              <UserPlus className="h-5 w-5" />
              Đăng ký
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              <LogIn className="h-5 w-5" />
              Đăng nhập
            </button>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full border border-indigo-200 bg-white/95 px-3 py-2 text-sm shadow-xl backdrop-blur md:left-auto md:right-5 md:translate-x-0">
        <span className="flex items-center gap-1.5 font-semibold text-indigo-700">
          <Clock className="h-4 w-4" />
          Dùng thử {formatRemaining(remaining)}
        </span>
        <button
          type="button"
          onClick={onRegister}
          className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700"
        >
          Đăng ký
        </button>
      </div>
    </>
  );
}
