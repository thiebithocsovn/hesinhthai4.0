export type PlickerSection = 'overview' | 'classes' | 'library' | 'session' | 'reports' | 'cards';

type InstallChoice = 'accepted' | 'dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: InstallChoice; platform: string }>;
}

export const PWA_INSTALL_STATE_EVENT = 'smartclass:pwa-install-state';

const PLICKER_SECTIONS: readonly PlickerSection[] = [
  'overview', 'classes', 'library', 'session', 'reports', 'cards',
];

let installPrompt: BeforeInstallPromptEvent | null = null;
let listenersInitialized = false;

export function readRequestedApplication(search: string): 'plicker' | null {
  return new URLSearchParams(search).get('app') === 'plicker' ? 'plicker' : null;
}

export function readRequestedPlickerSection(search: string): PlickerSection | null {
  if (readRequestedApplication(search) !== 'plicker') return null;
  const section = new URLSearchParams(search).get('section');
  return PLICKER_SECTIONS.find(candidate => candidate === section) || null;
}

export function createPlickerLaunchPath(baseUrl: string, section?: PlickerSection): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const query = new URLSearchParams({ app: 'plicker' });
  if (section) query.set('section', section);
  return `${normalizedBase}?${query.toString()}`;
}

export function selectApplicationManifest(
  application: 'ecosystem' | 'plicker',
  baseUrl: string,
): void {
  if (typeof document === 'undefined') return;
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) return;

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  manifest.href = `${normalizedBase}${application === 'plicker' ? 'plicker' : 'smartclass'}.webmanifest`;
}

export function getPwaInstallationInstructions(userAgent: string): string {
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return 'Mở bằng Safari, nhấn nút Chia sẻ và chọn “Thêm vào Màn hình chính”.';
  }
  if (/android/i.test(userAgent)) {
    return 'Mở bằng Chrome, nhấn biểu tượng ⋮ và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.';
  }
  return 'Mở menu trình duyệt và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.';
}

export function isInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    appleNavigator.standalone ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches,
  );
}

export function hasPwaInstallationPrompt(): boolean {
  return installPrompt !== null;
}

function announceInstallationState(): void {
  window.dispatchEvent(new Event(PWA_INSTALL_STATE_EVENT));
}

export function initializePwaInstallation(): void {
  if (typeof window === 'undefined' || listenersInitialized) return;
  listenersInitialized = true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    announceInstallationState();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    announceInstallationState();
  });
}

export async function promptPwaInstallation(): Promise<InstallChoice | 'unavailable'> {
  if (!installPrompt) return 'unavailable';
  const pendingPrompt = installPrompt;
  installPrompt = null;
  announceInstallationState();

  try {
    await pendingPrompt.prompt();
    const choice = await pendingPrompt.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

export function registerClassroomServiceWorker(baseUrl: string): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const register = () => {
    void navigator.serviceWorker
      .register(`${normalizedBase}service-worker.js`, { scope: normalizedBase })
      .catch(error => console.error('Không thể kích hoạt chế độ ứng dụng lớp học:', error));
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
