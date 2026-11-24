import React, { lazy, useState, useEffect, useRef } from 'react';
import { BookOpen, MonitorPlay, Users, Zap, CheckCircle2, ArrowRight, X, User, Lock, Eye, EyeOff, Plus, Trash2, Key, LogOut, Search, Edit2, MoreVertical, ShieldCheck, Gamepad2, Library, Layers, Layout, Smile, Brain, FileEdit, Sparkles, ArrowLeft, MessageSquare, Gift, Target, QrCode, ClipboardCheck, ChartColumnIncreasing, FileSpreadsheet, FileText, ListChecks, type LucideIcon } from 'lucide-react';
import { Teacher } from './types';
import { collection, onSnapshot, doc, setDoc, getDocFromServer } from 'firebase/firestore';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signOut, type User as FirebaseUser } from 'firebase/auth';
import { db, auth } from './firebase';
import { ECOSYSTEM_APPLICATIONS, ECOSYSTEM_DEPENDENCY_LABELS, type EcosystemApplicationId } from './ecosystem';
import { publishPlatformRegistrationMetrics } from './components/PlatformFooter';
import FastLandingPage from './components/FastLandingPage';
import { isAdministratorAlias, readRememberedAdministratorEmail, rememberVerifiedAdministratorEmail, resolveAdministratorLoginEmail } from './lib/adminAuth';
import { createPlickerLaunchPath, readRequestedApplication, selectApplicationManifest } from './lib/plickerPwa';
import { synchronizeTeacherBrowserSession } from './lib/teacherIsolation';
import { AUTH_PROFILE_TIMEOUT_MS, AUTH_REQUEST_TIMEOUT_MS, describeAuthError, waitForAuthOperation } from './lib/authFlow';
import { requestGoogleCredential } from './lib/googleAuth';

const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const KpiManager = lazy(() => import('./components/KpiManager'));
const ExamManager = lazy(() => import('./components/ExamManager'));
const AIChatbot = lazy(() => import('./components/AIChatbot'));
const HeadShakeGame = lazy(() => import('./components/HeadShakeGame'));
const LuckyDraw = lazy(() => import('./components/LuckyDraw'));
const DragDropGame = lazy(() => import('./components/DragDropGame'));
const SecretBoxGame = lazy(() => import('./components/SecretBoxGame'));
const LearningWall = lazy(() => import('./components/LearningWall'));
const GestureClass = lazy(() => import('./components/GestureClass'));
const QuestionStudioApp = lazy(() => import('./components/QuestionStudioApp'));
const ExcelMerger = lazy(() => import('./components/ExcelMerger'));
const PdfMerger = lazy(() => import('./components/PdfMerger'));

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase();

const PRODUCT_ICONS: Record<EcosystemApplicationId, LucideIcon> = {
  'gesture-class': MonitorPlay,
  'question-studio': ListChecks,
  'lucky-draw': Target,
  'lucky-draw-cards': Layers,
  plicker: QrCode,
  'learning-wall': Layout,
  'head-shake-game': Smile,
  chatbot: Brain,
  'exam-manager': ClipboardCheck,
  'kpi-manager': ChartColumnIncreasing,
  'secret-box': Gift,
  'drag-drop-game': Gamepad2,
  'excel-merger': FileSpreadsheet,
  'pdf-merger': FileText,
};

function isVerifiedAdministrator(user: FirebaseUser): boolean {
  return Boolean(ADMIN_EMAIL) && user.email?.toLowerCase() === ADMIN_EMAIL && (
    user.emailVerified || user.providerData.some(provider => provider.providerId === 'google.com')
  );
}

async function hasAdministratorAccess(user: FirebaseUser): Promise<boolean> {
  const verifiedIdentity = user.emailVerified || user.providerData.some(provider => provider.providerId === 'google.com');
  if (!verifiedIdentity) return false;
  if (isVerifiedAdministrator(user)) return true;

  try {
    const token = await waitForAuthOperation(user.getIdTokenResult(), AUTH_PROFILE_TIMEOUT_MS, 'auth/profile-timeout');
    return token.claims.admin === true || token.claims.role === 'admin';
  } catch {
    return false;
  }
}

export default function App() {
  const requestedApplication = readRequestedApplication(window.location.search);
  const [currentView, setCurrentView] = useState<'landing' | 'auth' | 'admin' | 'student_exam' | 'kpi-manager' | 'chatbot' | 'head-shake-game' | 'lucky-draw' | 'lucky-draw-cards' | 'drag-drop-game' | 'secret-box' | 'learning-wall' | 'gesture-class' | 'question-studio' | 'excel-merger' | 'pdf-merger'>(() => {
    if (new URLSearchParams(window.location.search).get('app') === 'learning-wall') return 'learning-wall';
    if (new URLSearchParams(window.location.search).get('app') === 'kpi-manager') return 'kpi-manager';
    if (requestedApplication === 'plicker') return 'admin';
    const saved = sessionStorage.getItem('currentView');
    try {
      const restored = saved ? JSON.parse(saved) : 'landing';
      const isInternalView = ['landing', 'auth', 'admin', 'student_exam'].includes(restored);
      const isAvailableApplication = ECOSYSTEM_APPLICATIONS.some(application => application.id === restored);
      return isInternalView || isAvailableApplication ? restored : 'landing';
    } catch {
      return 'landing';
    }
  });
  const [initialExam, setInitialExam] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isForgotPasswordModalOpen, setIsForgotPasswordModalOpen] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [currentUser, setCurrentUser] = useState<Teacher | 'admin' | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [googlePopupPending, setGooglePopupPending] = useState(false);
  const googleAbort = useRef<AbortController | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState('');

  useEffect(() => {
    let revision = 0;
    let disposed = false;
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      const currentRevision = ++revision;
      const isCurrent = () => !disposed && revision === currentRevision && auth.currentUser?.uid === firebaseUser?.uid;
      if (synchronizeTeacherBrowserSession(sessionStorage, firebaseUser?.uid)) {
        setCurrentUser(null);
        setTeachers([]);
      }

      if (!firebaseUser) {
        setCurrentUser(null);
        setTeachers([]);
        setAuthReady(true);
        return;
      }

      if (await hasAdministratorAccess(firebaseUser)) {
        if (!isCurrent()) return;
        if (firebaseUser.email) rememberVerifiedAdministratorEmail(firebaseUser.email);
        setCurrentUser('admin');
        setAuthReady(true);
        return;
      }

      if (!isCurrent()) return;

      setTeachers([]);
      try {
        const profile = await waitForAuthOperation(getDocFromServer(doc(db, 'teachers', firebaseUser.uid)), AUTH_PROFILE_TIMEOUT_MS, 'auth/profile-timeout');
        if (!isCurrent()) return;
        if (profile.exists() && profile.data().status === 'active') {
          setCurrentUser({ id: profile.id, ...profile.data() } as Teacher);
        } else {
          setCurrentUser(null);
        }
      } catch (error) {
        if (!isCurrent()) return;
        console.error('Không thể kiểm tra hồ sơ giáo viên:', error);
        setCurrentUser(null);
      } finally {
        if (isCurrent()) setAuthReady(true);
      }
    });
    return () => { disposed = true; revision++; unsubscribe(); googleAbort.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser === 'admin' || !auth.currentUser) return;
    if (currentUser.id !== auth.currentUser.uid) return;
    const signedInUid = auth.currentUser.uid;

    return onSnapshot(doc(db, 'teachers', signedInUid), profile => {
      if (profile.exists() && profile.id === signedInUid && profile.data().status === 'active') {
        return;
      }

      synchronizeTeacherBrowserSession(sessionStorage, null);
      setCurrentUser(null);
      setTeachers([]);
      setAuthMessage('Tài khoản giáo viên đã bị khóa hoặc chưa được quản trị viên phê duyệt.');
      setCurrentView('auth');
      void signOut(auth).catch(() => undefined);
    }, error => {
      console.error('Không thể theo dõi trạng thái tài khoản giáo viên:', error);
      if (typeof error === 'object' && error !== null && 'code' in error &&
          String(error.code) === 'permission-denied') {
        synchronizeTeacherBrowserSession(sessionStorage, null);
        setCurrentUser(null);
        setTeachers([]);
        setCurrentView('auth');
        void signOut(auth).catch(() => undefined);
      }
    });
  }, [currentUser]);

  useEffect(() => {
    if (currentUser !== 'admin' || !auth.currentUser) return;
    return onSnapshot(
      collection(db, 'teachers'),
      snapshot => {
        const profiles = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Teacher));
        setTeachers(profiles);
        void publishPlatformRegistrationMetrics(profiles).catch(error => {
          console.info('Chưa thể đồng bộ số liệu tổng hợp của giáo viên và trường học.', error);
        });
      },
      error => console.error('Không thể tải danh sách giáo viên:', error),
    );
  }, [currentUser]);

  useEffect(() => {
    sessionStorage.setItem('currentView', JSON.stringify(currentView));
  }, [currentView]);

  useEffect(() => {
    if (authReady && (currentView === 'admin' || currentView === 'kpi-manager') && !currentUser) {
      if (currentView === 'kpi-manager') sessionStorage.setItem('edukpi.pending', '1');
      setAuthMode('login');
      setCurrentView('auth');
    }
  }, [authReady, currentView, currentUser]);

  const navigateToAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setCurrentView('auth');
  };

  const resolveSignedInUser = async (firebaseUser: FirebaseUser): Promise<Teacher | 'admin'> => {
    if (await hasAdministratorAccess(firebaseUser)) {
      if (auth.currentUser?.uid !== firebaseUser.uid) throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
      if (firebaseUser.email) rememberVerifiedAdministratorEmail(firebaseUser.email);
      return 'admin';
    }

    if (ADMIN_EMAIL && firebaseUser.email?.toLowerCase() === ADMIN_EMAIL) {
      throw new Error('Tài khoản quản trị cần xác minh email hoặc đăng nhập bằng Google.');
    }

    const profile = await waitForAuthOperation(getDocFromServer(doc(db, 'teachers', firebaseUser.uid)), AUTH_PROFILE_TIMEOUT_MS, 'auth/profile-timeout');
    if (auth.currentUser?.uid !== firebaseUser.uid) throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
    if (!profile.exists()) {
      throw new Error('Chưa tìm thấy hồ sơ giáo viên. Vui lòng đăng ký hoặc liên hệ quản trị viên.');
    }
    const teacher = { id: profile.id, ...profile.data() } as Teacher;
    if (teacher.status !== 'active') {
      throw new Error('Tài khoản giáo viên đang chờ quản trị viên phê duyệt hoặc đã bị khóa.');
    }
    return teacher;
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (authBusy) return;
    const formData = new FormData(e.currentTarget);
    const loginId = String(formData.get('loginId') || '').trim();
    const loginEmail = resolveAdministratorLoginEmail(loginId, {
      configuredEmail: ADMIN_EMAIL,
      rememberedEmail: readRememberedAdministratorEmail(),
    });

    if (!loginEmail) {
      setAuthMessage('Không thể xác định tài khoản quản trị. Vui lòng sử dụng Đăng nhập bằng Google.');
      return;
    }
    const password = String(formData.get('password') || '');
    setAuthBusy(true);
    setAuthMessage('');

    let signedInUid = '';
    try {
      const credential = await waitForAuthOperation(signInWithEmailAndPassword(auth, loginEmail, password), AUTH_REQUEST_TIMEOUT_MS, 'auth/request-timeout');
      signedInUid = credential.user.uid;
      const verifiedUser = await resolveSignedInUser(credential.user);
      if (isAdministratorAlias(loginId) && verifiedUser !== 'admin') {
        throw new Error('Tài khoản đã đăng nhập nhưng chưa được cấp quyền quản trị.');
      }
      setCurrentUser(verifiedUser);
      const pendingKpi = sessionStorage.getItem('edukpi.pending') === '1';
      sessionStorage.removeItem('edukpi.pending');
      setCurrentView(pendingKpi ? 'kpi-manager' : requestedApplication === 'plicker' ? 'admin' : 'landing');
    } catch (error) {
      if (signedInUid && auth.currentUser?.uid === signedInUid) await signOut(auth).catch(() => undefined);
      setAuthMessage(describeAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignIn = async (destination: 'admin' | 'learning-wall' = 'admin') => {
    if (authBusy) return;
    const controller = new AbortController();
    googleAbort.current = controller;
    setAuthBusy(true);
    setGooglePopupPending(true);
    setAuthMessage('Hãy chọn tài khoản và hoàn tất xác thực trong cửa sổ Google.');
    let signedInUid = '';
    try {
      const googleCredential = await requestGoogleCredential(auth, controller.signal);
      setGooglePopupPending(false);
      googleAbort.current = null;
      setAuthMessage('Đang kiểm tra tài khoản và hồ sơ giáo viên…');
      const credential = await waitForAuthOperation(signInWithCredential(auth, googleCredential), AUTH_REQUEST_TIMEOUT_MS, 'auth/request-timeout');
      signedInUid = credential.user.uid;
      const verifiedUser = await resolveSignedInUser(credential.user);
      setCurrentUser(verifiedUser);
      setAuthMessage('');
      const pendingKpi = destination === 'admin' && sessionStorage.getItem('edukpi.pending') === '1';
      if (pendingKpi) sessionStorage.removeItem('edukpi.pending');
      setCurrentView(pendingKpi ? 'kpi-manager' : destination === 'admin' && requestedApplication !== 'plicker' ? 'landing' : destination);
    } catch (error) {
      if (signedInUid && auth.currentUser?.uid === signedInUid) await signOut(auth).catch(() => undefined);
      setAuthMessage(describeAuthError(error));
    } finally {
      googleAbort.current = null;
      setGooglePopupPending(false);
      setAuthBusy(false);
    }
  };

  const wallGoogleLogin = {
    onLogin: () => { void handleGoogleSignIn(currentView === 'admin' ? 'admin' : 'learning-wall'); },
    busy: authBusy, pending: googlePopupPending, message: authMessage,
    onCancel: () => googleAbort.current?.abort(),
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');
    setAuthBusy(true);
    setAuthMessage('');

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const newTeacher: Teacher = {
        id: credential.user.uid,
        name: String(formData.get('name') || '').trim(),
        username: email,
        email,
        school: String(formData.get('school') || '').trim(),
        level: String(formData.get('level') || ''),
        status: 'inactive',
      };
      await setDoc(doc(db, 'teachers', credential.user.uid), newTeacher);
      await sendEmailVerification(credential.user).catch(() => undefined);
      await signOut(auth);
      setAuthMode('login');
      setAuthMessage('Đăng ký thành công. Hãy xác minh email và chờ quản trị viên phê duyệt tài khoản.');
    } catch (error) {
      setAuthMessage(describeAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('resetEmail') || '').trim();

    try {
      await sendPasswordResetEmail(auth, email);
      setIsForgotPasswordModalOpen(false);
      setAuthMessage(`Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi đến ${email}.`);
    } catch (error) {
      setAuthMessage(describeAuthError(error));
      setIsForgotPasswordModalOpen(false);
    }
  };

  const launchApplication = (applicationId: EcosystemApplicationId) => {
    if (applicationId === 'kpi-manager') {
      if (currentUser && auth.currentUser) setCurrentView('kpi-manager');
      else { sessionStorage.setItem('edukpi.pending', '1'); navigateToAuth('login'); }
      return;
    }
    if (applicationId === 'plicker') {
      selectApplicationManifest('plicker', import.meta.env.BASE_URL);
      window.history.replaceState(window.history.state, '', createPlickerLaunchPath(import.meta.env.BASE_URL));
      if (currentUser && auth.currentUser) {
        setCurrentView('admin');
      } else {
        navigateToAuth('login');
      }
      return;
    }
    if (applicationId === 'exam-manager') {
      if (currentUser && auth.currentUser) { setInitialExam(true); setCurrentView('admin'); }
      else navigateToAuth('login');
      return;
    }
    setCurrentView(applicationId);
  };

  if (currentView === 'kpi-manager' && currentUser && auth.currentUser) {
    return <KpiManager currentUser={currentUser} onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'kpi-manager') {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Đang xác minh phiên đăng nhập KPI...</div>;
  }

  if (currentView === 'admin' && currentUser && auth.currentUser) {
    return <AdminDashboard key={auth.currentUser.uid} initialExam={initialExam} onHome={() => {
      setInitialExam(false);
      if (requestedApplication === 'plicker') {
        window.history.replaceState(window.history.state, '', import.meta.env.BASE_URL);
        selectApplicationManifest('ecosystem', import.meta.env.BASE_URL);
      }
      setCurrentView('landing');
    }} onLogout={() => {
      void signOut(auth);
      setCurrentUser(null);
      setTeachers([]);
      synchronizeTeacherBrowserSession(sessionStorage, null);
      setCurrentView('landing');
    }} teachers={teachers} setTeachers={setTeachers} currentUser={currentUser} initialApplication={requestedApplication} googleLogin={wallGoogleLogin} />;
  }

  if (currentView === 'admin') {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Đang xác minh phiên đăng nhập...</div>;
  }

  if (currentView === 'student_exam') {
    return (
      <div className="min-h-screen flex flex-col font-sans text-slate-900 bg-slate-50">
        <ExamManager initialMode="student" onBack={() => setCurrentView('landing')} />
      </div>
    );
  }

  if (currentView === 'chatbot') {
    return (
      <div className="min-h-screen flex flex-col h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 flex items-center gap-4 shrink-0">
          <button 
            onClick={() => setCurrentView('landing')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-indigo-600" />
            AI Giáo viên
          </h1>
        </header>
        <div className="flex-1 overflow-hidden p-4 md:p-8">
          <div className="max-w-4xl mx-auto h-full">
            <AIChatbot />
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'head-shake-game') {
    return <HeadShakeGame onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'lucky-draw') {
    return <LuckyDraw onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'lucky-draw-cards') {
    return <LuckyDraw initialMode="cards" onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'drag-drop-game') {
    return <DragDropGame onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'secret-box') {
    return <SecretBoxGame onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'learning-wall') {
    return <LearningWall currentUser={currentUser} onBack={() => setCurrentView('landing')} onLogin={() => navigateToAuth('login')} googleLogin={wallGoogleLogin} />;
  }

  if (currentView === 'gesture-class') {
    return <GestureClass onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'question-studio') {
    return <QuestionStudioApp onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'excel-merger') {
    return <ExcelMerger onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'pdf-merger') {
    return <PdfMerger onBack={() => setCurrentView('landing')} />;
  }

  if (currentView === 'auth') {
    return (
      <>
      <div className="min-h-screen flex font-sans text-slate-900 bg-white">
        {/* Left Panel - Teacher Focus */}
        <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-between relative overflow-hidden p-12">
          {/* Decorative background elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-b from-indigo-500/20 to-transparent rounded-full blur-3xl transform rotate-12"></div>
            <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-t from-blue-500/20 to-transparent rounded-full blur-3xl transform -rotate-12"></div>
          </div>

          {/* Logo */}
          <div 
            className="flex items-center gap-2 cursor-pointer relative z-10"
            onClick={() => setCurrentView('landing')}
          >
            <div className="bg-indigo-500 p-1.5 rounded text-white">
              <BookOpen className="w-6 h-6" />
            </div>
            <span className="font-bold text-2xl text-white">Edu AI</span>
          </div>
          
          {/* Image Content */}
          <div className="relative z-10 w-full flex-grow flex items-center justify-center mt-8">
            <div className="relative w-full max-w-lg aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
              <img 
                src="https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070&auto=format&fit=crop" 
                alt="Giáo viên giảng dạy" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent"></div>
              <div className="absolute bottom-0 left-0 right-0 p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Nâng tầm giảng dạy</h2>
                <p className="text-slate-300">Công cụ thông minh giúp giáo viên tối ưu hóa thời gian và nâng cao chất lượng bài giảng.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Auth Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <h2 className="text-2xl font-bold text-center mb-8 text-slate-800 uppercase">
              {authMode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
            </h2>

            {authMessage && (
              <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-800" role="status">
                {authMessage}
              </div>
            )}

            {authMode === 'login' ? (
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input name="loginId" type="text" value={loginIdentifier} onChange={event => { setLoginIdentifier(event.target.value); setAuthMessage(''); }} autoComplete="username" required className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="Email đăng nhập hoặc admin" />
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="Mật khẩu" />
                  <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer">
                    {showPassword ? <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600" /> : <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600" />}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-blue-500 border-slate-300 rounded focus:ring-blue-500" />
                    <span className="text-sm text-slate-600">Ghi nhớ phiên đăng nhập</span>
                  </label>
                </div>

                <button type="submit" disabled={authBusy} className="w-full bg-[#3b82f6] text-white font-medium py-2.5 rounded-lg hover:bg-blue-600 transition-colors mt-2 disabled:cursor-not-allowed disabled:opacity-60">
                  {authBusy ? 'Đang xác thực...' : 'Đăng nhập'}
                </button>
                <button type="button" disabled={authBusy} onClick={() => { void handleGoogleSignIn(); }} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                  Đăng nhập bằng Google
                </button>
                {googlePopupPending && <button type="button" onClick={() => googleAbort.current?.abort()} className="w-full rounded-lg px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100">Hủy đăng nhập Google</button>}
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleRegister}>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input name="name" type="text" required className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="Họ và tên" />
                </div>
                
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <BookOpen className="h-5 w-5 text-slate-400" />
                  </div>
                  <input name="school" type="text" required className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="Đơn vị công tác" />
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <input type="text" required className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="Địa chỉ: xã, tỉnh..." />
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <input type="tel" required className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="Số điện thoại" />
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input name="email" type="email" required className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="Email" />
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Users className="h-5 w-5 text-slate-400" />
                  </div>
                  <select name="level" required defaultValue="" className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm text-slate-600 bg-white appearance-none">
                    <option value="" disabled>Giáo viên cấp...</option>
                    <option value="Mầm non">Mầm non</option>
                    <option value="Tiểu học">Tiểu học</option>
                    <option value="THCS">THCS</option>
                    <option value="THPT">THPT</option>
                    <option value="Đại học/Cao đẳng">Đại học/Cao đẳng</option>
                    <option value="Khác">Khác</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input name="password" type={showPassword ? 'text' : 'password'} minLength={8} autoComplete="new-password" required className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="Mật khẩu từ 8 ký tự" />
                  <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer">
                    {showPassword ? <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600" /> : <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600" />}
                  </button>
                </div>

                <button type="submit" disabled={authBusy} className="w-full bg-[#3b82f6] text-white font-medium py-2.5 rounded-lg hover:bg-blue-600 transition-colors mt-2 disabled:cursor-not-allowed disabled:opacity-60">
                  {authBusy ? 'Đang tạo tài khoản...' : 'Đăng ký'}
                </button>
              </form>
            )}

            {authMode === 'login' && (
              <div className="mt-4 text-right">
                <button 
                  onClick={() => setIsForgotPasswordModalOpen(true)}
                  className="text-sm text-blue-500 hover:underline"
                >
                  Quên mật khẩu?
                </button>
              </div>
            )}

            <div className="mt-8 text-center text-sm text-slate-600">
              {authMode === 'login' ? (
                <>Bạn chưa có tài khoản? <button onClick={() => setAuthMode('register')} className="text-blue-500 hover:underline font-medium">Đăng ký</button></>
              ) : (
                <>Đã có tài khoản? <button onClick={() => setAuthMode('login')} className="text-blue-500 hover:underline font-medium">Đăng nhập</button></>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {isForgotPasswordModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">Quên mật khẩu</h2>
              <button 
                onClick={() => setIsForgotPasswordModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-600 mb-6 text-sm">
                Vui lòng nhập địa chỉ email bạn đã sử dụng để đăng ký tài khoản. Chúng tôi sẽ gửi cho bạn một liên kết để đặt lại mật khẩu.
              </p>
              <form className="space-y-4" onSubmit={handleForgotPassword}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input 
                    name="resetEmail"
                    type="email" 
                    required 
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                    placeholder="Nhập địa chỉ email của bạn" 
                  />
                </div>
                <div className="pt-2 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsForgotPasswordModalOpen(false)}
                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Gửi yêu cầu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  return <FastLandingPage key={currentUser && auth.currentUser ? auth.currentUser.uid : 'guest'}
    workspaceKey={currentUser && auth.currentUser ? auth.currentUser.uid : 'guest'}
    onTeacherLogin={() => { setInitialExam(false); if (currentUser && auth.currentUser) setCurrentView('admin'); else navigateToAuth('login'); }}
    onTeacherRegister={() => navigateToAuth('register')}
    onStudentLogin={() => setCurrentView('student_exam')}
    onOpenProduct={launchApplication}
    account={currentUser === 'admin' ? { name: 'Quản trị viên', email: auth.currentUser?.email || '' } : currentUser ? { name: currentUser.name, school: currentUser.school, email: currentUser.email } : undefined}
    onSignOut={currentUser ? () => {
      void signOut(auth).then(() => {
        setCurrentUser(null);
        setTeachers([]);
        synchronizeTeacherBrowserSession(sessionStorage, null);
      }).catch(error => setAuthMessage(describeAuthError(error)));
    } : undefined}
  />;
}
