import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronRight, GraduationCap, LayoutDashboard, Menu, Search, X } from 'lucide-react';
import { TIMETABLE_ADMIN_GROUPS, TIMETABLE_ADMIN_PAGES, TIMETABLE_SETUP_STEPS } from '../lib/timetableNavigation';
import './timetableAdmin.css';

interface Props {
  pageId: string;
  schoolName: string;
  trialMode: boolean;
  onNavigate: (id: string) => void;
  onBack: () => void;
  actions: React.ReactNode;
  children: React.ReactNode;
}

export default function TimetableAdminShell({ pageId, schoolName, trialMode, onNavigate, onBack, actions, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const sidebar = useRef<HTMLElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => { setMobile(media.matches); if (!media.matches) setMenuOpen(false); };
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobile || !menuOpen) return;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLInputElement>('input')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); event.preventDefault(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href]') || [])].filter(el => el.offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
      else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); menuButton.current?.focus(); };
  }, [menuOpen, mobile]);
  const page = TIMETABLE_ADMIN_PAGES.find(item => item.id === pageId) || TIMETABLE_ADMIN_PAGES[0];
  const navigate = (id: string) => { onNavigate(id); setMenuOpen(false); };
  return <div className="tt-admin" data-timetable-admin="true">
    {menuOpen && <button type="button" className="tt-backdrop" onClick={() => setMenuOpen(false)} aria-label="Đóng menu" />}
    <aside ref={sidebar} inert={mobile && !menuOpen} aria-hidden={mobile && !menuOpen ? true : undefined} id="timetable-sidebar" className={`tt-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Điều hướng thời khóa biểu">
      <button type="button" className="tt-close-menu" aria-label="Đóng menu thời khóa biểu" onClick={() => setMenuOpen(false)}><X size={20} /></button>
      <button type="button" className="tt-brand" onClick={() => navigate('overview')}>
        <span className="tt-brand-icon"><CalendarDays size={23} /></span>
        <span><strong>Thời khóa biểu</strong><small>QUẢN LÝ XẾP LỊCH</small></span>
      </button>
      <div className="tt-sidebar-search"><Search size={14} /><input aria-label="Tìm chức năng" placeholder="Tìm chức năng..." value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" onClick={() => setSearch('')} aria-label="Xóa tìm kiếm"><X size={13} /></button>}</div>
      <nav aria-label="Chức năng thời khóa biểu">
        <button type="button" className={`tt-nav-item tt-overview-link ${pageId === 'overview' ? 'is-active' : ''}`} onClick={() => navigate('overview')} aria-current={pageId === 'overview' ? 'page' : undefined}><LayoutDashboard size={15} />Tổng quan</button>
        {TIMETABLE_ADMIN_GROUPS.map((group, index) => {
          const pages = group.pages.filter(item => item.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
          if (!pages.length) return null;
          return <section key={group.title} className="tt-nav-group"><h2><span>{String(index + 1).padStart(2, '0')}</span>{group.title}</h2>
            {pages.map(item => <button type="button" key={item.id} onClick={() => navigate(item.id)} className={`tt-nav-item ${pageId === item.id ? 'is-active' : ''}`} aria-current={pageId === item.id ? 'page' : undefined}><span className="tt-nav-dot" />{item.label}{pageId === item.id && <ChevronRight size={13} />}</button>)}
          </section>;
        })}
      </nav>
      <button type="button" className="tt-ecosystem" onClick={onBack}><ArrowLeft size={15} />Về Hệ sinh thái 4.0</button>
    </aside>
    <div className="tt-main-column" inert={mobile && menuOpen}>
      <header className="tt-topbar">
        <button type="button" ref={menuButton} aria-controls="timetable-sidebar" className="tt-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Mở menu thời khóa biểu" aria-expanded={menuOpen}><Menu size={21} /></button>
        <div className="tt-breadcrumb">Thời khóa biểu <ChevronRight size={13} /><span>{page.label}</span></div>
        <span className="tt-local-status"><i />{trialMode ? 'Dùng thử trên thiết bị' : 'Không gian làm việc'}</span>
      </header>
      <main className="tt-content">
        <section className="tt-school-banner"><div className="tt-school-title"><GraduationCap size={27} /><div><p>PHẦN MỀM XẾP THỜI KHÓA BIỂU</p><h1>{schoolName || 'Cấu hình tên trường'}</h1></div></div><div className="tt-main-actions">{actions}</div></section>
        <section className="tt-workflow" aria-label="Các bước xếp thời khóa biểu"><strong>Quy trình xếp lịch</strong><div>{TIMETABLE_SETUP_STEPS.map((id, index) => {
          const step = TIMETABLE_ADMIN_PAGES.find(item => item.id === id)!;
          const labels = ['Khối', 'Lớp', 'Tiết', 'Môn', 'Giáo viên', 'GVCN', 'Phân công', 'Số tiết', 'Xếp TKB'];
          return <React.Fragment key={id}><button type="button" onClick={() => navigate(id)} className={`${pageId === id ? 'is-active' : ''} ${index === 8 ? 'tt-final-step' : ''}`} aria-current={pageId === id ? 'step' : undefined} title={step.label}><span>{index + 1}</span>{labels[index]}</button>{index < 8 && <ChevronRight size={13} />}</React.Fragment>;
        })}</div></section>
        <div className="tt-page-heading"><div><h2>{page.label}</h2><p>{page.description}</p></div><span className="tt-page-label">Thời khóa biểu</span></div>
        {children}
        <footer className="tt-footer">Thời khóa biểu · Hệ sinh thái giáo dục 4.0</footer>
      </main>
    </div>
  </div>;
}
