import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Printer, X } from 'lucide-react';
import { printExamReceipt } from '../lib/examReceipt';
import {
  classReceiptClasses, prepareClassExamReceipts,
  type ClassReceiptClass, type ClassReceiptExam, type ClassReceiptResult, type ClassReceiptSession, type ClassReceiptStudent,
} from '../lib/examClassReceipts';
import type { TeacherAccessScope } from '../lib/teacherIsolation';

interface Props {
  exam: ClassReceiptExam;
  classes: ClassReceiptClass[];
  students: ClassReceiptStudent[];
  results: ClassReceiptResult[];
  sessions: ClassReceiptSession[];
  access: TeacherAccessScope;
  initialClassId: string;
  dataReady: boolean;
  sessionsLoading: boolean;
  sessionsError: string;
  onClose: () => void;
}

export default function ExamClassReceiptsDialog({ exam, classes, students, results, sessions, access, initialClassId, dataReady, sessionsLoading, sessionsError, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const printingRef = useRef(false);
  const [classId, setClassId] = useState(initialClassId === 'all' ? '' : initialClassId);
  const [printing, setPrinting] = useState(false);
  const [printingHtml, setPrintingHtml] = useState('');
  const [printError, setPrintError] = useState('');
  const directory = useMemo(() => classReceiptClasses(exam, classes, access), [exam, classes, access.role, access.ownerUid]);
  const preview = useMemo(() => {
    if (!classId) return { document: null, error: '' };
    try { return { document: prepareClassExamReceipts(exam, classId, results, students, classes, sessions, access), error: '' }; }
    catch (error) { return { document: null, error: error instanceof Error ? error.message : 'Chưa thể tạo biên bản. Vui lòng thử lại.' }; }
  }, [exam, classId, results, students, classes, sessions, access.role, access.ownerUid]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const print = async () => {
    if (printingRef.current || !preview.document || !dataReady || sessionsLoading) return;
    printingRef.current = true;
    setPrinting(true); setPrintingHtml(preview.document.html); setPrintError('');
    try { await printExamReceipt(preview.document.html); }
    catch (error) { setPrintError(error instanceof Error ? error.message : 'Không thể mở hộp thoại in. Vui lòng thử lại.'); }
    finally { printingRef.current = false; setPrinting(false); setPrintingHtml(''); }
  };

  return <dialog ref={dialogRef} aria-labelledby="class-receipts-title" onCancel={event => { event.preventDefault(); if (!printingRef.current) onClose(); }} className="m-auto h-[94dvh] w-[calc(100%_-_1rem)] max-w-6xl rounded-2xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm">
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-slate-200 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 id="class-receipts-title" className="text-lg font-bold sm:text-xl">Xuất biên bản thi cả lớp</h2><p className="mt-1 break-words text-sm text-slate-600">{exam.title}</p></div>
          <button type="button" disabled={printing} onClick={onClose} aria-label="Đóng biên bản cả lớp" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40"><X size={20} /></button>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-0 flex-1 text-sm font-semibold" htmlFor="class-receipts-class">Lớp cần xuất biên bản
            <select id="class-receipts-class" aria-label="Lớp cần xuất biên bản" disabled={printing} value={classId} onChange={event => { setClassId(event.target.value); setPrintError(''); }} className="mt-1 block w-full max-w-lg rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
              <option value="" disabled>Chọn lớp</option>{directory.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={printing || !preview.document || !dataReady || sessionsLoading} onClick={() => void print()} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
            {printing ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}{printing ? 'Đang mở lệnh in…' : 'In / Lưu PDF cả lớp'}
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-600">Mỗi học sinh đã nộp bài có một biên bản, lấy lần nộp mới nhất và bắt đầu ở trang mới. Để tải một tệp PDF chung, chọn “Lưu dưới dạng PDF” trong hộp thoại in.</p>
        {preview.document && <p role="status" className="mt-2 text-sm font-semibold text-blue-800">{preview.document.className} · {preview.document.entries.length} biên bản{preview.document.pending > 0 ? ` · ${preview.document.pending} bài chưa chấm xong` : ''}{preview.document.previouslyPrinted > 0 ? ` · ${preview.document.previouslyPrinted} phiếu đã in trước đây` : ''}</p>}
        {preview.document && preview.document.pending > 0 && <p className="mt-1 text-sm text-amber-800">Bài chưa chấm xong sẽ ghi “Chờ chấm”, chưa có điểm cuối cùng.</p>}
        {(sessionsLoading || !dataReady) && <p role="status" className="mt-2 text-sm text-slate-600">Đang tải dữ liệu biên bản từ máy chủ…</p>}
        {sessionsError && <p role="status" className="mt-2 text-sm text-amber-800">{sessionsError}</p>}
        {(preview.error || printError) && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{preview.error || printError}</p>}
      </header>
      {printingHtml || preview.document ? <iframe title="Xem trước biên bản thi cả lớp A4" sandbox="allow-same-origin" srcDoc={printingHtml || preview.document?.html} className="min-h-0 w-full flex-1 border-0 bg-slate-100" /> : <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-6 text-center text-slate-500">{classId ? 'Chưa có biên bản để hiển thị.' : 'Chọn lớp để xem và xuất toàn bộ biên bản thi của lớp.'}</div>}
    </div>
  </dialog>;
}
