import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Presentation, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { exportQuestionBankToPptx, type QuestionBankForPptx } from '../lib/questionPptxInteractiveExport';

interface StoredQuestionBank extends QuestionBankForPptx {
  updatedAt?: string;
}

function storageKey(ownerUid: string): string {
  return `question_studio_v1:${ownerUid || 'guest'}`;
}

function readBanks(ownerUid: string): StoredQuestionBank[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(ownerUid)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function QuestionStudioPptxExport() {
  const [ownerUid, setOwnerUid] = useState(() => auth.currentUser?.uid || 'guest');
  const [banks, setBanks] = useState<StoredQuestionBank[]>(() => readBanks(ownerUid));
  const [selectedBankId, setSelectedBankId] = useState(() => readBanks(ownerUid)[0]?.id || '');
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState('');

  const refreshBanks = useCallback((uid = ownerUid) => {
    const next = readBanks(uid);
    setBanks(next);
    setSelectedBankId(current => next.some(bank => bank.id === current) ? current : next[0]?.id || '');
  }, [ownerUid]);

  useEffect(() => onAuthStateChanged(auth, user => {
    const nextUid = user?.uid || 'guest';
    setOwnerUid(nextUid);
    const next = readBanks(nextUid);
    setBanks(next);
    setSelectedBankId(next[0]?.id || '');
    setMessage('');
  }), []);

  useEffect(() => {
    const onFocus = () => refreshBanks();
    const timer = window.setInterval(() => refreshBanks(), 1800);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshBanks]);

  const selectedBank = useMemo(() => banks.find(bank => bank.id === selectedBankId) || banks[0], [banks, selectedBankId]);

  const handleDeleteBank = () => {
    const latestBanks = readBanks(ownerUid);
    const bankToDelete = latestBanks.find(bank => bank.id === selectedBankId) || latestBanks[0];
    if (!bankToDelete) {
      setMessage('Chưa có bộ câu hỏi để xóa.');
      return;
    }

    const questionCount = bankToDelete.questions.length;
    const confirmed = window.confirm(
      `Xóa bộ câu hỏi “${bankToDelete.title}” (${questionCount} câu)?\n\nThao tác này không thể hoàn tác.`,
    );
    if (!confirmed) return;

    const remaining = latestBanks.filter(bank => bank.id !== bankToDelete.id);
    localStorage.setItem(storageKey(ownerUid), JSON.stringify(remaining));
    setBanks(remaining);
    setSelectedBankId(remaining[0]?.id || '');
    setMessage(`Đã xóa bộ câu hỏi “${bankToDelete.title}”. Đang cập nhật giao diện...`);

    window.setTimeout(() => window.location.reload(), 250);
  };

  const handleExport = async () => {
    refreshBanks();
    const latestBanks = readBanks(ownerUid);
    const latestBank = latestBanks.find(bank => bank.id === selectedBankId) || latestBanks[0];
    if (!latestBank) {
      setMessage('Chưa có bộ câu hỏi để xuất PowerPoint.');
      return;
    }
    if (!latestBank.questions.length) {
      setMessage('Bộ câu hỏi đang chọn chưa có câu nào. Hãy tạo câu hỏi trước khi xuất.');
      return;
    }

    setIsExporting(true);
    setMessage('Đang dựng bài giảng PowerPoint...');
    try {
      const fileName = await exportQuestionBankToPptx(latestBank);
      setMessage(`Đã xuất “${fileName}”. Mở file và bấm Trình chiếu để sử dụng ngay.`);
    } catch (error) {
      console.error('Không thể xuất PowerPoint:', error);
      setMessage(error instanceof Error ? error.message : 'Không thể xuất PowerPoint. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-violet-200 bg-gradient-to-r from-violet-50 via-indigo-50 to-sky-50 px-3 py-3 sm:px-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            <Presentation className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Xuất bài giảng PowerPoint</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
                <Sparkles className="h-3 w-3" />
                Đúng xanh • Sai đỏ
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              Tự tạo file PPTX 16:9: bấm trực tiếp vào đáp án để nhận phản hồi xanh/đỏ; vẫn có slide đáp án và nút điều hướng cho đủ 10 dạng trắc nghiệm.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <select
              value={selectedBank?.id || ''}
              onChange={event => setSelectedBankId(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-72"
              aria-label="Chọn bộ câu hỏi để xuất PowerPoint hoặc xóa"
            >
              {!banks.length && <option value="">Chưa có bộ câu hỏi</option>}
              {banks.map(bank => (
                <option key={bank.id} value={bank.id}>{bank.title} ({bank.questions.length} câu)</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => refreshBanks()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-700 transition hover:bg-violet-50"
              title="Làm mới danh sách bộ câu hỏi"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleDeleteBank}
              disabled={!selectedBank || isExporting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Xóa bộ câu hỏi đang chọn"
              aria-label="Xóa bộ câu hỏi đang chọn"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || !selectedBank?.questions.length}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isExporting ? 'Đang tạo PPTX...' : 'Xuất PowerPoint'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mx-auto mt-2 max-w-7xl rounded-lg px-3 py-2 text-xs font-medium ${message.startsWith('Đã') ? 'bg-emerald-50 text-emerald-700' : message.startsWith('Đang') ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800'}`} role="status">
          {message}
        </div>
      )}
    </div>
  );
}
