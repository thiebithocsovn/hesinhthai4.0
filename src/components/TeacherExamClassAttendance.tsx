import { useEffect, useState, useMemo, useRef } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { planClassEnrollment } from '../lib/examEnrollmentPlan';
import { reconcileClassEnrollment } from '../lib/examEnrollmentSync';
import { formatStudentName } from '../lib/studentNameNormalization';
import { collectClassExamAttendance, type ClassRosterExam, type ClassRosterRecord, type ClassRosterResult, type ClassRosterSession } from '../lib/examClassAttendance';

export default function TeacherExamClassAttendance({ownerUid,classId,students,exams,rosterReady}:{ownerUid:string;classId:string;students:readonly ClassRosterRecord[];exams:readonly ClassRosterExam[];rosterReady:boolean}) {
  const [sessions,setSessions]=useState<ClassRosterSession[]>([]);
  const [results,setResults]=useState<ClassRosterResult[]>([]);
  const [sessionReady,setSessionReady]=useState(false);
  const [resultReady,setResultReady]=useState(false);
  const [sessionError,setSessionError]=useState(false);
  const [resultError,setResultError]=useState(false);
  useEffect(()=>{
    setSessions([]);setResults([]);setSessionReady(false);setResultReady(false);setSessionError(false);setResultError(false);
    if(!ownerUid)return;
    // Only subscribe while the selected class is open; never expose these
    // records to candidates or grant new read/write permissions.
    const stopSessions=onSnapshot(query(collection(db,'exam_sessions'),where('teacherId','==',ownerUid)),{includeMetadataChanges:true},snapshot=>{
      setSessions(snapshot.docs.map(d=>({...d.data(),id:d.id} as ClassRosterSession)));
      setSessionReady(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites);setSessionError(false);
    },()=>{setSessions([]);setSessionReady(false);setSessionError(true);});
    const stopResults=onSnapshot(query(collection(db,'results'),where('teacherId','==',ownerUid)),{includeMetadataChanges:true},snapshot=>{
      setResults(snapshot.docs.map(d=>({...d.data(),id:d.id} as ClassRosterResult)));
      setResultReady(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites);setResultError(false);
    },()=>{setResults([]);setResultReady(false);setResultError(true);});
    return()=>{stopSessions();stopResults();};
  },[ownerUid]);
  const rows=useMemo(()=>collectClassExamAttendance(ownerUid,classId,students,exams,sessions,results),[ownerUid,classId,students,exams,sessions,results]);
  const ready=rosterReady&&sessionReady&&resultReady;
  const plan=useMemo(()=>planClassEnrollment(ownerUid,classId,students,exams,sessions,results),[ownerUid,classId,students,exams,sessions,results]);
  const signature=JSON.stringify(plan.eligible.map(row=>[row.studentId,row.name,row.examId]));
  const attempted=useRef('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [syncError,setSyncError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!ready||busy||!plan.eligible.length||attempted.current===signature+':'+retry)return;
    const timer=window.setTimeout(()=>{
      attempted.current=signature+':'+retry;
      setBusy(true);setSyncError('');
      void reconcileClassEnrollment(db,ownerUid,classId).then(result=>{
        setNotice(result.added?'Đã chuyển '+result.added+' học sinh vào danh sách chính thức. Giữ nguyên bài thi và điểm.':'Danh sách đã được kiểm tra.');
      }).catch(()=>setSyncError('Chưa đồng bộ được toàn bộ học sinh. Các hồ sơ đã lưu vẫn được giữ; hãy thử lại.')).finally(()=>setBusy(false));
    },350);
    return()=>window.clearTimeout(timer);
  },[ready,busy,signature,retry,ownerUid,classId]);

  return <section className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" aria-label="Học sinh tự đăng ký dự thi theo lớp">
    <header className="border-b border-slate-100 p-4 sm:p-5">
      <h3 className="font-bold text-slate-800">Đồng bộ học sinh từ kỳ thi {ready?'('+rows.length+' lượt chưa chuyển)':''}</h3>
      <p className="mt-1 text-sm text-slate-500">Tự chuyển hồ sơ có tên đầy đủ, không trùng và có thông tin lớp đã lưu vào danh sách chính thức khi giáo viên mở lớp. Các trường hợp chưa đủ căn cứ được giữ để kiểm tra.</p>
      {(sessionError||resultError)?<p role="alert" className="mt-2 text-sm text-amber-800">Chưa tải đủ dữ liệu dự thi. Kiểm tra kết nối hoặc quyền truy cập Firebase, rồi mở lại lớp.</p>:!ready?<p role="status" className="mt-2 text-sm text-slate-500">Đang đồng bộ dữ liệu dự thi…</p>:null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">{plan.eligible.length} có thể chuyển · {plan.review.length} cần xác minh</span>
        {busy&&<span role="status" className="text-teal-700">Đang đồng bộ…</span>}
        {ready&&<button type="button" disabled={busy||!plan.eligible.length} onClick={()=>setRetry(v=>v+1)} className="rounded-lg border px-3 py-1.5 font-semibold text-teal-700 disabled:opacity-40">Đồng bộ lại</button>}
      </div>
      {notice&&<p role="status" className="mt-2 text-sm text-emerald-800">{notice}</p>}
      {syncError&&<p role="alert" className="mt-2 text-sm text-red-700">{syncError}</p>}
    </header>
    <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-4 py-3">Họ và tên</th><th scope="col" className="px-4 py-3">Kỳ thi</th><th scope="col" className="px-4 py-3">Trạng thái</th></tr></thead><tbody className="divide-y divide-slate-100">
      {rows.map(row=><tr key={row.key}><td className="px-4 py-3 font-medium text-slate-800">{formatStudentName(row.name)}{plan.review.find(item=>item.row.key===row.key)&&<p className="mt-1 text-xs text-amber-700">{plan.review.find(item=>item.row.key===row.key)?.reason}</p>}</td><td className="px-4 py-3 text-slate-600">{row.examTitle}</td><td className="px-4 py-3"><span className={'rounded-lg px-2 py-1 text-xs font-semibold '+(row.status==='submitted'?'bg-emerald-50 text-emerald-700':'bg-blue-50 text-blue-700')}>{row.status==='submitted'?'Đã nộp bài':'Có phiên làm bài'}</span></td></tr>)}
      {ready&&!rows.length&&<tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Không còn lượt thi đủ dữ liệu lớp cần chuyển.</td></tr>}
    </tbody></table></div>
  </section>;
}
