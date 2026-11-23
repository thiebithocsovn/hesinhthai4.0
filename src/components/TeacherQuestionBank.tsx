import { useMemo, useState } from 'react';
import { BookOpen, ClipboardPlus, Filter, Search } from 'lucide-react';

interface QuestionInfo { id: string; text: string; type?: string }
interface ExamInfo { id: string; title: string; questions: readonly QuestionInfo[] }
export interface BankSelection { examId: string; questionId: string }
interface Props {
  exams: readonly ExamInfo[];
  onCreateDraft: (selected: readonly BankSelection[]) => void;
  onOpenExam: (id: string) => void;
}
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi-VN').replace(/đ/g, 'd').trim();
}
function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm', short_answer: 'Trả lời ngắn',
  matching: 'Ghép nối', essay: 'Tự luận', practical: 'Thực hành',
  question_engine: 'Question Studio',
};

export default function TeacherQuestionBank({ exams, onCreateDraft, onOpenExam }: Props) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(0);
  // All questions come from previously authorized teacher-owned exams; no extra Firestore reads.
  const entries = useMemo(() => exams.flatMap(exam =>
    exam.questions.map((question, index) => ({ examId: exam.id, examTitle: exam.title, question, index, key: JSON.stringify([exam.id, question.id]) }))
  ), [exams]);
  const filtered = useMemo(() => entries.filter(entry => {
    if (source !== 'all' && entry.examId !== source) return false;
    if (kind !== 'all' && (entry.question.type || 'multiple_choice') !== kind) return false;
    if (!search.trim()) return true;
    const text = normalize(plainText(entry.question.text) + ' ' + entry.examTitle + ' ' + entry.question.id);
    return text.includes(normalize(search));
  }), [entries, source, kind, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const activePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(activePage * 20, (activePage + 1) * 20);
  const selectable = entries.filter(entry => selected.has(entry.key));
  const allVisibleSelected = visible.length > 0 && visible.every(item => selected.has(item.key));

  const toggle = (key: string) => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key);
    else if (next.size < 100) next.add(key);
    return next;
  });

  const togglePage = () => setSelected(previous => {
    const next = new Set(previous);
    if (allVisibleSelected) visible.forEach(item => next.delete(item.key));
    else visible.forEach(item => { if (next.size < 100) next.add(item.key); });
    return next;
  });

  return <section className="mx-auto max-w-7xl space-y-5" aria-label="Ngân hàng câu hỏi của giáo viên">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <BookOpen className="h-6 w-6 text-teal-700" /> Ngân hàng câu hỏi
        </h2>
        <p className="mt-1 text-sm text-slate-500">Tái sử dụng câu hỏi từ các kỳ thi thuộc tài khoản hiện tại, không tạo bản sao trong cơ sở dữ liệu.</p>
      </div>
      <button type="button" disabled={!selectable.length}
        onClick={() => onCreateDraft(selectable.map(entry => ({ examId: entry.examId, questionId: entry.question.id })))}
        className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40">
        <ClipboardPlus className="h-4 w-4" /> Tạo đề nháp ({selectable.length})
      </button>
    </div>
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_minmax(160px,220px)]">
      <label className="relative">
        <span className="sr-only">Tìm kiếm câu hỏi</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}
          placeholder="Tìm nội dung câu hỏi, kỳ thi..."
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"/>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Lọc nguồn đề</span>
        <Filter className="h-4 w-4 shrink-0 text-slate-400" />
        <select value={source} onChange={event => { setSource(event.target.value); setPage(0); }} className="min-w-0 w-full rounded-xl border border-slate-200 px-2 py-2.5">
          <option value="all">Tất cả kỳ thi</option>
          {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">Loại câu hỏi</span>
        <select value={kind} onChange={event => { setKind(event.target.value); setPage(0); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          <option value="all">Tất cả dạng câu hỏi</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={allVisibleSelected} disabled={!visible.length} onChange={togglePage}
            aria-label="Chọn các câu hỏi trên trang hiện tại" />
          Chọn trang này
        </label>
        <span className="text-xs text-slate-500">{filtered.length} / {entries.length} câu hỏi · Chọn tối đa 100 câu</span>
      </div>
      {visible.length ? <ul className="divide-y divide-slate-100">
        {visible.map(entry => (
          <li key={entry.key} className="flex items-start gap-3 px-4 py-4 hover:bg-slate-50">
            <input type="checkbox" checked={selected.has(entry.key)} onChange={() => toggle(entry.key)}
              disabled={!selected.has(entry.key) && selected.size >= 100} className="mt-1.5 shrink-0"
              aria-label={'Chọn câu ' + (entry.index + 1) + ' trong ' + entry.examTitle} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 break-words text-sm font-medium text-slate-800">
                <span className="font-bold">Câu {entry.index + 1}.</span> {plainText(entry.question.text) || '(Câu hỏi chứa nội dung đa phương tiện)'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-md bg-slate-100 px-2 py-0.5">{TYPE_LABELS[entry.question.type || 'multiple_choice'] || 'Khác'}</span>
                <button type="button" className="font-semibold text-teal-700 hover:underline" onClick={() => onOpenExam(entry.examId)}>
                  {entry.examTitle}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul> : <p className="p-10 text-center text-sm text-slate-500">Chưa có câu hỏi phù hợp. Có thể tạo kỳ thi trước rồi thêm câu hỏi.</p>}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm">
        <span className="text-slate-500">Trang {activePage + 1}/{pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={activePage === 0} onClick={() => setPage(x => x - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Trước</button>
          <button type="button" disabled={activePage + 1 >= pageCount} onClick={() => setPage(x => x + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Sau</button>
        </div>
      </div>
    </div>
  </section>;
}
