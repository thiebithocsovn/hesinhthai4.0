import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, ClipboardCheck, Copy, Download, LayoutDashboard, LockKeyhole, Plus, Save, ShieldCheck, Settings2, Users, BarChart3, GraduationCap, ArrowRight, Search } from 'lucide-react';
import KpiInsights from './KpiInsights';
import { collection, doc, getDoc, onSnapshot, query, where, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Teacher } from '../types';
import {
  DEFAULT_KPI_CRITERIA, KPI_KEYS, emptyKpiInputs, validateKpiCriteria, validateKpiScores,
  provisionalKpiRating, kpiCsvSafe,
  type KpiCriterion, type KpiEntry, type KpiEntryStatus, type KpiMember, type KpiPeriod,
  type KpiRole, type KpiSchool, type KpiKey,
} from '../lib/kpi';

type Props = { currentUser: Teacher | 'admin'; onBack: () => void };
const STATUS:Record<KpiEntryStatus,string> = {
  draft:'Bản nháp', submitted:'Chờ tổ duyệt', returned:'Cần chấm lại',
  reviewed:'Tổ đã duyệt', approved:'Đã phê duyệt',
};
const box = 'rounded-[24px] border border-slate-200 bg-white p-5 sm:p-7 shadow-[0_14px_45px_-30px_rgba(15,23,42,0.3)]';
const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#31499c] px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-[#21377c] disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

function messageOf(error:unknown):string {
  const code = (error as {code?:string})?.code;
  if (code === 'permission-denied') return 'Không có quyền truy cập hoặc quy tắc Firestore KPI chưa được triển khai. Liên hệ quản trị hệ thống.';
  return error instanceof Error ? error.message : 'Có lỗi khi kết nối dữ liệu.';
}
function fromScores(scores:Record<KpiKey,number>|null|undefined):Record<KpiKey,string> {
  const blank=emptyKpiInputs();
  if (scores) KPI_KEYS.forEach(key=>{ blank[key] = String(scores[key] ?? ''); });
  return blank;
}
function currentMonth():string {
  const date=new Date();
  return String(date.getFullYear())+'-'+String(date.getMonth()+1).padStart(2,'0');
}

export default function KpiManager({ currentUser, onBack }:Props) {
  const uid=auth.currentUser?.uid || '';
  const userName=currentUser === 'admin' ? (auth.currentUser?.displayName || 'Quản trị hệ thống') : currentUser.name;
  const [lookupCode,setLookupCode]=useState('');
  const [schoolCode,setSchoolCode]=useState('');
  const [school,setSchool]=useState<KpiSchool|null>(null);
  const [member,setMember]=useState<KpiMember|null>(null);
  const [members,setMembers]=useState<KpiMember[]>([]);
  const [schoolName,setSchoolName]=useState('');
  const [month,setMonth]=useState(currentMonth);
  const [period,setPeriod]=useState<KpiPeriod|null>(null);
  const [entries,setEntries]=useState<KpiEntry[]>([]);
  const [myEntry,setMyEntry]=useState<KpiEntry|null>(null);
  const [scores,setScores]=useState<Record<KpiKey,string>>(emptyKpiInputs);
  const [criteriaDraft,setCriteriaDraft]=useState<KpiCriterion[]>(DEFAULT_KPI_CRITERIA.map(c=>({...c})));
  const [uidToAdd,setUidToAdd]=useState('');
  const [nameToAdd,setNameToAdd]=useState('');
  const [teamToAdd,setTeamToAdd]=useState('');
  const [roleToAdd,setRoleToAdd]=useState<KpiRole>('teacher');
  const [reviewTarget,setReviewTarget]=useState<KpiEntry|null>(null);
  const [reviewScores,setReviewScores]=useState<Record<KpiKey,string>>(emptyKpiInputs);
  const [reviewNote,setReviewNote]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [editingCriteria,setEditingCriteria]=useState(false);
  const [membersOpen,setMembersOpen]=useState(true);
  const [view,setView]=useState<'overview'|'score'|'review'|'settings'>('overview');
  const [reportRefresh,setReportRefresh]=useState(0);
  const [reviewSearch,setReviewSearch]=useState('');
  const [reviewFilter,setReviewFilter]=useState('all');

  const isOwner=!!school && school.ownerUid===uid;
  const isReviewer=isOwner || (member?.role==='reviewer' && member.status==='active');
  const isMember=!!school && (isOwner || member?.status==='active');
  const criteria=period?.criteria || school?.criteria || DEFAULT_KPI_CRITERIA;
  const canEnter=period?.status==='open' && isMember && (!myEntry || myEntry.status==='draft' || myEntry.status==='returned');
  const preview=useMemo(()=>validateKpiScores(scores,criteria),[scores,criteria]);

  function success(text:string) { setNotice(text); setError(''); setReportRefresh(n=>n+1); }
  function fail(err:unknown) { setError(messageOf(err)); setNotice(''); }
  async function safely(action:()=>Promise<void>) {
    if (busy) return;
    setBusy(true);setError('');setNotice('');
    try { await action(); } catch(err) { fail(err); } finally { setBusy(false); }
  }

  useEffect(()=>{
    if(!uid) return;
    const code=sessionStorage.getItem('edukpi.school.'+uid);
    if(code && /^[A-Za-z0-9_-]{8,128}$/.test(code)) {
      setSchoolCode(code);setLookupCode(code);
    }
  },[uid]);

  useEffect(()=>{
    setSchool(null);setMember(null);setMembers([]);setPeriod(null);
    setEntries([]);setMyEntry(null);setScores(emptyKpiInputs());
    if(!uid || !schoolCode) return;
    let cancelled=false;
    const schoolRef=doc(db,'kpiSchools',schoolCode);
    const unsub=onSnapshot(schoolRef,snapshot=>{
      if(cancelled)return;
      if(!snapshot.exists()) { setSchool(null);setError('Không tìm thấy trường với mã này.');return; }
      setSchool(snapshot.data() as KpiSchool);
      setCriteriaDraft((snapshot.data() as KpiSchool).criteria.map(item=>({...item})));
      setError('');
    },err=>{if(!cancelled){setSchool(null);fail(err);}});
    const memberRef=doc(db,'kpiSchools',schoolCode,'members',uid);
    const unsubMember=onSnapshot(memberRef,snapshot=>{
      if(!cancelled)setMember(snapshot.exists()?snapshot.data() as KpiMember:null);
    },err=>{if(!cancelled && (err as {code?:string}).code!=='permission-denied')fail(err);});
    return ()=>{cancelled=true;unsub();unsubMember();};
  },[uid,schoolCode]);

  useEffect(()=>{
    setPeriod(null);setMyEntry(null);setEntries([]);setScores(emptyKpiInputs());
  },[schoolCode,month]);

  useEffect(()=>{
    if(!isMember || !schoolCode)return;
    return onSnapshot(doc(db,'kpiSchools',schoolCode,'periods',month),
      snapshot=>setPeriod(snapshot.exists()?snapshot.data() as KpiPeriod:null),
      err=>fail(err));
  },[isMember,schoolCode,month]);

  useEffect(()=>{
    if(!isMember || !schoolCode || !period)return;
    const ref=doc(db,'kpiSchools',schoolCode,'periods',month,'entries',uid);
    return onSnapshot(ref,snapshot=>{
      const item=snapshot.exists()?snapshot.data() as KpiEntry:null;
      setMyEntry(item);setScores(fromScores(item?.selfScores));
    },err=>fail(err));
  },[isMember,schoolCode,month,period?.status,uid]);

  useEffect(()=>{
    if(!isReviewer || !schoolCode || !period)return;
    const entriesRef=collection(db,'kpiSchools',schoolCode,'periods',month,'entries');
    const scopedEntries=isOwner?entriesRef:query(entriesRef,where('team','==',member?.team||''));
    return onSnapshot(scopedEntries,
      snapshot=>setEntries(snapshot.docs.map(item=>item.data() as KpiEntry)),
      err=>fail(err));
  },[isReviewer,isOwner,member?.team,schoolCode,month,period?.status]);

  useEffect(()=>{
    if(!isReviewer || !schoolCode)return;
    const membersRef=collection(db,'kpiSchools',schoolCode,'members');
    const scopedMembers=isOwner?membersRef:query(membersRef,where('team','==',member?.team||''));
    return onSnapshot(scopedMembers,
      snapshot=>setMembers(snapshot.docs.map(item=>item.data() as KpiMember)),
      err=>fail(err));
  },[isReviewer,isOwner,member?.team,schoolCode]);

  function connect() {
    const code=lookupCode.trim();
    if(!/^[A-Za-z0-9_-]{8,128}$/.test(code)){setError('Mã trường không hợp lệ.');return;}
    setSchoolCode(code);
    sessionStorage.setItem('edukpi.school.'+uid,code);
  }
  function leaveSchool() {
    setSchoolCode('');setLookupCode('');setNotice('');setError('');
    sessionStorage.removeItem('edukpi.school.'+uid);
  }
  async function createSchool() {
    if(!schoolName.trim() || schoolName.trim().length>160){setError('Tên trường phải từ 1 đến 160 ký tự.');return;}
    await safely(async()=>{
      const ref=doc(collection(db,'kpiSchools'));
      await setDoc(ref,{name:schoolName.trim(),ownerUid:uid,criteria:DEFAULT_KPI_CRITERIA,createdAt:serverTimestamp()});
      setLookupCode(ref.id);setSchoolCode(ref.id);
      sessionStorage.setItem('edukpi.school.'+uid,ref.id);
      success('Đã tạo trường. Hãy thêm giáo viên bằng mã UID và mở tháng đánh giá.');
    });
  }
  async function openPeriod() {
    if(!school || !isOwner)return;
    await safely(async()=>{
      const ref=doc(db,'kpiSchools',schoolCode,'periods',month);
      if(period) {
        await updateDoc(ref,{status:period.status==='open'?'closed':'open',updatedAt:serverTimestamp()});
        success(period.status==='open'?'Đã khóa tháng đánh giá.':'Đã mở lại tháng đánh giá.');
      } else {
        await setDoc(ref,{month,status:'open',criteria:school.criteria,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
        success('Đã mở tháng đánh giá '+month+'.');
      }
    });
  }
  async function saveCriteria() {
    if(!isOwner)return;
    const validation=validateKpiCriteria(criteriaDraft);
    if(validation){setError(validation);return;}
    await safely(async()=>{
      await updateDoc(doc(db,'kpiSchools',schoolCode),{criteria:criteriaDraft});
      setEditingCriteria(false);
      success('Đã lưu mẫu tiêu chí cho các tháng tạo mới; các tháng cũ không bị thay đổi.');
    });
  }
  async function addMember() {
    const newUid=uidToAdd.trim(), name=nameToAdd.trim(),team=teamToAdd.trim();
    if(!/^[A-Za-z0-9_-]{10,128}$/.test(newUid) || !name || name.length>160 || team.length>120 || newUid===uid) {
      setError('Kiểm tra UID, họ tên (tối đa 160 ký tự), tổ chuyên môn và không thêm chính mình.');return;
    }
    await safely(async()=>{
      const profile=await getDoc(doc(db,'teachers',newUid)).catch(()=>null);
      // The server-side rule checks active registration. Administrators may
      // read profiles; school owners without that right rely on the rule.
      if(profile && profile.exists() && profile.data().status!=='active')throw new Error('Giáo viên chưa được kích hoạt.');
      await setDoc(doc(db,'kpiSchools',schoolCode,'members',newUid),{
        uid:newUid,name,team,role:roleToAdd,status:'active',
      });
      setUidToAdd('');setNameToAdd('');setTeamToAdd('');
      success('Đã phân quyền. Giáo viên nhập mã trường để bắt đầu chấm KPI.');
    });
  }
  async function submitScores(status:'draft'|'submitted') {
    if(!canEnter)return;
    if('error' in preview){setError(preview.error);return;}
    await safely(async()=>{
      const ref=doc(db,'kpiSchools',schoolCode,'periods',month,'entries',uid);
      if(myEntry) {
        await updateDoc(ref,{
          selfScores:preview.scores,selfTotal:preview.total,status,updatedAt:serverTimestamp(),
          ...(myEntry.status==='returned'?{reviewScores:null,reviewTotal:null,note:'',reviewedBy:''}:{})
        });
      } else {
        await setDoc(ref,{
          uid,name:userName.slice(0,160),team:member?.team||'Ban giám hiệu',
          selfScores:preview.scores,selfTotal:preview.total,status,
          reviewScores:null,reviewTotal:null,note:'',reviewedBy:'',approvedBy:'',
          createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
        });
      }
      success(status==='submitted'?'Đã gửi phiếu cho tổ chuyên môn.':'Đã lưu bản nháp.');
    });
  }
  async function review(status:'reviewed'|'returned') {
    if(!isReviewer || !reviewTarget || reviewTarget.uid===uid || !period || period.status!=='open')return;
    const parsed=validateKpiScores(reviewScores,period.criteria);
    if('error' in parsed){setError(parsed.error);return;}
    await safely(async()=>{
      await updateDoc(doc(db,'kpiSchools',schoolCode,'periods',month,'entries',reviewTarget.uid),{
        reviewScores:parsed.scores,reviewTotal:parsed.total,note:reviewNote.trim().slice(0,1500),
        reviewedBy:uid,status,updatedAt:serverTimestamp(),
      });
      setReviewTarget(null);success('Đã cập nhật kết quả tổ chuyên môn.');
    });
  }
  async function approve(entry:KpiEntry) {
    if(!isOwner || entry.uid===uid || entry.status!=='reviewed')return;
    await safely(async()=>{
      await updateDoc(doc(db,'kpiSchools',schoolCode,'periods',month,'entries',entry.uid),
        {status:'approved',approvedBy:uid,updatedAt:serverTimestamp()});
      success('Đã phê duyệt phiếu của '+entry.name+'.');
    });
  }
  async function exportExcel() {
    if(!isReviewer || !period)return;
    await safely(async()=>{
      const XLSX=await import('xlsx');
      const headings=['STT','Họ và tên','Tổ','Trạng thái',...criteria.map(item=>item.label),'Tổng tự chấm','Điểm tổ/đơn vị','Người duyệt','Nhận xét'];
      const values=entries.slice().sort((a,b)=>a.name.localeCompare(b.name,'vi')).map((entry,i)=>[
        i+1,kpiCsvSafe(entry.name),kpiCsvSafe(entry.team),STATUS[entry.status],
        ...criteria.map(item=>entry.selfScores[item.key]),entry.selfTotal,entry.reviewTotal??'',
        entry.reviewedBy,kpiCsvSafe(entry.note),
      ]);
      const ws=XLSX.utils.aoa_to_sheet([headings,...values]);
      ws['!cols']=headings.map((header,i)=>({wch:i===1?28:i===2?22:i===3?20:i===headings.length-1?35:18}));
      const book=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book,ws,'KPI '+month);
      XLSX.writeFile(book,'Tong_hop_KPI_'+month+'_'+schoolCode+'.xlsx');
      success('Đã xuất bảng tổng hợp KPI theo tháng.');
    });
  }

  const kpiTotals=useMemo(()=>({
    submitted:entries.filter(e=>e.status!=='draft').length,
    approved:entries.filter(e=>e.status==='approved').length,
  }),[entries]);

  const pendingReviews=entries.filter(e=>e.status==='submitted'||e.status==='reviewed').length;
  const missingMembers=members.filter(m=>!entries.some(e=>e.uid===m.uid&&e.status!=='draft'));
  const filteredEntries=entries.filter(e=>(reviewFilter==='all'||e.status===reviewFilter) && (e.name+' '+e.team).toLocaleLowerCase('vi').includes(reviewSearch.trim().toLocaleLowerCase('vi')));
  const copyText=(value:string,label:string)=>{void navigator.clipboard.writeText(value).then(()=>setNotice(label)).catch(()=>setError('Không sao chép được. Hãy sao chép thủ công.'));};
  const actions=[{key:'overview' as const,name:'Tổng quan',icon:LayoutDashboard},{key:'score' as const,name:'Tự chấm điểm',icon:ClipboardCheck},...(isReviewer?[{key:'review' as const,name:'Duyệt phiếu',icon:ShieldCheck}]:[]),...(isOwner?[{key:'settings' as const,name:'Thiết lập',icon:Settings2}]:[])];

  return <main className="min-h-screen flex-1 overflow-auto bg-[#f5f7fb] text-slate-900">
    <div className="mx-auto max-w-[1360px] px-3 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Quay lại hệ sinh thái" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50"><ArrowLeft size={18}/></button>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200"><BarChart3 size={23}/></div>
          <div><h1 className="text-xl font-black tracking-tight sm:text-2xl">EduKPI <span className="text-indigo-600">AI</span></h1><p className="text-[11px] font-semibold tracking-wide text-slate-500">NỀN TẢNG KPI TRƯỜNG HỌC</p></div>
        </div>
        {school&&<button type="button" onClick={leaveSchool} className={secondary}>Đổi trường</button>}
      </header>
      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {!uid && <div className={box}>Cần đăng nhập tài khoản giáo viên hợp lệ để truy cập KPI.</div>}
      {uid && !school && <div className="grid gap-5 lg:grid-cols-2">
        <section className="relative overflow-hidden rounded-[28px] bg-[#14213e] p-6 text-white shadow-xl shadow-slate-200 sm:p-9">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-indigo-400/20 blur-2xl"/>
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold"><GraduationCap size={16}/> Không gian KPI của bạn</span>
            <h2 className="mt-6 text-2xl font-extrabold tracking-tight">Vào trường đang sử dụng</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Nhập mã trường do quản trị cung cấp để tự chấm điểm, xem báo cáo cá nhân và lịch sử đánh giá.</p>
            <label className="mt-7 block text-xs font-bold text-slate-200" htmlFor="kpi-school-code">Mã trường</label>
            <input id="kpi-school-code" className="mt-2 w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/30" value={lookupCode} onChange={e=>setLookupCode(e.target.value)} placeholder="Nhập mã do nhà trường cung cấp"/>
            <button type="button" className={primary+' mt-3 w-full'} onClick={connect}>Mở EduKPI <ArrowRight size={17}/></button>
            <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs font-semibold text-slate-300">Mã UID tài khoản của bạn</p>
              <p className="mt-2 select-all break-all font-mono text-sm text-white">{uid}</p>
              <button type="button" onClick={()=>copyText(uid,'Đã sao chép UID tài khoản.')} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-indigo-200 hover:text-white"><Copy size={14}/> Sao chép UID gửi quản trị trường</button>
            </div>
          </div>
        </section>
        <section className={box+' flex flex-col justify-between'}>
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Building2 size={25}/></div>
            <p className="mt-6 text-xs font-bold uppercase tracking-widest text-indigo-600">Thiết lập tổ chức</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">Khởi tạo trường mới</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Mỗi trường có dữ liệu riêng, bộ tiêu chí riêng và hệ thống quản lý theo cấp trường → tổ → cá nhân.</p>
            <label className="mt-7 block text-xs font-semibold text-slate-600" htmlFor="kpi-school-name">Tên trường học</label>
            <input id="kpi-school-name" className={inputClass+' mt-2'} value={schoolName} onChange={e=>setSchoolName(e.target.value)} placeholder="Ví dụ: Trường TH&THCS Na Rì 1"/>
            <button type="button" disabled={busy} className={primary+' mt-4 w-full'} onClick={()=>void createSchool()}><Plus size={17}/> Tạo trường và làm quản trị KPI</button>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-2 border-t border-slate-100 pt-5 text-center text-xs font-medium text-slate-500"><span>Đa trường</span><span>Phân quyền</span><span>Tháng · Quý · Năm</span></div>
        </section>
      </div>}
      {uid && school && !isMember && <section className={box}>
        <h2 className="text-xl font-semibold">Tài khoản chưa có quyền vào trường</h2>
        <p className="mt-2 text-slate-600">Nhà trường cần thêm UID <strong className="break-all">{uid}</strong> vào danh sách giáo viên của {school.name}.</p>
        <button type="button" onClick={leaveSchool} className={secondary+' mt-4'}>Nhập mã khác</button>
      </section>}
      {uid && school && isMember && <>
        <section className="relative mb-5 overflow-hidden rounded-[28px] bg-[#111d38] px-5 py-7 text-white shadow-xl shadow-slate-200 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-indigo-400/20 blur-2xl"/>
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-100">{isOwner?'Cấp trường':isReviewer?'Cấp tổ':'Cấp cá nhân'}</span>
              <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">{school.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Một hệ thống cho trường, tổ chuyên môn và cá nhân. Đơn giản khi sử dụng, minh bạch khi đánh giá.</p>
              <button type="button" onClick={()=>copyText(schoolCode,'Đã sao chép mã trường.')} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-indigo-200"><Copy size={14}/> Sao chép mã trường</button>
            </div>
            <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">{isOwner?'Quản trị trường':isReviewer?'Tổ '+member?.team:'Giáo viên'}</span>
              <span className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">{period?.status==='open'?'Kỳ đang mở':period?.status==='closed'?'Đã khóa kỳ':'Chưa mở kỳ'}</span></div>
          </div>
        </section>
        <nav aria-label="Điều hướng EduKPI" className="mb-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div className="flex min-w-max gap-1">{actions.map(action=><button type="button" key={action.key} onClick={()=>{setView(action.key);setReviewTarget(null);}} aria-current={view===action.key?'page':undefined}
            className={'inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors sm:px-5 '+(view===action.key?'bg-[#273d81] text-white':'text-slate-600 hover:bg-slate-50')}>
            <action.icon size={17}/>{action.name}{action.key==='review'&&pendingReviews>0&&<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{pendingReviews}</span>}
          </button>)}</div>
        </nav>
        <section className={box+' mb-4'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">{isOwner?'Quản trị trường':isReviewer?'Tổ chuyên môn':'Giáo viên'}</p>
              <h2 className="mt-1 text-xl font-bold">Quản lý kỳ KPI · Tháng {Number(month.slice(-2))}/{month.slice(0,4)}</h2>
              <p className="mt-1 text-xs text-slate-500">Mã trường: <span className="select-all font-mono">{schoolCode}</span></p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-slate-600">Tháng đánh giá
                <input type="month" className={inputClass+' mt-1'} value={month} onChange={event=>setMonth(event.target.value)}/>
              </label>
              {isOwner && <button type="button" disabled={busy} className={primary} onClick={()=>void openPeriod()}>
                {period?(period.status==='open'?<LockKeyhole size={17}/>:<Plus size={17}/>):<Plus size={17}/>}
                {!period?'Mở kỳ đánh giá':period.status==='open'?'Khóa kỳ':'Mở lại'}
              </button>}
            </div>
          </div>
          {period ? <p className="mt-4 text-sm text-slate-600">Trạng thái kỳ: <strong>{period.status==='open'?'Đang nhận điểm':'Đã khóa'}</strong> • Bộ tiêu chí được giữ cố định cho kỳ này.</p> :
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Tháng {month} chưa được nhà trường mở kỳ đánh giá.</p>}
        </section>

        {view==='overview'&&<KpiInsights schoolCode={schoolCode} schoolName={school.name} uid={uid} month={month} isOwner={isOwner} isReviewer={isReviewer} memberTeam={member?.team||''} members={members} refreshKey={reportRefresh} onOpenReview={()=>setView('review')}/>}
        {isOwner && view==='settings' && <section className={box+' mb-4'}>
          <div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">Thiết lập trường</h3>
            <div className="flex flex-wrap gap-2"><button className={secondary} onClick={()=>setMembersOpen(v=>!v)}><Users size={16}/> Danh sách và phân quyền</button>
              <button className={secondary} onClick={()=>setEditingCriteria(v=>!v)}>Cấu hình tiêu chí</button></div></div>
          {membersOpen && <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="mb-3 text-sm text-slate-600">Thêm giáo viên hoặc tổ trưởng bằng UID tài khoản đã đăng ký trong hệ sinh thái. Chỉ quản trị trường có thể phân quyền.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input className={inputClass} aria-label="UID giáo viên" placeholder="UID giáo viên" value={uidToAdd} onChange={e=>setUidToAdd(e.target.value)}/>
              <input className={inputClass} aria-label="Họ tên" placeholder="Họ và tên" value={nameToAdd} onChange={e=>setNameToAdd(e.target.value)}/>
              <input className={inputClass} aria-label="Tổ chuyên môn" placeholder="Tổ chuyên môn" value={teamToAdd} onChange={e=>setTeamToAdd(e.target.value)}/>
              <select className={inputClass} value={roleToAdd} onChange={e=>setRoleToAdd(e.target.value as KpiRole)}><option value="teacher">Giáo viên</option><option value="reviewer">Tổ trưởng / người duyệt</option></select>
            </div>
            <button className={primary+' mt-3'} disabled={busy} onClick={()=>void addMember()}><Plus size={16}/> Thêm / cập nhật</button>
            <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-2">Họ tên</th><th>Tổ</th><th>Vai trò</th><th>UID</th></tr></thead>
              <tbody>{members.map(item=><tr key={item.uid} className="border-b border-slate-100"><td className="py-2 font-medium">{item.name}</td><td>{item.team}</td><td>{item.role==='reviewer'?'Tổ trưởng':'Giáo viên'}</td><td className="max-w-36 truncate font-mono text-xs" title={item.uid}>{item.uid}</td></tr>)}</tbody>
            </table></div>
          </div>}
          {editingCriteria && <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="mb-3 text-sm text-slate-600">Thay đổi tên và trọng số của 6 nhóm tiêu chí; tổng điểm phải đúng 100. Chỉ áp dụng cho kỳ đánh giá được tạo sau này.</p>
            {criteriaDraft.map((item,index)=><div key={item.key} className="mb-2 flex gap-2">
              <input className={inputClass} aria-label={'Tên tiêu chí '+(index+1)} value={item.label} onChange={e=>setCriteriaDraft(old=>old.map((v,i)=>i===index?{...v,label:e.target.value}:v))}/>
              <input className={inputClass+' max-w-24'} aria-label={'Điểm tối đa '+(index+1)} type="number" min="0" max="100" step="0.5" value={item.max} onChange={e=>setCriteriaDraft(old=>old.map((v,i)=>i===index?{...v,max:Number(e.target.value)}:v))}/>
            </div>)}
            <p className="my-3 text-sm">Tổng điểm: <strong>{criteriaDraft.reduce((s,c)=>s+c.max,0)}/100</strong></p>
            <button type="button" className={primary} disabled={busy} onClick={()=>void saveCriteria()}>Lưu bộ tiêu chí</button>
          </div>}
        </section>}

        {view==='score' && !period && <div className={box+' mb-4'}>Nhà trường chưa mở kỳ đánh giá tháng này. Bạn có thể xem báo cáo ở tab Tổng quan.</div>}
        {view==='score' && period && <section className={box+' mb-4'}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-lg font-bold">Phiếu tự chấm KPI tháng {month}</h3><p className="text-sm text-slate-500">Chỉ cần nhập điểm vào 6 ô và gửi, không bắt buộc tải minh chứng.</p></div>
            {myEntry && <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">{STATUS[myEntry.status]}</span>}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {criteria.map((item,index)=><label key={item.key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="min-w-0 flex-1"><span className="text-xs font-semibold text-slate-500">{item.group==='general'?'Tiêu chí chung':'Kết quả nhiệm vụ'} · {index+1}</span><p className="font-medium">{item.label}</p><span className="text-xs text-slate-500">Tối đa {item.max} điểm</span></div>
              <input type="number" step="0.5" min={0} max={item.max} disabled={!canEnter} aria-label={'Điểm '+item.label}
                className="w-20 rounded-xl border border-slate-300 bg-white p-2 text-center text-lg font-bold disabled:bg-slate-100"
                value={scores[item.key]} onChange={e=>setScores(old=>({...old,[item.key]:e.target.value}))}/>
            </label>)}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-indigo-50 p-4">
            <div><p className="text-xs font-semibold text-indigo-700">Tổng điểm tự chấm</p>
              <p className="text-3xl font-black text-indigo-900">{'error' in preview?'—':preview.total}<span className="text-base font-normal"> / 100</span></p>
              {'error' in preview?<p className="text-xs text-rose-600">{preview.error}</p>:<p className="text-xs text-slate-600">{provisionalKpiRating(preview.total)} · Chỉ mang tính tham khảo</p>}
            </div>
            {canEnter && <div className="flex flex-wrap gap-2">
              <button className={secondary} disabled={busy || 'error' in preview} onClick={()=>void submitScores('draft')}><Save size={16}/> Lưu nháp</button>
              <button className={primary} disabled={busy || 'error' in preview} onClick={()=>void submitScores('submitted')}><CheckCircle2 size={16}/> Gửi tổ chuyên môn</button>
            </div>}
          </div>
          {myEntry?.note && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><strong>Nhận xét của tổ:</strong> {myEntry.note}</p>}
          {myEntry?.reviewTotal!==null && myEntry?.reviewTotal!==undefined && <p className="mt-3 text-sm">Điểm tổ chuyên môn: <strong>{myEntry.reviewTotal}/100</strong></p>}
          <p className="mt-4 text-xs text-slate-500">Điểm dự kiến không tự động trở thành kết quả xếp loại viên chức chính thức. Quyết định cuối cùng thuộc người có thẩm quyền.</p>
        </section>}

        {view==='review' && isReviewer && !period && <div className={box}>Nhà trường chưa mở kỳ đánh giá tháng này.</div>}
        {view==='review' && isReviewer && period && <section className={box}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-lg font-bold">Bảng tổng hợp và xét duyệt</h3><p className="text-sm text-slate-500">Đã gửi: {kpiTotals.submitted} · Đã phê duyệt: {kpiTotals.approved} · Tổng số phiếu: {entries.length}</p></div>
            <button type="button" onClick={()=>void exportExcel()} className={secondary}><Download size={16}/> Xuất Excel</button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <label className="relative min-w-48 flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400"/><input value={reviewSearch} onChange={e=>setReviewSearch(e.target.value)} placeholder="Tìm giáo viên hoặc tổ..." aria-label="Tìm phiếu chấm" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"/></label>
            <select aria-label="Trạng thái phiếu KPI" value={reviewFilter} onChange={e=>setReviewFilter(e.target.value)} className={inputClass+' w-auto'}>
              <option value="all">Tất cả trạng thái</option><option value="submitted">Chờ tổ duyệt</option><option value="reviewed">Chờ trường duyệt</option><option value="approved">Đã phê duyệt</option><option value="returned">Cần bổ sung</option><option value="draft">Bản nháp</option>
            </select>
            <button type="button" className={secondary} onClick={()=>copyText(missingMembers.map(m=>m.name+' - '+m.team).join('\n')||'Không có phiếu chưa nộp','Đã sao chép danh sách chưa nộp.')}><Copy size={16}/> Chưa nộp ({missingMembers.length})</button>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr><th className="p-3">Giáo viên</th><th className="p-3">Tổ</th><th className="p-3">Tự chấm</th><th className="p-3">Tổ duyệt</th><th className="p-3">Trạng thái</th><th className="p-3">Thao tác</th></tr></thead>
            <tbody>{filteredEntries.map(entry=><tr className="border-b border-slate-100 hover:bg-slate-50" key={entry.uid}>
              <td className="p-3 font-semibold">{entry.name}</td><td className="p-3">{entry.team}</td><td className="p-3">{entry.selfTotal}</td><td className="p-3">{entry.reviewTotal??'—'}</td>
              <td className="p-3">{STATUS[entry.status]}</td><td className="p-3">
                {entry.uid!==uid && period.status==='open' && (entry.status==='submitted' || entry.status==='reviewed') &&
                  <button type="button" className="font-semibold text-indigo-700 hover:underline" onClick={()=>{setReviewTarget(entry);setReviewScores(fromScores(entry.reviewScores||entry.selfScores));setReviewNote(entry.note);}}>Tổ xét duyệt</button>}
                {isOwner && entry.uid!==uid && entry.status==='reviewed' && <button type="button" className="ml-3 font-semibold text-emerald-700 hover:underline" disabled={busy} onClick={()=>void approve(entry)}>Phê duyệt</button>}
              </td></tr>)}</tbody>
          </table>{!entries.length&&<p className="p-4 text-sm text-slate-500">Chưa có phiếu KPI nào trong tháng này.</p>}</div>
        </section>}
        {reviewTarget && period && <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#101d36]/65 p-4 backdrop-blur-sm"><div className="mx-auto my-6 max-w-xl rounded-3xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Tổ chấm KPI">
          <div className="flex justify-between gap-3"><h3 className="text-xl font-bold">Tổ chấm: {reviewTarget.name}</h3><button className={secondary} onClick={()=>setReviewTarget(null)}>Đóng</button></div>
          <p className="my-3 text-sm text-slate-500">Điểm tự chấm: {reviewTarget.selfTotal}. Người duyệt có thể điều chỉnh nhưng phải ghi lý do khi trả lại.</p>
          <div className="grid gap-2">{period.criteria.map(item=><label className="flex items-center gap-2" key={item.key}><span className="flex-1 text-sm">{item.label} (/{item.max})</span><input type="number" min="0" max={item.max} step="0.5" className={inputClass+' max-w-24'} value={reviewScores[item.key]} onChange={e=>setReviewScores(old=>({...old,[item.key]:e.target.value}))}/></label>)}</div>
          <label className="mt-4 block text-sm font-medium">Nhận xét / yêu cầu làm rõ<textarea className={inputClass+' mt-2'} rows={3} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} maxLength={1500}/></label>
          <div className="mt-4 flex flex-wrap justify-end gap-2"><button className={secondary} disabled={busy || !reviewNote.trim() || reviewTarget.status!=='submitted'} onClick={()=>void review('returned')}>Trả lại bổ sung</button><button className={primary} disabled={busy} onClick={()=>void review('reviewed')}><ShieldCheck size={17}/> Xác nhận điểm tổ</button></div>
        </div></div>}
      </>}
    </div>
  </main>;
}
