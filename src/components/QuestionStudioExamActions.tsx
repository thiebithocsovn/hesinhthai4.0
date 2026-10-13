import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Copy, ExternalLink, Send, ShieldCheck } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { describeExamAccessError } from '../lib/examAccessError';
import { loadExamRosterMetadata } from '../lib/examRoster';
import {
  createExamAccessDocumentId,
  createPublicExamSchedule,
  createSecureExamAccessCode,
  protectExamForAccess,
  PUBLIC_EXAM_ACCESS_COLLECTION,
  PUBLIC_EXAM_SCHEDULES_COLLECTION,
} from '../lib/examPrivacy';
import { createExamFromQuestionBank, type QuestionBankSnapshot } from '../lib/questionExamBridge';
import type { QuestionDefinition } from '../lib/questionEngine';

interface StoredQuestionBank extends QuestionBankSnapshot {
  updatedAt?: string;
}

interface QuestionStudioExamActionsProps {
  onOpenExamManager: () => void;
}

function readBanks(ownerUid: string): StoredQuestionBank[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`question_studio_v1:${ownerUid || 'guest'}`) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(bank => bank && typeof bank.id === 'string' && typeof bank.title === 'string' && Array.isArray(bank.questions)) as StoredQuestionBank[];
  } catch {
    return [];
  }
}

function normalizeBank(bank: StoredQuestionBank): QuestionBankSnapshot {
  return {
    id: bank.id,
    title: bank.title,
    questions: bank.questions as QuestionDefinition[],
  };
}

export default function QuestionStudioExamActions({ onOpenExamManager }: QuestionStudioExamActionsProps) {
  const [ownerUid, setOwnerUid] = useState(() => auth.currentUser?.uid || 'guest');
  const [banks, setBanks] = useState<StoredQuestionBank[]>(() => readBanks(ownerUid));
  const [selectedBankId, setSelectedBankId] = useState(() => banks[0]?.id || '');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [startTime, setStartTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [publishedCode, setPublishedCode] = useState('');

  useEffect(() => onAuthStateChanged(auth, user => {
    const nextUid = user?.uid || 'guest';
    setOwnerUid(nextUid);
    const nextBanks = readBanks(nextUid);
    setBanks(nextBanks);
    setSelectedBankId(nextBanks[0]?.id || '');
    setPublishedCode('');
    setMessage('');
  }), []);

  useEffect(() => {
    const refresh = () => {
      const next = readBanks(ownerUid);
      setBanks(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setSelectedBankId(previous => next.some(bank => bank.id === previous) ? previous : next[0]?.id || '');
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [ownerUid]);

  const selectedBank = useMemo(() => banks.find(bank => bank.id === selectedBankId) || banks[0], [banks, selectedBankId]);

  const createExam = async (publish: boolean) => {
    setMessage('');
    setPublishedCode('');
    if (!auth.currentUser || ownerUid === 'guest') {
      setMessage('Cần đăng nhập tài khoản giáo viên trước khi tạo hoặc giao bài kiểm tra.');
      return;
    }
    if (!selectedBank?.questions.length) {
      setMessage('Bộ câu hỏi đang chọn chưa có câu hỏi để tạo bài kiểm tra.');
      return;
    }

    setBusy(true);
    const examId = createSecureExamAccessCode();
    let exam = createExamFromQuestionBank(normalizeBank(selectedBank), {
      teacherId: auth.currentUser.uid,
      durationMinutes,
      status: publish ? 'published' : 'draft',
      ...(startTime ? { startTime } : {}),
      title: selectedBank.title,
      examId,
    });

    try {
      if (publish) {
        exam = { ...exam, ...await loadExamRosterMetadata(db, exam.teacherId, exam.id) };
        const accessId = await createExamAccessDocumentId(exam.id);
        const protectedExam = await protectExamForAccess(exam, exam.id);
        const publicSchedule = await createPublicExamSchedule(exam);
        const batch = writeBatch(db);
        batch.set(doc(db, 'exams', exam.id), exam);
        batch.set(doc(db, PUBLIC_EXAM_ACCESS_COLLECTION, accessId), protectedExam);
        batch.set(doc(db, PUBLIC_EXAM_SCHEDULES_COLLECTION, publicSchedule.id), publicSchedule);
        await batch.commit();
        setPublishedCode(exam.id);
        setMessage('Đã giao bài. Học sinh vào Cổng thi Học sinh và nhập mã bên dưới.');
      } else {
        await setDoc(doc(db, 'exams', exam.id), exam);
        setMessage('Đã tạo bài kiểm tra nháp trong Tạo kỳ thi.');
        onOpenExamManager();
      }
    } catch (error) {
      console.error('Không thể tạo bài kiểm tra từ Question Studio:', error);
      setMessage(describeExamAccessError(error, 'publish'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-b border-indigo-100 bg-indigo-50/70 px-3 py-3 sm:px-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-indigo-800">
          <ShieldCheck className="h-4 w-4" />
          Ngân hàng 10 dạng → Tạo kỳ thi → Cổng học sinh → Kết quả
        </div>
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_120px_210px_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Bộ câu hỏi</span>
            <select
              value={selectedBank?.id || ''}
              onFocus={() => setBanks(readBanks(ownerUid))}
              onChange={event => setSelectedBankId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500"
            >
              {banks.map(bank => <option key={bank.id} value={bank.id}>{bank.title} ({bank.questions.length} câu)</option>)}
              {!banks.length && <option value="">Chưa có bộ câu hỏi</option>}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Thời lượng</span>
            <input type="number" min="1" max="300" value={durationMinutes} onChange={event => setDurationMinutes(Math.max(1, Number(event.target.value) || 45))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Mở từ lúc (không bắt buộc)</span>
            <input type="datetime-local" value={startTime} onChange={event => setStartTime(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !selectedBank?.questions.length} onClick={() => void createExam(false)} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50">
              <ClipboardCheck className="h-4 w-4" /> Tạo bài kiểm tra
            </button>
            <button type="button" disabled={busy || !selectedBank?.questions.length} onClick={() => void createExam(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" /> Giao bài
            </button>
          </div>
        </div>

        {(message || publishedCode) && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${publishedCode ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <div>
              <div className="font-medium">{message}</div>
              {publishedCode && <div className="mt-1 font-mono text-xl font-black tracking-[0.2em] text-emerald-700">{publishedCode}</div>}
            </div>
            <div className="flex gap-2">
              {publishedCode && <button type="button" onClick={() => void navigator.clipboard?.writeText(publishedCode)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm"><Copy className="h-3.5 w-3.5" /> Sao chép mã</button>}
              <button type="button" onClick={onOpenExamManager} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"><ExternalLink className="h-3.5 w-3.5" /> Mở Tạo kỳ thi</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
