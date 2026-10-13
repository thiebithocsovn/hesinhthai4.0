import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange } from 'lucide-react';

function findProductGrid(): HTMLElement | null {
  const section = document.getElementById('san-pham');
  if (!section) return null;
  const grid = section.querySelector('div.grid');
  return grid instanceof HTMLElement ? grid : null;
}

function findApplicationCount(): HTMLElement | null {
  const label = Array.from(document.querySelectorAll('div')).find(element =>
    element.textContent?.trim() === 'Ứng dụng giáo dục',
  );
  const value = label?.previousElementSibling;
  return value instanceof HTMLElement ? value : null;
}

function openSmartTimetable(): void {
  sessionStorage.setItem('currentView', JSON.stringify('smart-timetable'));
  window.location.reload();
}

export default function SmartTimetablePublicPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let countElement: HTMLElement | null = null;
    let originalCount = '';

    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextTarget = findProductGrid();
        setTarget(previous => previous === nextTarget ? previous : nextTarget);

        if (!countElement) {
          countElement = findApplicationCount();
          if (countElement) {
            originalCount = countElement.textContent || '';
            const numericCount = Number(originalCount);
            if (Number.isFinite(numericCount)) countElement.textContent = String(numericCount + 1);
          }
        }
      });
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (countElement && originalCount) countElement.textContent = originalCount;
    };
  }, []);

  if (!target) return null;

  return createPortal(
    <button
      type="button"
      onClick={openSmartTimetable}
      data-smart-timetable-public-card="true"
      className="group flex min-h-60 flex-col rounded-3xl border border-slate-200 bg-white p-7 text-left transition hover:border-indigo-400 hover:shadow-xl"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-lg">
          <CalendarRange className="h-7 w-7" />
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Chạy trên trình duyệt</span>
      </div>
      <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">Quản lý</span>
      <h3 className="mb-3 text-xl font-bold text-slate-900 group-hover:text-indigo-700">Xếp thời khóa biểu thông minh</h3>
      <p className="text-sm leading-6 text-slate-600">
        Bộ xếp lịch liên cấp Tiểu học + THCS với ràng buộc giáo viên, lớp, phòng, giờ bận, khóa tiết, chẩn đoán và xuất Excel.
      </p>
    </button>,
    target,
  );
}
