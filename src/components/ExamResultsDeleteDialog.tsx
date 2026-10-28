import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import {
  ALL_DELETION_EXAMS, classGrade, examResultDeletionClasses, selectExamResultsToDelete,
  type DeletionClass, type DeletionExam, type DeletionResult, type DeletionStudent, type ExamResultDeletionScope,
} from '../lib/examResultDeletion';
import type { TeacherAccessScope } from '../lib/teacherIsolation';

interface Props {
  exams: DeletionExam[];
  classes: DeletionClass[];
  students: DeletionStudent[];
  results: DeletionResult[];
  access: TeacherAccessScope;
  initialExamId: string;
  initialClassId: string;
  dataReady: boolean;
  onClose: () => void;
  onDelete: (ids: string[], onProgress: (deleted: number, total: number) => void) => Promise<void>;
}

const selectStyle = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50';

export default function ExamResultsDeleteDialog({ exams, classes, students, results, access, initialExamId, initialClassId, dataReady, onClose, onDelete }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [kind, setKind] = useState<ExamResultDeletionScope['kind']>(initialClassId !== 'all' ? 'class' : 'exam');
  const [examId, setExamId] = useState(initialExamId);
  const [classId, setClassId] = useState(initialClassId === 'all' ? '' : initialClassId);
  const directory = useMemo(() => examResultDeletionClasses(classes, exams, access), [classes, exams, access.role, access.ownerUid]);
  const grades = [...new Set(directory.map(item => classGrade(item.name)).filter((grade): grade is string => Boolean(grade)))].sort((a, b) => Number(a) - Number(b));
  const [grade, setGrade] = useState(() => classGrade(classes.find(item => item.id === initialClassId)?.name || '') || '');
  const [confirmation, setConfirmation] = useState({ text: '', signature: '' });
  const [busy, setBusy] = useState(false);
  const [runningTargets, setRunningTargets] = useState<DeletionResult[] | null>(null);
  const [progress, setProgress] = useState({ deleted: 0, total: 0 });
  const [error, setError] = useState('');
  const scope: ExamResultDeletionScope = kind === 'exam' ? { kind, examId } : kind === 'class' ? { kind, examId, classId } : { kind, examId, grade };
  const targets = useMemo(() => selectExamResultsToDelete(results, exams, students, classes, scope, access),
    [results, exams, students, classes, kind, examId, classId, grade, access.role, access.ownerUid]);
  const displayedTargets = runningTargets || targets;
  const signature = JSON.stringify([scope, targets.map(result => result.id).sort()]);
  const confirmationText = confirmation.signature === signature ? confirmation.text : '';
  const ready = dataReady && access.role !== 'guest' && targets.length > 0 && confirmationText.trim().normalize('NFD').replace(/\p{M}/gu, '').toUpperCase() === 'XOA';

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current || !ready) return;
    busyRef.current = true;
    setBusy(true); setError(''); setRunningTargets(targets);
    try {
      await onDelete(targets.map(result => result.id), (deleted, total) => setProgress({ deleted, total }));
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể xoá kết quả. Vui lòng thử lại.');
      setConfirmation({ text: '', signature: '' });
    } finally {
      busyRef.current = false; setBusy(false); setRunningTargets(null);
    }
  };

  return <dialog ref={dialogRef} aria-labelledby="delete-exam-results-title" aria-describedby="delete-exam-results-description" onCancel={event => { event.preventDefault(); if (!busyRef.current) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm">
    <form onSubmit={submit} className="p-5 sm:p-6" aria-busy={busy}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 id="delete-exam-results-title" className="flex items-center gap-2 text-xl font-bold"><Trash2 className="h-6 w-6 text-red-600" />Xoá kết quả thi</h3>
          <p id="delete-exam-results-description" className="mt-2 text-sm text-slate-600">Chọn phạm vi cần xoá. Bao gồm cả các lần nộp cũ của học sinh.</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng hộp thoại xoá" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40"><X className="h-5 w-5" /></button>
      </div>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Xoá theo
          <select autoFocus value={kind} onChange={event => { const next = event.target.value as typeof kind; setKind(next); if (next === 'exam' && examId === ALL_DELETION_EXAMS) setExamId(initialExamId || exams[0]?.id || ''); setError(''); }} className={selectStyle}>
            <option value="exam">Theo bài thi</option><option value="class">Theo lớp</option><option value="grade">Theo khối</option>
          </select>
        </label>
        <label className="text-sm font-semibold">Bài thi áp dụng
          <select value={examId} onChange={event => { setExamId(event.target.value); setError(''); }} className={selectStyle}>
            <option value="" disabled>Chọn bài thi</option>
            {kind !== 'exam' && <option value={ALL_DELETION_EXAMS}>Tất cả bài thi</option>}
            {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
          </select>
        </label>
        {kind === 'class' && <label className="text-sm font-semibold sm:col-span-2">Lớp cần xoá kết quả
          <select value={classId} onChange={event => { setClassId(event.target.value); setError(''); }} className={selectStyle}>
            <option value="" disabled>Chọn lớp</option>
            {directory.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        {kind === 'grade' && <label className="text-sm font-semibold sm:col-span-2">Khối cần xoá kết quả
          <select value={grade} onChange={event => { setGrade(event.target.value); setError(''); }} className={selectStyle}>
            <option value="" disabled>Chọn khối</option>{grades.map(item => <option key={item} value={item}>Khối {item}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-500">Khối được xác định từ tên lớp, ví dụ 3A, 8A4, Lớp 10A.</span>
        </label>}
      </fieldset>
      <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">{kind === 'exam' ? 'Toàn bộ các lớp' : kind === 'class' ? `Lớp: ${directory.find(item => item.id === classId)?.name || 'Chưa chọn'}` : `Khối: ${grade || 'Chưa chọn'}`}</p>
        <p className="mt-1 break-words">Bài thi: {examId === ALL_DELETION_EXAMS ? 'Tất cả bài thi' : exams.find(exam => exam.id === examId)?.title || 'Chưa chọn'}</p>
        <p className="mt-2"><strong>{displayedTargets.length} lượt nộp</strong> · {new Set(displayedTargets.map(result => result.studentId)).size} học sinh · {new Set(displayedTargets.map(result => result.examId)).size} bài thi</p>
        <p className="mt-2">Bài làm, điểm và nhận xét trong các lượt nộp này sẽ bị xoá vĩnh viễn. Đề thi, lớp học và tài khoản học sinh được giữ lại.</p>
      </div>
      {!dataReady && !busy && <p role="status" className="mt-3 text-sm text-amber-800">Đang chờ danh sách kết quả từ máy chủ. Cần kết nối mạng trước khi xoá.</p>}
      {dataReady && targets.length === 0 && !busy && <p role="status" className="mt-3 text-sm text-slate-600">Không có kết quả trong phạm vi đã chọn.</p>}
      <label className="mt-4 block text-sm font-semibold">Nhập XOÁ để xác nhận
        <input value={confirmationText} disabled={busy} onChange={event => setConfirmation({ text: event.target.value, signature })} autoComplete="off" spellCheck={false} className={selectStyle} placeholder="XOÁ" />
      </label>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {busy && <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-700">Đang xoá {progress.deleted}/{progress.total} lượt nộp. Vui lòng giữ cửa sổ này mở.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-5 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">Huỷ</button>
        <button type="submit" disabled={busy || !ready} className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{busy ? 'Đang xoá…' : `Xoá ${targets.length} lượt nộp`}
        </button>
      </div>
    </form>
  </dialog>;
}
