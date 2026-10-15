import { useRef, useState } from 'react';
import { FileUp, Hand, LoaderCircle, Paperclip, Trash2 } from 'lucide-react';
import {
  formatFileSize,
  formatPoints,
  isSubmittedPracticalFile,
  PRACTICAL_FILE_PRESETS,
  readPracticalFile,
  type GradableQuestion,
} from '../lib/examManualGrading';

interface Props {
  question: GradableQuestion;
  answer: unknown;
  onChange: (value: unknown) => void;
}

const ESSAY_LIMIT = 5000;

/** Student input for essay (tự luận) and practical (thực hành) questions. */
export default function ExamManualStudentQuestion({ question, answer, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const criteria = question.rubric || [];

  if (question.type === 'essay') {
    const text = typeof answer === 'string' ? answer : '';
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={event => onChange(event.target.value.slice(0, ESSAY_LIMIT))}
          rows={7}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 leading-7 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          placeholder="Em viết câu trả lời vào đây…"
          aria-label="Bài làm tự luận"
        />
        <p className="text-right text-xs text-slate-500">{text.length}/{ESSAY_LIMIT} ký tự</p>
      </div>
    );
  }

  const preset = PRACTICAL_FILE_PRESETS.find(item => item.id === question.acceptedFiles) || PRACTICAL_FILE_PRESETS[0];
  const file = isSubmittedPracticalFile(answer) ? answer : null;

  return (
    <div className="flex flex-col gap-4">
      {criteria.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="mb-2 text-sm font-bold text-emerald-800">Yêu cầu cần đạt</p>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {criteria.map(item => <li key={item.id} className="flex justify-between gap-3"><span>• {item.text}</span><span className="shrink-0 font-semibold text-emerald-700">{formatPoints(item.points)}đ</span></li>)}
          </ul>
        </div>
      )}
      {question.practicalMode === 'observe' ? (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Hand className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Em làm bài thực hành trên máy tính theo yêu cầu. Giáo viên sẽ quan sát và chấm trực tiếp tại lớp, em không cần nộp tệp.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={preset.accept || undefined}
            className="hidden"
            onChange={async event => {
              const selected = event.target.files?.[0];
              event.target.value = '';
              if (!selected) return;
              setBusy(true); setError('');
              try { onChange(await readPracticalFile(selected)); }
              catch (reason) { setError(reason instanceof Error ? reason.message : 'Không đọc được tệp.'); }
              finally { setBusy(false); }
            }}
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-white p-3">
              {file.type.startsWith('image/') ? <img src={file.dataUrl} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <Paperclip className="h-6 w-6 shrink-0 text-emerald-600" />}
              <div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-800">{file.name}</p><p className="text-xs text-slate-500">{formatFileSize(file.size)} · đã sẵn sàng nộp</p></div>
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">Đổi tệp</button>
              <button type="button" onClick={() => onChange(undefined)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Bỏ tệp đã chọn"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-6 font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60">
              {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
              {busy ? 'Đang đọc tệp…' : `Chọn tệp bài làm (${preset.label})`}
            </button>
          )}
          <p className="text-xs text-slate-500">Lưu bài trên máy trước, rồi chọn tệp để nộp cùng bài thi. Tệp tối đa 500 KB; nếu tệp quá nặng, em chụp ảnh màn hình bài làm và nộp ảnh.</p>
          {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
