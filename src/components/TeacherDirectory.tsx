import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserCheck, UserPlus, School, Lock, Unlock, Search, X, Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MoreHorizontal, Edit2, Key, Trash2, ShieldCheck, Filter, ArrowUpDown, MapPin } from 'lucide-react';
import type { Teacher } from '../types';
import { directoryInitials, directoryOptions, directoryStats, filterDirectory, foldDirectoryText, paginateDirectory, regionalGroups, UNKNOWN_PROVINCE, provinceKey, provinceLabel, type DirectoryStatus, type DirectorySort } from '../lib/teacherDirectory';
interface Props {
  teachers: Teacher[];
  onAdd: (region?: {province?: string; school?: string}) => void;
  onEdit: (teacher: Teacher) => void;
  onPassword: (id: string) => void;
  onToggle: (id: string, status: Teacher['status']) => void;
  onDelete: (id: string) => void;
}
const fieldClass='w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const iconButton='inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';
const sortFields: {key:DirectorySort;label:string}[]=[{key:'name',label:'Họ và tên'},{key:'school',label:'Đơn vị công tác'},{key:'level',label:'Cấp học'},{key:'status',label:'Trạng thái'},{key:'username',label:'Tên đăng nhập'}];
const avatars=['bg-indigo-100 text-indigo-700','bg-sky-100 text-sky-700','bg-teal-100 text-teal-700','bg-violet-100 text-violet-700','bg-amber-100 text-amber-800'];
function Avatar({ teacher }: { teacher: Teacher }) {
  const hash=Array.from(teacher.id).reduce((n,c)=>n+c.charCodeAt(0),0);
  return <span aria-hidden="true" className={'grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold '+avatars[hash%avatars.length]}>{directoryInitials(teacher.name)}</span>;
}
function Status({teacher}: {teacher:Teacher}) {
  const active=teacher.status==='active';
  return <span className={'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium '+(active?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800')}><span className={'h-1.5 w-1.5 rounded-full '+(active?'bg-emerald-500':'bg-amber-500')}/>{active?'Hoạt động':'Chưa kích hoạt'}</span>;
}
export default function TeacherDirectory({teachers,onAdd,onEdit,onPassword,onToggle,onDelete}:Props) {
  const [query,setQuery]=useState('');
  const [province,setProvince]=useState('');
  const [school,setSchool]=useState('');
  const [regionalView,setRegionalView]=useState(true);
  const [level,setLevel]=useState('');
  const [status,setStatus]=useState<DirectoryStatus>('all');
  const [sort,setSort]=useState<DirectorySort>('name');
  const [direction,setDirection]=useState<'asc'|'desc'>('asc');
  const [size,setSize]=useState(20);
  const [page,setPage]=useState(1);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [showFilters,setShowFilters]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const stats=useMemo(()=>directoryStats(teachers),[teachers]);
  const groups=useMemo(()=>regionalGroups(teachers),[teachers]);
  const region=groups.find(g=>g.key===province);
  const schools=useMemo(()=>groups.filter(g=>!province||g.key===province).flatMap(g=>g.schools.map(s=>({...s,province:g.key,display:province?s.label:s.label+' · '+g.label}))),[groups,province]);
  const selectedSchool=schools.find(s=>s.key===school);
  const selectProvince=(key:string)=>{setProvince(key);setSchool('');setPage(1);};
  const selectSchool=(key:string)=>{setSchool(key);setPage(1);};
  const levels=useMemo(()=>directoryOptions(teachers,'level'),[teachers]);
  const filtered=useMemo(()=>filterDirectory(teachers,{query,school:'',province,regionalSchool:school,level,status,sort,direction}),[teachers,query,school,province,level,status,sort,direction]);
  const paged=paginateDirectory(filtered,page,size);
  const selected=teachers.find(t=>t.id===selectedId);
  useEffect(()=>{setPage(1);},[query,school,province,level,status,sort,direction,size]);
  useEffect(()=>{if(page!==paged.page)setPage(paged.page);},[page,paged.page]);
  useEffect(()=>{
    const node=dialog.current;
    if(!node)return;
    if(selectedId && selected && !node.open)node.showModal();
    if((!selectedId || !selected) && node.open)node.close();
  },[selectedId,selected]);
  const reset=()=>{setQuery('');setProvince('');setSchool('');setLevel('');setStatus('all');setPage(1);};
  const changeSort=(key:DirectorySort)=>{if(sort===key)setDirection(d=>d==='asc'?'desc':'asc');else{setSort(key);setDirection('asc');}};
  const clearDialog=()=>{dialog.current?.close();setSelectedId(null);};
  const runAction=(action:(t:Teacher)=>void)=>{if(!selected)return;const teacher=selected;clearDialog();action(teacher);};
  const filterCount=Number(!!province)+Number(!!school)+Number(!!level)+Number(status!=='all');
  const hasFilter=!!query.trim()||filterCount>0;
  const metrics=[{title:'Tổng tài khoản',value:stats.total,Icon:Users,color:'bg-indigo-50 text-indigo-700',filter:'all' as const,caption:'Toàn bộ giáo viên'},
    {title:'Đang hoạt động',value:stats.active,Icon:UserCheck,color:'bg-emerald-50 text-emerald-700',filter:'active' as const,caption:'Được cấp quyền truy cập'},
    {title:'Chưa kích hoạt',value:stats.inactive,Icon:Lock,color:'bg-amber-50 text-amber-700',filter:'inactive' as const,caption:'Chờ duyệt hoặc bị khóa'},
    {title:'Đơn vị công tác',value:groups.reduce((sum,g)=>sum+g.schools.filter(s=>s.label!=='Chưa khai báo trường').length,0),Icon:School,color:'bg-sky-50 text-sky-700',filter:null,caption:'Nhóm trường theo tỉnh'}];
  const identity=(t:Teacher)=><div className="flex min-w-0 flex-1 items-center gap-3"><Avatar teacher={t}/><div className="min-w-0"><button type="button" onClick={()=>setSelectedId(t.id)} className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-indigo-700 hover:underline" title={t.name}>{t.name||'Chưa có tên'}</button><p title={t.email} className="truncate text-xs text-slate-500">{t.email||'Chưa có email'}</p>{t.username && foldDirectoryText(t.username)!==foldDirectoryText(t.email)&&<p className="truncate text-[11px] text-slate-500" title={t.username}>Đăng nhập: {t.username}</p>}</div></div>;
  const actions=(t:Teacher)=><div className="flex shrink-0 items-center justify-end gap-1.5"><button type="button" title="Chỉnh sửa" aria-label={'Chỉnh sửa '+t.name} onClick={()=>onEdit(t)} className={iconButton}><Edit2 className="h-4 w-4"/></button><button type="button" title="Chi tiết và thao tác" aria-label={'Thao tác với '+t.name} onClick={()=>setSelectedId(t.id)} className={iconButton}><MoreHorizontal className="h-4 w-4"/></button></div>;
  const heading=(key:DirectorySort,title:string)=><th scope="col" aria-sort={sort===key?(direction==='asc'?'ascending':'descending'):'none'} className="px-4 py-3 text-left text-xs font-semibold text-slate-600"><button type="button" onClick={()=>changeSort(key)} className="inline-flex items-center gap-1 text-left hover:text-indigo-700">{title}{sort===key?(direction==='asc'?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>):<ArrowUpDown className="h-3 w-3 text-slate-400"/>}</button></th>;
  return <div data-teacher-directory="true" className="mx-auto w-full max-w-[1600px] min-w-0 px-3 pb-24 pt-5 sm:px-6 lg:px-8 lg:pt-7">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="mb-1 text-xs font-medium text-indigo-600">Quản trị hệ thống / Tài khoản</p><h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý giáo viên</h1><p className="mt-1 text-sm text-slate-500">Danh sách tài khoản, đơn vị và quyền truy cập Edu AI.</p></div>
      <button type="button" onClick={()=>onAdd({province:province&&province!==UNKNOWN_PROVINCE?province:selectedSchool?.province!==UNKNOWN_PROVINCE?selectedSchool?.province:undefined,school:selectedSchool?.label==='Chưa khai báo trường'?undefined:selectedSchool?.label})} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><Plus className="h-5 w-5"/>Cấp tài khoản</button>
    </header>
    <section aria-label="Tổng quan tài khoản" className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map(({title,value,Icon,color,filter,caption})=>{
        const children=<><span className={'grid h-9 w-9 shrink-0 place-items-center rounded-xl '+color}><Icon className="h-5 w-5"/></span><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{title}</p><div className="text-2xl font-bold tabular-nums text-slate-900">{value.toLocaleString('vi-VN')}</div><p className="mt-0.5 hidden text-[11px] text-slate-500 sm:block">{caption}</p></div></>;
        const base='flex items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm sm:p-4';
        return filter===null?<div key={title} className={base+' border-slate-200'}>{children}</div>:<button key={title} type="button" aria-pressed={status===filter} onClick={()=>setStatus(filter)} className={base+' transition hover:border-indigo-300 '+(status===filter?'border-indigo-400 ring-1 ring-indigo-100':'border-slate-200')}>{children}</button>;
      })}
    </section>
    <section aria-label="Quản lý theo địa bàn" className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-bold text-slate-900"><MapPin className="h-5 w-5 text-indigo-600"/>Quản lý theo tỉnh / trường</h2><p className="mt-1 text-xs text-slate-500">{groups.filter(g=>g.key!==UNKNOWN_PROVINCE).length} tỉnh/thành có hồ sơ · {groups.find(g=>g.key===UNKNOWN_PROVINCE)?.total||0} tài khoản chưa xác định tỉnh</p></div><button type="button" aria-expanded={regionalView} onClick={()=>setRegionalView(v=>!v)} className={iconButton+' text-xs'}>{regionalView?'Thu gọn':'Mở danh mục'}<ChevronDown className={'ml-1 h-4 w-4 '+(regionalView?'rotate-180':'')}/></button></div>
      {regionalView&&<div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)]">
        <div className="max-h-64 space-y-1 overflow-auto rounded-xl border border-slate-200 p-2"><button type="button" aria-pressed={!province} onClick={()=>selectProvince('')} className={'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm '+(!province?'bg-indigo-50 font-semibold text-indigo-700':'hover:bg-slate-50')}>Toàn quốc <span className="text-xs tabular-nums">{teachers.length}</span></button>{groups.map(g=><button type="button" key={g.key} aria-pressed={province===g.key} onClick={()=>selectProvince(g.key)} className={'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm '+(province===g.key?'bg-indigo-50 font-semibold text-indigo-700':'hover:bg-slate-50')}><span>{g.label}</span><span className="text-xs tabular-nums">{g.total}</span></button>)}</div>
        <div className="min-w-0 rounded-xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{region?.label||'Toàn quốc'} · {schools.length} nhóm trường</h3><button type="button" onClick={()=>selectSchool('')} className="text-xs font-medium text-indigo-700">Tất cả trường</button></div><div className="grid max-h-52 gap-2 overflow-auto sm:grid-cols-2">{schools.map(g=><button key={g.key} type="button" aria-pressed={school===g.key} onClick={()=>{if(!province)setProvince(g.province);selectSchool(g.key);}} className={'rounded-xl border p-3 text-left transition hover:border-indigo-300 '+(school===g.key?'border-indigo-400 bg-indigo-50':'border-slate-200')}><span className="flex items-start gap-2"><School className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"/><span className="min-w-0 break-words text-xs font-semibold">{g.display}</span></span><span className="mt-2 block text-xs text-slate-500">{g.total} giáo viên · {g.active} hoạt động</span></button>)}</div>{!schools.length&&<p className="p-3 text-xs text-slate-500">Chưa có hồ sơ trường học.</p>}</div>
      </div>}
      <p className="mt-3 text-xs text-slate-500">Hồ sơ chưa khai báo tỉnh nằm trong nhóm chưa xác định. Chỉnh sửa hồ sơ để xác nhận tỉnh; không tự suy đoán từ tên trường.</p>
    </section>
    <section aria-label="Danh sách giáo viên" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-slate-900">Danh sách giáo viên <span className="ml-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{filtered.length}</span></h2><span className="inline-flex items-center gap-1 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-indigo-600"/>Quản trị tài khoản</span></div>
        <div className="flex items-center gap-2"><label className="relative flex-1"><span className="sr-only">Tìm kiếm giáo viên</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input ref={searchRef} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm tên, email, tên đăng nhập, trường, tỉnh..." className={fieldClass+' pl-9 pr-9'}/>{query&&<button type="button" onClick={()=>{setQuery('');searchRef.current?.focus();}} aria-label="Xóa tìm kiếm" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4"/></button>}</label>
          <button type="button" aria-expanded={showFilters} onClick={()=>setShowFilters(v=>!v)} className={iconButton+' px-3 py-2.5 lg:hidden'}><Filter className="h-4 w-4"/><span className="ml-1 text-sm">Lọc{filterCount?' ('+filterCount+')':''}</span></button>
        </div>
        <div className={(showFilters?'grid':'hidden')+' mt-3 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-5'}>
          <label className="min-w-0"><span className="mb-1 block text-xs font-medium text-slate-600">Tỉnh/thành phố</span><select aria-label="Lọc tỉnh/thành phố" className={fieldClass} value={province} onChange={e=>selectProvince(e.target.value)}><option value="">Toàn quốc</option>{groups.map(g=><option key={g.key} value={g.key}>{g.label}</option>)}</select></label><label className="min-w-0"><span className="mb-1 block text-xs font-medium text-slate-600">Trường / đơn vị</span><select aria-label="Lọc đơn vị công tác" className={fieldClass} value={school} onChange={e=>selectSchool(e.target.value)}><option value="">Tất cả đơn vị</option>{schools.map(o=><option key={o.key} value={o.key}>{o.display}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-medium text-slate-600">Cấp học</span><select aria-label="Lọc cấp học" className={fieldClass} value={level} onChange={e=>setLevel(e.target.value)}><option value="">Tất cả cấp học</option>{levels.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-medium text-slate-600">Trạng thái</span><select className={fieldClass} value={status} onChange={e=>setStatus(e.target.value as DirectoryStatus)}><option value="all">Tất cả trạng thái</option><option value="active">Hoạt động</option><option value="inactive">Chờ duyệt / khóa</option></select></label>
          <label><span className="mb-1 block text-xs font-medium text-slate-600">Sắp xếp</span><select className={fieldClass} value={sort+':'+direction} onChange={e=>{const [k,d]=e.target.value.split(':');setSort(k as DirectorySort);setDirection(d as 'asc'|'desc');}}>{sortFields.flatMap(o=>[<option key={o.key+':asc'} value={o.key+':asc'}>{o.label} (A–Z)</option>,<option key={o.key+':desc'} value={o.key+':desc'}>{o.label} (Z–A)</option>])}</select></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-xs text-slate-500">{hasFilter?'Tìm thấy '+filtered.length+' / '+teachers.length+' tài khoản':'Hiển thị danh sách tài khoản hiện có'}</p>{hasFilter&&<button type="button" onClick={reset} className="flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"><X className="h-3.5 w-3.5"/>Xóa bộ lọc</button>}</div>
      </div>
      <div className="hidden xl:block max-h-[min(62vh,700px)] overflow-auto">
        <table className="w-full table-fixed min-w-[850px] border-collapse text-left">
          <colgroup><col style={{width:'34%'}}/><col style={{width:'28%'}}/><col style={{width:'12%'}}/><col style={{width:'15%'}}/><col style={{width:'11%'}}/></colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_#e2e8f0]"><tr>{heading('name','Giáo viên')}{heading('school','Đơn vị công tác')}{heading('level','Cấp học')}{heading('status','Trạng thái')}<th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Thao tác</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{paged.items.map(t=><tr key={t.id} className="transition-colors hover:bg-indigo-50/40"><td className="px-4 py-3">{identity(t)}</td><td className="break-words px-4 py-3 text-sm text-slate-700"><div>{t.school||'—'}</div><div className="mt-1 text-xs text-slate-500">{provinceLabel(provinceKey(t))}</div></td><td className="px-4 py-3 text-xs text-slate-600">{t.level||'—'}</td><td className="px-4 py-3"><Status teacher={t}/></td><td className="px-4 py-3">{actions(t)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 xl:hidden">{paged.items.map(t=><article key={t.id} className="p-4"><div className="flex items-start justify-between gap-2">{identity(t)}{actions(t)}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-0 sm:pl-[52px]"><div className="min-w-0"><p className="text-xs font-medium text-slate-700">{t.school||'Chưa khai báo đơn vị'}</p><p className="text-xs text-slate-500">{provinceLabel(provinceKey(t))} · {t.level||'Chưa khai báo cấp học'}</p></div><Status teacher={t}/></div></article>)}</div>
      {!paged.items.length&&<div className="px-4 py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500"><Users className="h-6 w-6"/></span><h3 className="mt-3 font-semibold text-slate-900">{hasFilter?'Không tìm thấy giáo viên phù hợp':'Chưa có tài khoản giáo viên'}</h3><p className="mt-1 text-sm text-slate-500">{hasFilter?'Thử từ khóa khác hoặc xóa bộ lọc.':'Danh sách sẽ hiển thị khi có hồ sơ tài khoản.'}</p>{hasFilter&&<button type="button" onClick={reset} className="mt-3 text-sm font-semibold text-indigo-700">Xóa bộ lọc</button>}</div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
        <span>{paged.from}–{paged.to} trên {filtered.length} tài khoản</span><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-1">Mỗi trang <select aria-label="Số tài khoản mỗi trang" value={size} onChange={e=>setSize(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-2">{[10,20,50].map(n=><option key={n}>{n}</option>)}</select></label><button type="button" aria-label="Trang trước" disabled={paged.page===1} onClick={()=>setPage(paged.page-1)} className={iconButton}><ChevronLeft className="h-4 w-4"/></button><span className="tabular-nums">{paged.page} / {paged.pages}</span><button type="button" aria-label="Trang sau" disabled={paged.page===paged.pages} onClick={()=>setPage(paged.page+1)} className={iconButton}><ChevronRight className="h-4 w-4"/></button></div>
      </footer>
    </section>
    <dialog ref={dialog} aria-label="Chi tiết tài khoản giáo viên" onClose={()=>setSelectedId(null)} onClick={e=>{if(e.target===e.currentTarget)clearDialog();}} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/45">
      {selected&&<div className="p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Chi tiết tài khoản</h2><button type="button" aria-label="Đóng chi tiết" className={iconButton} onClick={clearDialog}><X className="h-4 w-4"/></button></div><div className="flex items-center gap-3"><Avatar teacher={selected}/><div className="min-w-0"><p className="break-words font-bold text-slate-900">{selected.name}</p><Status teacher={selected}/></div></div><dl className="mt-5 space-y-3 text-sm">{[['Email',selected.email],['Tên đăng nhập',selected.username],['Tỉnh/thành phố',provinceLabel(provinceKey(selected))],['Đơn vị công tác',selected.school],['Cấp học',selected.level]].map(([k,v])=><div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="break-all font-medium text-slate-800">{v||'—'}</dd></div>)}</dl><div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={()=>runAction(onEdit)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm font-semibold hover:bg-slate-50"><Edit2 className="h-4 w-4 text-indigo-600"/>Chỉnh sửa thông tin</button>
        <button type="button" onClick={()=>runAction(t=>onPassword(t.id))} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm font-semibold hover:bg-slate-50"><Key className="h-4 w-4 text-indigo-600"/>Đặt lại mật khẩu / khôi phục</button>
        <button type="button" onClick={()=>runAction(t=>onToggle(t.id,t.status))} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm font-semibold hover:bg-slate-50">{selected.status==='active'?<Lock className="h-4 w-4 text-amber-600"/>:<Unlock className="h-4 w-4 text-emerald-600"/>}{selected.status==='active'?'Khóa tài khoản':'Kích hoạt / mở khóa'}</button>
        <button type="button" onClick={()=>runAction(t=>onDelete(t.id))} className="flex w-full items-center gap-3 rounded-lg border border-red-100 p-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4"/>Xóa hồ sơ giáo viên</button>
      </div><p className="mt-3 text-xs text-slate-500">Các thao tác thay đổi quyền và xóa hồ sơ cần xác nhận theo quy trình hiện hành.</p></div>}
    </dialog>
  </div>;
}
