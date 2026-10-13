import React, { lazy, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import App from '../App';
import { auth } from '../firebase';
import { ECOSYSTEM_APPLICATIONS, type EcosystemApplicationId } from '../ecosystem';
import { assignPlickerCardIds, removePlickerStudent, renamePlickerStudent } from '../lib/plickerStudents';
import TrialAccessGate from './TrialAccessGate';

const PlickerClassroom = lazy(() => import('./PlickerClassroom'));

const TRIAL_ACTIVE_APPLICATION_KEY = 'smartclass_trial_active_application_v1';
const GUEST_PLICKER_CLASSES_KEY = 'smartclass_trial_plicker_classes_v1';
const GUEST_PLICKER_STUDENTS_KEY = 'smartclass_trial_plicker_students_v1';

type TrialApplicationId = Exclude<EcosystemApplicationId, 'exam-manager'>;

interface GuestPlickerClass {
  id: string;
  title: string;
  authorId?: string;
}

interface GuestPlickerStudent {
  id: string;
  classId: string;
  name: string;
  cardId?: number;
}

const PRODUCT_NAME_TO_ID = new Map(
  ECOSYSTEM_APPLICATIONS.map(application => [application.name, application.id] as const),
);

function readStoredApplication(): TrialApplicationId | null {
  try {
    const explicitTrial = sessionStorage.getItem(TRIAL_ACTIVE_APPLICATION_KEY) as EcosystemApplicationId | null;
    if (explicitTrial && explicitTrial !== 'exam-manager' && ECOSYSTEM_APPLICATIONS.some(item => item.id === explicitTrial)) {
      return explicitTrial;
    }

    const savedView = sessionStorage.getItem('currentView');
    const parsed = savedView ? JSON.parse(savedView) as EcosystemApplicationId : null;
    if (parsed && parsed !== 'exam-manager' && ECOSYSTEM_APPLICATIONS.some(item => item.id === parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

function findProductId(target: EventTarget | null): EcosystemApplicationId | null {
  if (!(target instanceof Element)) return null;
  const card = target.closest('button');
  if (!card) return null;
  const title = card.querySelector('h3')?.textContent?.trim();
  return title ? PRODUCT_NAME_TO_ID.get(title) || null : null;
}

function goToLanding(): void {
  sessionStorage.removeItem(TRIAL_ACTIVE_APPLICATION_KEY);
  sessionStorage.setItem('currentView', JSON.stringify('landing'));
  window.location.assign(import.meta.env.BASE_URL);
}

function goToAuth(mode: 'login' | 'register'): void {
  sessionStorage.removeItem(TRIAL_ACTIVE_APPLICATION_KEY);
  sessionStorage.setItem('currentView', JSON.stringify('landing'));
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set('auth', mode);
  window.location.assign(url.toString());
}

function readGuestClasses(): GuestPlickerClass[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_PLICKER_CLASSES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readGuestStudents(): GuestPlickerStudent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_PLICKER_STUDENTS_KEY) || '[]');
    return Array.isArray(parsed) ? assignPlickerCardIds(parsed) : [];
  } catch {
    return [];
  }
}

function GuestPlickerTrial({ onBack }: { onBack: () => void }) {
  const [classes, setClasses] = useState<GuestPlickerClass[]>(readGuestClasses);
  const [students, setStudents] = useState<GuestPlickerStudent[]>(readGuestStudents);

  useEffect(() => {
    try {
      localStorage.setItem(GUEST_PLICKER_CLASSES_KEY, JSON.stringify(classes));
    } catch {
      // Trial remains usable when storage is restricted.
    }
  }, [classes]);

  useEffect(() => {
    try {
      localStorage.setItem(GUEST_PLICKER_STUDENTS_KEY, JSON.stringify(students));
    } catch {
      // Trial remains usable when storage is restricted.
    }
  }, [students]);

  return (
    <PlickerClassroom
      onBack={onBack}
      categories={classes}
      categoriesReady
      allStudents={students}
      schoolName="Dùng thử"
      teacherName="Giáo viên dùng thử"
      onCreateClass={(title, studentNames = []) => {
        const classId = `trial-class-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setClasses(previous => [...previous, { id: classId, title }]);
        if (studentNames.length) {
          setStudents(previous => assignPlickerCardIds([
            ...previous,
            ...studentNames.map((name, index) => ({
              id: `trial-student-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
              classId,
              name,
            })),
          ]));
        }
      }}
      onDeleteClass={classId => {
        setClasses(previous => previous.filter(classroom => classroom.id !== classId));
        setStudents(previous => previous.filter(student => student.classId !== classId));
      }}
      onAddStudents={(classId, names) => {
        setStudents(previous => assignPlickerCardIds([
          ...previous,
          ...names.map((name, index) => ({
            id: `trial-student-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
            classId,
            name,
          })),
        ]));
      }}
      onUpdateStudent={(studentId, name) => setStudents(previous => renamePlickerStudent(previous, studentId, name))}
      onDeleteStudent={studentId => setStudents(previous => removePlickerStudent(previous, studentId))}
      onSyncStudents={rosters => {
        const classIds = new Set(classes.map(classroom => classroom.id));
        const synchronized = Object.values(rosters)
          .flat()
          .filter(student => classIds.has(student.classId));
        setStudents(assignPlickerCardIds(synchronized));
      }}
    />
  );
}

export default function ProductTrialController() {
  const [signedIn, setSignedIn] = useState(Boolean(auth.currentUser));
  const [activeApplication, setActiveApplication] = useState<TrialApplicationId | null>(readStoredApplication);

  const activeProduct = useMemo(
    () => ECOSYSTEM_APPLICATIONS.find(application => application.id === activeApplication) || null,
    [activeApplication],
  );

  useEffect(() => onAuthStateChanged(auth, user => {
    setSignedIn(Boolean(user));
    if (user) {
      sessionStorage.removeItem(TRIAL_ACTIVE_APPLICATION_KEY);
      setActiveApplication(null);
    }
  }), []);

  useEffect(() => {
    const requestedAuth = new URLSearchParams(window.location.search).get('auth');
    if (requestedAuth !== 'login' && requestedAuth !== 'register') return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const expectedText = requestedAuth === 'register' ? 'Đăng ký' : 'Giáo viên';
      const target = buttons.find(button => button.textContent?.trim() === expectedText);
      if (target) {
        window.clearInterval(timer);
        target.click();
        window.history.replaceState(window.history.state, '', import.meta.env.BASE_URL);
      } else if (attempts > 40) {
        window.clearInterval(timer);
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const rewritePricingTrialLabel = () => {
      document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
        if (button.textContent?.trim() === 'Dùng thử 14 ngày') button.textContent = 'Dùng thử';
      });
    };
    rewritePricingTrialLabel();
    const observer = new MutationObserver(rewritePricingTrialLabel);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const captureProductLaunch = (event: MouseEvent) => {
      if (signedIn) return;
      const applicationId = findProductId(event.target);
      if (!applicationId) return;

      if (applicationId === 'exam-manager') {
        event.preventDefault();
        event.stopPropagation();
        goToAuth('register');
        return;
      }

      sessionStorage.setItem(TRIAL_ACTIVE_APPLICATION_KEY, applicationId);
      setActiveApplication(applicationId);

      if (applicationId === 'plicker') {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('click', captureProductLaunch, true);
    return () => document.removeEventListener('click', captureProductLaunch, true);
  }, [signedIn]);

  useEffect(() => {
    if (signedIn || activeApplication === 'plicker') return undefined;
    const timer = window.setInterval(() => {
      const stored = readStoredApplication();
      if (stored !== activeApplication) setActiveApplication(stored);
    }, 300);
    return () => window.clearInterval(timer);
  }, [activeApplication, signedIn]);

  // A teacher-issued wall invitation is not a product trial. Ignore stale trial
  // state so pupils can follow their class link without the subscription gate.
  if (new URLSearchParams(window.location.search).get('app') === 'learning-wall' &&
      /^#wall=[a-f0-9]{48}$/.test(window.location.hash)) {
    return <App />;
  }

  if (!signedIn && activeApplication === 'plicker') {
    return (
      <TrialAccessGate
        applicationId="plicker"
        applicationName={activeProduct?.name || 'Tương tác thẻ Plicker'}
        onBack={goToLanding}
        onRegister={() => goToAuth('register')}
        onLogin={() => goToAuth('login')}
      >
        <GuestPlickerTrial onBack={goToLanding} />
      </TrialAccessGate>
    );
  }

  if (!signedIn && activeApplication && activeProduct) {
    return (
      <TrialAccessGate
        applicationId={activeApplication}
        applicationName={activeProduct.name}
        onBack={goToLanding}
        onRegister={() => goToAuth('register')}
        onLogin={() => goToAuth('login')}
      >
        <App />
      </TrialAccessGate>
    );
  }

  return <App />;
}
