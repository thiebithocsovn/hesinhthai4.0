import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ShieldCheck, ClipboardCheck, UserCheck, AlertTriangle } from 'lucide-react';
import { auth, db } from '../firebase';
import { resolveTeacherAccessScope, canAccessTeacherOwnedRecord } from '../lib/teacherIsolation';
import { assignmentId, prepareAssignment, STAFF_KINDS, STAFF_STATES, type StaffAssignment, type StaffExam, type StaffState } from '../lib/examStaffAccess';

const COLLECTION='exam_staff_assignments';
const button='rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40';
function explain(error:unknown) {
  if(typeof error==='object'&&error!==null&&'code' in error&&String(error.code)==='permission-denied')return 'Firebase từ chối quyền. Kiểm tra tài khoản, trường, phiên bản hội đồng và trạng thái phát hành quy tắc backend.';
  return error instanceof Error?error.message:'Không thể thực hiện thao tác.';
}
export function TeacherStaffInbox({currentUser}:{currentUser:any}) {
  const scope=resolveTeacherAccessScope(currentUser,auth.currentUser?.uid);
  const [tasks,setTasks]=useState<StaffAssignment[]>([]);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    setTasks([]);setReady(false);setError('');
    if(scope.role==='guest')return;
    return onSnapshot(query(collection(db,COLLECTION),where('staffUid','==',scope.ownerUid)),{includeMetadataChanges:true},snap=>{
      setTasks(snap.docs.map(d=>({...d.data(),id:d.id} as StaffAssignment)));
      setReady(!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites);setError('');
    },e=>{setTasks([]);setReady(false);setError(explain(e));});
  },[scope.ownerUid,scope.role,retry]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Nhiệm vụ khảo thí được giao">
    <h3 className="flex items-center gap-2 font-bold text-slate-900"><ClipboardCheck size={20} className="text-teal-700"/> Nhiệm vụ hội đồng của tôi</h3>
    <p className="mt-1 text-xs text-slate-500">Chỉ tài khoản được cấp nhiệm vụ mới xem và gửi báo cáo. Không cấp quyền xem đáp án, điểm hoặc bài làm của giáo viên khác.</p>
    {error?<p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error} <button type="button" onClick={()=>setRetry(v=>v+1)} className="font-semibold underline">Thử lại</button></p>:!ready?<p className="mt-3 text-xs text-slate-500">Đang xác minh quyền với máy chủ…</p>:!tasks.length?<p className="mt-3 text-sm text-slate-500">Chưa có nhiệm vụ được cấp.</p>:null}
    <div className="mt-3 grid gap-3 lg:grid-cols-2">{tasks.map(task=><TaskCard key={task.id+':'+task.state+':'+task.report} task={task} ready={ready}/>)}</div>
  </section>;
}
function TaskCard({task,ready}:{task:StaffAssignment;ready:boolean}) {
  const [state,setState]=useState<Exclude<StaffState,'pending'>>(task.state==='pending'?'ready':task.state);
  const [report,setReport]=useState(task.report||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const save=async()=>{
    if(!ready||busy||!auth.currentUser||auth.currentUser.uid!==task.staffUid)return;
    setBusy(true);setError('');
    try{await updateDoc(doc(db,COLLECTION,task.id),{state,report:report.trim(),updatedAt:serverTimestamp()});}
    catch(e){setError(explain(e));}
    finally{setBusy(false);}
  };
  return <article className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-teal-700">{task.role}{task.room?' · '+task.room:''}</p><h4 className="mt-1 font-bold">{task.examTitle}</h4><p className="text-xs text-slate-600">{task.schoolName} · {task.site}</p></div><span className="rounded-lg border bg-white px-2 py-1 text-xs">{STAFF_STATES[task.state]||'Chưa xác định'}</span></div>
    <p className="text-sm text-slate-700"><strong>{STAFF_KINDS[task.role]?.label}:</strong> {STAFF_KINDS[task.role]?.help}</p>
    <label className="block text-xs font-semibold">Trạng thái báo cáo<select value={state} onChange={e=>setState(e.target.value as Exclude<StaffState,'pending'>)} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm">{(['ready','issue','completed'] as const).map(s=><option key={s} value={s}>{STAFF_STATES[s]}</option>)}</select></label>
    <label className="block text-xs font-semibold">Nội dung nghiệp vụ<textarea value={report} onChange={e=>setReport(e.target.value)} maxLength={2000} rows={3} placeholder="Không nhập đáp án, điểm hoặc dữ liệu cá nhân học sinh." className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"/></label>
    <button type="button" disabled={!ready||busy||(state==='issue'&&!report.trim())} onClick={()=>void save()} className="w-full rounded-lg bg-teal-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">{busy?'Đang gửi…':'Gửi báo cáo'}</button>
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  </article>;
}
export function TeacherStaffGrantPanel({exam,currentUser}:{exam:StaffExam;currentUser:any}) {
  const scope=resolveTeacherAccessScope(currentUser,auth.currentUser?.uid);
  const [grants,setGrants]=useState<StaffAssignment[]>([]);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    setGrants([]);setReady(false);setError('');
    if(!canAccessTeacherOwnedRecord(scope,exam))return;
    const base=collection(db,COLLECTION);
    const filter=scope.role==='administrator'?query(base,where('examId','==',exam.id)):query(base,where('teacherId','==',scope.ownerUid),where('examId','==',exam.id));
    return onSnapshot(filter,{includeMetadataChanges:true},snap=>{
      setGrants(snap.docs.map(d=>({...d.data(),id:d.id} as StaffAssignment)));setReady(!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites);setError('');
    },e=>{setGrants([]);setReady(false);setError(explain(e));});
  },[exam.id,exam.teacherId,scope.role,scope.ownerUid,retry]);
  const grant=async(index:number)=>{
    if(!ready||busy||!canAccessTeacherOwnedRecord(scope,exam)||auth.currentUser?.uid!==scope.ownerUid)return;
    const member=exam.councilPlan?.members[index];
    if(!member?.teacherUid)return;
    setBusy(member.teacherUid);setError('');setNotice('');
    try{
      const data=prepareAssignment(exam,index,scope.ownerUid);
      await setDoc(doc(db,COLLECTION,assignmentId(exam.id,data.staffUid)),{...data,grantedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      setNotice('Máy chủ đã xác nhận cấp nhiệm vụ.');
    }catch(e){setError(explain(e));}finally{setBusy('');}
  };
  const revoke=async(task:StaffAssignment)=>{
    if(!ready||busy||auth.currentUser?.uid!==scope.ownerUid||!canAccessTeacherOwnedRecord(scope,exam)||!window.confirm('Thu hồi nhiệm vụ này? Người được cấp sẽ mất quyền gửi báo cáo. Báo cáo hiện tại trong nhiệm vụ cũng bị xóa.'))return;
    setBusy(task.staffUid);setError('');setNotice('');
    try{await deleteDoc(doc(db,COLLECTION,task.id));setNotice('Máy chủ đã xác nhận thu hồi nhiệm vụ.');}
    catch(e){setError(explain(e));}finally{setBusy('');}
  };
  return <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Phân quyền hội đồng">
    <h4 className="flex items-center gap-2 font-bold"><ShieldCheck size={19} className="text-teal-700"/> Phân quyền nhiệm vụ tại backend</h4>
    <p className="text-xs text-slate-600">Chỉ cấp từ hội đồng đã lưu, thành viên liên kết tài khoản đang hoạt động và có tên trường trùng chính xác. Giám thị phải có phòng. Thay đổi hội đồng sẽ vô hiệu quyền gửi báo cáo của phiên bản cũ; thu hồi rồi cấp lại khi còn nháp.</p>
    {!exam.councilPlan&&<p className="text-sm text-slate-500">Lưu hội đồng trước khi cấp nhiệm vụ.</p>}
    {!ready&&!error&&<p className="text-xs text-slate-500">Đang kiểm tra kết nối phân quyền…</p>}
    {exam.status!=='draft'&&<p className="text-xs text-amber-800">Chỉ cấp mới khi kỳ thi còn nháp. Vẫn có thể thu hồi nhiệm vụ đã cấp.</p>}
    {error&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle size={14} className="mr-1 inline"/>{error} <button type="button" onClick={()=>setRetry(v=>v+1)} className="font-semibold underline">Thử lại</button></p>}
    {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
    <div className="divide-y rounded-lg border bg-white">{(exam.councilPlan?.members||[]).map((m,index)=>{
      const existing=grants.find(g=>g.staffUid===m.teacherUid);
      return <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><div className="min-w-0"><p className="text-sm font-semibold">{m.name} · {m.role}</p><p className="text-xs text-slate-500">{m.room||'Không phân phòng'} · {m.teacherUid?'Đã liên kết tài khoản':'Khai báo thủ công'}</p></div>{existing?<span className="text-xs font-semibold text-teal-800"><UserCheck size={15} className="mr-1 inline"/>{existing.councilRevision===exam.councilPlan?.updatedAt?'Đã cấp':'Phiên bản cũ'}</span>:<button type="button" disabled={!ready||!!busy||exam.status!=='draft'||!m.teacherUid||(m.role==='Giám thị'&&!m.room)} onClick={()=>void grant(index)} className={button}>Cấp nhiệm vụ</button>}</div>;
    })}</div>
    {grants.length>0&&<div className="space-y-2"><h5 className="text-sm font-bold">Nhiệm vụ đã cấp và báo cáo</h5>{grants.map(g=><article key={g.id} className="rounded-lg border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{g.staffName} · {g.role} {g.room}</p><p className="text-xs text-slate-600">{g.councilRevision!==exam.councilPlan?.updatedAt?'Đã lỗi thời · ':''}{STAFF_STATES[g.state]}</p></div><button type="button" disabled={!ready||!!busy} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40" onClick={()=>void revoke(g)}>Thu hồi</button></div>{g.report&&<p className="mt-2 whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-sm">{g.report}</p>}</article>)}</div>}
  </section>;
}
