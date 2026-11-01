import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, CheckCircle2, Download, FileText, Search, ShieldCheck, Users, X } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { kpiCsvSafe, type KpiEntry, type KpiMember } from '../lib/kpi';
import {
  KpiStatusLabel, kpiMonths, kpiOfficialScore, kpiPeriodLabel, kpiPersonSummary,
  kpiTeamSummary, kpiMonthlyTrend, summarizeKpiRecords, type KpiPeriodScope, type KpiRecord,
} from '../lib/kpiAnalytics';

type Props = { schoolCode:string; schoolName:string; uid:string; month:string;
  isOwner:boolean; isReviewer:boolean; memberTeam:string; members:KpiMember[];
  refreshKey:number; onOpenReview:()=>void; };
const panel='rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-[0_14px_45px_-30px_rgba(15,23,42,0.3)] sm:p-6';
const field='rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400';
const fmt=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2});
const score=(n:number|null|undefined)=>n===null||n===undefined?'—':fmt.format(n);
const color=(n:number|null)=>n===null?'text-slate-400':n>=90?'text-emerald-700':n>=70?'text-indigo-700':'text-amber-700';

export default function KpiInsights({schoolCode,schoolName,uid,month,isOwner,isReviewer,memberTeam,members,refreshKey,onOpenReview}:Props){
  const [scope,setScope]=useState<KpiPeriodScope>('month');
  const [year,setYear]=useState(Number(month.slice(0,4)));
  const [quarter,setQuarter]=useState(Math.floor((Number(month.slice(-2))-1)/3)+1);
  const [team,setTeam]=useState('all');
  const [search,setSearch]=useState('');
  const [personId,setPersonId]=useState('');
  const [records,setRecords]=useState<KpiRecord[]>([]);
  const [opened,setOpened]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [exporting,setExporting]=useState(false);
  const allowedMembers=useMemo(()=>isOwner?members:isReviewer?members.filter(p=>p.team===memberTeam):members.filter(p=>p.uid===uid),
    [members,isOwner,isReviewer,memberTeam,uid]);

  useEffect(()=>{if(scope==='month')setYear(Number(month.slice(0,4)));},[month,scope]);
  useEffect(()=>{
    let mounted=true;
    async function load(){
      setLoading(true);setError('');
      try{
        const periods=await getDocs(collection(db,'kpiSchools',schoolCode,'periods'));
        const available=periods.docs.map(d=>d.id).filter(s=>s.startsWith(String(year)+'-')&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)).sort();
        const batches=await Promise.all(available.map(async current=>{
          if(!isReviewer){
            const found=await getDoc(doc(db,'kpiSchools',schoolCode,'periods',current,'entries',uid));
            return found.exists()?[{month:current,entry:found.data() as KpiEntry}]:[];
          }
          const list=collection(db,'kpiSchools',schoolCode,'periods',current,'entries');
          const found=await getDocs(isOwner?list:query(list,where('team','==',memberTeam)));
          return found.docs.map(d=>({month:current,entry:d.data() as KpiEntry}));
        }));
        if(mounted){setRecords(batches.flat());setOpened(available);}
      }catch(err){
        if(mounted){setRecords([]);setOpened([]);setError(err instanceof Error?err.message:'Không tải được dữ liệu KPI.');}
      }finally{if(mounted)setLoading(false);}
    }
    void load();
    return()=>{mounted=false;};
  },[schoolCode,uid,isOwner,isReviewer,memberTeam,year,refreshKey]);

  const months=useMemo(()=>kpiMonths(year,scope,month,quarter),[year,scope,month,quarter]);
  const scopedRecords=useMemo(()=>records.filter(x=>months.includes(x.month)&&(team==='all'||x.entry.team===team)),[records,months,team]);
  const scopedMembers=useMemo(()=>allowedMembers.filter(x=>team==='all'||x.team===team),[allowedMembers,team]);
  const stats=useMemo(()=>summarizeKpiRecords(scopedRecords),[scopedRecords]);
  const teams=useMemo(()=>kpiTeamSummary(scopedRecords,scopedMembers),[scopedRecords,scopedMembers]);
  const people=useMemo(()=>kpiPersonSummary(scopedRecords,scopedMembers).filter(x=>
    (x.name+' '+x.team).toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))),[scopedRecords,scopedMembers,search]);
  const allTeams=useMemo(()=>[...new Set([...allowedMembers.map(x=>x.team),...records.map(x=>x.entry.team)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi')),[allowedMembers,records]);
  const yearlyMonths=useMemo(()=>kpiMonths(year,'year',month,quarter),[year,month,quarter]);
  const trend=useMemo(()=>kpiMonthlyTrend(records.filter(x=>team==='all'||x.entry.team===team),yearlyMonths),[records,team,yearlyMonths]);
  const person=people.find(p=>p.uid===personId);

  async function exportReport(){
    if(loading||error||exporting)return;
    setExporting(true);
    try{
      const XLSX=await import('xlsx');
      const wb=XLSX.utils.book_new();
      const detail=XLSX.utils.aoa_to_sheet([
        ['EDUKPI AI · BẢNG CHI TIẾT KPI'],
        ['Trường',kpiCsvSafe(schoolName)],
        ['Kỳ báo cáo',kpiPeriodLabel(scope,year,month,quarter)],
        ['Ghi chú','Chỉ phiếu đã phê duyệt mới được tính điểm chính thức.'],
        [],
        ['Tháng','Họ và tên','Tổ chuyên môn','Trạng thái','Tự chấm','Tổ duyệt','Điểm chính thức','Nhận xét'],
        ...scopedRecords.slice().sort((a,b)=>a.month.localeCompare(b.month)||a.entry.name.localeCompare(b.entry.name,'vi'))
          .map(r=>[r.month,kpiCsvSafe(r.entry.name),kpiCsvSafe(r.entry.team),KpiStatusLabel[r.entry.status],
            r.entry.selfTotal,r.entry.reviewTotal??'',kpiOfficialScore(r.entry)??'',kpiCsvSafe(r.entry.note||'')]),
      ]);
      detail['!cols']=[{wch:16},{wch:30},{wch:26},{wch:27},{wch:16},{wch:16},{wch:22},{wch:45}];
      XLSX.utils.book_append_sheet(wb,detail,'Chi tiết');
      if(isReviewer){
        const teamSheet=XLSX.utils.aoa_to_sheet([
          ['TỔNG HỢP CẤP TỔ'],['Tổ','Nhân sự','Đã gửi','Đã duyệt','Chờ duyệt','Điểm TB chính thức'],
          ...teams.map(t=>[kpiCsvSafe(t.team),t.people,t.submitted,t.approved,t.pending,t.average??'']),
        ]);
        teamSheet['!cols']=[{wch:28},{wch:16},{wch:18},{wch:18},{wch:18},{wch:27}];
        XLSX.utils.book_append_sheet(wb,teamSheet,'Theo tổ');
      }
      const personSheet=XLSX.utils.aoa_to_sheet([
        ['TỔNG HỢP CÁ NHÂN'],['Họ và tên','Tổ','Đã gửi','Đã duyệt','Chờ duyệt','Điểm TB chính thức'],
        ...kpiPersonSummary(scopedRecords,scopedMembers).map(p=>[kpiCsvSafe(p.name),kpiCsvSafe(p.team),p.submitted,p.approved,p.pending,p.average??'']),
      ]);
      personSheet['!cols']=[{wch:28},{wch:26},{wch:18},{wch:18},{wch:18},{wch:27}];
      XLSX.utils.book_append_sheet(wb,personSheet,'Cá nhân');
      XLSX.writeFile(wb,'EduKPI_'+scope+'_'+year+'_'+schoolCode.slice(0,8)+'.xlsx');
    }catch(err){setError('Không xuất được Excel: '+String(err));}
    finally{setExporting(false);}
  }

  return <div className="space-y-5">
    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Báo cáo quản trị</p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">Tổng hợp KPI đa cấp</h2>
          <p className="mt-1 text-sm text-slate-500">Trường học → Tổ chuyên môn → Giáo viên · Dữ liệu trực tiếp từ hệ thống</p>
        </div>
        <button type="button" onClick={()=>void exportReport()} disabled={loading||exporting||!!error}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
          <Download size={17}/>{exporting?'Đang xuất...':'Xuất Excel'}
        </button>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-3 sm:p-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-500">Kỳ đánh giá</p>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {(['month','quarter','year'] as const).map(value=><button type="button" key={value} onClick={()=>{setScope(value);setPersonId('');}}
              className={'rounded-lg px-3.5 py-2 text-sm font-semibold '+(scope===value?'bg-indigo-600 text-white shadow':'text-slate-500 hover:bg-slate-50')}>
              {value==='month'?'Tháng':value==='quarter'?'Quý':'Năm'}</button>)}
          </div>
        </div>
        {scope!=='month'&&<label className="text-xs font-semibold text-slate-500">Năm
          <select value={year} aria-label="Năm thống kê" onChange={e=>{setYear(Number(e.target.value));setPersonId('');}} className={field+' mt-1 block'}>
            {Array.from({length:7},(_,i)=>new Date().getFullYear()-4+i).map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </label>}
        {scope==='quarter'&&<label className="text-xs font-semibold text-slate-500">Quý
          <select value={quarter} aria-label="Quý thống kê" onChange={e=>{setQuarter(Number(e.target.value));setPersonId('');}} className={field+' mt-1 block'}>
            {[1,2,3,4].map(q=><option key={q} value={q}>Quý {q}</option>)}
          </select>
        </label>}
        {scope==='month'&&<span className="mb-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">{kpiPeriodLabel(scope,year,month,quarter)}</span>}
        {isOwner&&<label className="min-w-44 text-xs font-semibold text-slate-500">Phạm vi trường / tổ
          <select value={team} aria-label="Lọc tổ" onChange={e=>{setTeam(e.target.value);setPersonId('');}} className={field+' mt-1 block w-full'}>
            <option value="all">Toàn trường</option>
            {allTeams.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </label>}
      </div>
      {loading&&<p role="status" className="mt-3 text-sm text-indigo-700">Đang tổng hợp dữ liệu theo quyền truy cập...</p>}
      {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Không thể tải báo cáo: {error}</p>}
      {!loading&&!error&&<p className="mt-3 text-xs text-slate-500">{kpiPeriodLabel(scope,year,month,quarter)} · {opened.filter(m=>months.includes(m)).length} tháng đã mở · Chỉ kết quả được trường phê duyệt mới tính vào điểm bình quân.</p>}
    </section>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        {label:'Điểm TB chính thức',value:loading?'…':score(stats.average),sub:stats.average===null?'Chưa có kết quả duyệt':'Trên thang điểm 100',icon:BarChart3,bg:'bg-indigo-50 text-indigo-600'},
        {label:'Phiếu đã gửi',value:loading?'…':String(stats.submitted),sub:'Trong kỳ thống kê',icon:FileText,bg:'bg-sky-50 text-sky-600'},
        {label:'Đã phê duyệt',value:loading?'…':String(stats.approved),sub:stats.approvedRate===null?'Chưa có dữ liệu':stats.approvedRate+'% số phiếu đã gửi',icon:CheckCircle2,bg:'bg-emerald-50 text-emerald-600'},
        {label:'Cần xử lý',value:loading?'…':String(stats.pending),sub:stats.returned+' phiếu cần bổ sung',icon:Users,bg:'bg-amber-50 text-amber-600'},
      ].map(item=><div key={item.label} className={panel}>
        <div className={'mb-3 flex h-10 w-10 items-center justify-center rounded-xl '+item.bg}><item.icon size={19}/></div>
        <p className="text-xs font-semibold text-slate-500 sm:text-sm">{item.label}</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{item.value}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{item.sub}</p>
      </div>)}
    </section>

    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <section className={panel}>
        <h3 className="font-bold text-slate-900">Xu hướng điểm KPI được phê duyệt</h3>
        <p className="mt-1 text-xs text-slate-500">12 tháng của năm {year} · Chỉ tính phiếu đã duyệt cuối cùng</p>
        <div className="mt-5 flex h-44 items-end justify-between gap-1.5 border-b border-slate-100 pb-2">
          {trend.map(t=><div key={t.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={t.month+': '+(t.average===null?'Chưa có điểm được duyệt':score(t.average))}>
            <div className="flex h-full w-full items-end justify-center">
              <div className={'w-full max-w-8 rounded-t-md '+(t.average===null?'bg-slate-100':'bg-gradient-to-t from-indigo-700 to-indigo-400')} style={{height:(t.average===null?5:Math.max(5,t.average))+'%'}}/>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">{Number(t.month.slice(-2))}</span>
          </div>)}
        </div>
        <p className="mt-3 text-xs text-slate-500">Tháng chưa có dữ liệu được hiển thị màu xám, không tính bằng 0 điểm.</p>
      </section>
      <section className={panel}>
        <h3 className="font-bold text-slate-900">Tiến độ phê duyệt</h3><p className="mt-1 text-xs text-slate-500">Số phiếu trong phạm vi đã chọn</p>
        <div className="mt-5 space-y-4">
          {[
            {name:'Đã phê duyệt',n:stats.approved,c:'bg-emerald-500'},
            {name:'Chờ tổ / trường duyệt',n:stats.pending,c:'bg-indigo-500'},
            {name:'Yêu cầu bổ sung',n:stats.returned,c:'bg-amber-500'},
            {name:'Đang lưu nháp',n:stats.drafts,c:'bg-slate-400'},
          ].map(s=><div key={s.name}>
            <div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-600">{s.name}</span><strong>{loading?'…':s.n}</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={'h-full rounded-full '+s.c} style={{width:s.n/Math.max(scopedRecords.length,1)*100+'%'}}/></div>
          </div>)}
        </div>
        {isReviewer&&stats.pending>0&&<button type="button" onClick={onOpenReview} className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-indigo-700">Xem phiếu chờ duyệt <ArrowRight size={15}/></button>}
      </section>
    </div>

    {isReviewer&&<section className={panel}>
      <div className="flex items-center justify-between gap-2"><div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Cấp {isOwner?'trường':'tổ'}</p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">Thống kê các tổ chuyên môn</h3>
      </div>{isOwner&&team!=='all'&&<button onClick={()=>setTeam('all')} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">Toàn trường <X size={14}/></button>}</div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[575px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3">Tổ chuyên môn</th><th className="px-3 py-3 text-center">Nhân sự</th><th className="px-3 py-3 text-center">Đã gửi</th><th className="px-3 py-3 text-center">Đã duyệt</th><th className="px-3 py-3 text-center">Điểm TB</th>{isOwner&&<th className="px-3 py-3">Chi tiết</th>}</tr></thead>
        <tbody>{teams.map(t=><tr key={t.team} className="border-b border-slate-100"><td className="px-3 py-3.5 font-bold">{t.team}</td><td className="text-center">{t.people}</td><td className="text-center">{t.submitted}</td><td className="text-center">{t.approved}</td><td className={'text-center font-bold '+color(t.average)}>{score(t.average)}</td>
          {isOwner&&<td><button type="button" className="font-semibold text-indigo-600" onClick={()=>{setTeam(t.team);setPersonId('');}}>Xem tổ <ArrowRight size={13} className="inline"/></button></td>}</tr>)}</tbody>
      </table>{!loading&&!teams.length&&<p className="py-6 text-center text-sm text-slate-500">Chưa có tổ hoặc dữ liệu trong kỳ này.</p>}</div>
    </section>}

    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Cấp cá nhân</p><h3 className="mt-1 text-lg font-bold text-slate-900">Thống kê từng giáo viên</h3></div>
        {isReviewer&&<label className="relative block w-full sm:w-64"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500" aria-label="Tìm giáo viên" placeholder="Tìm tên hoặc tổ..." value={search} onChange={e=>setSearch(e.target.value)}/></label>}
      </div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[570px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3">Họ và tên</th><th className="px-3 py-3">Tổ</th><th className="px-3 py-3 text-center">Đã gửi</th><th className="px-3 py-3 text-center">Đã duyệt</th><th className="px-3 py-3 text-center">Điểm TB</th><th className="px-3 py-3">Lịch sử</th></tr></thead>
        <tbody>{people.map(p=><tr key={p.uid} className="border-b border-slate-100"><td className="px-3 py-3.5 font-bold text-slate-800">{p.name}</td><td className="px-3 text-slate-500">{p.team}</td><td className="text-center">{p.submitted}</td><td className="text-center">{p.approved}</td><td className={'text-center font-bold '+color(p.average)}>{score(p.average)}</td><td><button type="button" onClick={()=>setPersonId(p.uid)} className="font-semibold text-indigo-600">12 tháng <ArrowRight size={13} className="inline"/></button></td></tr>)}</tbody>
      </table>{!loading&&!people.length&&<p className="py-6 text-center text-sm text-slate-500">Không tìm thấy hồ sơ KPI phù hợp.</p>}</div>
      {person&&<div className="mt-5 rounded-2xl bg-indigo-50/60 p-4">
        <div className="flex items-start justify-between gap-2">
          <div><p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Lịch sử KPI {year}</p><h4 className="mt-1 text-lg font-bold text-slate-900">{person.name}</h4><p className="text-xs text-slate-500">{person.team} · Trung bình chính thức: {score(person.average)}</p></div>
          <button type="button" aria-label="Đóng lịch sử" onClick={()=>setPersonId('')} className="rounded-xl p-2 hover:bg-white"><X size={18}/></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{yearlyMonths.map(m=>{
          const entry=records.find(r=>r.month===m&&r.entry.uid===person.uid)?.entry;
          return <div className="rounded-xl border border-slate-100 bg-white p-3" key={m}>
            <p className="text-xs font-semibold text-slate-500">Tháng {Number(m.slice(-2))}</p>
            <p className={'mt-1 text-lg font-black '+color(entry?kpiOfficialScore(entry):null)}>{entry?score(kpiOfficialScore(entry)):'—'}</p>
            <p className="text-[11px] text-slate-500">{entry?KpiStatusLabel[entry.status]:'Chưa có phiếu'}</p>
          </div>;
        })}</div>
      </div>}
    </section>
    <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-indigo-600"/>Báo cáo chỉ sử dụng dữ liệu trong phạm vi tài khoản được phân quyền. Điểm được phê duyệt mới tính vào trung bình; kết quả này không thay thế quyết định xếp loại viên chức chính thức.</p>
  </div>;
}
