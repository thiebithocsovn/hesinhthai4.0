import React, { useState } from 'react';
import { AlertCircle, Download, Loader2, Sparkles } from 'lucide-react';
import { auth } from '../../firebase';
import type { TeacherDraft, TeacherDraftKind } from '../../lib/teacherDraftAi';

const TRIAL_STORAGE_KEY = 'teacher_ai_assistant_trial_v1';
const GUEST_TRIAL_LIMIT = 2;

interface StructuredDraftAssistantProps {
  kind: TeacherDraftKind;
}

function readGuestTrialCount(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(TRIAL_STORAGE_KEY) || 0) || 0);
  } catch {
    return 0;
  }
}

function writeGuestTrialCount(value: number): void {
  try {
    localStorage.setItem(TRIAL_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures; generation can still continue while signed in.
  }
}

function navigateToRegistration(): void {
  sessionStorage.setItem('currentView', JSON.stringify('auth'));
  window.location.reload();
}

export default function StructuredDraftAssistant({ kind }: StructuredDraftAssistantProps) {
  const isSkkn = kind === 'skkn';
  const [book, setBook] = useState('Kết nối tri thức với cuộc sống');
  const [subject, setSubject] = useState('Tin học');
  const [grade, setGrade] = useState('6');
  const [topic, setTopic] = useState(isSkkn ? '' : 'Giáo dục AI');
  const [problem, setProblem] = useState('');
  const [intervention, setIntervention] = useState('');
  const [evidence, setEvidence] = useState('');
  const [references, setReferences] = useState('');
  const [additionalRequirements, setAdditionalRequirements] = useState('');
  const [draft, setDraft] = useState<TeacherDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [guestTrialCount, setGuestTrialCount] = useState(readGuestTrialCount);

  const isSignedIn = Boolean(auth.currentUser);
  const guestTrialExhausted = !isSignedIn && guestTrialCount >= GUEST_TRIAL_LIMIT;

  const generate = async () => {
    if (!topic.trim()) {
      setError(isSkkn ? 'Hãy nhập tên hoặc ý tưởng đề tài SKKN.' : 'Hãy nhập chủ đề/bài học cần soạn.');
      return;
    }
    if (guestTrialExhausted) {
      setError(`Bạn đã dùng hết ${GUEST_TRIAL_LIMIT} lượt thử AI trên trình duyệt này. Đăng ký/đăng nhập để tiếp tục.`);
      return;
    }

    setIsGenerating(true);
    setError('');
    setMessage('');
    try {
      const { generateTeacherDraft } = await import('../../lib/teacherDraftAi');
      const result = await generateTeacherDraft({
        kind,
        book,
        subject,
        grade,
        topic,
        problem,
        intervention,
        evidence,
        references,
        additionalRequirements,
      });
      setDraft(result);
      if (!auth.currentUser) {
        const nextCount = guestTrialCount + 1;
        writeGuestTrialCount(nextCount);
        setGuestTrialCount(nextCount);
      }
      setMessage(result.source === 'google-gemini'
        ? `Đã tạo dự thảo bằng Google Gemini · ${result.model || 'Gemini'}. Hãy rà soát và chỉnh sửa trước khi xuất Word.`
        : 'Đã tạo khung dự thảo cục bộ an toàn. Các chỗ thiếu số liệu/căn cứ được để lại để giáo viên bổ sung.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo dự thảo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportWord = async () => {
    if (!draft) return;
    setIsExporting(true);
    setError('');
    try {
      const { createSimpleDocx, downloadSimpleDocx, safeDocxFileName } = await import('../../lib/simpleDocx');
      const blob = await createSimpleDocx(draft.title, draft.sections);
      downloadSimpleDocx(blob, safeDocxFileName(draft.title, isSkkn ? 'SKKN_AI' : 'Giao_an_chuyen_de_AI'));
      setMessage('Đã tạo file Word từ bản dự thảo hiện tại.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xuất Word.');
    } finally {
      setIsExporting(false);
    }
  };

  const updateSection = (index: number, content: string) => {
    setDraft(previous => previous ? {
      ...previous,
      sections: previous.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, content } : section),
    } : previous);
  };

  return (
    <div className="space-y-5">
      {!isSignedIn && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-amber-900">Dùng thử AI: {Math.max(0, GUEST_TRIAL_LIMIT - guestTrialCount)}/{GUEST_TRIAL_LIMIT} lượt còn lại</p>
            <p className="mt-1 text-sm text-amber-800">Đăng ký để tiếp tục sử dụng sau khi hết lượt thử.</p>
          </div>
          <button type="button" onClick={navigateToRegistration} className="rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-950">Đăng ký / Đăng nhập</button>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          {isSkkn ? 'AI hỗ trợ Sáng kiến kinh nghiệm (SKKN)' : 'AI soạn giáo án / chuyên đề AI'}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {isSkkn
            ? 'AI tạo bản dự thảo theo dữ liệu giáo viên cung cấp; không tự bịa số liệu, minh chứng hoặc tài liệu tham khảo.'
            : 'Tạo kế hoạch bài dạy/chuyên đề AI có tiến trình, đánh giá và lưu ý an toàn – đạo đức AI; giáo viên duyệt trước khi xuất Word.'}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Bộ sách
            <select value={book} onChange={event => setBook(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500">
              <option>Kết nối tri thức với cuộc sống</option><option>Cánh Diều</option><option>Chân trời sáng tạo</option><option>Khác</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Môn/lĩnh vực
            <input value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500" />
          </label>
          <label className="text-sm font-medium text-slate-700">Lớp/đối tượng
            <select value={grade} onChange={event => setGrade(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500">
              {Array.from({ length: 12 }, (_, index) => String(index + 1)).map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">{isSkkn ? 'Tên/ý tưởng đề tài' : 'Chủ đề/bài học'}
            <input value={topic} onChange={event => setTopic(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500" placeholder={isSkkn ? 'VD: Nâng cao...' : 'VD: Dữ liệu và AI'} />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">{isSkkn ? 'Thực trạng/vấn đề' : 'Mục tiêu/vấn đề trọng tâm'}
            <textarea value={problem} onChange={event => setProblem(event.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" />
          </label>
          <label className="text-sm font-medium text-slate-700">{isSkkn ? 'Giải pháp/biện pháp' : 'Hoạt động/giải pháp mong muốn'}
            <textarea value={intervention} onChange={event => setIntervention(event.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" />
          </label>
          <label className="text-sm font-medium text-slate-700">{isSkkn ? 'Số liệu/minh chứng trước-sau' : 'Thiết bị, dữ liệu, học liệu hiện có'}
            <textarea value={evidence} onChange={event => setEvidence(event.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" placeholder={isSkkn ? 'Chỉ nhập số liệu thực tế; để trống nếu chưa có.' : 'Phòng máy, máy chiếu, tài khoản AI...'} />
          </label>
          <label className="text-sm font-medium text-slate-700">Khung tham chiếu/căn cứ đã xác minh
            <textarea value={references} onChange={event => setReferences(event.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" placeholder="Dán mã năng lực, văn bản hoặc nguồn đã kiểm tra. AI không tự bịa căn cứ." />
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">Yêu cầu bổ sung
          <textarea value={additionalRequirements} onChange={event => setAdditionalRequirements(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" placeholder="Thời lượng, cấu trúc riêng của trường, điều kiện lớp học..." />
        </label>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => void generate()} disabled={isGenerating || guestTrialExhausted} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? 'AI đang soạn...' : 'Tạo dự thảo bằng AI'}
          </button>
        </div>
      </section>

      {(message || error) && (
        <div className={`rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
          {error ? <div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : message}
        </div>
      )}

      {draft && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Bản dự thảo – giáo viên quyết định nội dung cuối</p>
              <input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full min-w-[280px] border-0 p-0 text-xl font-bold text-slate-900 outline-none" />
            </div>
            <button type="button" onClick={() => void exportWord()} disabled={isExporting} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Xuất Word
            </button>
          </div>
          <div className="mt-5 space-y-4">
            {draft.sections.map((section, index) => (
              <label key={`${section.heading}-${index}`} className="block rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="font-bold text-slate-900">{section.heading}</span>
                <textarea value={section.content} onChange={event => updateSection(index, event.target.value)} rows={Math.min(12, Math.max(4, section.content.split('\n').length + 2))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-800 outline-none focus:border-indigo-500" />
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
