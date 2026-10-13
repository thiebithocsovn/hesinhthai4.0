function waitForElement<T extends Element>(selector: string, timeout = 3000): Promise<T | null> {
  const current = document.querySelector<T>(selector);
  if (current) return Promise.resolve(current);

  return new Promise(resolve => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const element = document.querySelector<T>(selector);
      if (element) finish(element);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => finish(null), timeout);
  });
}

function findBoardTitleInput(): HTMLInputElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('.lw-modal label'));
  const titleLabel = labels.find(label => label.textContent?.trim().startsWith('Tên bảng'));
  return titleLabel?.querySelector<HTMLInputElement>('input') || null;
}

async function openRenameForm(titleButton: HTMLButtonElement): Promise<void> {
  titleButton.click();
  const settingsButton = await waitForElement<HTMLButtonElement>('.lw-topbar [aria-label="Cài đặt bảng"]');
  if (!settingsButton) return;
  settingsButton.click();

  const modal = await waitForElement<HTMLElement>('.lw-modal');
  if (!modal) return;

  const focusTitle = () => {
    const input = findBoardTitleInput();
    if (!input) return false;
    input.focus();
    input.select();
    return true;
  };

  if (focusTitle()) return;
  const observer = new MutationObserver(() => {
    if (focusTitle()) observer.disconnect();
  });
  observer.observe(modal, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 2500);
}

export function initializeLearningWallDashboardRename(): void {
  if (typeof document === 'undefined') return;

  const enhanceCards = () => {
    document.querySelectorAll<HTMLElement>('.lw-board-card').forEach(card => {
      if (card.querySelector('[data-lw-rename-board="true"]')) return;

      const titleButton = card.querySelector<HTMLButtonElement>('.lw-board-card-title');
      const actionRow = card.querySelector<HTMLElement>('.lw-board-card-body > .lw-row');
      if (!titleButton || !actionRow || titleButton.disabled) return;

      const renameButton = document.createElement('button');
      renameButton.type = 'button';
      renameButton.className = 'lw-button';
      renameButton.dataset.lwRenameBoard = 'true';
      renameButton.title = 'Sửa tên bảng';
      renameButton.setAttribute('aria-label', `Sửa tên bảng ${titleButton.textContent?.trim() || ''}`);
      renameButton.innerHTML = '<span aria-hidden="true">✏️</span>Sửa tên';
      renameButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void openRenameForm(titleButton);
      });

      actionRow.insertBefore(renameButton, actionRow.firstChild);
    });
  };

  const observer = new MutationObserver(enhanceCards);
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceCards();
}
