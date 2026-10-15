import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks } from 'lucide-react';
import { LibraryCard } from './library/LibraryCard';

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
    <LibraryCard id="question-studio" icon={<ListChecks />} onOpen={onOpen} data-question-studio-library-card="true">
      <h3>Trắc nghiệm 10 dạng</h3>
      <p>Tạo ngân hàng 10 dạng câu hỏi trắc nghiệm cơ bản với một Question Engine dùng chung.</p>
    </LibraryCard>,
    target,
  );
}
