import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { auth } from '../../firebase';
import type {
  TeacherDocumentAnalysis,
  TeacherDocumentExportMode,
  TeacherIntegrationMode,
  TeacherIntegrationSuggestion,
} from '../../lib/teacherDocument';

const TRIAL_STORAGE_KEY = 'teacher_ai_assistant_trial_v1';
const GUEST_TRIAL_LIMIT = 2;

const INTEGRATION_MODES: Array<{ id: TeacherIntegrationMode; label: string; description: string }> = [
  { id: 'digital-competency', label: 'Năng lực số', description: 'Phân tích bài học và đề xuất vị trí tích hợp NLS.' },
  { id: 'ai-competency', label: 'Năng lực AI', description: 'Đề xuất nội dung phát triển năng lực AI phù hợp.' },
  { id: 'digital-ai', label: 'NLS + AI', description: 'Phân tích đồng thời NLS và năng lực AI.' },
  { id: 'inclusive-education', label: 'Giáo dục hòa nhập', description: 'Điều chỉnh hoạt động để tăng khả năng tiếp cận.' },
  { id: 'integrated', label: 'Tích hợp tổng hợp', description: 'Đề xuất nội dung tích hợp phù hợp với từng bài.' },
  { id: 'ai-lesson-plan', label: 'Chuyên đề AI', description: 'Xác định bài có thể phát triển thành hoạt động AI.' },
];

export interface TeacherDocumentAssistantProps {
  initialMode?: TeacherIntegrationMode;
  lockedMode?: boolean;
  heading?: string;
  description?: string;
  initialDocumentType?: string;
  exportMode?: TeacherDocumentExportMode;
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
    // Storage can be unavailable in private browser modes. The app still works.
  }
}

function navigateToRegistration(): void {
  sessionStorage.setItem('currentView', JSON.stringify('auth'));
  window.location.reload();
}

function confidenceLabel(value: 'high' | 'medium' | 'fallback'): string {
  if (value === 'high') return 'Đã nhận diện chắc chắn';
  if (value === 'medium') return 'Nhận diện gần đúng';
  return 'Chưa thấy cột chuyên biệt';
}

export default function TeacherDocumentAssistant({
  initialMode = 'digital-competency',
  lockedMode = false,
  heading = 'AI tích hợp hồ sơ chuyên môn',
  description = 'Chọn sách → môn → lớp → tải KHGD/PPCT/giáo án hiện có → AI phân tích → giáo viên duyệt → tích hợp → tải kết quả Word.',
  initialDocumentType = 'KHGD / Phụ lục III',
  exportMode = 'integrated-document',
}: TeacherDocumentAssistantProps) {
  const [mode, setMode] = useState<TeacherIntegrationMode>(initialMode);
  const [book, setBook] = useState('Kết nối tri thức với cuộc sống');
  const [subject, setSubject] = useState('Toán');
  const [grade, setGrade] = useState('8');
  const [documentType, setDocumentType] = useState(initialDocumentType);
  const [referenceFramework, setReferenceFramework] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [documentAnalysis, setDocumentAnalysis] = useState<TeacherDocumentAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<TeacherIntegrationSuggestion[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [guestTrialCount, setGuestTrialCount] = useState(readGuestTrialCount);

  const isSignedIn = Boolean(auth.currentUser);
  const guestTrialExhausted = !isSignedIn && guestTrialCount >= GUEST_TRIAL_LIMIT;
  const detection = documentAnalysis?.columnDetection[mode];
  const isCompetencyTable = exportMode === 'competency-table';

  const handleFile = async (selected: File | null) => {
    setFile(selected);
    setDocumentAnalysis(null);
    setSuggestions([]);
    setMessage('');
    setError('');
    setSourceLabel('');
    if (!selected) return;

    setIsReading(true);
    try {
      const { parseTeacherDocx } = await import('../../lib/teacherDocument');
      const parsed = await parseTeacherDocx(selected);
      setDocumentAnalysis(parsed);
      const column = parsed.columnDetection[mode];
      setMessage(isCompetencyTable
        ? `Đã đọc ${parsed.rows.length} hàng trong KHGD. Hệ thống sẽ tạo Bảng NL AI riêng từ các hàng được giáo viên duyệt.`
        : `Đã đọc ${parsed.rows.length} hàng. Vị trí tích hợp dự kiến: ${column.label}. Tệp gốc chưa bị thay đổi.`);
    } catch (err) {
      setFile(null);
      setError(err instanceof Error ? err.message : 'Không thể đọc tệp Word.');
    } finally {
      setIsReading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!file || !documentAnalysis) {
      setError('Hãy tải tệp DOCX trước khi phân tích.');
      return;
    }
    if (guestTrialExhausted) {
      setError(`Bạn đã dùng hết ${GUEST_TRIAL_LIMIT} lượt thử AI trên trình duyệt này. Đăng ký/đăng nhập để tiếp tục.`);
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setMessage('');
    try {
      const { analyzeTeacherDocument } = await import('../../lib/teacherAssistantAi');
      const result = await analyzeTeacherDocument({
        mode,
        book,
        subject,
        grade,
        documentType,
        rows: documentAnalysis.rows,
        referenceFramework,
      });
      setSuggestions(result.suggestions);
      setSourceLabel(result.source === 'google-gemini'
        ? `Google Gemini · ${result.model || 'Gemini'}`
        : 'Phân tích cục bộ dự phòng');

      if (!auth.currentUser) {
        const nextCount = guestTrialCount + 1;
        writeGuestTrialCount(nextCount);
        setGuestTrialCount(nextCount);
      }

      setMessage(result.suggestions.length === 0
        ? 'AI chưa tìm thấy hàng nào đủ phù hợp để đề xuất tích hợp. Hệ thống không ép tích hợp khi không có căn cứ.'
        : `Đã tạo ${result.suggestions.length} đề xuất. Hãy duyệt, sửa hoặc bỏ từng nội dung trước khi xuất Word.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể phân tích tài liệu.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateSuggestion = (id: string, patch: Partial<TeacherIntegrationSuggestion>) => {
    setSuggestions(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const handleExport = async () => {
    if (!file || !documentAnalysis) return;
    setIsExporting(true);
    setError('');
    try {
      const tools = await import('../../lib/teacherDocument');
      if (isCompetencyTable) {
        const blob = await tools.createAiCompetencyTableDocx(suggestions, documentAnalysis.rows, { book, subject, grade });
        tools.downloadBlob(blob, tools.buildAiCompetencyTableFileName(file.name));
        setMessage('Đã tạo Bảng tích hợp NL AI riêng từ KHGD đã tải lên và các đề xuất đã được giáo viên duyệt.');
      } else {
        const blob = await tools.createIntegratedTeacherDocx(file, suggestions, mode);
        tools.downloadBlob(blob, tools.buildIntegratedFileName(file.name));
        const target = documentAnalysis.columnDetection[mode];
        setMessage(target.confidence === 'fallback'
          ? 'Đã tạo file Word và dùng ô cuối của từng hàng làm vị trí dự phòng vì mẫu không có cột tích hợp chuyên biệt.'
          : `Đã tạo file Word từ bản gốc và chèn nội dung vào cột “${target.label}” được hệ thống nhận diện.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo file Word kết quả.');
    } finally {
      setIsExporting(false);
    }
  };

  const approvedCount = suggestions.filter(item => item.approved).length;

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
        <div className="mb-5">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            {isCompetencyTable ? <FileSpreadsheet className="h-5 w-5 text-indigo-600" /> : <Sparkles className="h-5 w-5 text-indigo-600" />}
            {heading}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-3 rounded-xl bg-indigo-50 px-4 py-3 text-xs font-semibold leading-5 text-indigo-800">
            Quy trình: 1. Chọn sách → 2. Chọn môn/lớp → 3. Tải Word hiện có → 4. AI phân tích → 5. Giáo viên duyệt/sửa → 6. Tải kết quả
          </div>
        </div>

        {!lockedMode && (
          <div className="grid gap-3 md:grid-cols-3">
            {INTEGRATION_MODES.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setMode(item.id); setSuggestions([]); setMessage(''); }}
                className={`rounded-2xl border p-4 text-left transition ${mode === item.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
              >
                <p className="font-bold text-slate-900">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
              </button>
            ))}
          </div>
        )}

        <div className={`${lockedMode ? '' : 'mt-5 '}grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
          <label className="text-sm font-medium text-slate-700">Bộ sách
            <select value={book} onChange={event => setBook(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500">
              <option>Kết nối tri thức với cuộc sống</option><option>Cánh Diều</option><option>Chân trời sáng tạo</option><option>Khác</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Môn học
            <input value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500" placeholder="Toán, Tin học..." />
          </label>
          <label className="text-sm font-medium text-slate-700">Lớp
            <select value={grade} onChange={event => setGrade(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500">
              {Array.from({ length: 12 }, (_, index) => String(index + 1)).map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Loại tài liệu
            <select value={documentType} onChange={event => setDocumentType(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500">
              <option>KHGD / Phụ lục III</option><option>PPCT</option><option>Kế hoạch bài dạy</option><option>Phụ lục I / II</option><option>Tài liệu khác dạng bảng</option>
            </select>
          </label>
        </div>

        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Khung/mã năng lực chính thức (khuyến nghị)</summary>
          <p className="mt-2 text-xs leading-5 text-slate-600">Dán đoạn văn bản chứa các mã được phép sử dụng. AI chỉ giữ mã xuất hiện nguyên văn tại đây; nếu chưa có căn cứ, hệ thống để trống mã để tránh bịa mã.</p>
          <textarea value={referenceFramework} onChange={event => setReferenceFramework(event.target.value)} rows={5} className="mt-3 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-indigo-500" />
        </details>

        <label className="mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50">
          {isReading ? <Loader2 className="h-6 w-6 animate-spin text-indigo-600" /> : <Upload className="h-6 w-6 text-indigo-600" />}
          <span>
            <span className="block font-semibold text-slate-800">{file ? file.name : 'Chọn file Word .DOCX'}</span>
            <span className="mt-1 block text-xs text-slate-500">Document Engine chỉ được tải khi chọn tệp Word.</span>
          </span>
          <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={event => void handleFile(event.target.files?.[0] || null)} />
        </label>

        {documentAnalysis && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Đã nhận diện {documentAnalysis.rows.length} hàng trong bảng Word.</span>
              <button type="button" disabled={isAnalyzing || guestTrialExhausted} onClick={() => void handleAnalyze()} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                {isAnalyzing ? 'AI đang phân tích...' : 'Phân tích bằng AI'}
              </button>
            </div>
            {!isCompetencyTable && detection && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${detection.confidence === 'fallback' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
                <span className="font-semibold">Vị trí chèn: </span>{detection.label} · {confidenceLabel(detection.confidence)}.
                {detection.confidence === 'fallback' && <span> Hệ thống sẽ chỉ dùng ô cuối của từng hàng làm phương án dự phòng và không thay đổi cấu trúc bảng.</span>}
              </div>
            )}
          </div>
        )}
      </section>

      {(message || error || sourceLabel) && (
        <div className={`rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
          {error ? <div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : <p>{message}</p>}
          {sourceLabel && !error && <p className="mt-2 text-xs font-medium">Nguồn phân tích: {sourceLabel}</p>}
        </div>
      )}

      {suggestions.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Duyệt đề xuất trước khi xuất</h3>
              <p className="mt-1 text-sm text-slate-600">Đã chọn {approvedCount}/{suggestions.length}. Có thể sửa mã, YCCĐ và nội dung trực tiếp.</p>
            </div>
            <button type="button" onClick={() => void handleExport()} disabled={isExporting || approvedCount === 0} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isCompetencyTable ? 'Xuất Bảng NL AI' : 'Tạo Word hoàn chỉnh'}
            </button>
          </div>
          <div className="space-y-3">
            {suggestions.map((item, index) => (
              <article key={item.id} className={`rounded-2xl border p-4 ${item.approved ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
                <div className="flex gap-3">
                  <input type="checkbox" checked={item.approved} onChange={event => updateSuggestion(item.id, { approved: event.target.checked })} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">#{index + 1}</span>
                      <h4 className="font-bold text-slate-900">{item.lesson}</h4>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{item.confidence}</span>
                    </div>
                    {item.reason && <p className="mt-1 text-xs leading-5 text-slate-500">{item.reason}</p>}
                    <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                      <label className="text-xs font-semibold text-slate-600">Mã năng lực
                        <input value={item.code} onChange={event => updateSuggestion(item.id, { code: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500" placeholder="Để trống nếu chưa xác minh" />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">Yêu cầu cần đạt từ tài liệu nguồn
                        <textarea value={item.requirement || ''} onChange={event => updateSuggestion(item.id, { requirement: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-slate-900 outline-none focus:border-indigo-500" placeholder="Không bịa YCCĐ mới" />
                      </label>
                    </div>
                    <label className="mt-3 block text-xs font-semibold text-slate-600">Nội dung tích hợp
                      <textarea value={item.content} onChange={event => updateSuggestion(item.id, { content: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-slate-900 outline-none focus:border-indigo-500" />
                    </label>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
