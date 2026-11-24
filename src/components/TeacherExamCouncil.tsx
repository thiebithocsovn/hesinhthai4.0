import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { Building2, Download, Plus, Save, Users, X } from 'lucide-react';
import { auth, db } from '../firebase';
import { COUNCIL_ROLES, groupSchools, schoolKey, validateCouncil, type CouncilMember, type CouncilPlan, type CouncilRole, type SchoolTeacher } from '../lib/examCouncil';
import { buildOperationsCsv, type ExamOperationsPlan } from '../lib/examOperations';
import { canAccessTeacherOwnedRecord, resolveTeacherAccessScope, type TeacherAccessScope } from '../lib/teacherIsolation';

interface CouncilExam { id:string; title:string; teacherId?:string; status:'draft'|'published'|'closed'; councilPlan?:CouncilPlan; operationsPlan?:ExamOperationsPlan }
interface Props { exams:readonly CouncilExam[]; currentUser:any; onEdit:(id:string)=>void }
const input='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100';
const button='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40';
function teacherProfile(id:string, data:Record<string,unknown>):SchoolTeacher {
  return {id,name:String(data.name||data.username||'Chưa có tên'),school:String(data.school||''),status:String(data.status||''),level:String(data.level||'')};
}
function download(name:string,rows:readonly (readonly unknown[])[]) {
  const url=URL.createObjectURL(new Blob([buildOperationsCsv(rows)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function TeacherExamCouncil({exams,currentUser,onEdit}:Props) {
  const access=resolveTeacherAccessScope(currentUser,auth.currentUser?.uid);
  const [teachers,setTeachers]=useState<SchoolTeacher[]>([]);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [filter,setFilter]=useState('');
  const [selectedId,setSelectedId]=useState('');
  useEffect(()=>{
    setTeachers([]);setReady(false);setError('');
    const failed=()=>{setTeachers([]);setReady(false);setError('Không tải được hồ sơ trường/giáo viên. Kiểm tra mạng và quyền tài khoản.');};
    if(access.role==='guest')return;
    if(access.role==='administrator'){
      return onSnapshot(collection(db,'teachers'),{includeMetadataChanges:true},snapshot=>{
        setTeachers(snapshot.docs.map(d=>teacherProfile(d.id,d.data())));setReady(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites);setError('');
      },failed);
    }
    return onSnapshot(doc(db,'teachers',access.ownerUid),{includeMetadataChanges:true},snapshot=>{
      setTeachers(snapshot.exists()?[teacherProfile(snapshot.id,snapshot.data())]:[]);setReady(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites);setError('');
    },failed);
  },[access.role,access.ownerUid,retry]);
  const schools=useMemo(()=>groupSchools(teachers),[teachers]);
  const visible=schools.filter(s=>schoolKey(s.name).includes(schoolKey(filter)));
  const scopedExams=exams.filter(e=>canAccessTeacherOwnedRecord(access,e));
  const exam=scopedExams.find(e=>e.id===selectedId)||scopedExams[0];
  const saveSchool=async(teacher:SchoolTeacher,name:string)=>{
    const value=name.trim().replace(/\s+/g,' ');
    if(!value||value.length>160)throw new Error('Tên trường phải từ 1 đến 160 ký tự.');
    if(!ready||resolveTeacherAccessScope(currentUser,auth.currentUser?.uid).role!=='administrator')throw new Error('Chỉ quản trị viên được cập nhật trường.');
    await runTransaction(db,async tx=>{
      const ref=doc(db,'teachers',teacher.id);
      const snap=await tx.get(ref);
      if(!snap.exists())throw new Error('Tài khoản không còn tồn tại.');
      if(String(snap.data().school||'')!==teacher.school)throw new Error('Hồ sơ đã thay đổi. Tải lại trước khi lưu.');
      tx.update(ref,{school:value});
    });
  };
  return <section className="mx-auto max-w-7xl space-y-5">
    <header><h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Building2 className="h-6 w-6 text-teal-700"/>Trường & hội đồng thi</h2><p className="mt-1 text-sm text-slate-500">Quản lý thông tin trường từ hồ sơ đã đăng ký và lập hội đồng theo từng kỳ thi.</p></header>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {[['Trường đã khai báo',schools.filter(s=>s.key).length],['Hồ sơ giáo viên trong phạm vi quyền',teachers.length],['Kỳ thi có hội đồng',scopedExams.filter(e=>e.councilPlan).length]].map(([label,value])=><div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><strong className="text-2xl">{ready?value:'—'}</strong></div>)}
    </div>
    <section className="rounded-2xl border bg-white p-4 sm:p-5">
      <h3 className="font-bold">1. Danh mục trường</h3>
      <p className="mt-1 text-xs text-slate-500">{access.role==='administrator'?'Quản trị viên xem các hồ sơ giáo viên và chỉnh trường đăng ký.':'Giáo viên chỉ xem hồ sơ trường của chính mình.'} Danh mục nhóm theo tên trường trong hồ sơ, chưa phải hệ thống định danh tenant liên trường.</p>
      {error&&<p role="alert" className="mt-2 text-sm text-red-700">{error} <button type="button" onClick={()=>setRetry(v=>v+1)} className="underline">Thử lại</button></p>}
      {!ready&&!error&&<p className="mt-2 text-xs text-amber-800">Đang xác nhận dữ liệu từ máy chủ.</p>}
      <label className="mt-3 block text-xs font-semibold">Tìm trường<input value={filter} onChange={e=>setFilter(e.target.value)} className={'mt-1 '+input} placeholder="Tên trường"/></label>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{visible.map(s=><details key={s.key} className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{s.name} · {s.teachers.length} hồ sơ · {s.active} đang hoạt động</summary>
        {s.teachers.map(t=><SchoolTeacherRow key={t.id+':'+t.school} teacher={t} editable={ready&&access.role==='administrator'} onSave={saveSchool}/>)}
      </details>)}{ready&&!visible.length&&<p className="text-sm text-slate-500">Không có hồ sơ trường phù hợp.</p>}</div>
    </section>
    <section className="rounded-2xl border bg-white p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-bold"><Users size={20}/>2. Hội đồng thi</h3>
      <label className="mt-3 block text-sm font-semibold">Chọn kỳ thi<select value={exam?.id||''} onChange={e=>setSelectedId(e.target.value)} className={'mt-1 '+input}>{!exam&&<option value="">Chưa có kỳ thi</option>}{scopedExams.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
      {exam&&<CouncilEditor key={exam.id+':'+(exam.councilPlan?.updatedAt||'')} exam={exam} teachers={teachers} ready={ready} access={access} currentUser={currentUser} onEdit={onEdit}/>}
    </section>
  </section>;
}
function SchoolTeacherRow({teacher,editable,onSave}:{teacher:SchoolTeacher;editable:boolean;onSave:(t:SchoolTeacher,name:string)=>Promise<void>}) {
  const [editing,setEditing]=useState(false),[value,setValue]=useState(teacher.school),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="mt-2 rounded-lg bg-slate-50 p-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{teacher.name} · {teacher.level||'Chưa khai báo cấp học'}</span>{editable&&<button type="button" className={button} onClick={()=>setEditing(v=>!v)}>Đổi trường</button>}</div>
    {editing&&editable&&<div className="mt-2 flex flex-wrap gap-2"><input aria-label="Trường đăng ký" value={value} maxLength={160} onChange={e=>setValue(e.target.value)} className={input}/><button type="button" disabled={busy||!value.trim()} className={button} onClick={async()=>{if(!window.confirm('Cập nhật trường đăng ký của giáo viên này? Không chuyển quyền sở hữu dữ liệu.'))return;setBusy(true);setError('');try{await onSave(teacher,value);setEditing(false);}catch(e){setError(e instanceof Error?e.message:'Không cập nhật được.');}finally{setBusy(false);}}}>{busy?'Đang lưu…':'Xác nhận cập nhật'}</button></div>}{error&&<p role="alert" className="text-xs text-red-700">{error}</p>}</div>;
}
function CouncilEditor({exam,teachers,ready,access,currentUser,onEdit}:{exam:CouncilExam;teachers:SchoolTeacher[];ready:boolean;access:TeacherAccessScope;currentUser:any;onEdit:(id:string)=>void}) {
  const previous=exam.councilPlan?.version===1?exam.councilPlan:undefined;
  const owner=teachers.find(t=>t.id===exam.teacherId);
  const [name,setName]=useState(previous?.name||'Hội đồng '+exam.title);
  const [school,setSchool]=useState(previous?.schoolName||'');
  const [site,setSite]=useState(previous?.site||'');
  const [members,setMembers]=useState<CouncilMember[]>(previous?.members||[]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const effectiveSchool=school||owner?.school||'';
  const rooms=exam.operationsPlan?.rooms.map(r=>r.name)||[];
  const editable=exam.status==='draft'&&ready&&!!owner&&canAccessTeacherOwnedRecord(access,exam);
  const selectable=teachers.filter(t=>t.status==='active'&&schoolKey(t.school)===schoolKey(effectiveSchool)&&!!schoolKey(effectiveSchool));
  const plan:CouncilPlan={version:1,name:name.trim(),schoolName:effectiveSchool.trim(),site:site.trim(),members:members.map(m=>({...m,name:m.name.trim()})),updatedAt:new Date().toISOString()};
  const problems=validateCouncil(plan,rooms);
  const setMember=(id:string,patch:Partial<CouncilMember>)=>setMembers(old=>old.map(m=>m.id===id?{...m,...patch}:m));
  const save=async()=>{
    if(!editable||problems.length||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      await runTransaction(db,async tx=>{
        const ref=doc(db,'exams',exam.id),snapshot=await tx.get(ref);
        if(!snapshot.exists())throw new Error('Kỳ thi không còn tồn tại.');
        const fresh={...snapshot.data(),id:snapshot.id} as CouncilExam;
        const scope=resolveTeacherAccessScope(currentUser,auth.currentUser?.uid);
        if(fresh.status!=='draft'||fresh.teacherId!==exam.teacherId||!canAccessTeacherOwnedRecord(scope,fresh)||scope.role!==access.role||scope.ownerUid!==access.ownerUid)throw new Error('Quyền hoặc trạng thái kỳ thi đã thay đổi.');
        if(fresh.councilPlan?.updatedAt!==previous?.updatedAt)throw new Error('Kế hoạch đã được cập nhật ở nơi khác. Tải lại trước khi lưu.');
        if(!fresh.teacherId)throw new Error('Thiếu tài khoản sở hữu kỳ thi.');
        const profile=await tx.get(doc(db,'teachers',fresh.teacherId));
        if(!profile.exists()||schoolKey(profile.data().school)!==schoolKey(plan.schoolName))throw new Error('Trường tổ chức phải khớp hồ sơ giáo viên sở hữu kỳ thi.');
        for(const member of plan.members.filter(m=>m.teacherUid)){
          const t=await tx.get(doc(db,'teachers',member.teacherUid!));
          if(!t.exists()||t.data().status!=='active'||schoolKey(t.data().school)!==schoolKey(plan.schoolName)||String(t.data().name||t.data().username||'Chưa có tên').trim()!==member.name)throw new Error('Hồ sơ thành viên đã thay đổi: '+member.name);
        }
        const freshIssues=validateCouncil(plan,fresh.operationsPlan?.rooms.map(r=>r.name)||[]);
        if(freshIssues.length)throw new Error(freshIssues.join(' '));
        tx.update(ref,{councilPlan:plan});
      });
      setMessage('Đã lưu hội đồng thi.');
    }catch(e){setError(e instanceof Error?e.message:'Không lưu được hội đồng thi.');}finally{setBusy(false);}
  };
  const exportPlan=()=>download('Hoi_dong_'+exam.id.replace(/[^a-zA-Z0-9_-]/g,'_'),[['Kỳ thi',exam.title],['Hội đồng',previous?.name],['Trường',previous?.schoolName],['Điểm thi',previous?.site],['Họ tên','Nhiệm vụ','Phòng','Nguồn'],...(previous?.members||[]).map(m=>[m.name,m.role,m.room,m.teacherUid?'Hồ sơ tài khoản':'Khai báo thủ công'])]);
  return <div className="mt-4 space-y-4">
    <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Phân công nghiệp vụ phục vụ danh sách/biên bản; không cấp quyền đăng nhập, mở đề, chấm điểm hay xem dữ liệu của người khác. Hội đồng chỉ sửa khi kỳ thi còn nháp. Trường phải khớp hồ sơ của chủ sở hữu.</p>
    <fieldset disabled={!editable||busy} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-semibold">Tên hội đồng<input maxLength={160} value={name} onChange={e=>setName(e.target.value)} className={'mt-1 '+input}/></label>
        <label className="text-sm font-semibold">Trường tổ chức<input value={effectiveSchool} readOnly className={'mt-1 '+input}/>{owner?.school&&schoolKey(effectiveSchool)!==schoolKey(owner.school)&&<button type="button" className="mt-1 text-xs text-teal-700 underline" onClick={()=>setSchool(owner.school)}>Cập nhật theo hồ sơ hiện tại</button>}</label>
        <label className="text-sm font-semibold">Điểm thi<input maxLength={160} value={site} onChange={e=>setSite(e.target.value)} className={'mt-1 '+input}/></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Thành viên ({members.length})</h4><button type="button" disabled={members.length>=100} className={button} onClick={()=>setMembers(old=>[...old,{id:crypto.randomUUID(),name:'',role:'Giám thị',room:''}])}><Plus size={15} className="mr-1 inline"/>Thêm thành viên</button></div>
      {members.map(m=><div key={m.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div><label className="text-xs font-semibold">Họ tên<input maxLength={160} value={m.name} readOnly={!!m.teacherUid} onChange={e=>setMember(m.id,{name:e.target.value})} className={input}/></label>
        <label className="mt-1 block text-xs text-slate-500">Nguồn hồ sơ<select value={m.teacherUid||''} onChange={e=>{const t=selectable.find(t=>t.id===e.target.value);setMembers(old=>old.map(row=>{if(row.id!==m.id)return row;const next={...row};if(t){next.teacherUid=t.id;next.name=t.name;}else delete next.teacherUid;return next;}));}} className={input}><option value="">Khai báo thủ công</option>{m.teacherUid&&!selectable.some(t=>t.id===m.teacherUid)&&<option value={m.teacherUid}>Hồ sơ cũ</option>}{selectable.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
        <label className="text-xs font-semibold">Nhiệm vụ<select value={m.role} onChange={e=>setMember(m.id,{role:e.target.value as CouncilRole,room:''})} className={input}>{COUNCIL_ROLES.map(r=><option key={r}>{r}</option>)}</select></label>
        <label className="text-xs font-semibold">Phòng phân công<select value={m.room} disabled={m.role!=='Giám thị'} onChange={e=>setMember(m.id,{room:e.target.value})} className={input}><option value="">Chưa phân phòng</option>{m.room&&!rooms.includes(m.room)&&<option value={m.room}>{m.room} (không còn)</option>}{rooms.map(r=><option key={r}>{r}</option>)}</select></label>
        <button aria-label={'Bỏ thành viên '+m.name} type="button" className="self-start rounded-lg border p-2 text-red-700" onClick={()=>setMembers(old=>old.filter(row=>row.id!==m.id))}><X size={18}/></button>
      </div>)}
    </fieldset>
    {problems.length>0&&<div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{problems.map(p=><p key={p}>{p}</p>)}</div>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={!editable||!!problems.length||busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={()=>void save()}><Save size={16} className="mr-1 inline"/>{busy?'Đang lưu…':'Lưu hội đồng'}</button><button type="button" disabled={!previous} onClick={exportPlan} className={button}><Download size={16} className="mr-1 inline"/>Xuất hội đồng đã lưu</button><button type="button" className={button} onClick={()=>onEdit(exam.id)}>Mở đề thi</button></div>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{message&&<p role="status" className="text-sm text-green-800">{message}</p>}
  </div>;
}
