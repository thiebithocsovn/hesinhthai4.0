import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks } from 'lucide-react';

interface QuestionStudioLibraryPortalProps {
  onOpen?: () => void;
}

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

function openQuestionStudio(): void {
  sessionStorage.setItem('currentView', JSON.stringify('question-studio'));
  window.location.reload();
}

export default function QuestionStudioLibraryPortal({ onOpen = openQuestionStudio }: QuestionStudioLibraryPortalProps) {
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
      onClick={onOpen}
      data-question-studio-library-card="true"
      className="group rounded-2xl border border-violet-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md md:p-6"
    >
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600 transition-transform group-hover:scale-110 md:mb-4 md:h-12 md:w-12">
        <ListChecks className="h-5 w-5 md:h-6 md:w-6" />
      </div>
      <h3 className="mb-1 text-sm font-bold text-slate-800 md:mb-2 md:text-lg">Trắc nghiệm 10 dạng</h3>
      <p className="line-clamp-2 text-[10px] text-slate-500 md:text-sm">
        Tạo ngân hàng 10 dạng câu hỏi trắc nghiệm cơ bản với một Question Engine dùng chung.
      </p>
    </button>,
    target,
  );
}
