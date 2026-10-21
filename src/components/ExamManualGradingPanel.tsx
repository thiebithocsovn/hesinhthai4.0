import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, CheckCircle2, Download, EyeOff, Hand, LoaderCircle, Paperclip, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  describeManualAnswer,
  formatFileSize,
  formatPoints,
  gradeFromChecks,
  highlightRuns,
  canTeacherGradeQuestion,
  isShortAnswerQuestion,
  isSubmittedPracticalFile,
  manualSubmissionCode,
  questionMaxPoints,
  QUICK_COMMENTS,
  rubricKeywords,
  type ManualGrade,
} from '../lib/examManualGrading';
import { analyzePracticalFile, evaluateAutoCheck, type AutoCheck, type AutoCheckResult, type PracticalFileFacts } from '../lib/practicalFileCheck';
import { receiptAnswerText, receiptQuestionIsCorrect, type ReceiptQuestion } from '../lib/examReceipt';
import { examQuestionHtml } from '../lib/examQuestionContent';

const MACHINE_BADGE: Record<AutoCheckResult['status'], { text: string; className: string }> = {
  pass: { text: '✓ Máy: đạt', className: 'bg-emerald-100 text-emerald-800' },
  near: { text: '≈ Gần đúng', className: 'bg-amber-100 text-amber-800' },
  fail: { text: '✗ Chưa thấy', className: 'bg-red-100 text-red-700' },
  unknown: { text: '? Không rõ', className: 'bg-slate-100 text-slate-600' },
};

interface GradingQuestion extends ReceiptQuestion {}

interface GradingResult {
  id: string;
  studentId: string;
  submittedAt: string;
  answers?: Record<string, unknown>;
  manualGrades?: Record<string, ManualGrade>;
  examVersion?: string;
}

interface Props {
  exam: { id: string; title: string; questions: GradingQuestion[] };
  results: GradingResult[];
  studentName: (result: GradingResult) => string;
  classLabel: (result: GradingResult) => string;
  onClose: () => void;
  /** 'after-grading': the single signed receipt prints once a student's last essay/practical grade is saved. */
  signTiming?: 'after-grading' | 'at-submit';
}

export type ExamGradeSaveState = 'idle' | 'saving' | 'saved' | 'error';

function Highlighted({ text, keywords }: { text: string; keywords: Set<string> }) {
  if (!keywords.size) return <>{text}</>;
  return <>{highlightRuns(text, keywords).map((run, index) => run.mark ? <mark key={index} className="rounded bg-amber-200/80 px-0.5 text-inherit">{run.text}</mark> : <span key={index}>{run.text}</span>)}</>;
}

export function ExamGradeCard({ question, result, label, sublabel, keywords, onSave, onStatusChange }: {
  question: GradingQuestion;
  result: GradingResult;
  label: string;
  sublabel: string;
  keywords: Set<string>;
  onSave: (grade: ManualGrade) => Promise<void>;
  onStatusChange?: (state: ExamGradeSaveState) => void;
}) {
  const existing = result.manualGrades?.[question.id];
  const max = questionMaxPoints(question);
  const rubric = question.rubric || [];
  const shortAnswer = isShortAnswerQuestion(question);
  const automaticPoints = shortAnswer && receiptQuestionIsCorrect(question, result.answers?.[question.id]) ? max : 0;
  const [checks, setChecks] = useState<string[]>(existing?.checks || []);
  const [directPoints, setDirectPoints] = useState<string>(existing && !rubric.length ? String(existing.points) : shortAnswer ? String(automaticPoints) : '');
  const [comment, setComment] = useState(existing?.comment || '');
  const [graded, setGraded] = useState(Boolean(existing));
  const [state, setState] = useState<ExamGradeSaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<(() => void) | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const revision = useRef(0);
  const answer = result.answers?.[question.id];
  const file = question.type === 'practical' && isSubmittedPracticalFile(answer) ? answer : null;
  const hasAutoChecks = rubric.some(item => item.auto?.kind);
  const [facts, setFacts] = useState<PracticalFileFacts | null>(null);
  const statusCallback = useRef(onStatusChange);
  useEffect(() => { statusCallback.current = onStatusChange; });
  useEffect(() => { statusCallback.current?.('idle'); }, []);
  const reportState = (next: ExamGradeSaveState) => { setState(next); statusCallback.current?.(next); };

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    // Changing question or closing the review must not discard the last edit.
    pendingSave.current?.();
  }, []);

  // Read the submitted Word / PowerPoint / Scratch file once to suggest which criteria are met.
  useEffect(() => {
    setFacts(null);
    if (!file || !hasAutoChecks) return;
    let cancelled = false;
    void analyzePracticalFile(file).then(value => { if (!cancelled) setFacts(value); });
    return () => { cancelled = true; };
  }, [file?.dataUrl, hasAutoChecks]);

  const machine = new Map<string, AutoCheckResult>();
  if (file && facts) for (const item of rubric) if (item.auto?.kind) machine.set(item.id, evaluateAutoCheck(item.auto as AutoCheck, facts, file.name));
  const machinePassed = rubric.filter(item => machine.get(item.id)?.status === 'pass').length;

  const points = rubric.length ? gradeFromChecks(question, checks).points : Math.min(max, Math.max(0, Number(directPoints) || 0));

  const schedule = (nextChecks: string[], nextComment: string, nextDirect: string) => {
    window.clearTimeout(timer.current);
    pendingSave.current = null;
    const currentRevision = ++revision.current;
    if (!rubric.length && (nextDirect.trim() === '' || !Number.isFinite(Number(nextDirect)) || Number(nextDirect) < 0 || Number(nextDirect) > max)) {
      reportState('error');
      return;
    }
    reportState('saving');
    pendingSave.current = () => {
      pendingSave.current = null;
      saveQueue.current = saveQueue.current.then(async () => {
        const grade = rubric.length
          ? gradeFromChecks(question, nextChecks, nextComment)
          : { points: Math.round(Number(nextDirect) * 100) / 100, checks: [], ...(nextComment.trim() ? { comment: nextComment.trim().slice(0, 500) } : {}), gradedAt: new Date().toISOString() };
        try { await onSave(grade); if (revision.current === currentRevision) { setGraded(true); reportState('saved'); } }
        catch { if (revision.current === currentRevision) reportState('error'); }
      });
    };
    timer.current = window.setTimeout(() => pendingSave.current?.(), 450);
  };

  const toggle = (id: string) => {
    const next = checks.includes(id) ? checks.filter(item => item !== id) : [...checks, id];
    setChecks(next); schedule(next, comment, directPoints);
  };

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm md:p-5 ${graded ? 'border-emerald-200' : 'border-amber-200'}`}>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-800">{label}</p>
          {sublabel && <p className="text-xs text-slate-500">{sublabel}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${graded ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{graded ? `${formatPoints(points)} / ${formatPoints(max)} điểm` : shortAnswer ? `Tự động: ${formatPoints(automaticPoints)} / ${formatPoints(max)}` : 'Chưa chấm'}</span>
      </header>

      <div className="mb-4">
        {question.type === 'essay' || shortAnswer ? (
          typeof answer === 'string' && answer.trim()
            ? <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 leading-7 text-slate-800"><Highlighted text={answer} keywords={keywords} /></p>
            : <p className="rounded-xl bg-slate-50 p-3 italic text-slate-500">Học sinh không trả lời.</p>
        ) : question.practicalMode === 'observe' ? (
          <p className="flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><Hand className="h-4 w-4" />Chấm theo quan sát bài làm trên máy của học sinh.</p>
        ) : isSubmittedPracticalFile(answer) ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
            {answer.type.startsWith('image/') ? <a href={answer.dataUrl} download={answer.name} title="Tải ảnh"><img src={answer.dataUrl} alt={`Bài làm của ${label}`} className="max-h-72 rounded-lg border border-slate-200 object-contain" /></a> : <Paperclip className="h-6 w-6 text-emerald-600" />}
            <div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-800">{answer.name}</p><p className="text-xs text-slate-500">{formatFileSize(answer.size)}{answer.type.startsWith('image/') ? '' : ' · tải về để mở bằng Word, PowerPoint hoặc Scratch'}</p></div>
            <a href={answer.dataUrl} download={answer.name} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-slate-200 hover:bg-blue-50"><Download className="h-4 w-4" />Tải tệp</a>
          </div>
        ) : <p className="rounded-xl bg-slate-50 p-3 italic text-slate-500">{describeManualAnswer(question, answer)}.</p>}
      </div>

      {file && hasAutoChecks && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <Bot className="h-4 w-4 shrink-0" />
          {facts ? <span className="flex-1">Máy đã đọc tệp: <b>{machinePassed}/{machine.size}</b> tiêu chí kiểm tra được là đạt. Thầy cô xem lại rồi quyết định.</span> : <span className="flex flex-1 items-center gap-1.5"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Máy đang đọc tệp…</span>}
          {facts && machine.size > 0 && (
            <button type="button" onClick={() => {
              const next = rubric.filter(item => machine.has(item.id) ? machine.get(item.id)!.status === 'pass' : checks.includes(item.id)).map(item => item.id);
              setChecks(next); schedule(next, comment, directPoints);
            }} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700">Tích theo gợi ý của máy</button>
          )}
        </div>
      )}
      {rubric.length ? (
        <div className="flex flex-col gap-2">
          {rubric.map(item => {
            const on = checks.includes(item.id);
            const verdict = machine.get(item.id);
            return (
              <button key={item.id} type="button" onClick={() => toggle(item.id)} aria-pressed={on} className={`flex min-h-[46px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${on ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>{on && <Check className="h-4 w-4" />}</span>
                <span className="flex-1 text-sm text-slate-800">
                  {item.text || 'Tiêu chí chưa đặt tên'}
                  {verdict?.detail && <span className="mt-0.5 block text-xs text-slate-500">{verdict.detail}</span>}
                </span>
                {verdict && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${MACHINE_BADGE[verdict.status].className}`} title={verdict.detail}>{MACHINE_BADGE[verdict.status].text}</span>}
                <span className="shrink-0 text-sm font-bold text-slate-600">{formatPoints(item.points)}đ</span>
              </button>
            );
          })}
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">Điểm câu này
          <input type="number" min={0} max={max} step={0.01} value={directPoints} onChange={event => { setDirectPoints(event.target.value); schedule(checks, comment, event.target.value); }} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-right" />
          <span className="text-slate-500">/ {formatPoints(max)}</span>
        </label>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setChecks([]); setDirectPoints('0'); schedule([], comment, '0'); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">0 điểm</button>
        <button type="button" onClick={() => { const all = rubric.map(item => item.id); setChecks(all); setDirectPoints(String(max)); schedule(all, comment, String(max)); }} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">Đủ điểm</button>
        <span className="ml-auto text-xs" aria-live="polite">
          {state === 'saving' && <span className="flex items-center gap-1 text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Đang lưu…</span>}
          {state === 'saved' && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Đã lưu</span>}
          {state === 'error' && <span role="alert" className="text-red-600">Chưa lưu. Nhập điểm từ 0 đến {formatPoints(max)}, kiểm tra mạng rồi thử lại.</span>}
        </span>
      </div>

      <details className="mt-3 group">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">{comment ? `Nhận xét: ${comment}` : 'Thêm nhận xét (tùy chọn)'}</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_COMMENTS.map(text => <button key={text} type="button" onClick={() => { setComment(text); schedule(checks, text, directPoints); }} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">{text}</button>)}
        </div>
        <input value={comment} maxLength={500} onChange={event => { setComment(event.target.value); schedule(checks, event.target.value, directPoints); }} placeholder="Hoặc gõ nhận xét riêng…" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </details>
    </article>
  );
}

/** Grade essay and practical questions one question at a time across the whole class. */
export default function ExamManualGradingPanel({ exam, results, studentName, classLabel, onClose, signTiming }: Props) {
  const manual = useMemo(() => exam.questions.map((question, index) => ({ question, number: index + 1 })).filter(item => canTeacherGradeQuestion(item.question)), [exam.questions]);
  const [selectedId, setSelectedId] = useState(manual[0]?.question.id || '');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [anonymous, setAnonymous] = useState(false);
  const [local, setLocal] = useState<Record<string, ManualGrade>>({});
  // Reference card starts open on wide screens and folded on phones; the teacher can toggle it.
  const [referenceOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const selected = manual.find(item => item.question.id === selectedId) || manual[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const gradeOf = (result: GradingResult, questionId: string) => local[`${result.id}:${questionId}`] || result.manualGrades?.[questionId];
  const gradedCount = (questionId: string) => results.filter(result => gradeOf(result, questionId)).length;
  const totalSlots = manual.length * results.length;
  const doneSlots = manual.reduce((sum, item) => sum + gradedCount(item.question.id), 0);
  const keywords = useMemo(() => new Set(selected?.question.type === 'essay' ? rubricKeywords(selected.question) : []), [selected]);

  const save = async (result: GradingResult, questionId: string, grade: ManualGrade) => {
    try {
      await updateDoc(doc(db, 'results', result.id), { [`manualGrades.${questionId}`]: grade, manualGradedAt: grade.gradedAt });
      setLocal(previous => ({ ...previous, [`${result.id}:${questionId}`]: grade }));
    } catch (error) { window.alert('Chưa lưu được điểm. Hãy mở lại bài và thử lại khi có kết nối.'); throw error; }
  };

  const visible = selected ? results.filter(result => filter === 'all' || (filter === 'done') === Boolean(gradeOf(result, selected.question.id))) : [];

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label="Chấm tự luận, trả lời ngắn và thực hành">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl">Chấm tự luận, trả lời ngắn & thực hành</h2>
          <p className="truncate text-sm text-slate-500">{exam.title}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
          <span className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"><span className="block h-full bg-emerald-500" style={{ width: `${totalSlots ? Math.round(doneSlots / totalSlots * 100) : 0}%` }} /></span>
          Đã chấm {doneSlots}/{totalSlots}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)} /><EyeOff className="h-4 w-4" />Ẩn tên</label>
        <button type="button" onClick={onClose} className="ml-auto flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-black sm:ml-0"><X className="h-4 w-4" />Xong</button>
      </header>

      {signTiming && manual.length > 0 && (
        <p className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900 md:px-6">
          {signTiming === 'after-grading'
            ? 'Học sinh ký phiếu một lần: chấm xong tất cả câu tự luận / thực hành của em nào thì khoảng 20 giây sau lần tích cuối, trạm in (nếu đang bật) tự in phiếu có điểm cuối cùng cho em đó; nếu không bật trạm, in ở cột Thao tác trong bảng kết quả.'
            : 'Phiếu ký đã in lúc nộp bài kèm mã đối chiếu. Điểm chấm ở đây được công bố trên hệ thống, không in phiếu thứ hai.'}
        </p>
      )}
      {!manual.length ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-slate-500">Kỳ thi này chưa có câu tự luận, trả lời ngắn hoặc thực hành.</div>
      ) : (
        <>
          <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:px-6" aria-label="Chọn câu cần chấm">
            {manual.map(item => {
              const active = item.question.id === selected?.question.id;
              const count = gradedCount(item.question.id);
              return (
                <button key={item.question.id} type="button" onClick={() => setSelectedId(item.question.id)} aria-pressed={active} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                  Câu {item.number}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${item.question.type === 'essay' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{item.question.type === 'essay' ? 'Tự luận' : isShortAnswerQuestion(item.question) ? 'Trả lời ngắn' : 'Thực hành'}</span>
                  <span className={`text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{count}/{results.length}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-auto">
            <div className="mx-auto grid max-w-6xl gap-5 p-4 md:p-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <aside className="lg:sticky lg:top-0 lg:self-start">
                <details open={referenceOpen} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <summary className="cursor-pointer font-bold text-slate-800">Câu {selected.number} · {formatPoints(questionMaxPoints(selected.question))} điểm</summary>
                  <div className="prose prose-sm mt-3 max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: examQuestionHtml(selected.question.text) }} />
                  {isShortAnswerQuestion(selected.question) && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><b>Đáp án: </b>{receiptAnswerText(selected.question, undefined, true)}. Thầy cô có thể nhập điểm hoặc chọn 0 điểm / Đủ điểm để thay kết quả chấm tự động.</p>}
                  {(selected.question.rubric || []).length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-sm font-semibold text-slate-700">{selected.question.type === 'essay' ? 'Các ý chấm' : 'Tiêu chí chấm'}</p>
                      <ul className="space-y-1 text-sm text-slate-600">{selected.question.rubric!.map(item => <li key={item.id} className="flex justify-between gap-2"><span>• {item.text}</span><b>{formatPoints(item.points)}đ</b></li>)}</ul>
                    </div>
                  )}
                  {selected.question.sampleAnswer && <div className="mt-3 rounded-xl bg-violet-50 p-3 text-sm text-violet-900"><p className="mb-1 font-semibold">Gợi ý đáp án</p><p className="whitespace-pre-wrap">{selected.question.sampleAnswer}</p></div>}
                  {selected.question.type === 'essay' && keywords.size > 0 && <p className="mt-3 text-xs text-slate-500">Cụm từ trong ý chấm được <mark className="rounded bg-amber-200/80 px-0.5">tô vàng</mark> trong bài làm để dễ dò; thầy cô vẫn là người quyết định điểm.</p>}
                </details>
              </aside>

              <section className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {([['all', 'Tất cả'], ['pending', 'Chưa chấm'], ['done', 'Đã chấm']] as const).map(([value, text]) => (
                    <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filter === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{text}</button>
                  ))}
                  <span className="ml-auto text-sm text-slate-500">{results.length} bài nộp</span>
                </div>
                {!results.length && <p className="rounded-2xl bg-white p-6 text-center text-slate-500">Chưa có học sinh nộp bài. Bài nộp sẽ hiện tại đây ngay khi học sinh bấm Nộp bài.</p>}
                {results.length > 0 && !visible.length && <p className="rounded-2xl bg-white p-6 text-center text-slate-500">{filter === 'pending' ? 'Đã chấm xong câu này. 🎉' : 'Chưa có bài nào được chấm ở câu này.'}</p>}
                {visible.map(result => (
                  <ExamGradeCard
                    key={`${result.id}:${selected.question.id}`}
                    question={selected.question}
                    result={{ ...result, manualGrades: { ...result.manualGrades, ...(local[`${result.id}:${selected.question.id}`] ? { [selected.question.id]: local[`${result.id}:${selected.question.id}`] } : {}) } }}
                    label={anonymous ? `Bài số ${results.indexOf(result) + 1}` : studentName(result)}
                    sublabel={[anonymous ? '' : classLabel(result), `Mã đối chiếu ${manualSubmissionCode(exam.questions, result.answers)}`].filter(Boolean).join(' · ')}
                    keywords={keywords}
                    onSave={grade => save(result, selected.question.id, grade)}
                  />
                ))}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
