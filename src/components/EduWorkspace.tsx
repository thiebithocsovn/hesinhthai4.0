import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { X, Minus, Square, PanelLeft, PanelRight, Monitor, RotateCcw } from 'lucide-react';
import { LEARNING_WALL_URL, type EcosystemApplicationId } from '../ecosystem';

const ExcelMerger = lazy(() => import('./ExcelMerger'));
const PdfMerger = lazy(() => import('./PdfMerger'));
const SecretBoxGame = lazy(() => import('./SecretBoxGame'));
const DragDropGame = lazy(() => import('./DragDropGame'));

export const WINDOW_APPS = ['excel-merger', 'pdf-merger', 'secret-box', 'drag-drop-game', 'learning-wall'] as const;
export type WindowAppId = typeof WINDOW_APPS[number];
export type LauncherId = EcosystemApplicationId | 'smart-timetable';
export function isWindowApp(id: string): id is WindowAppId {
  return (WINDOW_APPS as readonly string[]).includes(id);
}
type Layout = 'normal' | 'maximized' | 'left' | 'right';
export type WorkspaceWindow = { id: WindowAppId; layout: Layout; minimized: boolean; x: number; y: number; width: number; height: number };
const TITLES: Record<WindowAppId, string> = {
  'learning-wall': 'Tường học tập AI',
  'excel-merger': 'Gộp tệp Excel',
  'pdf-merger': 'Tách, gộp file PDF',
  'secret-box': 'Mở ô bí mật',
  'drag-drop-game': 'Kéo thả đúng chỗ',
};
export function openWindow(previous: WorkspaceWindow[], id: WindowAppId): WorkspaceWindow[] {
  const existing = previous.find(item => item.id === id);
  if (existing) return [...previous.filter(item => item.id !== id), { ...existing, minimized: false }];
  const offset = (previous.length % 4) * 3;
  return [...previous, { id, layout: id === 'learning-wall' ? 'maximized' : 'normal', minimized: false, x: 8 + offset, y: 4 + offset, width: 80, height: 86 }];
}
export function useEduWindows() {
  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const open = (id: WindowAppId) => setWindows(previous => openWindow(previous, id));
  const focus = (id: WindowAppId) => setWindows(previous => {
    const item = previous.find(w => w.id === id);
    if (!item || (previous.at(-1)?.id === id && !item.minimized)) return previous;
    return openWindow(previous, id);
  });
  const patch = (id: WindowAppId, values: Partial<Omit<WorkspaceWindow, 'id'>>) =>
    setWindows(previous => previous.map(item => item.id === id ? { ...item, ...values } : item));
  const close = (id: WindowAppId) => {
    if (window.confirm('Đóng ứng dụng? Tệp hoặc hoạt động chưa lưu trong cửa sổ này có thể bị mất.')) {
      setWindows(previous => previous.filter(item => item.id !== id));
    }
  };
  const minimizeAll = () => setWindows(previous => previous.map(item => ({ ...item, minimized: true })));
  return { windows, open, focus, patch, close, minimizeAll };
}

class AppBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <div className="p-6 text-slate-900" role="alert"><h3 className="font-bold">Ứng dụng gặp lỗi</h3><p className="my-3 text-sm">Các cửa sổ khác vẫn hoạt động. Đóng cửa sổ hoặc thử tải lại ứng dụng.</p><button onClick={() => this.setState({ error: false })} className="rounded-lg bg-indigo-600 px-3 py-2 text-white">Thử lại</button></div>;
    return this.props.children;
  }
}

function WindowContent({ id, onBack }: { id: WindowAppId; onBack: () => void }) {
  switch (id) {
    case 'learning-wall': return <iframe title="Tường học tập AI" src={LEARNING_WALL_URL}
      className="block h-full w-full min-h-0 flex-1 border-0 bg-white"
      allow="camera; microphone; clipboard-read; clipboard-write; fullscreen"
      allowFullScreen referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals" />;
    case 'excel-merger': return <ExcelMerger onBack={onBack}/>;
    case 'pdf-merger': return <PdfMerger onBack={onBack}/>;
    case 'secret-box': return <SecretBoxGame onBack={onBack}/>;
    case 'drag-drop-game': return <DragDropGame onBack={onBack}/>;
  }
}

type Controls = ReturnType<typeof useEduWindows>;
export function EduWindowLayer({ controls }: { controls: Controls }) {
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: WindowAppId; pointer: number; sx: number; sy: number; x: number; y: number } | null>(null);
  const resize = useRef<{ id: WindowAppId; pointer: number; sx: number; sy: number; width: number; height: number } | null>(null);
  const [compact, setCompact] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handle = () => setCompact(window.innerWidth < 768);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return <div ref={area} className="pointer-events-none fixed inset-x-0 top-0 md:top-20 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[15]" aria-label="Không gian đa nhiệm">
    {controls.windows.map((item, index) => {
      const maximized = compact || item.layout === 'maximized';
      const style: React.CSSProperties = maximized ? { inset: 0 } : item.layout === 'left' ? { left: 0, top: 0, width: '50%', height: '100%' } : item.layout === 'right' ? { right: 0, top: 0, width: '50%', height: '100%' } : { left: item.x + '%', top: item.y + '%', width: item.width + '%', height: item.height + '%' };
      const active = controls.windows.filter(w => !w.minimized).at(-1)?.id === item.id;
      const button = 'rounded-md p-1.5 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-500';
      return <section key={item.id} data-edu-window={item.id} aria-label={TITLES[item.id]} aria-hidden={item.minimized || undefined} onPointerDown={() => controls.focus(item.id)} onFocusCapture={() => controls.focus(item.id)} style={{ ...style, zIndex: index + 1, display: item.minimized ? 'none' : 'flex' }} className={'pointer-events-auto absolute min-h-0 flex-col overflow-hidden rounded-xl border bg-white text-slate-900 shadow-2xl ' + (active ? 'border-indigo-400' : 'border-slate-300')}>
        <header className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-100 px-2 py-1">
          <div className="flex min-w-0 flex-1 touch-none select-none items-center gap-2 px-1 py-1.5" onDoubleClick={() => controls.patch(item.id, { layout: item.layout === 'maximized' ? 'normal' : 'maximized' })} onPointerDown={event => {
            if (compact || item.layout !== 'normal' || event.button !== 0) return;
            drag.current = { id: item.id, pointer: event.pointerId, sx: event.clientX, sy: event.clientY, x: item.x, y: item.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={event => {
            const d = drag.current;
            if (!d || d.id !== item.id || d.pointer !== event.pointerId || !area.current) return;
            const rect = area.current.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            controls.patch(item.id, { x: Math.max(0, Math.min(100 - item.width, d.x + (event.clientX - d.sx) / rect.width * 100)), y: Math.max(0, Math.min(100 - item.height, d.y + (event.clientY - d.sy) / rect.height * 100)) });
          }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
            <Monitor className="h-4 w-4 shrink-0 text-indigo-600"/><span className="truncate text-xs font-semibold sm:text-sm">{TITLES[item.id]}</span>
          </div>
          {item.id === 'learning-wall' && <a href={LEARNING_WALL_URL} target="_blank" rel="noopener noreferrer" title="Mở riêng nếu trình duyệt chặn phiên đăng nhập nhúng" className="rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">Mở riêng ↗</a>}
          {!compact && <><button type="button" title="Chia nửa trái" aria-label="Chia nửa trái" onClick={() => controls.patch(item.id, { layout: 'left' })} className={button}><PanelLeft className="h-4 w-4"/></button><button type="button" title="Chia nửa phải" aria-label="Chia nửa phải" onClick={() => controls.patch(item.id, { layout: 'right' })} className={button}><PanelRight className="h-4 w-4"/></button></>}
          <button type="button" title="Thu nhỏ" aria-label="Thu nhỏ" onClick={() => controls.patch(item.id, { minimized: true })} className={button}><Minus className="h-4 w-4"/></button>
          {!compact && <button type="button" title="Phóng to hoặc khôi phục" aria-label="Phóng to hoặc khôi phục" onClick={() => controls.patch(item.id, { layout: item.layout === 'maximized' ? 'normal' : 'maximized' })} className={button}>{item.layout === 'maximized' ? <RotateCcw className="h-4 w-4"/> : <Square className="h-4 w-4"/>}</button>}
          <button type="button" title="Đóng cửa sổ" aria-label="Đóng cửa sổ" onClick={() => controls.close(item.id)} className="rounded-md p-1.5 hover:bg-red-600 hover:text-white"><X className="h-4 w-4"/></button>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-auto bg-slate-50" style={{ contain: 'layout paint' }}>
          <AppBoundary><Suspense fallback={<p className="p-6 text-center text-sm text-slate-600">Đang mở ứng dụng…</p>}><WindowContent id={item.id} onBack={() => controls.close(item.id)}/></Suspense></AppBoundary>
        </div>
        {!compact && item.layout === 'normal' && <div aria-hidden="true" title="Kéo để đổi kích thước" className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-nwse-resize touch-none rounded-tl-lg border-l border-t border-slate-300 bg-slate-200" onPointerDown={event => {
          event.preventDefault(); resize.current = { id: item.id, pointer: event.pointerId, sx: event.clientX, sy: event.clientY, width: item.width, height: item.height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={event => {
          const r = resize.current; const rect = area.current?.getBoundingClientRect();
          if (!r || r.id !== item.id || r.pointer !== event.pointerId || !rect?.width || !rect.height) return;
          controls.patch(item.id, { width: Math.max(40, Math.min(100 - item.x, r.width + (event.clientX - r.sx) / rect.width * 100)), height: Math.max(35, Math.min(100 - item.y, r.height + (event.clientY - r.sy) / rect.height * 100)) });
        }} onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }} onLostPointerCapture={() => { resize.current = null; }}/>}
      </section>;
    })}
  </div>;
}
