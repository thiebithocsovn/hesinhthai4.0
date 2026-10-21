import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, X } from 'lucide-react';
import { ExamGradeCard, type ExamGradeSaveState } from './ExamManualGradingPanel';
import { canTeacherGradeQuestion, formatPoints, isManualQuestion, questionMaxPoints, summarizeExamScore, versionQuestions, type ManualGrade } from '../lib/examManualGrading';
import { receiptAnswerText, receiptQuestionIsCorrect, type ReceiptExam, type ReceiptResult } from '../lib/examReceipt';
import { examQuestionHtml } from '../lib/examQuestionContent';

interface ReviewResult extends ReceiptResult { studentId: string }

interface Props {
  exam: ReceiptExam;
  results: ReviewResult[];
  resultId: string;
  studentName: (result: ReviewResult) => string;
  classLabel: (result: ReviewResult) => string;
  onSelect: (id: string) => void;
  onSaveGrade: (resultId: string, questionId: string, grade: ManualGrade) => Promise<void>;
  onPrint: (result: ReviewResult) => void;
  onClose: () => void;
}

const NO_KEYWORDS = new Set<string>();

/** Review each student's submitted version without editing their original answers. */
export default function ExamSubmissionReview({ exam, results, resultId, studentName, classLabel, onSelect, onSaveGrade, onPrint, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'written'>('all');
  const [local, setLocal] = useState<Record<string, Record<string, ManualGrade>>>({});
  const [saveStates, setSaveStates] = useState<Record<string, ExamGradeSaveState>>({});
  const unsettled = Object.values(saveStates).some(state => state === 'saving' || state === 'error');
  const index = results.findIndex(result => result.id === resultId);
  const source = results[index];
  const result = source && { ...source, manualGrades: { ...source.manualGrades, ...local[source.id] } };
  const summary = result ? summarizeExamScore(exam, result, receiptQuestionIsCorrect) : null;
  const questions = versionQuestions(exam, source?.examVersion);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); }, [resultId]);

  const save = async (questionId: string, grade: ManualGrade) => {
    if (!result) return;
    try {
      await onSaveGrade(result.id, questionId, grade);
      setLocal(previous => ({ ...previous, [result.id]: { ...previous[result.id], [questionId]: grade } }));
    } catch (error) { window.alert('Chưa lưu được điểm. Hãy mở lại bài và thử lại khi có kết nối.'); throw error; }
  };

  return (
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="exam-review-title" className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-slate-100 p-0 text-slate-800 backdrop:bg-slate-900/40">
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1"><h2 id="exam-review-title" className="text-xl font-bold">Bài làm học sinh</h2><p className="truncate text-sm text-slate-500">{exam.title}</p></div>
          {result && <button type="button" disabled={unsettled} title={unsettled ? 'Chờ lưu xong điểm trước khi xem phiếu in' : 'Xem phiếu in'} onClick={() => onPrint(result)} className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 disabled:opacity-40"><Printer size={18} />Xem phiếu in</button>}
          <button type="button" onClick={onClose} autoFocus className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"><X size={18} />Đóng</button>
        </header>
        {!result ? <p className="p-6 text-center">Không tìm thấy bài nộp.</p> : <>
          <div className="border-b border-slate-200 bg-white px-4 py-3 md:px-6">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
              <label className="min-w-0 flex-1 text-xs font-medium text-slate-500">Học sinh
                <select aria-label="Chọn bài làm học sinh" value={result.id} onChange={event => onSelect(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-bold text-slate-800">{results.map(item => <option key={item.id} value={item.id}>{studentName(item)}{classLabel(item) ? ` · ${classLabel(item)}` : ''}</option>)}</select>
              </label>
              <div className="flex items-center gap-1">
                <button type="button" disabled={index <= 0} onClick={() => onSelect(results[index - 1].id)} aria-label="Bài trước" className="rounded-lg border p-2 disabled:opacity-30"><ChevronLeft size={20} /></button>
                <span className="px-2 text-sm">{index + 1}/{results.length}</span>
                <button type="button" disabled={index >= results.length - 1} onClick={() => onSelect(results[index + 1].id)} aria-label="Bài tiếp theo" className="rounded-lg border p-2 disabled:opacity-30"><ChevronRight size={20} /></button>
              </div>
              <div className="rounded-xl bg-blue-50 px-4 py-2 text-center font-bold text-blue-800">{summary?.complete ? `${formatPoints(summary.score10)} / 10` : `Chờ chấm ${summary?.pendingManual} câu`}</div>
            </div>
            <p className="mx-auto mt-2 max-w-4xl text-xs text-slate-500">Mã đề: {result.examVersion || 'Gốc'} · Nộp: {new Date(result.submittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. Điểm và nhận xét tự lưu khi chỉnh sửa; câu trả lời ngắn dùng điểm giáo viên thay điểm tự động sau khi lưu.</p>
          </div>
          <div ref={content} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
              <nav aria-label="Lọc câu hỏi" className="flex flex-wrap gap-2">{([['all', 'Tất cả câu hỏi'], ['written', 'Tự luận / Trả lời ngắn / Thực hành']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === value ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200'}`}>{label}</button>)}</nav>
              {filter === 'written' && !questions.some(canTeacherGradeQuestion) && <p className="rounded-xl bg-white p-5">Đề này không có câu tự luận, trả lời ngắn hoặc thực hành.</p>}
              {questions.map((submittedQuestion, number) => {
                const original = exam.questions.find(question => question.id === submittedQuestion.id) || submittedQuestion;
                const question = { ...submittedQuestion, points: original.points, rubric: original.rubric, sampleAnswer: original.sampleAnswer };
                const editable = canTeacherGradeQuestion(question);
                if (filter === 'written' && !editable) return null;
                const answer = result.answers?.[question.id];
                const payload = question.engineQuestion?.payload;
                const options = payload?.type === 'single_choice' || payload?.type === 'multiple_choice' ? payload.options.map(option => option.text) : question.options;
                const correct = receiptQuestionIsCorrect(question, answer);
                return <section key={`${result.id}:${question.id}`} aria-label={`Câu ${number + 1}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-4 md:p-5">
                    <h3 className="mb-2 font-bold">Câu {number + 1} · {question.type === 'essay' ? 'Tự luận' : question.type === 'practical' ? 'Thực hành' : editable ? 'Trả lời ngắn' : 'Câu hỏi'} · {formatPoints(questionMaxPoints(original))} điểm</h3>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: examQuestionHtml(question.text || question.engineQuestion?.prompt || '') }} />
                    {!editable && options.length > 0 && <ol className="mt-3 space-y-1">{options.map((option, optionIndex) => <li key={optionIndex} className="flex gap-2 text-sm"><b>{String.fromCharCode(65 + optionIndex)}.</b><span dangerouslySetInnerHTML={{ __html: examQuestionHtml(option) }} /></li>)}</ol>}
                    {editable && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-violet-50 p-3 text-sm text-violet-900"><b>Đáp án / Hướng dẫn chấm: </b>{isManualQuestion(original) ? original.sampleAnswer || 'Chấm theo các tiêu chí bên dưới.' : receiptAnswerText(question, answer, true)}</p>}
                  </div>
                  {editable ? <div className="p-3"><ExamGradeCard question={question} result={result} label="Bài làm học sinh" sublabel="" keywords={NO_KEYWORDS} onSave={grade => save(question.id, grade)} onStatusChange={state => setSaveStates(previous => ({ ...previous, [`${result.id}:${question.id}`]: state }))} /></div> : <div className="space-y-3 p-4 md:p-5">
                    <div><p className="mb-1 text-xs font-bold uppercase text-slate-500">Câu trả lời của học sinh</p><p className="whitespace-pre-wrap break-words">{receiptAnswerText(question, answer)}</p></div>
                    <div className="flex flex-wrap items-start gap-3"><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${correct ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{correct ? 'Đúng' : 'Chưa đúng'}</span><p className="whitespace-pre-wrap break-words text-sm text-slate-600">Đáp án: {receiptAnswerText(question, answer, true)}</p></div>
                  </div>}
                </section>;
              })}
            </div>
          </div>
        </>}
      </div>
    </dialog>
  );
}
