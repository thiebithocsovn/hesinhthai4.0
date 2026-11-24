import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
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
  return <section className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" aria-label="Học sinh tự đăng ký dự thi theo lớp">
    <header className="border-b border-slate-100 p-4 sm:p-5">
      <h3 className="font-bold text-slate-800">Học sinh dự thi ngoài danh sách lớp chính thức {ready?'('+rows.length+' lượt)':''}</h3>
      <p className="mt-1 text-sm text-slate-500">Tự động đối chiếu lớp đã chọn trong phiên thi hoặc bài nộp. Một học sinh có thể có nhiều lượt thi; các lượt này chưa làm thay đổi sĩ số chính thức.</p>
      {(sessionError||resultError)?<p role="alert" className="mt-2 text-sm text-amber-800">Chưa tải đủ dữ liệu dự thi. Kiểm tra kết nối hoặc quyền truy cập Firebase, rồi mở lại lớp.</p>:!ready?<p role="status" className="mt-2 text-sm text-slate-500">Đang đồng bộ dữ liệu dự thi…</p>:null}
    </header>
    <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-4 py-3">Họ và tên</th><th scope="col" className="px-4 py-3">Kỳ thi</th><th scope="col" className="px-4 py-3">Trạng thái</th></tr></thead><tbody className="divide-y divide-slate-100">
      {rows.map(row=><tr key={row.key}><td className="px-4 py-3 font-medium text-slate-800">{row.name}</td><td className="px-4 py-3 text-slate-600">{row.examTitle}</td><td className="px-4 py-3"><span className={'rounded-lg px-2 py-1 text-xs font-semibold '+(row.status==='submitted'?'bg-emerald-50 text-emerald-700':'bg-blue-50 text-blue-700')}>{row.status==='submitted'?'Đã nộp bài':'Có phiên làm bài'}</span></td></tr>)}
      {ready&&!rows.length&&<tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Chưa có lượt thi ngoài danh sách chính thức có thông tin lớp đã lưu.</td></tr>}
    </tbody></table></div>
  </section>;
}
