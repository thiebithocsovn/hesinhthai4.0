import React, { useEffect, useRef, useState } from 'react';
import { Bot, X, Sparkles, ArrowRight, ClipboardCopy, ShieldCheck, Loader2 } from 'lucide-react';
import { AGENT_PROFILES, AGENT_ROLES, agentAppName, buildAgentPlan, type AgentAppId, type AgentContext, type AgentRole } from '../lib/eduAgentCore';

type Props = {
  context: AgentContext;
  uid?: string;
  onLaunch?: (id: AgentAppId) => void;
  onTimetableCommand?: (command: string) => void;
  desktop?: boolean;
  timetableBusy?: boolean;
};

export default function EduAgentDock({ context, uid, onLaunch, onTimetableCommand, desktop = false, timetableBusy = false }: Props) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AgentRole>(AGENT_PROFILES[context].role);
  const [request, setRequest] = useState('');
  const [plan, setPlan] = useState<ReturnType<typeof buildAgentPlan> | null>(null);
  const [draft, setDraft] = useState<{text:string;model:string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  useEffect(() => { setRole(AGENT_PROFILES[context].role); setRequest(''); setPlan(null); setDraft(null); setBusy(false); setNotice(''); return () => { revision.current++; }; }, [context, uid]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const show = () => setOpen(true);
    window.addEventListener('keydown', escape);
    window.addEventListener('edu-ai:open-agent', show);
    return () => { window.removeEventListener('keydown', escape); window.removeEventListener('edu-ai:open-agent', show); };
  }, []);
  const prepare = () => { if (!request.trim()) return; setPlan(buildAgentPlan(request, context, role)); setDraft(null); setNotice('Kế hoạch cục bộ; chưa thực hiện tác vụ nào.'); };
  const generate = async () => {
    if (!uid || busy || !request.trim()) return;
    const current = ++revision.current;
    const input = request.trim();
    setPlan(buildAgentPlan(input, context, role)); setBusy(true); setNotice(''); setDraft(null);
    try {
      const { requestEduAgentDraft } = await import('../lib/eduAgentCloud');
      const result = await requestEduAgentDraft(input, context, role, uid);
      if (current === revision.current) setDraft(result);
    } catch {
      if (current === revision.current) setNotice('Gemini chưa phản hồi hoặc phiên không hợp lệ. Bạn vẫn có kế hoạch cục bộ; không có dữ liệu nào bị thay đổi.');
    } finally { if (current === revision.current) setBusy(false); }
  };
  const copy = async () => {
    const text = draft?.text || (plan ? [plan.title, ...plan.steps].join('\n') : '');
    try { await navigator.clipboard.writeText(text); setNotice('Đã sao chép nội dung để sử dụng trong ứng dụng.'); }
    catch { setNotice('Không sao chép tự động được. Hãy bôi đen nội dung và sao chép thủ công.'); }
  };
  const reset = () => { revision.current++; setBusy(false); setPlan(null); setDraft(null); setNotice(''); };
  const position = desktop ? 'bottom-[calc(4.8rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(5rem+env(safe-area-inset-bottom))]';
  return <div data-edu-agent-dock="true" className="text-slate-900">
    {!open && <button type="button" onClick={() => setOpen(true)} title="Edu AI Agent" aria-label="Mở Edu AI Agent" className={'fixed right-3 z-[45] flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-700 px-3 py-3 text-xs font-bold text-white shadow-xl hover:bg-indigo-600 '+position}><Bot className="h-5 w-5"/><span className="hidden sm:inline">AI Agent</span></button>}
    {open && <section aria-label="Edu AI Agent" className={'fixed right-2 z-[70] flex max-h-[min(75dvh,680px)] w-[min(96vw,430px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl '+position}>
      <header className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-slate-950 via-indigo-950 to-indigo-800 p-4 text-white"><Bot className="h-7 w-7 shrink-0 text-cyan-300"/><div className="min-w-0 flex-1"><h2 className="font-bold">Edu AI Agent</h2><p className="truncate text-xs text-indigo-100">{agentAppName(context)} · Điều phối 6 vai trò</p></div><button type="button" aria-label="Đóng AI Agent" onClick={()=>setOpen(false)} className="rounded-lg p-2 hover:bg-white/15"><X className="h-5 w-5"/></button></header>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4">
        <label className="block text-xs font-semibold">Vai trò chuyên môn<select value={role} onChange={e=>{setRole(e.target.value as AgentRole);reset();}} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm">{Object.entries(AGENT_ROLES).map(([id,r])=><option key={id} value={id}>{r.name}</option>)}</select></label>
        <p className="text-xs text-slate-600">{AGENT_ROLES[role].description}</p>
        <label className="block text-xs font-semibold">Yêu cầu<textarea rows={4} maxLength={1800} value={request} onChange={e=>{setRequest(e.target.value);reset();}} placeholder={AGENT_PROFILES[context].example} className="mt-1 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm"/></label>
        <button type="button" onClick={()=>{setRequest(AGENT_PROFILES[context].example);reset();}} className="text-left text-xs font-semibold text-indigo-700 underline">Dùng yêu cầu mẫu của ứng dụng</button>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!request.trim()||busy} onClick={prepare} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold disabled:opacity-50">Lập kế hoạch cục bộ</button>{uid && <button type="button" disabled={!request.trim()||busy} onClick={generate} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}Gửi Gemini tạo dự thảo</button>}</div>
        <p className="flex gap-1.5 text-[11px] leading-relaxed text-slate-600"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600"/>Chỉ gửi nội dung bạn nhập khi bấm Gemini. Không tự đọc hồ sơ, tệp, điểm số hoặc dữ liệu học sinh. Không nhập thông tin cá nhân. AI không tự sửa dữ liệu.</p>
        {!uid && <p className="text-xs text-slate-600">Đăng nhập tài khoản được cấp quyền để dùng Gemini. Kế hoạch cục bộ không cần API.</p>}
        {onTimetableCommand && <button type="button" disabled={!request.trim()||busy||timetableBusy} onClick={()=>{onTimetableCommand(request.trim().slice(0,500));setOpen(false);}} className="w-full rounded-lg border border-teal-300 bg-teal-50 p-2 text-left text-xs font-semibold text-teal-800 disabled:opacity-50">Chuyển lệnh vào Agent thời khóa biểu để xem trước →</button>}
        {plan && <section className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h3 className="text-sm font-bold">{plan.title}</h3><ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed">{plan.steps.map((step,i)=><li key={i}>{step}</li>)}</ol><h4 className="mt-3 text-xs font-bold">Công cụ đề xuất</h4><div className="mt-2 flex flex-wrap gap-1.5">{plan.targets.map(id=>onLaunch && id!==context ? <button type="button" key={id} onClick={()=>onLaunch(id)} className="flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1.5 text-xs text-indigo-700">{agentAppName(id)}<ArrowRight className="h-3 w-3"/></button> : <span key={id} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">{agentAppName(id)}{id===context?' · hiện tại':''}</span>)}</div></section>}
        {draft && <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3"><h3 className="text-sm font-bold">Dự thảo Gemini · {draft.model}</h3><div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{draft.text}</div><p className="mt-2 text-xs text-indigo-800">Kiểm tra và duyệt trước khi sử dụng. Chưa thực hiện thay đổi nào.</p></section>}
        {(plan || draft) && <button type="button" onClick={()=>void copy()} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"><ClipboardCopy className="h-4 w-4"/>Sao chép {draft?'dự thảo':'kế hoạch'}</button>}
        {notice && <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{notice}</p>}
      </div>
    </section>}
  </div>;
}
