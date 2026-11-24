import { useEffect, useState, useMemo, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { planClassEnrollment } from '../lib/examEnrollmentPlan';
import { reconcileClassEnrollment } from '../lib/examEnrollmentSync';
import { formatStudentName } from '../lib/studentNameNormalization';
import { auditClassNames } from '../lib/studentNameAgent';
import { collectClassExamAttendance, type ClassRosterExam, type ClassRosterRecord, type ClassRosterResult, type ClassRosterSession } from '../lib/examClassAttendance';

export default function TeacherExamClassAttendance({ownerUid,classId,students,exams,rosterReady,onRename,onRemove}:{ownerUid:string;classId:string;students:readonly ClassRosterRecord[];exams:readonly ClassRosterExam[];rosterReady:boolean;onRename:(id:string,name:string)=>Promise<void>;onRemove:(id:string)=>Promise<void>}) {
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

  // One table, one row per existing student ID. Pending records are visibly
  // marked until the teacher-authorized transaction confirms membership.
  const official=students.filter(student=>student.teacherId===ownerUid&&student.classId===classId);
  const officialIds=new Set(official.map(student=>student.id));
  const pending=new Map(rows.filter(row=>!officialIds.has(row.studentId)).map(row=>[row.studentId,row]));
  const reasons=new Map(plan.review.map(item=>[item.row.studentId,item.reason]));
  const displayed=[
    ...official.map(student=>({id:student.id,name:student.name,confirmed:true,reason:'',canEdit:true})),
    ...[...pending.values()].filter(row=>{
      const student=students.find(s=>s.id===row.studentId);
      return student&&!student.classId&&!student.enrollmentExcluded;
    }).map(row=>({id:row.studentId,name:row.name,confirmed:false,reason:reasons.get(row.studentId)||'',canEdit:true}))
  ].sort((a,b)=>formatStudentName(a.name).localeCompare(formatStudentName(b.name),'vi')||a.id.localeCompare(b.id));
  const visibleIds=new Set(displayed.map(row=>row.id));
  const findings=auditClassNames(ownerUid,classId,official,students.filter(s=>visibleIds.has(s.id)));
  return <section aria-label="Học sinh trong danh sách chính thức">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-bold text-slate-800">Học sinh trong danh sách chính thức ({official.length})</h3>
        <p className="mt-1 text-xs text-slate-500">Tự cập nhật khi học sinh bắt đầu thi và chọn lớp. Không tạo thêm danh sách riêng.</p><p className="mt-1 text-xs text-teal-700">Trợ lý họ tên: {findings.size} hồ sơ cần rà soát cách viết hoặc trùng tên. Không tự gộp hồ sơ.</p></div>
      <button type="button" disabled={!ready||busy||!plan.eligible.length} onClick={()=>setRetry(v=>v+1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-teal-700 disabled:opacity-40">{busy?'Đang đồng bộ…':'Đồng bộ lại'}</button>
    </div>
    {(sessionError||resultError||syncError)?<p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{syncError||'Chưa tải đủ dữ liệu dự thi. Kiểm tra kết nối hoặc mở lại lớp.'}</p>:!ready||busy?<p role="status" className="mb-2 text-xs text-slate-500">Đang đồng bộ danh sách từ máy chủ…</p>:notice?<p role="status" className="mb-2 text-xs text-emerald-800">{notice}</p>:null}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[480px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600"><tr><th scope="col" className="w-16 px-4 py-3 text-center">STT</th><th scope="col" className="px-4 py-3">Họ và tên</th><th scope="col" className="px-4 py-3">Trạng thái</th><th scope="col" className="px-4 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">
      {displayed.map((row,index)=><tr key={row.id} className="hover:bg-slate-50">
        <td className="px-4 py-3 text-center text-slate-500">{index+1}</td>
        <td className="px-4 py-3"><input type="text" aria-label={'Họ tên học sinh '+(index+1)} key={row.id+':'+row.name} defaultValue={formatStudentName(row.name)} onBlur={event=>{const name=formatStudentName(event.target.value);event.target.value=name;if(name&&name!==row.name)void onRename(row.id,name);}} className="w-full rounded border border-transparent bg-transparent px-1 py-1 font-medium text-slate-800 focus:border-teal-500 focus:outline-none"/>{findings.get(row.id)&&<p className="mt-1 text-xs text-amber-800">{(()=>{const finding=findings.get(row.id)!;switch(finding.kind){case 'duplicate':return 'Trùng họ tên – cần xác minh từng học sinh.';case 'incomplete':return 'Họ tên chưa đầy đủ.';case 'possible-spelling':return 'Tên gần khớp danh sách: '+finding.suggestion+'. Xác minh trước khi sửa hoặc gộp hồ sơ.';case 'format':return 'Đã chuẩn hóa hiển thị; có thể lưu lại khi sửa tên.';default:return 'Kiểm tra dấu tiếng Việt theo hồ sơ gốc.';}})()}</p>}</td>
        <td className="px-4 py-3">{row.confirmed?<span className="text-xs font-semibold text-emerald-700">Đã vào lớp</span>:<span className="text-xs font-medium text-amber-800">{row.reason||'Đang chờ đồng bộ'}</span>}</td>
        <td className="px-4 py-3 text-right">{row.confirmed&&<button type="button" aria-label={'Bỏ '+row.name+' khỏi lớp'} onClick={()=>void onRemove(row.id)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={17}/></button>}</td>
      </tr>)}
      {ready&&!displayed.length&&<tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Chưa có học sinh nào trong lớp này.</td></tr>}
    </tbody></table></div>
  </section>;
}
