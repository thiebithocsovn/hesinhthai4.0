import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange } from 'lucide-react';
import { LibraryCard } from './library/LibraryCard';

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
    <LibraryCard id="smart-timetable" icon={<CalendarRange />} onOpen={openSmartTimetable} data-smart-timetable-library-card="true">
      <h3>Xếp thời khóa biểu thông minh</h3>
      <p>Xếp lịch liên cấp Tiểu học + THCS, kiểm soát trùng giáo viên, phòng học, giờ bận và khóa tiết.</p>
    </LibraryCard>,
    target,
  );
}
