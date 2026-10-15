import React, { useEffect } from 'react';
import { ArrowRight, CalendarDays, Cloud, MonitorSmartphone, ShieldCheck, Sparkles } from 'lucide-react';
import { LIBRARY_ENTRIES, libraryEntryVisible, useLibraryFilter } from './libraryCatalog';
import { LibraryArt } from './LibraryArt';
import './library.css';

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap';

// Shares the stylesheet link with the Learning Wall, so the font loads once.
export function useLibraryFont(): void {
  useEffect(() => {
    if (typeof document === 'undefined' || document.querySelector('link[data-lw-font]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = FONT_URL; link.dataset.lwFont = 'true';
    document.head.appendChild(link);
  }, []);
}

function FooterIcon({ text }: { text: string }) {
  if (text.includes('đám mây')) return <Cloud size={15} />;
  if (text.includes('trên máy')) return <ShieldCheck size={15} />;
  if (text.includes('AI')) return <Sparkles size={15} />;
  if (text.includes('cài đặt')) return <MonitorSmartphone size={15} />;
  return <CalendarDays size={15} />;
}

type LibraryCardProps = {
  id: keyof typeof LIBRARY_ENTRIES;
  icon: React.ReactNode;
  onOpen: () => void;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'id'>;

export function LibraryCard({ id, icon, onOpen, children, className = '', style, ...rest }: LibraryCardProps) {
  const filter = useLibraryFilter();
  const entry = LIBRARY_ENTRIES[id];
  if (!entry || !libraryEntryVisible(entry, filter)) return null;
  return <button
    type="button"
    {...rest}
    onClick={onOpen}
    className={`lib-card group ${entry.dark ? 'is-dark' : ''} ${className}`}
    style={{ ...style, ['--lib-from' as string]: entry.from, ['--lib-to' as string]: entry.to } as React.CSSProperties}
  >
    <span className="lib-card-hero">
      <span className="lib-card-badge">{entry.badge}</span>
      <span className="lib-card-icon" aria-hidden="true">{icon}</span>
      <span className="lib-card-copy">{children}</span>
      <span className="lib-card-art"><LibraryArt art={entry.art} /></span>
    </span>
    <span className="lib-card-foot">
      <span className="lib-card-meta"><FooterIcon text={entry.footer} />{entry.footer}</span>
      <span className="lib-card-cta">Dùng ngay<ArrowRight size={14} /></span>
    </span>
  </button>;
}
