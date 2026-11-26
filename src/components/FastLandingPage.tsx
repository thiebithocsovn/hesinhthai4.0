import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowRight, Pin, PinOff, Clock3, Monitor, SlidersHorizontal, CalendarRange, Settings, Search, X, Image, Moon, Sun, Grid2X2, Sparkles, Power, Wifi,
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

import { EduWindowLayer, useEduWindows, isWindowApp, type LauncherId } from './EduWorkspace';
import EduAgentDock from './EduAgentDock';
import DesktopShortcuts from './DesktopShortcuts';
import { readDesktopPositions, type DesktopPositions } from '../lib/desktopLayout';
import './edu-fluent-start.css';

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
  account: { name: string; school?: string; email?: string };
  onSignOut?: () => void;
  workspaceKey?: string;
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
const DEFAULT_PREFS: Preferences = { theme: 'ocean', mode: 'light', wallpaper: '' };
const PREF_KEY = 'edu-ai-desktop-preferences-v1';
function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return {
      theme: THEMES.some(t => t.id === value.theme) ? value.theme : DEFAULT_PREFS.theme,
      mode: value.mode === 'dark' ? 'dark' : 'light',
      wallpaper: typeof value.wallpaper === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.wallpaper) && value.wallpaper.length < 2000000 ? value.wallpaper : '',
    };
  } catch { return DEFAULT_PREFS; }
}
const DEFAULT_PINS: LauncherId[] = ['learning-wall', 'exam-manager', 'chatbot', 'smart-timetable', 'gesture-class', 'plicker', 'question-studio', 'kpi-manager', 'excel-merger', 'pdf-merger', 'secret-box', 'drag-drop-game', 'lucky-draw', 'lucky-draw-cards', 'head-shake-game'];
const APP_GRADIENTS: Record<LauncherId, string> = {
  'learning-wall': 'linear-gradient(145deg,#8b8cf8,#4f46e5)', 'exam-manager':'linear-gradient(145deg,#38bdf8,#2563eb)', chatbot:'linear-gradient(145deg,#c084fc,#6d28d9)', 'smart-timetable':'linear-gradient(145deg,#2dd4bf,#0e7490)', 'gesture-class':'linear-gradient(145deg,#38bdf8,#0284c7)', plicker:'linear-gradient(145deg,#60a5fa,#1d4ed8)', 'question-studio':'linear-gradient(145deg,#a78bfa,#4338ca)', 'kpi-manager':'linear-gradient(145deg,#34d399,#047857)', 'excel-merger':'linear-gradient(145deg,#22c55e,#166534)', 'pdf-merger':'linear-gradient(145deg,#fb923c,#dc2626)', 'secret-box':'linear-gradient(145deg,#fbbf24,#a8550b)', 'drag-drop-game':'linear-gradient(145deg,#60a5fa,#4338ca)', 'lucky-draw':'linear-gradient(145deg,#fbbf24,#ea580c)', 'lucky-draw-cards':'linear-gradient(145deg,#e879f9,#7c3aed)', 'head-shake-game':'linear-gradient(145deg,#fb7185,#db2777)',
};
function validLauncher(value: unknown): value is LauncherId {
  return value === 'smart-timetable' || ECOSYSTEM_APPLICATIONS.some(app => app.id === value);
}
function readLauncherList(key: string, fallback: LauncherId[]): LauncherId[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? [...new Set(value.filter(validLauncher))].slice(0, 15) : fallback;
  } catch { return fallback; }
}
function saveLauncherList(key: string, value: LauncherId[]) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* browser storage can be unavailable */ }
}
const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

export default function FastLandingPage(props: FastLandingPageProps) {
  const [prefs, setPrefs] = useState(readPreferences);
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const [start, setStart] = useState(false);
  const workspace = useEduWindows();
  const personalKey = 'edu-ai-launcher-v2:' + (props.workspaceKey || 'guest');
  const [pins, setPins] = useState<LauncherId[]>(() => readLauncherList(personalKey + ':pins', DEFAULT_PINS));
  const desktopLayoutKey = personalKey + ':desktop-layout-v1';
  const [desktopPositions,setDesktopPositions] = useState<DesktopPositions>(()=>{try{return readDesktopPositions(window.localStorage,desktopLayoutKey);}catch{return {};}});
  const updateDesktopPositions = (next:DesktopPositions) => {
    setDesktopPositions(next);
    try { localStorage.setItem(desktopLayoutKey,JSON.stringify(next)); }
    catch { setNotice('Đã đổi vị trí, nhưng trình duyệt chưa lưu được bố cục.'); }
  };
  const [recent, setRecent] = useState<LauncherId[]>(() => readLauncherList(personalKey + ':recent', []));
  const [pinMode, setPinMode] = useState(false);
  const [tasks, setTasks] = useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('all');
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState('');
  const [allApps, setAllApps] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const startButtonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLElement>(null);
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
  const fluentTheme = light ? 'edu-fluent-light' : 'edu-fluent-dark';
  const matches = (name: string) => normalize(name).includes(searchTerm);
  const openTimetable = () => {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin);
    url.searchParams.set('app', 'smart-timetable');
    window.location.assign(url.toString());
  };
  const openStart = () => { setSettings(false); setTasks(false); setStart(true); setQuery(''); setCategory('all'); setPinMode(false); setAllApps(false); setInfoOpen(false); };
  const closeStart = () => { setStart(false); startButtonRef.current?.focus({ preventScroll:true }); };
  const labelFor = (id: LauncherId) => id === 'smart-timetable' ? 'Thời khóa biểu' : catalog.find(app => app.id === id)?.name || id;
  const iconFor = (id: LauncherId) => id === 'smart-timetable' ? CalendarRange : PRODUCT_ICONS[id];
  const visibleIds = (allApps || searchTerm || pinMode ? DEFAULT_PINS : pins).filter(id => {
    const app = catalog.find(item => item.id === id);
    const dep = id === 'smart-timetable' ? 'firebase' : app?.dependency || '';
    return (category === 'all' || dep === category || (category === 'ai' && (dep.includes('ai') || id === 'chatbot'))) && matches(labelFor(id) + ' ' + (app?.description || '') + (id === 'smart-timetable' ? ' xep lich giao vien tkb' : ''));
  });
  const renderAppIcon = (id: LauncherId, size = 23) => { const Icon = iconFor(id); return <span className="edu-app-icon" style={{ background: APP_GRADIENTS[id] }}><Icon size={size} strokeWidth={1.8}/></span>; };
  const openAgent = () => { setStart(false); setTasks(false); setSettings(false); window.dispatchEvent(new Event('edu-ai:open-agent')); };
  const togglePin = (id: LauncherId) => {
    const next = pins.includes(id) ? pins.filter(pin => pin !== id) : [...pins, id];
    setPins(next); saveLauncherList(personalKey + ':pins', next);
  };
  const launch = (id: LauncherId) => {
    const windowed = Boolean(props.account && isWindowApp(id));
    if (!windowed && workspace.windows.length && !window.confirm('Chuyển sang ứng dụng toàn màn hình sẽ đóng các cửa sổ hiện tại. Hãy lưu hoặc tải xuống công việc trước khi tiếp tục.')) return;
    const next = [id, ...recent.filter(item => item !== id)].slice(0, 6);
    setRecent(next); saveLauncherList(personalKey + ':recent', next);
    setStart(false); setTasks(false);
    if (windowed && isWindowApp(id)) { workspace.open(id); return; }
    if (id === 'smart-timetable') openTimetable(); else props.onOpenProduct(id);
  };
  const openTasks = () => { setStart(false); setSettings(false); setTasks(value => !value); };
  useEffect(() => { if (!start) return; const frame = requestAnimationFrame(() => { if (window.matchMedia('(pointer:fine)').matches) searchRef.current?.focus({ preventScroll: true }); else menuRef.current?.focus({ preventScroll: true }); }); return () => cancelAnimationFrame(frame); }, [start]);
  const openSettings = () => { setStart(false); setTasks(false); setSettings(true); };
  const changePreferences = (next: Preferences) => {
    prefsRef.current = next;
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
      changePreferences({ ...prefsRef.current, wallpaper });
    } catch { if (request === wallpaperRequest.current) setNotice('Không đọc được ảnh này. Hãy chọn ảnh khác.'); }
    finally { URL.revokeObjectURL(url); }
  };
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    const update = () => setOnline(navigator.onLine);
    const esc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (menuRef.current?.dataset.open === 'true') startButtonRef.current?.focus({ preventScroll: true }); setStart(false); setSettings(false); setTasks(false); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSettings(false); setTasks(false); setStart(true); setQuery(''); setCategory('all'); setAllApps(false); setPinMode(false); setInfoOpen(false);
      }
    };
    window.addEventListener('online', update); window.addEventListener('offline', update); window.addEventListener('keydown', esc);
    return () => { window.clearInterval(timer); window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('keydown', esc); wallpaperRequest.current++; };
  }, []);
  useEffect(() => {
    if (!workspace.windows.length) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [workspace.windows.length]);
  const confirmNavigation = (callback: () => void) => () => {
    if (!workspace.windows.length || window.confirm('Các cửa sổ đang mở sẽ đóng. Bạn đã lưu công việc chưa?')) callback();
  };
  const background = prefs.wallpaper ? 'linear-gradient(135deg, rgba(0,0,0,.40), rgba(0,0,0,.32)), url("' + prefs.wallpaper + '") center / cover' : theme.background;

  return (
    <div data-edu-ai-desktop="true" className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans text-white" style={{ background, backgroundAttachment: 'fixed' }}>
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/35 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-white/15 p-2.5"><BookOpen className="h-6 w-6" style={{color:theme.accent}} /></div><div><div className="text-xl font-black tracking-tight">Edu AI</div><div className="text-[10px] uppercase tracking-[.2em] text-white/70">Education AI OS</div></div></div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={confirmNavigation(props.onStudentLogin)} className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20">Học sinh</button>
          <button type="button" onClick={confirmNavigation(props.onTeacherLogin)} className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20">Thư viện giáo viên</button>

          {props.onSignOut && <button type="button" onClick={confirmNavigation(props.onSignOut)} title="Đăng xuất" aria-label="Đăng xuất" className="rounded-lg bg-white/10 p-2 hover:bg-white/20"><Power className="h-5 w-5"/></button>}
          <button type="button" aria-label="Cá nhân hóa" title="Cá nhân hóa" onClick={openSettings} className="rounded-lg bg-white/10 p-2 hover:bg-white/20"><Settings className="h-5 w-5"/></button>
        </div>
      </header>
      <main aria-label="Màn hình nền Edu AI" className="edu-desktop-surface relative flex flex-1 items-start px-3 pb-24 pt-4 sm:px-5">
        <h1 className="sr-only">Màn hình nền Edu AI</h1>
        <DesktopShortcuts pins={pins} positions={desktopPositions} onPositions={updateDesktopPositions} launch={launch} labelFor={labelFor} renderIcon={id=>renderAppIcon(id,25)}/>
      </main>
      {props.account && <EduWindowLayer controls={workspace}/>}
      <EduAgentDock desktop context={workspace.windows.filter(w => !w.minimized).at(-1)?.id || 'desktop'} uid={props.account ? props.workspaceKey : undefined} onLaunch={props.account ? launch : undefined}/>
      <div data-open={start} className="edu-start-scrim" onClick={closeStart} aria-hidden="true"/>
      <section ref={menuRef} tabIndex={-1} id="edu-start-menu" aria-label="Start Menu Edu AI" aria-hidden={!start} inert={!start} data-open={start} className={'edu-start-menu '+fluentTheme}>
        <div className="edu-start-head">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg"><BookOpen className="h-6 w-6"/></div>
            <div className="min-w-0 flex-1"><h2 className="text-xl font-extrabold tracking-tight">Edu AI</h2><p className="edu-fluent-muted text-xs">Education Operating System</p></div>
            <button type="button" aria-label="Đóng Start" onClick={closeStart} className="edu-fluent-button p-2"><X className="h-5 w-5"/></button>
          </div>
          <label className="edu-start-search">
            <Search className="edu-fluent-muted h-5 w-5 shrink-0"/>
            <input ref={searchRef} aria-label="Tìm ứng dụng" placeholder="Tìm ứng dụng, AI Agent..." value={query} onChange={event=>{setQuery(event.target.value);setCategory('all');}} onKeyDown={event=>{if(event.key==='Enter' && visibleIds.length===1 && !pinMode){event.preventDefault();launch(visibleIds[0]);}}}/>
            {query ? <button type="button" aria-label="Xóa tìm kiếm" onClick={()=>{setQuery('');setCategory('all');searchRef.current?.focus();}} className="edu-fluent-button p-1"><X className="h-4 w-4"/></button> : <Sparkles className="h-5 w-5 text-indigo-500"/>}
          </label>
        </div>
        <div className="edu-start-body">
          <section aria-label="Danh mục ứng dụng">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">{searchTerm ? <Search className="h-4 w-4"/> : allApps || pinMode ? <Grid2X2 className="h-4 w-4"/> : <Pin className="h-4 w-4"/>}{searchTerm ? 'Kết quả tìm kiếm' : allApps || pinMode ? 'Tất cả ứng dụng' : 'Ứng dụng đã ghim'}</h3>
              <div className="flex items-center gap-1">
                <button type="button" aria-pressed={pinMode} onClick={()=>{setPinMode(value=>!value);setCategory('all');setQuery('');}} className="edu-fluent-button flex items-center gap-1 px-2 py-1.5 text-xs"><Pin className="h-3.5 w-3.5"/>{pinMode?'Hoàn tất':'Ghim'}</button>
                <button type="button" onClick={()=>{setAllApps(value=>!value);setPinMode(false);setCategory('all');setQuery('');}} className="edu-fluent-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold">{allApps?'Quay lại':'Tất cả ứng dụng'}<ArrowRight className={'h-3.5 w-3.5 '+(allApps?'rotate-180':'')}/></button>
              </div>
            </div>
            {(allApps || pinMode || searchTerm) && <div className="mb-3 flex flex-wrap gap-1.5">{[{id:'all',name:'Tất cả'},{id:'browser',name:'Trên máy'},{id:'firebase',name:'Đám mây'},{id:'ai',name:'AI'}].map(c=><button key={c.id} type="button" aria-pressed={category===c.id} onClick={()=>setCategory(c.id)} className={'edu-fluent-button px-2.5 py-1.5 text-xs '+(category===c.id?'bg-indigo-600 text-white':'edu-fluent-muted')}>{c.name}</button>)}</div>}
            {pinMode && <p className="edu-fluent-muted mb-2 text-xs">Chọn biểu tượng để ghim hoặc bỏ ghim trên trình duyệt này.</p>}
            <div className="edu-app-grid">
              {visibleIds.map(id=><button key={id} type="button" data-edu-launch={id} data-edu-pin-mode={pinMode?'true':undefined} aria-pressed={pinMode?pins.includes(id):undefined} title={labelFor(id)} onClick={()=>pinMode?togglePin(id):launch(id)} className="edu-app-tile edu-fluent-button">
                {renderAppIcon(id)}<span className="edu-app-label">{labelFor(id)}</span>
                {pinMode&&<span className={'absolute right-1 top-1 rounded-full p-1 text-white '+(pins.includes(id)?'bg-indigo-600':'bg-slate-500')}>{pins.includes(id)?<CheckCircle2 className="h-3 w-3"/>:<Pin className="h-3 w-3"/>}</span>}
              </button>)}
            </div>
            {!visibleIds.length && <p className="edu-fluent-muted py-5 text-center text-sm">{searchTerm?'Không tìm thấy ứng dụng phù hợp.':'Chưa có ứng dụng đã ghim. Chọn Tất cả ứng dụng để thêm.'}</p>}
          </section>
          {!pinMode && !searchTerm && !allApps && <div className="mt-4 grid gap-3 sm:grid-cols-[1.25fr_1fr]">
            <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Clock3 className="h-4 w-4"/>Mở gần đây</h3>
              {recent.length ? <div className="space-y-1">{recent.slice(0,3).map(id=>{const Icon=iconFor(id);return <button key={id} type="button" data-edu-launch={id} onClick={()=>launch(id)} className="edu-fluent-button flex w-full items-center gap-2 p-2 text-left"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{background:APP_GRADIENTS[id]}}><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{labelFor(id)}</span><span className="edu-fluent-muted block text-[10px]">Ứng dụng gần đây</span></span><ArrowRight className="h-3.5 w-3.5 shrink-0"/></button>})}</div>:<p className="edu-fluent-muted p-2 text-xs leading-5">Ứng dụng bạn mở sẽ xuất hiện tại đây.</p>}
            </section>
            <section className="edu-start-agent flex flex-col justify-between gap-2">
              <div className="flex items-center gap-2"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white shadow-md"><Brain className="h-6 w-6"/></div><div><h3 className="text-sm font-bold">Edu AI Agent</h3><p className="edu-fluent-muted text-[11px]">6 vai trò hỗ trợ chuyên môn</p></div></div>
              <button type="button" onClick={openAgent} className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"><Sparkles className="h-4 w-4"/>Mở trợ lý AI<ArrowRight className="h-3.5 w-3.5"/></button>
            </section>
          </div>}
          {!pinMode && searchTerm && matches('Edu AI Agent điều phối trợ lý') && <button type="button" onClick={openAgent} className="edu-fluent-button mt-3 flex w-full items-center gap-2 p-2 text-left text-sm"><Brain className="h-5 w-5 text-indigo-500"/>Edu AI Agent<ArrowRight className="ml-auto h-4 w-4"/></button>}
          {!searchTerm && !pinMode && !allApps && <div className="mt-3"><button type="button" aria-expanded={infoOpen} onClick={()=>setInfoOpen(value=>!value)} className="edu-fluent-button edu-fluent-muted px-2 py-1.5 text-xs">{infoOpen?'Thu gọn thông tin hệ thống':'Thông tin hệ thống và cài đặt ứng dụng'}</button>{infoOpen&&<DeferredFooter {...props}/>}</div>}
        </div>
        <div className="edu-start-profile flex items-center gap-2">
          <button type="button" onClick={confirmNavigation(props.onTeacherLogin)} title="Thư viện giáo viên" className="edu-fluent-button flex min-w-0 flex-1 items-center gap-2 p-1 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-500 text-white"><User className="h-5 w-5"/></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{props.account.name}</span><span className="edu-fluent-muted block truncate text-[11px]">{props.account.school || props.account.email || 'Tài khoản giáo viên'}</span></span>
          </button>
          <button type="button" title="Cài đặt" aria-label="Cài đặt Start" onClick={openSettings} className="edu-fluent-button p-2.5"><Settings className="h-5 w-5"/></button>
          {props.onSignOut&&<button type="button" title="Đăng xuất" aria-label="Đăng xuất khỏi Edu AI" onClick={confirmNavigation(props.onSignOut)} className="edu-fluent-button p-2.5"><Power className="h-5 w-5"/></button>}
        </div>
      </section>
      {tasks && <><div className="fixed inset-0 z-20 bg-black/25" onClick={()=>setTasks(false)} aria-hidden="true"/><section aria-label="Ứng dụng đang mở" className={'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-2 z-30 w-[min(94vw,420px)] rounded-2xl border p-4 shadow-2xl '+panel}>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Không gian đa nhiệm</h2><button aria-label="Đóng danh sách tác vụ" type="button" onClick={()=>setTasks(false)} className={'rounded-lg p-2 '+tile}><X className="h-4 w-4"/></button></div>
        {!workspace.windows.length && <p className={'text-sm '+subtle}>{props.account?'Chưa có cửa sổ đang mở. Mở Excel, PDF, Ô bí mật hoặc Kéo thả từ Start.':'Đăng nhập tài khoản giáo viên đã được cấp quyền để sử dụng cửa sổ đa nhiệm.'}</p>}
        {workspace.windows.map(w=>{const Icon=iconFor(w.id);return <div key={w.id} className={'mb-2 flex items-center gap-2 rounded-xl border p-2 '+tile}><Icon className="h-5 w-5"/><button type="button" className="flex-1 text-left text-sm" onClick={()=>{workspace.focus(w.id);setTasks(false);}}>{labelFor(w.id)}<span className={'block text-[10px] '+subtle}>{w.minimized?'Đã thu nhỏ':'Đang mở'}</span></button><button type="button" aria-label={'Đóng '+labelFor(w.id)} onClick={()=>workspace.close(w.id)} className="rounded p-1 hover:bg-red-600 hover:text-white"><X className="h-4 w-4"/></button></div>;})}
        {!!workspace.windows.length && <button type="button" className={'mt-2 w-full rounded-lg border px-3 py-2 text-xs '+tile} onClick={()=>{workspace.minimizeAll();setTasks(false);}}>Hiện màn hình Desktop</button>}
      </section></>}
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
          <h3 className="mb-2 mt-5 text-sm font-bold">Bố cục biểu tượng Desktop</h3>
          <p className={'mb-2 text-xs '+subtle}>Kéo thả biểu tượng hoặc dùng Alt + phím mũi tên. Vị trí được lưu theo tài khoản trên trình duyệt này.</p>
          <button type="button" onClick={()=>{updateDesktopPositions({});setNotice('Đã khôi phục bố cục biểu tượng mặc định.');}} className={'rounded-xl border px-4 py-2.5 text-sm '+tile}>Sắp xếp lại biểu tượng mặc định</button>
          <p className={'mt-3 text-xs ' + subtle}>Tùy chọn lưu trên trình duyệt hiện tại. Không gửi ảnh lên Firebase.</p>
          {notice && <p role="status" className={'mt-2 text-xs ' + subtle}>{notice}</p>}
        </section>
      </div>}
      <footer className={'edu-fluent-taskbar '+fluentTheme}>
        <div className="hidden sm:flex items-center gap-1"><button type="button" aria-label="Hiện Desktop" title="Hiện Desktop" onClick={()=>{setStart(false);setTasks(false);setSettings(false);workspace.minimizeAll();}} className="edu-task-icon"><Monitor className="h-4 w-4"/></button></div>
        <div className="edu-task-apps mx-auto">
          <button ref={startButtonRef} type="button" aria-label="Start" aria-controls="edu-start-menu" aria-expanded={start} onClick={()=>start?closeStart():openStart()} title="Start" className="edu-task-icon"><span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm"><Grid2X2 className="h-5 w-5"/></span></button>
          <button type="button" aria-label="Tìm kiếm ứng dụng" title="Tìm kiếm (Ctrl+K)" onClick={openStart} className="edu-task-icon"><Search className="h-5 w-5"/></button>
          <button type="button" aria-label="Ứng dụng đang mở" title="Đa nhiệm" aria-expanded={tasks} onClick={openTasks} className="edu-task-icon"><Layers className="h-5 w-5"/>{workspace.windows.length>0&&<span className="absolute -right-0.5 -top-0.5 rounded-full bg-indigo-600 px-1 text-[9px] text-white">{workspace.windows.length}</span>}</button>
          <button type="button" aria-label="Mở AI Agent" title="Edu AI Agent" onClick={openAgent} className="edu-task-icon"><Brain className="h-5 w-5 text-indigo-500"/></button>
          {workspace.windows.map(w=>{const Icon=iconFor(w.id);return <button type="button" key={w.id} title={labelFor(w.id)} aria-label={labelFor(w.id)} onClick={()=>{setStart(false);setTasks(false);workspace.focus(w.id);}} className="edu-task-icon"><span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{background:APP_GRADIENTS[w.id]}}><Icon className="h-4 w-4"/></span><span className={'absolute bottom-0 h-0.5 rounded-full '+(w.minimized?'w-2 bg-slate-400':'w-4 bg-indigo-500')}/></button>})}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" aria-label="Cài đặt giao diện" title="Cá nhân hóa" onClick={openSettings} className="edu-task-icon hidden sm:grid"><Settings className="h-4 w-4"/></button>
          <Wifi className={'h-4 w-4 shrink-0 '+(online?'text-emerald-600':'text-slate-500')} aria-label={online?'Có mạng':'Mất mạng'}/>
          <div className="text-right text-xs leading-tight"><div>{clock.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</div><div className="edu-fluent-muted hidden sm:block">{clock.toLocaleDateString('vi-VN')}</div></div>
        </div>
      </footer>
    </div>
  );
}
