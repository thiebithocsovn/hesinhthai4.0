import React, { lazy, Suspense, useEffect, useState } from 'react';
import type { EcosystemApplicationId } from '../ecosystem';
import FastLandingPage from './FastLandingPage';

const ProductTrialController = lazy(() => import('./ProductTrialController'));
const QuestionStudioLibraryPortal = lazy(() => import('./QuestionStudioLibraryPortal'));
const SmartTimetableEntry = lazy(() => import('./SmartTimetableEntry'));
const SmartTimetableLibraryPortal = lazy(() => import('./SmartTimetableLibraryPortal'));
const SmartTimetablePublicPortal = lazy(() => import('./SmartTimetablePublicPortal'));

const LEGACY_AI_LABELS: Record<string, string> = {
  'AI Phân tích tâm lý': 'AI Giáo viên',
  'AI Phân tích tâm lý bạo lực học đường': 'AI Giáo viên',
};

function normalizeLegacyAiTextNode(node: Node): void {
  if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue) return;
  const current = node.nodeValue.trim();
  const replacement = LEGACY_AI_LABELS[current];
  if (!replacement) return;
  node.nodeValue = node.nodeValue.replace(current, replacement);
}

function normalizeLegacyAiLabels(root: Node): void {
  normalizeLegacyAiTextNode(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) normalizeLegacyAiTextNode(walker.currentNode);
}

function readStoredView(): string {
  try {
    const saved = sessionStorage.getItem('currentView');
    return saved ? String(JSON.parse(saved) || '') : '';
  } catch {
    return '';
  }
}

function runtimeRequiredImmediately(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has('auth') || params.has('app')) return true;
  const stored = readStoredView();
  return Boolean(stored && stored !== 'landing');
}

function hasFirebaseSessionHint(): boolean {
  try {
    return Object.keys(localStorage).some(key => key.startsWith('firebase:authUser:'));
  } catch {
    return false;
  }
}

function storeView(view: string): void {
  sessionStorage.setItem('currentView', JSON.stringify(view));
}

export default function PlatformBootstrap() {
  const [runtimeActive, setRuntimeActive] = useState(runtimeRequiredImmediately);

  useEffect(() => {
    if (runtimeActive || !hasFirebaseSessionHint()) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const browser = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const inspectSession = async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([
          import('../firebase'),
          import('firebase/auth'),
        ]);
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(auth, user => {
          if (user && !cancelled) setRuntimeActive(true);
        });
      } catch (error) {
        console.info('Không thể khôi phục phiên Firebase trong Fast Landing.', error);
      }
    };

    let idleId: number | undefined;
    let timerId: number | undefined;
    if (browser.requestIdleCallback) idleId = browser.requestIdleCallback(() => void inspectSession(), { timeout: 1800 });
    else timerId = window.setTimeout(() => void inspectSession(), 900);

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (idleId !== undefined) browser.cancelIdleCallback?.(idleId);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [runtimeActive]);

  useEffect(() => {
    if (!runtimeActive || !document.body) return;

    normalizeLegacyAiLabels(document.body);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          normalizeLegacyAiTextNode(mutation.target);
          continue;
        }
        mutation.addedNodes.forEach(normalizeLegacyAiLabels);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [runtimeActive]);

  const activate = (view: string) => {
    storeView(view);
    setRuntimeActive(true);
  };

  const openProduct = (applicationId: EcosystemApplicationId) => {
    if (applicationId === 'exam-manager') {
      const url = new URL(import.meta.env.BASE_URL, window.location.origin);
      url.searchParams.set('auth', 'register');
      window.history.replaceState(window.history.state, '', url.toString());
      activate('landing');
      return;
    }
    activate(applicationId);
  };

  const openAuth = (mode: 'login' | 'register') => {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin);
    url.searchParams.set('auth', mode);
    window.history.replaceState(window.history.state, '', url.toString());
    activate('landing');
  };

  if (runtimeActive && readStoredView() === 'smart-timetable') {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Đang mở bộ xếp thời khóa biểu...</div>}>
        <SmartTimetableEntry />
      </Suspense>
    );
  }

  if (!runtimeActive) {
    return (
      <>
        <FastLandingPage
          onTeacherLogin={() => openAuth('login')}
          onTeacherRegister={() => openAuth('register')}
          onStudentLogin={() => activate('student_exam')}
          onOpenProduct={openProduct}
        />
        <Suspense fallback={null}>
          <SmartTimetablePublicPortal />
        </Suspense>
      </>
    );
  }

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Đang mở chức năng...</div>}>
      <ProductTrialController />
      <QuestionStudioLibraryPortal />
      <SmartTimetableLibraryPortal />
      <SmartTimetablePublicPortal />
    </Suspense>
  );
}
