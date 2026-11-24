import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowRight, CalendarRange, Settings, Search, X, Image, Moon, Sun, Grid2X2, Sparkles, Power, Wifi,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  ChartColumnIncreasing,
  FileSpreadsheet,
  FileText,
  Gamepad2,
  Layers,
  Layout,
  ListChecks,
  MonitorPlay,
  QrCode,
  Smile,
  Target,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  ECOSYSTEM_APPLICATIONS,
  ECOSYSTEM_DEPENDENCY_LABELS,
  type EcosystemApplicationId,
} from '../ecosystem';

const PlatformFooter = lazy(() => import('./PlatformFooter'));

const PRODUCT_ICONS: Record<EcosystemApplicationId, LucideIcon> = {
  'gesture-class': MonitorPlay,
  'question-studio': ListChecks,
  'lucky-draw': Target,
  'lucky-draw-cards': Layers,
  plicker: QrCode,
  'learning-wall': Layout,
  'head-shake-game': Smile,
  chatbot: Brain,
  'exam-manager': ClipboardCheck,
  'kpi-manager': ChartColumnIncreasing,
  'secret-box': Layers,
  'drag-drop-game': Gamepad2,
  'excel-merger': FileSpreadsheet,
  'pdf-merger': FileText,
};

interface FastLandingPageProps {
  onTeacherLogin: () => void;
  onTeacherRegister: () => void;
  onStudentLogin: () => void;
  onOpenProduct: (applicationId: EcosystemApplicationId) => void;
  account?: { name: string; school?: string; email?: string };
  onSignOut?: () => void;
}

function DeferredFooter(props: FastLandingPageProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const activate = () => setReady(true);
    const browser = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (browser.requestIdleCallback) {
      const id = browser.requestIdleCallback(activate, { timeout: 2500 });
      return () => browser.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(activate, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready) return <div className="h-20 border-t border-slate-200 bg-white" aria-hidden="true" />;

  return (
    <Suspense fallback={<div className="h-20 border-t border-slate-200 bg-white" aria-hidden="true" />}>
      <PlatformFooter
        onTeacherRegister={props.onTeacherRegister}
        onTeacherLogin={props.onTeacherLogin}
        onStudentLogin={props.onStudentLogin}
        onOpenProduct={props.onOpenProduct}
        compact
      />
    </Suspense>
  );
}

const THEMES = [
  { id: 'ocean', name: 'Đại dương', background: 'radial-gradient(ellipse at 78% 25%, #176c90 0%, transparent 45%), linear-gradient(135deg, #07172e, #132c57 60%, #145369)', accent: '#5eead4' },
  { id: 'aurora', name: 'Cực quang', background: 'radial-gradient(ellipse at 75% 25%, #306c6b 0%, transparent 42%), radial-gradient(ellipse at 20% 65%, #6336a7 0%, transparent 50%), #10172d', accent: '#c4b5fd' },
  { id: 'forest', name: 'Thiên nhiên', background: 'radial-gradient(ellipse at 70% 20%, #4d7c42, transparent 50%), linear-gradient(130deg, #0b201a, #174338)', accent: '#a7f3d0' },
  { id: 'sunset', name: 'Hoàng hôn', background: 'radial-gradient(ellipse at 76% 30%, #b45350, transparent 50%), linear-gradient(135deg, #21173c, #653857)', accent: '#fed7aa' },
  { id: 'midnight', name: 'Đêm tối', background: 'radial-gradient(ellipse at 75% 25%, #30394d, transparent 50%), #080d18', accent: '#93c5fd' },
  { id: 'classroom', name: 'Lớp học', background: 'linear-gradient(135deg, #11182799, #11182766), url("' + import.meta.env.BASE_URL + 'homepage-classroom-background.jpg") center / cover', accent: '#fde68a' },
] as const;
type ThemeId = typeof THEMES[number]['id'];
type Preferences = { theme: ThemeId; mode: 'light' | 'dark'; wallpaper: string };
const DEFAULT_PREFS: Preferences = { theme: 'ocean', mode: 'dark', wallpaper: '' };
const PREF_KEY = 'edu-ai-desktop-preferences-v1';
function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return {
      theme: THEMES.some(t => t.id === value.theme) ? value.theme : DEFAULT_PREFS.theme,
      mode: value.mode === 'light' ? 'light' : 'dark',
      wallpaper: typeof value.wallpaper === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.wallpaper) && value.wallpaper.length < 2000000 ? value.wallpaper : '',
    };
  } catch { return DEFAULT_PREFS; }
}
const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

export default function FastLandingPage(props: FastLandingPageProps) {
  const [prefs, setPrefs] = useState(readPreferences);
  const [start, setStart] = useState(true);
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState('');
  const [drawGroup, setDrawGroup] = useState(false);
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const [online, setOnline] = useState(() => navigator.onLine);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const wallpaperRequest = React.useRef(0);
  const theme = THEMES.find(t => t.id === prefs.theme) || THEMES[0];
  const light = prefs.mode === 'light';
  const panel = light ? 'bg-white/95 text-slate-900 border-white/70' : 'bg-slate-950/95 text-white border-white/15';
  const subtle = light ? 'text-slate-600' : 'text-slate-300';
  const tile = light ? 'bg-slate-100 hover:bg-slate-200 border-slate-200' : 'bg-white/5 hover:bg-white/15 border-white/10';
  const searchTerm = normalize(query.trim());
  const catalog = ECOSYSTEM_APPLICATIONS.map(application => ({ ...application, Icon: PRODUCT_ICONS[application.id] }));
  const mainApps = catalog.filter(app => app.id !== 'chatbot' && app.id !== 'lucky-draw-cards');
  const matches = (name: string) => normalize(name).includes(searchTerm);
  const openTimetable = () => {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin);
    url.searchParams.set('app', 'smart-timetable');
    window.location.assign(url.toString());
  };
  const openStart = () => { setSettings(false); setStart(true); setQuery(''); };
  const openSettings = () => { setStart(false); setSettings(true); };
  const changePreferences = (next: Preferences) => {
    setPrefs(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); setNotice('Đã lưu cá nhân hóa trên trình duyệt này.'); }
    catch { setNotice('Đã áp dụng, nhưng trình duyệt chưa lưu được cài đặt.'); }
  };
  const selectTheme = (id: ThemeId) => { wallpaperRequest.current++; changePreferences({ ...prefs, theme: id, wallpaper: '' }); };
  const loadWallpaper = async (file?: File) => {
    if (!file) return;
    const request = ++wallpaperRequest.current;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      setNotice('Chọn ảnh JPG, PNG hoặc WebP dưới 15 MB.'); return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      const factor = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * factor));
      canvas.height = Math.max(1, Math.round(image.height * factor));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas');
      ctx.fillStyle = '#101827'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const wallpaper = canvas.toDataURL('image/jpeg', 0.78);
      if (wallpaper.length >= 2000000) throw new Error('Image too large');
      if (request !== wallpaperRequest.current) return;
      setPrefs(previous => {
        const next = { ...previous, wallpaper };
        try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* reported below */ }
        return next;
      });
      setNotice('Đã áp dụng hình nền riêng. Ảnh được xử lý trên thiết bị, không tải lên máy chủ.');
    } catch { if (request === wallpaperRequest.current) setNotice('Không đọc được ảnh này. Hãy chọn ảnh khác.'); }
    finally { URL.revokeObjectURL(url); }
  };
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    const update = () => setOnline(navigator.onLine);
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') { setStart(false); setSettings(false); } };
    window.addEventListener('online', update); window.addEventListener('offline', update); window.addEventListener('keydown', esc);
    return () => { window.clearInterval(timer); window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('keydown', esc); wallpaperRequest.current++; };
  }, []);
  const background = prefs.wallpaper ? 'linear-gradient(135deg, rgba(0,0,0,.40), rgba(0,0,0,.32)), url("' + prefs.wallpaper + '") center / cover' : theme.background;

  return (
    <div data-edu-ai-desktop="true" className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans text-white" style={{ background, backgroundAttachment: 'fixed' }}>
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/35 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-white/15 p-2.5"><BookOpen className="h-6 w-6" style={{color:theme.accent}} /></div><div><div className="text-xl font-black tracking-tight">Edu AI</div><div className="text-[10px] uppercase tracking-[.2em] text-white/70">Education AI OS</div></div></div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={props.onStudentLogin} className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20">Học sinh</button>
          <button type="button" onClick={props.onTeacherLogin} className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20">Giáo viên</button>
          {!props.account && <button type="button" onClick={props.onTeacherRegister} className="rounded-lg bg-white/15 px-3 py-2 hover:bg-white/25">Đăng ký</button>}
          <button type="button" aria-label="Cá nhân hóa" title="Cá nhân hóa" onClick={openSettings} className="rounded-lg bg-white/10 p-2 hover:bg-white/20"><Settings className="h-5 w-5"/></button>
        </div>
      </header>
      <main className="relative flex flex-1 flex-col items-center justify-center px-5 pb-24 pt-10 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-md"><Brain className="h-12 w-12" style={{color:theme.accent}}/></div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.25em] text-white/75">Không gian làm việc giáo dục số</p>
          <h1 className="text-5xl font-black tracking-tight drop-shadow-lg sm:text-7xl">Edu AI</h1>
          <p className="mt-4 text-base text-white/85 sm:text-lg">Một hệ điều hành · Một tài khoản · Toàn bộ công cụ giáo dục</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={openStart} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-slate-900 shadow-xl hover:bg-slate-100"><Grid2X2 className="h-5 w-5"/>Mở Start</button>
            <button type="button" onClick={openSettings} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/20 px-5 py-3 font-semibold text-white hover:bg-black/35"><Image className="h-5 w-5"/>Đổi hình nền</button>
          </div>
        </div>
      </main>
      {start && <div className="fixed inset-0 z-20 bg-black/35" onClick={() => setStart(false)} aria-hidden="true"/>}
      {start && <section aria-label="Start Menu Edu AI" className={'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-[calc(100%-1rem)] max-w-4xl -translate-x-1/2 overflow-y-auto rounded-3xl border p-4 shadow-2xl backdrop-blur-xl sm:p-6 ' + panel}>
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Start</h2><p className={'text-xs ' + subtle}>Edu AI · Trung tâm ứng dụng</p></div><button type="button" aria-label="Đóng Start" onClick={() => setStart(false)} className={'rounded-xl p-2 ' + tile}><X className="h-5 w-5"/></button></div>
        <label className={'mb-4 flex items-center gap-3 rounded-xl border px-3 py-2.5 ' + tile}><Search className="h-5 w-5 shrink-0"/><input aria-label="Tìm ứng dụng" placeholder="Tìm ứng dụng và công cụ..." value={query} onChange={event => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:opacity-70"/></label>
        <div className={'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 ' + tile}>
          <div className="flex min-w-0 items-center gap-3"><User className="h-7 w-7 shrink-0" style={{color:light?'#2563eb':theme.accent}}/><div className="min-w-0"><div className="truncate font-semibold">{props.account?.name || 'Không gian giáo viên'}</div><div className={'truncate text-xs ' + subtle}>{props.account?.school || props.account?.email || 'Đăng nhập để truy cập dữ liệu của bạn'}</div></div></div>
          <button type="button" onClick={props.onTeacherLogin} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500">{props.account ? 'Quản trị' : 'Đăng nhập giáo viên'}</button>
        </div>
        <section id="san-pham" aria-label="Danh mục ứng dụng">
          <h2 className="mb-3 text-sm font-bold">Tất cả ứng dụng <span className={'ml-2 font-normal ' + subtle}>{mainApps.length+1} nhóm</span></h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {mainApps.filter(app => matches(app.name + ' ' + app.description + ' ' + (app.id === 'lucky-draw' ? 'Bốc thẻ tương tác' : ''))).map(app => {
              const Icon = app.Icon;
              if (app.id === 'lucky-draw') return <button key={app.id} type="button" aria-expanded={drawGroup} onClick={() => setDrawGroup(value => !value)} title="Vòng quay may mắn và Bốc thẻ tương tác" className={'flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center ' + tile}><span className="rounded-xl bg-amber-500 p-2.5 text-white"><Icon className="h-5 w-5"/></span><span className="text-xs font-semibold">Vòng quay &amp; Bốc thẻ</span></button>;
              return <button key={app.id} type="button" title={app.description} onClick={() => props.onOpenProduct(app.id)} className={'flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center ' + tile}><span className="rounded-xl bg-indigo-600 p-2.5 text-white shadow"><Icon className="h-5 w-5"/></span><h3 className="text-xs font-semibold">{app.name}</h3></button>;
            })}
            {matches('Thời khóa biểu xếp lịch giáo viên') && <button type="button" data-smart-timetable-public-card="true" onClick={openTimetable} className={'flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center ' + tile}><span className="rounded-xl bg-teal-600 p-2.5 text-white"><CalendarRange className="h-5 w-5"/></span><h3 className="text-xs font-semibold">Thời khóa biểu</h3></button>}
          </div>
          {(drawGroup || (searchTerm && matches('Vòng quay may mắn Bốc thẻ tương tác'))) && <div className={'mt-3 flex flex-wrap gap-2 rounded-xl border p-3 ' + tile}>{catalog.filter(app => app.id === 'lucky-draw' || app.id === 'lucky-draw-cards').map(app => <button key={app.id} type="button" onClick={() => props.onOpenProduct(app.id)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"><h3>{app.name}</h3></button>)}</div>}
          {matches('AI Giáo viên trợ lý Edu AI Agent') && <button type="button" onClick={() => props.onOpenProduct('chatbot')} className={'mt-3 flex w-full items-center gap-3 rounded-2xl border p-3 text-left ' + tile}><span className="rounded-xl bg-violet-600 p-2.5 text-white"><Sparkles className="h-6 w-6"/></span><div><h3 className="text-sm font-bold">AI Giáo viên</h3><p className={'text-xs ' + subtle}>Trợ lý AI · Soạn và tích hợp kế hoạch giáo dục</p></div><ArrowRight className="ml-auto h-4 w-4"/></button>}
        </section>
        <div className="mt-4"><DeferredFooter {...props} /></div>
        <details className={'mt-3 rounded-xl border p-3 ' + tile}><summary className="cursor-pointer text-sm font-semibold">Gói dịch vụ và bảng giá</summary>        <section id="bang-gia" className="rounded-2xl bg-white py-8 text-slate-900">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mb-14 text-center"><h2 className="mb-4 text-3xl font-bold text-slate-900">Bảng giá linh hoạt</h2><p className="text-slate-600">Trò chơi và công cụ giúp giáo viên trải nghiệm; AI giáo dục có thể nâng cấp theo gói sử dụng.</p></div>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><h3 className="mb-2 text-lg font-semibold">Cơ bản</h3><p className="mb-6 text-sm text-slate-500">Dành cho giáo viên cá nhân</p><div className="mb-6 text-4xl font-bold">Miễn phí</div><ul className="mb-8 space-y-3 text-slate-600"><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Dùng thử các công cụ</li><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Lưu dữ liệu theo tài khoản</li></ul><button onClick={props.onTeacherRegister} className="w-full rounded-xl bg-indigo-50 px-4 py-3 font-medium text-indigo-600 hover:bg-indigo-100">Đăng ký ngay</button></div>
              <div className="relative rounded-3xl border border-indigo-500 bg-indigo-600 p-8 text-white shadow-xl md:-translate-y-3"><div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-1 text-xs font-bold uppercase">Phổ biến</div><h3 className="mb-2 text-lg font-semibold">Chuyên nghiệp</h3><p className="mb-6 text-sm text-indigo-200">AI giáo dục + công cụ nâng cao</p><div className="mb-6"><span className="text-4xl font-bold">499.000đ</span><span className="text-indigo-200">/tháng</span></div><ul className="mb-8 space-y-3 text-indigo-50"><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-indigo-200" />AI Giáo viên</li><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-indigo-200" />Tích hợp NLS, AI, hòa nhập</li></ul><button onClick={props.onTeacherRegister} className="w-full rounded-xl bg-white px-4 py-3 font-medium text-indigo-600 hover:bg-slate-50">Dùng thử</button></div>
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><h3 className="mb-2 text-lg font-semibold">Nhà trường</h3><p className="mb-6 text-sm text-slate-500">Quản trị nhiều giáo viên</p><div className="mb-6 text-4xl font-bold">Liên hệ</div><ul className="mb-8 space-y-3 text-slate-600"><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Quản trị tập trung</li><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Phân quyền và báo cáo</li></ul><button onClick={props.onTeacherRegister} className="w-full rounded-xl bg-indigo-50 px-4 py-3 font-medium text-indigo-600 hover:bg-indigo-100">Nhận báo giá</button></div>
            </div>
          </div>
        </section>
</details>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-500/25 pt-3">
          <button type="button" onClick={openSettings} className={'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ' + tile}><Settings className="h-4 w-4"/>Cá nhân hóa</button>
          {props.onSignOut && <button type="button" onClick={props.onSignOut} className={'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ' + tile}><Power className="h-4 w-4"/>Đăng xuất</button>}
          <span className={'text-xs ' + subtle}>Edu AI · Phiên bản 1.0</span>
        </div>
      </section>}
      {settings && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-3" onClick={() => setSettings(false)}>
        <section role="dialog" aria-label="Cá nhân hóa Edu AI" className={'max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-3xl border p-5 shadow-2xl ' + panel} onClick={event=>event.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Cá nhân hóa</h2><button type="button" aria-label="Đóng cài đặt" onClick={() => setSettings(false)} className={'rounded-xl p-2 ' + tile}><X className="h-5 w-5"/></button></div>
          <p className={'mb-3 text-sm ' + subtle}>Chọn chủ đề cho màn hình chính.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{THEMES.map(t=><button key={t.id} type="button" aria-pressed={prefs.theme === t.id && !prefs.wallpaper} onClick={() => selectTheme(t.id)} className={'overflow-hidden rounded-xl border-2 text-left ' + (prefs.theme === t.id && !prefs.wallpaper ? 'border-indigo-500' : 'border-slate-500/30')}><div className="h-20" style={{background:t.background}}/><div className="px-3 py-2 text-xs font-semibold">{t.name}</div></button>)}</div>
          <h3 className="mb-2 mt-5 text-sm font-bold">Chế độ giao diện</h3>
          <div className="flex gap-2">{(['light','dark'] as const).map(mode=><button type="button" key={mode} aria-pressed={prefs.mode===mode} onClick={()=>changePreferences({...prefs,mode})} className={'flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm '+ (prefs.mode===mode?'border-indigo-500 '+tile:tile)}>{mode==='light'?<Sun className="h-4 w-4"/>:<Moon className="h-4 w-4"/>}{mode==='light'?'Sáng':'Tối'}</button>)}</div>
          <h3 className="mb-2 mt-5 text-sm font-bold">Hình nền của bạn</h3>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{void loadWallpaper(e.target.files?.[0]);e.target.value='';}}/>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"><Image className="h-4 w-4"/>Tải ảnh từ máy</button><button type="button" onClick={()=>{wallpaperRequest.current++;changePreferences(DEFAULT_PREFS)}} className={'rounded-xl border px-4 py-3 text-sm ' + tile}>Khôi phục mặc định</button></div>
          <p className={'mt-3 text-xs ' + subtle}>Tùy chọn lưu trên trình duyệt hiện tại. Không gửi ảnh lên Firebase.</p>
          {notice && <p role="status" className={'mt-2 text-xs ' + subtle}>{notice}</p>}
        </section>
      </div>}
      <footer className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-white/15 bg-slate-950/80 px-3 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-1.5"><button type="button" aria-expanded={start} onClick={()=>{if(start)setStart(false);else openStart()}} className={'flex items-center gap-2 rounded-xl px-3 py-2 font-semibold '+(start?'bg-white/20':'hover:bg-white/10')}><Grid2X2 className="h-5 w-5" style={{color:theme.accent}}/><span>Start</span></button><button type="button" aria-label="Tìm kiếm ứng dụng" onClick={openStart} className="rounded-xl p-2 hover:bg-white/10"><Search className="h-5 w-5"/></button><button type="button" title="Cá nhân hóa" aria-label="Cài đặt giao diện" onClick={openSettings} className="rounded-xl p-2 hover:bg-white/10"><Settings className="h-5 w-5"/></button></div>
        <div className="flex items-center gap-3"><Wifi className={'h-4 w-4 '+(online?'text-emerald-300':'text-slate-500')} aria-label={online?'Có mạng':'Mất mạng'}/><div className="text-right text-xs leading-tight"><div>{clock.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</div><div className="text-slate-300">{clock.toLocaleDateString('vi-VN')}</div></div></div>
      </footer>
    </div>
  );
}
