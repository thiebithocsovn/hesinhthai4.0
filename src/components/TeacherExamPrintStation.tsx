import { useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { collection, doc, getDoc, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../firebase';
import { buildExamReceiptHtml, getExamReceiptSettings, getReceiptStudentClassId, printExamReceipt, type ReceiptExam, type ReceiptStudent } from '../lib/examReceipt';
import { gradeSubmittedExam, pendingTeacherPrintResults, TeacherExamPrintQueue, type TeacherPrintResult, type TeacherPrintState } from '../lib/teacherExamPrinting';

interface StationExam extends ReceiptExam { teacherId?: string; status: string }
interface Props { exams: StationExam[]; authenticatedUid: string; }
interface StationSession { examId: string; teacherId: string; since: string; baselineIds: string[]; }

export default function TeacherExamPrintStation({ exams, authenticatedUid }: Props) {
  const sessionKey = `teacher_exam_print_station::${authenticatedUid}`;
  const [station, setStation] = useState<StationSession | null>(() => {
    try { const stored = sessionStorage.getItem(sessionKey); const parsed = stored ? JSON.parse(stored) : null; return parsed && Array.isArray(parsed.baselineIds) ? parsed : null; } catch { return null; }
  });
  const [selectedId, setSelectedId] = useState('');
  const [ready, setReady] = useState(false);
  const [baselineReady, setBaselineReady] = useState(false);
  const baselineRef = useRef<string[]>([]);
  const [message, setMessage] = useState('');
  const [entries, setEntries] = useState<{ id: string; status: string; message: string }[]>([]);
  const stationId = useRef(crypto.randomUUID());
  const latestExams = useRef(exams);
  latestExams.current = exams;
  const selected = exams.find(exam => exam.id === (station?.examId || selectedId || exams[0]?.id));

  // Read existing document IDs before arming; student-computer clock drift must not hide a new submission.
  useEffect(() => {
    setBaselineReady(false); baselineRef.current = [];
    if (!selected?.teacherId || !authenticatedUid) return;
    return onSnapshot(query(collection(db, 'results'), where('teacherId', '==', selected.teacherId)), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      baselineRef.current = snapshot.docs.filter(item => item.data().examId === selected.id).map(item => item.id);
      setBaselineReady(true);
    }, () => setBaselineReady(false));
  }, [selected?.id, selected?.teacherId, authenticatedUid]);

  useEffect(() => {
    if (!station || !authenticatedUid) return;
    let mounted = true;
    let latest: TeacherPrintResult[] = [];
    const report = (id: string, status: string, detail: string) => {
      if (mounted) setEntries(previous => [{ id, status, message: detail }, ...previous.filter(item => item.id !== id)].slice(0, 8));
    };
    const resultRef = (id: string) => doc(db, 'results', id);
    const matches = (result: TeacherPrintResult) => result.examId === station.examId && result.teacherId === station.teacherId;
    const ownedClaim = (result: TeacherPrintResult) => result.teacherPrint?.status === 'claimed' && result.teacherPrint.stationId === stationId.current;
    const stamp = (status: TeacherPrintState['status'], claimedAt: string): TeacherPrintState => ({ status, stationId: stationId.current, claimedAt, updatedAt: new Date().toISOString() });
    const queue = new TeacherExamPrintQueue({
      claim: async result => runTransaction(db, async transaction => {
        const snapshot = await transaction.get(resultRef(result.id));
        if (!snapshot.exists()) return null;
        const current = { ...snapshot.data(), id: snapshot.id } as TeacherPrintResult;
        if (!matches(current) || !pendingTeacherPrintResults([current], station.teacherId, station.examId, station.since, Date.now(), station.baselineIds).length) return null;
        const state = stamp('claimed', new Date().toISOString());
        transaction.update(snapshot.ref, { teacherPrint: state });
        return { ...current, teacherPrint: state };
      }),
      prepare: async result => {
        const exam = latestExams.current.find(item => item.id === result.examId && item.teacherId === result.teacherId);
        if (!exam) throw new Error('Chưa tải được đề thi của giáo viên.');
        if (!getExamReceiptSettings(exam).autoPrint) throw new Error('Kỳ thi đã tắt in tự động.');
        const grade = gradeSubmittedExam(exam, result);
        const studentSnapshot = await getDoc(doc(db, 'students', result.studentId));
        if (!studentSnapshot.exists() || studentSnapshot.data().teacherId !== result.teacherId) throw new Error('Không tìm thấy học sinh thuộc giáo viên tổ chức kỳ thi.');
        const student = { ...studentSnapshot.data(), id: studentSnapshot.id } as ReceiptStudent;
        let receiptExam = exam;
        const classId = getReceiptStudentClassId(exam, student, result);
        if (classId) {
          const classSnapshot = await getDoc(doc(db, 'classes', classId));
          if (classSnapshot.exists() && classSnapshot.data().teacherId === result.teacherId) {
            receiptExam = { ...exam, classNames: { ...exam.classNames, [classId]: String(classSnapshot.data().name || '') } };
          }
        }
        let startedAt: string | undefined;
        try { const session = await getDoc(doc(db, 'exam_sessions', result.id)); if (session.exists() && session.data().teacherId === result.teacherId) startedAt = session.data().startTime; } catch { /* Start time is optional on the receipt. */ }
        return { ...grade, studentName: student.name, html: buildExamReceiptHtml(receiptExam, student, { ...result, ...grade }, startedAt) };
      },
      markDispatching: async (result, receipt) => runTransaction(db, async transaction => {
        const snapshot = await transaction.get(resultRef(result.id));
        if (!snapshot.exists()) return false;
        const current = snapshot.data() as TeacherPrintResult;
        if (!matches(current) || !ownedClaim(current)) return false;
        transaction.update(snapshot.ref, { score: receipt.score, totalQuestions: receipt.totalQuestions, teacherGradedAt: new Date().toISOString(), teacherPrint: stamp('dispatching', current.teacherPrint!.claimedAt) });
        return true;
      }),
      print: printExamReceipt,
      markSent: async result => {
        await runTransaction(db, async transaction => {
          const snapshot = await transaction.get(resultRef(result.id));
          if (!snapshot.exists()) throw new Error('Không còn bài nộp để ghi nhận trạng thái in.');
          const current = snapshot.data() as TeacherPrintResult;
          if (!matches(current) || current.teacherPrint?.stationId !== stationId.current || current.teacherPrint.status !== 'dispatching') throw new Error('Trạng thái máy in đã thay đổi.');
          transaction.update(snapshot.ref, { teacherPrint: stamp('sent', current.teacherPrint.claimedAt) });
        });
      },
      markFailed: async result => {
        await runTransaction(db, async transaction => {
          const snapshot = await transaction.get(resultRef(result.id));
          if (snapshot.exists()) {
            const current = snapshot.data() as TeacherPrintResult;
            if (matches(current) && ownedClaim(current)) transaction.update(snapshot.ref, { teacherPrint: stamp('failed', current.teacherPrint!.claimedAt) });
          }
        });
      },
      report,
    });
    const feed = () => { if (!latestExams.current.some(exam => exam.id === station.examId && exam.teacherId === station.teacherId)) return; queue.add(pendingTeacherPrintResults(latest, station.teacherId, station.examId, station.since, Date.now(), station.baselineIds)); };
    const unsubscribe = onSnapshot(query(collection(db, 'results'), where('teacherId', '==', station.teacherId)), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      latest = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as TeacherPrintResult));
      setMessage('Đang nhận bài mới và tự động chấm, gửi lệnh in trên máy giáo viên.');
      feed();
    }, () => setMessage('Mất kết nối dữ liệu. Giữ cửa sổ này mở; hệ thống sẽ tiếp tục nhận bài khi kết nối trở lại.'));
    const recovery = window.setInterval(feed, 10_000);
    return () => { mounted = false; unsubscribe(); window.clearInterval(recovery); queue.stop(); };
  }, [station?.examId, station?.teacherId, station?.since, authenticatedUid]);

  const start = () => {
    if (!selected?.teacherId || !ready || !baselineReady || !getExamReceiptSettings(selected).autoPrint) return;
    const next = { examId: selected.id, teacherId: selected.teacherId, since: new Date().toISOString(), baselineIds: [...baselineRef.current] };
    try { sessionStorage.setItem(sessionKey, JSON.stringify(next)); } catch { /* Session can still run without refresh recovery. */ }
    setEntries([]); setMessage('Đang kết nối với bài nộp…'); setStation(next);
  };
  const stop = () => { setStation(null); try { sessionStorage.removeItem(sessionKey); } catch {} setMessage('Đã dừng nhận lệnh in mới. Phiếu đang xử lý sẽ hoàn tất.'); };

  if (!authenticatedUid) return null;
  return <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Máy in giáo viên">
    <h3 className="flex items-center gap-2 font-bold text-blue-900"><Printer size={20} />Máy giáo viên: nhận bài → chấm → tự in phiếu ký</h3>
    <p className="mt-2 text-sm text-slate-600">Cấu hình Chrome và máy in một lần, bật trạm trước giờ thi và giữ cửa sổ giáo viên này mở. Máy học sinh chỉ nộp bài. Mỗi bài được xếp hàng và gửi lệnh lần lượt.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <select aria-label="Kỳ thi in tự động" value={station?.examId || selected?.id || ''} disabled={!!station} onChange={event => setSelectedId(event.target.value)} className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="" disabled>Chọn kỳ thi</option>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</select>
      {!station ? <button type="button" disabled={!ready || !baselineReady || !selected || !getExamReceiptSettings(selected).autoPrint} onClick={start} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Bật trạm in giáo viên</button> : <button type="button" onClick={stop} className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white">Dừng trạm in</button>}
      <a href={`${import.meta.env.BASE_URL}teacher-printing/Cau_hinh_in_giao_vien.cmd`} download className="text-sm font-semibold text-blue-700 underline">Tải bộ bật/tắt in tự động Windows</a>
      <button type="button" onClick={() => void printExamReceipt(buildExamReceiptHtml({ id: 'test', title: 'KIỂM TRA MÁY IN - KHÔNG PHẢI BÀI THI', durationMinutes: 0, questions: [], receiptSettings: { schoolName: 'KIỂM TRA KẾT NỐI MÁY IN' } }, { id: 'test', name: 'Phiếu thử máy in giáo viên' }, { id: 'test-print', score: 0, totalQuestions: 0, submittedAt: new Date().toISOString() })).catch(error => setMessage(String(error)))} className="text-sm font-semibold text-blue-700 underline">In thử một phiếu</button>
    </div>
    {!station && <><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={ready} onChange={event => setReady(event.target.checked)} />Máy giáo viên đã bật in không cần xác nhận và đã chọn máy in giấy mặc định.</label>{selected && !baselineReady && <p className="mt-2 text-sm text-slate-600">Đang xác nhận danh sách bài nộp hiện có trước khi bật trạm…</p>}{selected && !getExamReceiptSettings(selected).autoPrint && <p className="mt-2 text-sm text-amber-800">Bật “Tự động in tại máy giáo viên khi nhận bài nộp” trong cấu hình kỳ thi rồi lưu.</p>}</>}
    <p className="mt-2 text-xs text-slate-600">Chỉ tự in các bài nộp từ lúc bật trạm. Trình duyệt thường vẫn hiện hộp thoại; bộ cấu hình dành cho Chrome 144 trở lên giúp in không cần bấm In. Trạng thái “đã gửi” ghi nhận lệnh trình duyệt, không xác nhận giấy đã ra; hãy kiểm tra hàng đợi Windows khi máy in hết giấy hoặc mất kết nối.</p>
    {message && <p className="mt-3 text-sm font-medium text-blue-900" role="status">{message}</p>}
    {!!entries.length && <ul className="mt-2 space-y-1 text-sm">{entries.map(item => <li key={item.id} className={item.status === 'failed' || item.status === 'uncertain' ? 'text-red-700' : 'text-slate-700'}>{item.message}</li>)}</ul>}
  </section>;
}
