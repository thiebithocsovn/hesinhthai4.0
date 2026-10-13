import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PlatformBootstrap from './components/PlatformBootstrap';
import './index.css';
import { resolveApiUrl } from './lib/api';
import { initializeLearningWallDashboardRename } from './lib/learningWallDashboardRename';
import { initializePwaInstallation, registerClassroomServiceWorker } from './lib/plickerPwa';

initializePwaInstallation();

function deferHeadShakeReporting(): void {
  const loadReporting = () => {
    void import('./lib/headShakeReportController')
      .then(module => module.initializeHeadShakeReporting())
      .catch(error => console.info('Chưa thể khởi tạo báo cáo trò chơi lắc đầu.', error));
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(loadReporting, { timeout: 5000 });
  } else {
    window.setTimeout(loadReporting, 2500);
  }
}

deferHeadShakeReporting();

if (import.meta.env.PROD) {
  registerClassroomServiceWorker(import.meta.env.BASE_URL);
}

// Prevent library conflict with window.fetch (e.g. Mediapipe/TFLite)
(function() {
  if (!window.fetch) return;
  const nativeFetch = window.fetch.bind(window);
  const originalFetch: typeof window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return nativeFetch(resolveApiUrl(input.slice('/api/'.length)), init);
    }
    return nativeFetch(input, init);
  };

  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (descriptor && descriptor.configurable) {
      Object.defineProperty(window, 'fetch', {
        get: () => originalFetch,
        set: () => {
          console.warn('Attempt to overwrite window.fetch blocked.');
        },
        configurable: false,
      });
    }
  } catch {
    // Already locked or restricted.
  }
})();

const originalInfo = console.info;
console.info = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Created TensorFlow Lite XNNPACK delegate for CPU')) return;
  originalInfo(...args);
};

const originalLog = console.log;
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Created TensorFlow Lite XNNPACK delegate for CPU')) return;
  originalLog(...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformBootstrap />
  </StrictMode>,
);

initializeLearningWallDashboardRename();
