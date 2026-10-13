import { useState } from 'react';
import { ArrowLeft, ListChecks, ShieldCheck } from 'lucide-react';
import { auth } from '../firebase';
import '../lib/questionPptxSequentialPatch';
import ExamManager from './ExamManager';
import QuestionStudio from './QuestionStudio';
import QuestionStudioExamActions from './QuestionStudioExamActions';
import QuestionStudioPptxExport from './QuestionStudioPptxExport';

interface QuestionStudioAppProps {
  onBack: () => void;
  currentUser?: any;
}

export default function QuestionStudioApp({ onBack, currentUser }: QuestionStudioAppProps) {
  const [showExamManager, setShowExamManager] = useState(false);

  if (showExamManager) {
    const uid = auth.currentUser?.uid || '';
    return (
      <section className="flex h-dvh min-h-screen w-full flex-col overflow-hidden bg-slate-50">
        <ExamManager
          initialMode="teacher"
          currentUser={currentUser || (uid ? { id: uid } : null)}
          onBack={() => setShowExamManager(false)}
        />
      </section>
    );
  }

  return (
    <section className="flex h-dvh min-h-screen w-full flex-col overflow-hidden bg-slate-50">
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
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
            <ListChecks className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">Trắc nghiệm 10 dạng</h1>
            <p className="truncate text-xs text-slate-500">Question Studio • Lớp Học Thông Minh 4.0</p>
          </div>
        </div>

        <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 md:inline-flex">
          <ShieldCheck className="h-4 w-4" />
          Dữ liệu tách theo tài khoản giáo viên
        </span>
      </header>

      <QuestionStudioPptxExport />
      <QuestionStudioExamActions onOpenExamManager={() => setShowExamManager(true)} />
      <QuestionStudio />
    </section>
  );
}
