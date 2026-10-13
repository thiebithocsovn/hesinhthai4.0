import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange } from 'lucide-react';

function findLibraryGrid(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll('h1')).find(element =>
    element.textContent?.trim() === 'Thư viện tương tác',
  );
  if (!heading) return null;
  const header = heading.closest('header');
  const content = header?.nextElementSibling;
  if (!(content instanceof HTMLElement)) return null;
  const grid = content.querySelector('div.grid');
  return grid instanceof HTMLElement ? grid : null;
}

function openSmartTimetable(): void {
  sessionStorage.setItem('currentView', JSON.stringify('smart-timetable'));
  window.location.reload();
}

export default function SmartTimetableLibraryPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextTarget = findLibraryGrid();
        setTarget(previous => previous === nextTarget ? previous : nextTarget);
      });
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!target) return null;

  return createPortal(
    <button
      type="button"
      onClick={openSmartTimetable}
      data-smart-timetable-library-card="true"
      className="group rounded-2xl border border-indigo-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md md:p-6"
    >
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 transition-transform group-hover:scale-110 md:mb-4 md:h-12 md:w-12">
        <CalendarRange className="h-5 w-5 md:h-6 md:w-6" />
      </div>
      <h3 className="mb-1 text-sm font-bold text-slate-800 md:mb-2 md:text-lg">Xếp thời khóa biểu thông minh</h3>
      <p className="line-clamp-2 text-[10px] text-slate-500 md:text-sm">
        Xếp lịch liên cấp Tiểu học + THCS, kiểm soát trùng giáo viên, phòng học, giờ bận và khóa tiết.
      </p>
    </button>,
    target,
  );
}
