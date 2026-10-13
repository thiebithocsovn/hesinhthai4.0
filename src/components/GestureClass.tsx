import { useState } from 'react';
import { ArrowLeft, ExternalLink, Hand, ListChecks, ShieldCheck } from 'lucide-react';
import { auth } from '../firebase';
import QuestionStudio from './QuestionStudio';

interface GestureClassProps {
  onBack: () => void;
}

export default function GestureClass({ onBack }: GestureClassProps) {
  const [activeModule, setActiveModule] = useState<'gesture' | 'questions'>('gesture');
  const ownerUid = auth.currentUser?.uid || 'guest';
  const applicationUrl = `${import.meta.env.BASE_URL}gestureclass/index.html?owner=${encodeURIComponent(ownerUid)}&v=projector-readable-v1`;

  return (
    <section className="flex h-dvh min-h-screen w-full flex-col overflow-hidden bg-slate-50">
      <header className="flex min-h-16 shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-5 md:flex-row md:items-center md:justify-between md:py-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Quay lại hệ sinh thái"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Hand className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">GestureClass</h1>
            <p className="truncate text-xs text-slate-500">Lớp Học Thông Minh 4.0</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto">
          <div className="flex shrink-0 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveModule('gesture')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeModule === 'gesture' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Hand className="h-4 w-4" />
              Lớp học cử chỉ
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('questions')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeModule === 'questions' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <ListChecks className="h-4 w-4" />
              Trắc nghiệm 10 dạng
            </button>
          </div>

          {activeModule === 'gesture' && (
            <>
              <span className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 xl:inline-flex">
                <ShieldCheck className="h-4 w-4" />
                Camera xử lý trên thiết bị
              </span>
              <a
                href={applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:px-3"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Mở riêng</span>
              </a>
            </>
          )}
        </div>
      </header>

      {activeModule === 'gesture' ? (
        <iframe
          title="GestureClass — Lớp học tương tác bằng cử chỉ"
          src={applicationUrl}
          allow="camera; fullscreen"
          allowFullScreen
          className="min-h-0 w-full flex-1 border-0 bg-[#f6f7fb]"
        />
      ) : (
        <QuestionStudio />
      )}
    </section>
  );
}
