import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Camera, CheckCircle2, ChevronLeft,
  ChevronRight, CircleAlert, ClipboardPaste, Download, Eye, EyeOff, FileText, FileUp,
  GraduationCap, Layers, LoaderCircle,
  LayoutDashboard, Link2, Maximize2, MonitorPlay, Pause, Pencil, Play, Plus, Printer, QrCode,
  RefreshCw, Save, ScanLine, Settings2, ShieldCheck, Smartphone, Square, Trash2, UserPlus,
  Users, Wifi, WifiOff, X,
} from 'lucide-react';
import { deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import PlickerDisplayScreen, { PlickerDisplayMath } from './PlickerDisplayScreen';
import PlickerMobileScanner from './PlickerMobileScanner';
import PlickerQuestionEditor from './PlickerQuestionEditor';
import PlickerQuestionMediaGallery, { PlickerRichContent } from './PlickerQuestionContent';
import { filterPlickerStudentsByClasses } from '../lib/plickerStudents';
import { createPlickerReportDocumentId, createTeacherStorageKey } from '../lib/teacherIsolation';
import {
  buildPlickerStudentScoreRows,
  createPlickerReportWorkbook,
  deletePlickerReport,
  getPlickerReportMaximumScore,
  inferPlickerSchoolYear,
  resolvePlickerReportStudents,
  type PlickerClassroomReport,
  type PlickerReportSettings,
  type PlickerReportStudent,
} from '../lib/plickerReports';
import {
  formatPlickerScore,
  normalizePlickerQuestionPoints,
  PLICKER_DEFAULT_QUESTION_POINTS,
} from '../lib/plickerScoring';
import {
  createPlickerMarker,
  detectPlickerCards,
  PLICKER_CARD_LIMIT,
  PlickerTemporalConsensus,
  type DetectedPlickerCard,
  type PlickerAnswer,
} from '../lib/plickerVision';
import {
  getPwaInstallationInstructions,
  hasPwaInstallationPrompt,
  isInstalledPwa,
  promptPwaInstallation,
  PWA_INSTALL_STATE_EVENT,
  readRequestedPlickerSection,
} from '../lib/plickerPwa';
import {
  createPlickerDevicePath,
  getPlickerDisplayActivationKey,
  createPlickerLiveRoomId,
  createPlickerLiveSession,
  createPlickerQuestionKey,
  getPlickerOrphanedRosterChanges,
  isPlickerDeviceOnline,
  isPlickerLiveSessionRunning,
  PLICKER_DEVICE_HEARTBEAT_MS,
  mergePlickerDeletedClasses,
  mergePlickerDeletedQuestionSets,
  mergePlickerQuestionSets,
  normalizePlickerLiveRoom,
  readPlickerDeviceRole,
  sanitizePlickerQuestionSet,
  sanitizePlickerStudents,
  summarizePlickerLiveAnswers,
  type PlickerDeviceRole,
  type PlickerLiveQuestion,
  type PlickerLiveQuestionSet,
  type PlickerLiveRoom,
  type PlickerLiveSession,
} from '../lib/plickerLive';
import { describePlickerSyncError, getPlickerSyncErrorCode } from '../lib/plickerSyncError';
import {
  parsePlickerQuestionText,
  PLICKER_IMPORT_QUESTION_LIMIT,
  readPlickerQuestionFile,
} from '../lib/plickerQuestionImport';

interface Student {
  id: string;
  classId: string;
  name: string;
  cardId?: number;
}

interface Category {
  id: string;
  title: string;
  parentId?: string;
  authorId?: string;
}

interface PlickerClassroomProps {
  onBack: () => void;
  onLogout?: () => void;
  categories: Category[];
  categoriesReady: boolean;
  allStudents: Student[];
  onCreateClass: (title: string, students?: string[]) => void;
  onDeleteClass: (classId: string) => void | Promise<void>;
  onAddStudents: (classId: string, names: string[]) => void;
  onUpdateStudent: (studentId: string, name: string) => void;
  onDeleteStudent: (studentId: string) => void;
  onSyncStudents: (rosters: Record<string, Student[]>) => void;
  schoolName?: string;
  teacherName?: string;
  isAdministrator?: boolean;
  synchronizedReports?: (PlickerClassroomReport & { teacherId?: string })[];
  administratorQuestionSets?: (PlickerLiveQuestionSet & { teacherId: string })[];
}

interface ClassroomQuestion extends PlickerLiveQuestion {
  type?: 'multiple_choice' | 'true_false';
  gradingType?: 'graded' | 'survey';
}

interface ClassroomQuestionSet {
  id: string;
  title: string;
  questions: ClassroomQuestion[];
  createdAt: string;
  updatedAt: string;
}

interface ClassroomResponse {
  studentId: string;
  studentName: string;
  cardId: number;
  answer: PlickerAnswer;
  confidence: number;
  timestamp: number;
  source: 'camera' | 'manual';
}

type ClassroomReport = PlickerClassroomReport & { teacherId?: string };

type ClassroomView = 'overview' | 'classes' | 'library' | 'session' | 'reports' | 'cards';

const ANSWERS: PlickerAnswer[] = ['A', 'B', 'C', 'D'];
const ANSWER_COLORS: Record<PlickerAnswer, string> = {
  A: 'bg-blue-500',
  B: 'bg-amber-500',
  C: 'bg-emerald-500',
  D: 'bg-fuchsia-500',
};
const SETS_STORAGE_KEY = 'plickerQuestionSets';
const DELETED_SETS_STORAGE_KEY = 'plickerDeletedQuestionSets';
const DELETED_CLASSES_STORAGE_KEY = 'plickerDeletedClasses';
const REPORTS_STORAGE_KEY = 'smartclass_plicker_reports_v2';
const REPORT_SETTINGS_STORAGE_KEY = 'smartclass_plicker_report_settings_v1';

function createIdentifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getOrCreatePlickerDeviceId(ownerUid: string, role: PlickerDeviceRole): string {
  const storageKey = `smartclass_plicker_device_v1_${ownerUid || 'guest'}_${role}`;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && /^[a-zA-Z0-9_-]{1,120}$/u.test(saved)) return saved;
    const created = createIdentifier(`device-${role}`);
    localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return createIdentifier(`device-${role}`);
  }
}

function defaultQuestion(id = 1): ClassroomQuestion {
  return {
    id,
    text: '',
    type: 'multiple_choice',
    gradingType: 'graded',
    points: PLICKER_DEFAULT_QUESTION_POINTS,
    options: { A: '', B: '', C: '', D: '' },
    correctAnswer: null,
  };
}

function initialQuestionSets(ownerUid: string): ClassroomQuestionSet[] {
  const fallback: ClassroomQuestionSet[] = [{
    id: 'starter-general',
    title: 'Câu hỏi khởi động',
    questions: [
      {
        id: 1,
        text: 'Thủ đô của Việt Nam là thành phố nào?',
        points: PLICKER_DEFAULT_QUESTION_POINTS,
        options: { A: 'Hải Phòng', B: 'Hà Nội', C: 'Đà Nẵng', D: 'Huế' },
        correctAnswer: 'B',
      },
      {
        id: 2,
        text: 'Kết quả của phép tính 7 × 8 là bao nhiêu?',
        points: PLICKER_DEFAULT_QUESTION_POINTS,
        options: { A: '48', B: '54', C: '56', D: '64' },
        correctAnswer: 'C',
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }];

  try {
    const saved = localStorage.getItem(createTeacherStorageKey(SETS_STORAGE_KEY, ownerUid));
    if (saved === null) return fallback;
    const parsed = JSON.parse(saved) as ClassroomQuestionSet[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function initialDeletedQuestionSets(ownerUid: string): Record<string, number> {
  try {
    const saved = localStorage.getItem(createTeacherStorageKey(DELETED_SETS_STORAGE_KEY, ownerUid));
    const parsed = saved ? JSON.parse(saved) as Record<string, number> : {};
    return mergePlickerDeletedQuestionSets({}, parsed);
  } catch {
    return {};
  }
}

function initialDeletedClasses(ownerUid: string): Record<string, number> {
  try {
    const saved = localStorage.getItem(createTeacherStorageKey(DELETED_CLASSES_STORAGE_KEY, ownerUid));
    const parsed = saved ? JSON.parse(saved) as Record<string, number> : {};
    return mergePlickerDeletedClasses({}, parsed);
  } catch {
    return {};
  }
}

function initialReports(ownerUid: string): ClassroomReport[] {
  try {
    const saved = localStorage.getItem(createTeacherStorageKey(REPORTS_STORAGE_KEY, ownerUid));
    const parsed = saved ? JSON.parse(saved) as ClassroomReport[] : [];
    return Array.isArray(parsed)
      ? parsed.filter(report => report && (!report.teacherId || report.teacherId === ownerUid))
      : [];
  } catch {
    return [];
  }
}

function initialReportSettings(ownerUid: string, schoolName = '', teacherName = ''): PlickerReportSettings {
  const defaults: PlickerReportSettings = {
    schoolName,
    teacherName,
    subject: '',
    schoolYear: inferPlickerSchoolYear(),
    examDate: '',
  };
  try {
    const saved = localStorage.getItem(createTeacherStorageKey(REPORT_SETTINGS_STORAGE_KEY, ownerUid));
    const parsed = saved ? JSON.parse(saved) as Partial<PlickerReportSettings> : {};
    return {
      schoolName: typeof parsed.schoolName === 'string' && parsed.schoolName.trim() ? parsed.schoolName : defaults.schoolName,
      teacherName: typeof parsed.teacherName === 'string' && parsed.teacherName.trim() ? parsed.teacherName : defaults.teacherName,
      subject: typeof parsed.subject === 'string' ? parsed.subject : defaults.subject,
      schoolYear: typeof parsed.schoolYear === 'string' && parsed.schoolYear.trim() ? parsed.schoolYear : defaults.schoolYear,
      examDate: '',
    };
  } catch {
    return defaults;
  }
}

function readableCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera chưa được cấp quyền. Hãy cho phép website sử dụng camera và tải lại trang.';
  }
  if (name === 'NotFoundError') return 'Không tìm thấy camera trên thiết bị này.';
  if (name === 'NotReadableError') return 'Camera đang được ứng dụng khác sử dụng.';
  return error instanceof Error ? error.message : 'Không thể khởi động camera.';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadDetailedReport(report: ClassroomReport): void {
  const lines = [['Lớp', 'Bộ câu hỏi', 'Câu hỏi', 'Mã thẻ', 'Học sinh', 'Đáp án', 'Đáp án đúng', 'Kết quả']];
  for (const question of report.questions) {
    for (const response of question.responses) {
      const evaluation = question.correctAnswer
        ? response.answer === question.correctAnswer ? 'Đúng' : 'Sai'
        : 'Khảo sát';
      lines.push([
        report.className, report.setTitle, question.text, String(response.cardId),
        response.studentName, response.answer, question.correctAnswer || '', evaluation,
      ]);
    }
  }

  const csv = '\ufeff' + lines.map(line => line.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bao-cao-the-tuong-tac-${report.id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadScoreReport(
  report: ClassroomReport,
  students: PlickerReportStudent[],
  settings: PlickerReportSettings,
): void {
  const workbook = createPlickerReportWorkbook(report, students, settings);
  const file = new Blob([new Uint8Array(workbook)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  const safeClassName = report.className.trim().replace(/[\\/:*?"<>|]+/gu, '-');
  link.href = url;
  link.download = `bang-diem-${safeClassName || 'lop-hoc'}-${(settings.examDate || report.completedAt).slice(0, 10)}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function MarkerSvg({ cardId, className = '' }: { cardId: number; className?: string }) {
  const marker = createPlickerMarker(cardId);
  return (
    <svg
      viewBox="0 0 7 7"
      className={className}
      role="img"
      aria-label={`Mã thẻ học sinh ${cardId}`}
      shapeRendering="crispEdges"
    >
      <rect width="7" height="7" fill="white" />
      {marker.flatMap((row, rowIndex) => row.map((dark, columnIndex) =>
        dark ? <rect key={`${rowIndex}-${columnIndex}`} x={columnIndex} y={rowIndex} width="1" height="1" fill="black" /> : null,
      ))}
    </svg>
  );
}

function MetricCard({
  title, value, note, icon, accent,
}: {
  title: string;
  value: string | number;
  note: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${accent}`}>{icon}</div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{note}</p>
    </div>
  );
}

export default function PlickerClassroom({
  onBack, categories, categoriesReady, allStudents, onCreateClass, onDeleteClass, onAddStudents, onUpdateStudent, onDeleteStudent, onSyncStudents, schoolName = '', teacherName = '', isAdministrator = false, synchronizedReports = [], administratorQuestionSets = [],
}: PlickerClassroomProps) {
  const ownerUid = auth.currentUser?.uid || '';
  const [view, setView] = useState<ClassroomView>(() => readRequestedPlickerSection(window.location.search) || 'overview');
  const [selectedClassId, setSelectedClassId] = useState(categories[0]?.id || '');
  const [sets, setSets] = useState<ClassroomQuestionSet[]>(() => initialQuestionSets(ownerUid));
  const [deletedQuestionSetIds, setDeletedQuestionSetIds] = useState<Record<string, number>>(() => initialDeletedQuestionSets(ownerUid));
  const [deletedClassIds, setDeletedClassIds] = useState<Record<string, number>>(() => initialDeletedClasses(ownerUid));
  const [selectedSetId, setSelectedSetId] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answersByQuestion, setAnswersByQuestion] = useState<Record<string, ClassroomResponse[]>>({});
  const [reports, setReports] = useState<ClassroomReport[]>(() => initialReports(ownerUid));
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [deletingReport, setDeletingReport] = useState<ClassroomReport | null>(null);
  const [reportSettings, setReportSettings] = useState<PlickerReportSettings>(() => initialReportSettings(ownerUid, schoolName, teacherName));
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [showCorrect, setShowCorrect] = useState(false);
  const [showProjector, setShowProjector] = useState(() => new URLSearchParams(window.location.search).get('role') === 'display');
  const [showGraph, setShowGraph] = useState(false);
  const [cameraStats, setCameraStats] = useState({ fps: 0, candidates: 0, confidence: 0 });
  const [classModal, setClassModal] = useState(false);
  const [addStudentsModal, setAddStudentsModal] = useState(false);
  const [classTitle, setClassTitle] = useState('');
  const [studentText, setStudentText] = useState('');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingStudentName, setEditingStudentName] = useState('');
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [deletingClass, setDeletingClass] = useState<Category | null>(null);
  const [deletingClassBusy, setDeletingClassBusy] = useState(false);
  const [pendingClassTitle, setPendingClassTitle] = useState('');
  const [editingSet, setEditingSet] = useState<ClassroomQuestionSet | null>(null);
  const [deletingSet, setDeletingSet] = useState<ClassroomQuestionSet | null>(null);
  const [questionImportOpen, setQuestionImportOpen] = useState(false);
  const [questionImportText, setQuestionImportText] = useState('');
  const [questionImportTitle, setQuestionImportTitle] = useState('Bộ câu hỏi nhập nhanh');
  const [questionImportTarget, setQuestionImportTarget] = useState<'new' | 'editing'>('new');
  const [questionImportSource, setQuestionImportSource] = useState('');
  const [questionImportError, setQuestionImportError] = useState('');
  const [questionImportBusy, setQuestionImportBusy] = useState(false);
  const [printCards, setPrintCards] = useState(false);
  const [notice, setNotice] = useState('');
  const [pwaInstalled, setPwaInstalled] = useState(isInstalledPwa);
  const [pwaPromptReady, setPwaPromptReady] = useState(hasPwaInstallationPrompt);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showPairingHelp, setShowPairingHelp] = useState(false);
  const [scannerQrCode, setScannerQrCode] = useState('');
  const [deviceRole, setDeviceRole] = useState<PlickerDeviceRole>(() =>
    readPlickerDeviceRole(window.location.search, navigator.userAgent));
  const [liveRoom, setLiveRoom] = useState<PlickerLiveRoom | null>(null);
  const [syncReady, setSyncReady] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [presenceNow, setPresenceNow] = useState(Date.now());

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const questionImportInputRef = useRef<HTMLInputElement>(null);
  const consensusRef = useRef(new PlickerTemporalConsensus(2, 850));
  const sessionIdRef = useRef(createIdentifier('session'));
  const deviceIdRef = useRef(getOrCreatePlickerDeviceId(ownerUid, deviceRole));
  const currentRoomRef = useRef<PlickerLiveRoom | null>(null);
  const followedSessionIdRef = useRef('');
  const displayedActivationKeysRef = useRef(new Set<string>());
  const deviceRoleRef = useRef(deviceRole);
  deviceRoleRef.current = deviceRole;
  const deletedQuestionSetIdsRef = useRef(deletedQuestionSetIds);
  deletedQuestionSetIdsRef.current = deletedQuestionSetIds;
  const deletedClassIdsRef = useRef(deletedClassIds);
  deletedClassIdsRef.current = deletedClassIds;
  const cloudDeletedClassIdsRef = useRef<Record<string, number>>({});
  const cloudRostersRef = useRef<Record<string, Student[]>>({});
  const categoryIdsRef = useRef(new Set(categories.map(category => category.id)));
  categoryIdsRef.current = new Set(categories.map(category => category.id));
  const onSyncStudentsRef = useRef(onSyncStudents);
  onSyncStudentsRef.current = onSyncStudents;
  const syncWriteCooldownUntilRef = useRef(0);
  const pendingAnswerFieldsRef = useRef<Record<string, unknown>>({});
  const pendingAnswerFlushTimerRef = useRef<number | null>(null);

  const liveRoomReference = useMemo(() =>
    ownerUid ? doc(db, 'categories', createPlickerLiveRoomId(ownerUid)) : null,
  [ownerUid]);

  const registeredStudents = useMemo(() =>
    filterPlickerStudentsByClasses(allStudents, categories),
  [allStudents, categories]);
  const visibleQuestionSets = useMemo(() => {
    if (!isAdministrator) return sets;
    const combined = new Map<string, ClassroomQuestionSet>(sets.map(set => [set.id, set]));
    for (const questionSet of administratorQuestionSets) {
      combined.set(questionSet.id, questionSet as ClassroomQuestionSet);
    }
    return [...combined.values()];
  }, [administratorQuestionSets, isAdministrator, sets]);
  const selectedClass = categories.find(item => item.id === selectedClassId) || null;
  const classStudents = useMemo(() =>
    registeredStudents
      .filter(student => student.classId === selectedClassId)
      .slice(0, PLICKER_CARD_LIMIT)
      .sort((left, right) => (left.cardId || PLICKER_CARD_LIMIT + 1) - (right.cardId || PLICKER_CARD_LIMIT + 1)),
  [registeredStudents, selectedClassId]);
  const classStudentsByCard = useMemo(() => new Map(
    classStudents.map((student, index) => [student.cardId || index + 1, student]),
  ), [classStudents]);
  const selectedSet = visibleQuestionSets.find(item => item.id === selectedSetId) || null;
  const currentQuestion = selectedSet?.questions[questionIndex] || null;
  const questionKey = currentQuestion && selectedSet ? createPlickerQuestionKey(selectedSet.id, currentQuestion.id) : '';
  const currentAnswers = answersByQuestion[questionKey] || [];
  const currentAnswersRef = useRef<ClassroomResponse[]>([]);
  currentAnswersRef.current = currentAnswers;
  const correctCount = currentQuestion?.correctAnswer
    ? currentAnswers.filter(item => item.answer === currentQuestion.correctAnswer).length
    : 0;
  const selectedReport = reports.find(report => report.id === selectedReportId) || null;
  const selectedReportStudents = useMemo(() => selectedReport
    ? resolvePlickerReportStudents(selectedReport, registeredStudents)
    : [], [registeredStudents, selectedReport]);
  const selectedReportScores = useMemo(() => selectedReport
    ? buildPlickerStudentScoreRows(selectedReport, selectedReportStudents)
    : [], [selectedReport, selectedReportStudents]);
  const liveSession = liveRoom?.activeSession || null;
  const sessionInProgress = isPlickerLiveSessionRunning(liveSession);
  const questionImportPreview = useMemo(() => parsePlickerQuestionText(questionImportText), [questionImportText]);

  const reportSynchronizationError = useCallback((error: unknown) => {
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    const code = getPlickerSyncErrorCode(error);
    const message = describePlickerSyncError(error, online);

    if (code === 'resource-exhausted') {
      syncWriteCooldownUntilRef.current = Math.max(syncWriteCooldownUntilRef.current, Date.now() + 60_000);
    }

    console.error('Không thể đồng bộ buổi học giữa điện thoại và máy tính:', {
      code: code || 'unknown',
      online,
      message,
      cooldownUntil: syncWriteCooldownUntilRef.current || undefined,
      error,
    });
    setSyncError(message);
  }, []);

  const canWriteToFirestore = useCallback(() => Date.now() >= syncWriteCooldownUntilRef.current, []);

  const saveRoomFields = useCallback(async (fields: Record<string, unknown>) => {
    if (!liveRoomReference || !ownerUid || !canWriteToFirestore()) return;
    try {
      await setDoc(liveRoomReference, {
        kind: 'plicker_live_session',
        ownerUid,
        authorId: ownerUid,
        ...fields,
        updatedAt: Date.now(),
      }, { merge: true });
      setSyncError('');
    } catch (error) {
      reportSynchronizationError(error);
    }
  }, [canWriteToFirestore, liveRoomReference, ownerUid, reportSynchronizationError]);

  const updateLiveSessionFields = useCallback(async (fields: Record<string, unknown>) => {
    if (!liveRoomReference || !currentRoomRef.current?.activeSession || !canWriteToFirestore()) return;
    try {
      await updateDoc(liveRoomReference, {
        ...fields,
        'activeSession.updatedAt': Date.now(),
        updatedAt: Date.now(),
      });
      setSyncError('');
    } catch (error) {
      reportSynchronizationError(error);
    }
  }, [canWriteToFirestore, liveRoomReference, reportSynchronizationError]);

  const flushPendingAnswerFields = useCallback(() => {
    if (pendingAnswerFlushTimerRef.current !== null) {
      window.clearTimeout(pendingAnswerFlushTimerRef.current);
      pendingAnswerFlushTimerRef.current = null;
    }
    const fields = pendingAnswerFieldsRef.current;
    pendingAnswerFieldsRef.current = {};
    if (!Object.keys(fields).length) return;
    if (!canWriteToFirestore()) {
      pendingAnswerFieldsRef.current = { ...fields, ...pendingAnswerFieldsRef.current };
      return;
    }
    void updateLiveSessionFields(fields);
  }, [canWriteToFirestore, updateLiveSessionFields]);

  const queueLiveAnswerFields = useCallback((fields: Record<string, unknown>) => {
    pendingAnswerFieldsRef.current = { ...pendingAnswerFieldsRef.current, ...fields };
    if (pendingAnswerFlushTimerRef.current !== null) return;
    pendingAnswerFlushTimerRef.current = window.setTimeout(() => {
      pendingAnswerFlushTimerRef.current = null;
      flushPendingAnswerFields();
    }, 700);
  }, [flushPendingAnswerFields]);

  useEffect(() => () => {
    if (pendingAnswerFlushTimerRef.current !== null) {
      window.clearTimeout(pendingAnswerFlushTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setPresenceNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const markOnline = () => setIsOnline(true);
    const markOffline = () => {
      setIsOnline(false);
      setSyncError(describePlickerSyncError(new Error('Browser offline'), false));
    };
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  useEffect(() => {
    if (!categoriesReady || !liveRoomReference || !ownerUid) return;
    setSyncReady(false);

    return onSnapshot(liveRoomReference, snapshot => {
      if (!snapshot.exists()) {
        currentRoomRef.current = null;
        cloudRostersRef.current = {};
        setLiveRoom(null);
        setSyncReady(true);
        setSyncError('');
        return;
      }

      const normalizedRoom = normalizePlickerLiveRoom(snapshot.data(), ownerUid);
      if (!normalizedRoom) {
        setSyncError('Phiên đồng bộ không thuộc tài khoản đang đăng nhập.');
        setSyncReady(true);
        return;
      }

      const mergedDeletedClasses = mergePlickerDeletedClasses(
        deletedClassIdsRef.current,
        normalizedRoom.deletedClassIds || {},
      );
      cloudRostersRef.current = normalizedRoom.rosters as Record<string, Student[]>;
      cloudDeletedClassIdsRef.current = normalizedRoom.deletedClassIds || {};
      if (mergedDeletedClasses !== deletedClassIdsRef.current) {
        deletedClassIdsRef.current = mergedDeletedClasses;
        setDeletedClassIds(mergedDeletedClasses);
      }
      const room: PlickerLiveRoom = {
        ...normalizedRoom,
        deletedClassIds: mergedDeletedClasses,
        rosters: Object.fromEntries(
          Object.entries(normalizedRoom.rosters).filter(([classId]) =>
            !mergedDeletedClasses[classId] && categoryIdsRef.current.has(classId)),
        ),
        activeSession: normalizedRoom.activeSession &&
            !mergedDeletedClasses[normalizedRoom.activeSession.classId] &&
            categoryIdsRef.current.has(normalizedRoom.activeSession.classId)
          ? normalizedRoom.activeSession
          : null,
      };

      currentRoomRef.current = room;
      setLiveRoom(room);
      setSyncReady(true);
      setSyncError('');

      const mergedDeletedQuestionSets = mergePlickerDeletedQuestionSets(
        deletedQuestionSetIdsRef.current,
        room.deletedQuestionSetIds || {},
      );
      if (mergedDeletedQuestionSets !== deletedQuestionSetIdsRef.current) {
        deletedQuestionSetIdsRef.current = mergedDeletedQuestionSets;
        setDeletedQuestionSetIds(mergedDeletedQuestionSets);
      }

      if (room.librarySets.length > 0 || Object.keys(mergedDeletedQuestionSets).length > 0) {
        setSets(previous => mergePlickerQuestionSets(
          previous,
          room.librarySets as ClassroomQuestionSet[],
          mergedDeletedQuestionSets,
        ));
      }

      const session = room.activeSession;
      const synchronizedRosters: Record<string, Student[]> = session
        ? { [session.classId]: session.students as Student[], ...room.rosters as Record<string, Student[]> }
        : room.rosters as Record<string, Student[]>;
      for (const classId of Object.keys(mergedDeletedClasses)) synchronizedRosters[classId] = [];
      if (Object.keys(synchronizedRosters).length > 0) {
        onSyncStudentsRef.current(synchronizedRosters);
      }

      if (!session) return;
      setSets(previous => mergePlickerQuestionSets(
        previous,
        [session.questionSet as ClassroomQuestionSet],
        mergedDeletedQuestionSets,
      ));
      setSelectedClassId(session.classId);
      if (!mergedDeletedQuestionSets[session.questionSet.id]) setSelectedSetId(session.questionSet.id);
      setQuestionIndex(session.questionIndex);
      setShowCorrect(session.showCorrect);
      setShowGraph(session.showGraph);
      setAnswersByQuestion(Object.fromEntries(
        Object.entries(session.answersByQuestion || {}).map(([key, responses]) => [
          key,
          Object.values(responses).sort((left, right) => left.cardId - right.cardId),
        ]),
      ));
      sessionIdRef.current = session.sessionId;

      if (session.phase !== 'finished' && followedSessionIdRef.current !== session.sessionId) {
        followedSessionIdRef.current = session.sessionId;
        setView('session');
      }

      const displayActivationKey = getPlickerDisplayActivationKey(
        deviceRoleRef.current,
        session,
        deviceIdRef.current,
      );
      if (displayActivationKey && !displayedActivationKeysRef.current.has(displayActivationKey)) {
        displayedActivationKeysRef.current.add(displayActivationKey);
        setView('session');
        setShowProjector(true);
      }

      if (session.phase === 'results' || session.phase === 'finished') {
        setScanning(false);
      }
    }, reportSynchronizationError);
  }, [categoriesReady, liveRoomReference, ownerUid, reportSynchronizationError]);

  useEffect(() => {
    if (!syncReady || !ownerUid) return;
    const announceDevice = () => {
      if (document.hidden || !canWriteToFirestore()) return;
      const device = { deviceId: deviceIdRef.current, updatedAt: Date.now() };
      void saveRoomFields({
        devices: {
          ...(currentRoomRef.current?.devices || {}),
          [deviceRole]: device,
        },
      });
    };

    announceDevice();
    const heartbeat = window.setInterval(announceDevice, PLICKER_DEVICE_HEARTBEAT_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) announceDevice();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [canWriteToFirestore, deviceRole, ownerUid, saveRoomFields, syncReady]);

  useEffect(() => {
    if (!syncReady || !ownerUid || (!sets.length && !Object.keys(deletedQuestionSetIds).length)) return;
    const remoteSets = currentRoomRef.current?.librarySets || [];
    const combined = mergePlickerQuestionSets(
      sets,
      remoteSets as ClassroomQuestionSet[],
      deletedQuestionSetIds,
    );
    if (combined !== sets) {
      setSets(combined);
      return;
    }
    const remoteDeleted = currentRoomRef.current?.deletedQuestionSetIds || {};
    if (JSON.stringify(combined) === JSON.stringify(remoteSets) &&
        JSON.stringify(deletedQuestionSetIds) === JSON.stringify(remoteDeleted)) return;

    const timer = window.setTimeout(() => {
      void saveRoomFields({
        librarySets: combined.map(sanitizePlickerQuestionSet),
        deletedQuestionSetIds,
      });
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [deletedQuestionSetIds, ownerUid, saveRoomFields, sets, syncReady]);

  useEffect(() => {
    if (!categoriesReady || !syncReady || !ownerUid || isAdministrator) return;
    const remoteRosters = currentRoomRef.current?.rosters || {};
    const mergedDeletedClasses = mergePlickerDeletedClasses(
      deletedClassIds,
      cloudDeletedClassIdsRef.current,
    );
    if (mergedDeletedClasses !== deletedClassIds) {
      setDeletedClassIds(mergedDeletedClasses);
      return;
    }
    const changed: Record<string, Student[]> = {};

    for (const classroom of categories) {
      if (mergedDeletedClasses[classroom.id]) continue;
      const students = sanitizePlickerStudents(registeredStudents.filter(student => student.classId === classroom.id));
      const alreadySynchronized = Object.prototype.hasOwnProperty.call(remoteRosters, classroom.id);
      if (!students.length && !alreadySynchronized) continue;
      if (JSON.stringify(students) !== JSON.stringify(remoteRosters[classroom.id] || [])) {
        changed[classroom.id] = students;
      }
    }

    for (const classId of Object.keys(mergedDeletedClasses)) {
      if ((remoteRosters[classId] || []).length > 0) changed[classId] = [];
    }
    Object.assign(changed, getPlickerOrphanedRosterChanges(
      cloudRostersRef.current,
      categories.map(classroom => classroom.id),
    ));

    const deletionMarkersChanged = JSON.stringify(mergedDeletedClasses) !== JSON.stringify(cloudDeletedClassIdsRef.current);
    if (!Object.keys(changed).length && !deletionMarkersChanged) return;
    const timer = window.setTimeout(() => {
      void saveRoomFields({
        ...(Object.keys(changed).length ? { rosters: changed } : {}),
        deletedClassIds: mergedDeletedClasses,
      });
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [categories, categoriesReady, deletedClassIds, isAdministrator, ownerUid, registeredStudents, saveRoomFields, syncReady]);

  useEffect(() => {
    const refreshInstallationState = () => {
      setPwaInstalled(isInstalledPwa());
      setPwaPromptReady(hasPwaInstallationPrompt());
    };
    const markInstalled = () => setPwaInstalled(true);
    const displayMode = window.matchMedia?.('(display-mode: standalone)');

    window.addEventListener(PWA_INSTALL_STATE_EVENT, refreshInstallationState);
    window.addEventListener('appinstalled', markInstalled);
    displayMode?.addEventListener?.('change', refreshInstallationState);

    return () => {
      window.removeEventListener(PWA_INSTALL_STATE_EVENT, refreshInstallationState);
      window.removeEventListener('appinstalled', markInstalled);
      displayMode?.removeEventListener?.('change', refreshInstallationState);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(createTeacherStorageKey(SETS_STORAGE_KEY, ownerUid), JSON.stringify(sets));
  }, [ownerUid, sets]);

  useEffect(() => {
    localStorage.setItem(createTeacherStorageKey(DELETED_SETS_STORAGE_KEY, ownerUid), JSON.stringify(deletedQuestionSetIds));
  }, [deletedQuestionSetIds, ownerUid]);

  useEffect(() => {
    localStorage.setItem(createTeacherStorageKey(DELETED_CLASSES_STORAGE_KEY, ownerUid), JSON.stringify(deletedClassIds));
  }, [deletedClassIds, ownerUid]);

  useEffect(() => {
    localStorage.setItem(createTeacherStorageKey(REPORTS_STORAGE_KEY, ownerUid), JSON.stringify(reports));
  }, [ownerUid, reports]);

  useEffect(() => {
    if (isAdministrator) {
      setReports(synchronizedReports);
      return;
    }
    const ownedReports = synchronizedReports.filter(report => report.teacherId === ownerUid);
    if (!ownedReports.length) return;

    setReports(previous => {
      const combined = new Map<string, ClassroomReport>(previous
        .filter(report => !report.teacherId || report.teacherId === ownerUid)
        .map(report => [report.id, report]));
      for (const report of ownedReports) combined.set(report.id, report);
      return [...combined.values()]
        .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
        .slice(0, 100);
    });
  }, [isAdministrator, ownerUid, synchronizedReports]);

  useEffect(() => {
    if (!categoriesReady || !ownerUid) return;
    const migrationKey = createTeacherStorageKey('plicker_legacy_reports_migrated', ownerUid);
    if (localStorage.getItem(migrationKey) === '1') return;
    localStorage.setItem(migrationKey, '1');

    try {
      const legacyValue = localStorage.getItem(REPORTS_STORAGE_KEY);
      const legacyReports = legacyValue ? JSON.parse(legacyValue) as ClassroomReport[] : [];
      const ownedClassIds = new Set(categories.map(category => category.id));
      const recoverableReports = legacyReports.filter(report =>
        report?.id && (isAdministrator || ownedClassIds.has(report.classId)),
      );
      if (!recoverableReports.length) return;

      if (!isAdministrator) {
        setReports(previous => {
          const combined = new Map<string, ClassroomReport>(previous.map(report => [report.id, report]));
          for (const report of recoverableReports) combined.set(report.id, { ...report, teacherId: ownerUid });
          return [...combined.values()]
            .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
            .slice(0, 100);
        });
      }

      for (const report of recoverableReports) {
        const categoryOwnerUid = categories.find(category => category.id === report.classId)?.authorId;
        const reportOwnerUid = isAdministrator && categoryOwnerUid && categoryOwnerUid !== 'admin'
          ? categoryOwnerUid
          : ownerUid;
        const portableReport = JSON.parse(JSON.stringify({ ...report, teacherId: reportOwnerUid })) as ClassroomReport;
        void setDoc(doc(db, 'wall_posts', createPlickerReportDocumentId(reportOwnerUid, report.id)), {
          kind: 'plicker_report',
          authorId: reportOwnerUid,
          teacherId: reportOwnerUid,
          report: portableReport,
          createdAt: report.completedAt,
        }).catch(error => console.error('Không thể khôi phục báo cáo cũ theo tài khoản:', error));
      }
    } catch (error) {
      console.error('Không thể đọc lịch sử báo cáo cũ:', error);
    }
  }, [categories, categoriesReady, isAdministrator, ownerUid]);

  useEffect(() => {
    localStorage.setItem(createTeacherStorageKey(REPORT_SETTINGS_STORAGE_KEY, ownerUid), JSON.stringify({
      ...reportSettings,
      examDate: '',
    }));
  }, [ownerUid, reportSettings]);

  useEffect(() => {
    if ((!selectedClassId || !categories.some(item => item.id === selectedClassId)) && categories[0]) {
      setSelectedClassId(categories[0].id);
    } else if (selectedClassId && categories.length === 0) {
      setSelectedClassId('');
    }
    if (pendingClassTitle) {
      const created = categories.find(item => item.title === pendingClassTitle);
      if (created) {
        setSelectedClassId(created.id);
        setPendingClassTitle('');
      }
    }
  }, [categories, pendingClassTitle, selectedClassId]);

  useEffect(() => {
    if (!selectedSetId && visibleQuestionSets[0]) setSelectedSetId(visibleQuestionSets[0].id);
  }, [selectedSetId, visibleQuestionSets]);

  const recordAnswer = useCallback((
    student: Student,
    cardId: number,
    answer: PlickerAnswer,
    confidence: number,
    source: 'camera' | 'manual',
  ) => {
    if (!questionKey) return;
    if (currentQuestion?.options[answer] === undefined) return;
    const previousAnswer = currentAnswersRef.current.find(item => item.studentId === student.id);
    if (previousAnswer?.answer === answer && previousAnswer.source === source) return;
    const response: ClassroomResponse = {
      studentId: student.id,
      studentName: student.name,
      cardId,
      answer,
      confidence,
      timestamp: Date.now(),
      source,
    };
    setAnswersByQuestion(previous => {
      const questionAnswers = previous[questionKey] || [];
      const existing = questionAnswers.find(item => item.studentId === student.id);
      if (existing?.answer === answer && existing.source === source) return previous;
      return {
        ...previous,
        [questionKey]: [
          ...questionAnswers.filter(item => item.studentId !== student.id),
          response,
        ],
      };
    });

    const activeSession = currentRoomRef.current?.activeSession;
    if (activeSession && activeSession.sessionId === sessionIdRef.current && /^[a-zA-Z0-9_-]+$/.test(student.id)) {
      queueLiveAnswerFields({
        [`activeSession.answersByQuestion.${questionKey}.${student.id}`]: response,
      });
    }
  }, [currentQuestion, questionKey, queueLiveAnswerFields]);

  // A synchronized roster or answer must not stop/reopen the camera. Read the
  // latest students and answer handler from each frame instead of effect deps.
  const scanContextRef = useRef({ studentsByCard: classStudentsByCard, record: recordAnswer });
  scanContextRef.current = { studentsByCard: classStudentsByCard, record: recordAnswer };
  const cameraActive = scanning && view === 'session' && Boolean(currentQuestion) && classStudents.length > 0;

  useEffect(() => {
    consensusRef.current.reset();
  }, [questionKey, selectedClassId, liveSession?.sessionId]);

  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;
    let animationFrame = 0;
    let stream: MediaStream | null = null;
    let attachedVideo: HTMLVideoElement | null = null;
    let lastFrame = 0;
    let measuredFrames = 0;
    let measurementStarted = performance.now();
    const processing = document.createElement('canvas');
    const processingContext = processing.getContext('2d', { willReadFrequently: true });
    consensusRef.current.reset();

    const renderDetections = (detections: DetectedPlickerCard[], studentsByCard: Map<number, Student>) => {
      const overlay = overlayRef.current;
      const context = overlay?.getContext('2d');
      if (!overlay || !context) return;
      if (overlay.width !== processing.width || overlay.height !== processing.height) {
        overlay.width = processing.width;
        overlay.height = processing.height;
      }
      context.clearRect(0, 0, overlay.width, overlay.height);

      for (const detection of detections) {
        const student = studentsByCard.get(detection.cardId);
        if (!student) continue;
        context.strokeStyle = '#34d399';
        context.lineWidth = 3;
        context.beginPath();
        detection.corners.forEach((corner, index) => {
          if (index === 0) context.moveTo(corner.x, corner.y);
          else context.lineTo(corner.x, corner.y);
        });
        context.closePath();
        context.stroke();
        const label = `#${detection.cardId} ${student.name}: ${detection.answer}`;
        context.font = 'bold 15px system-ui';
        const textWidth = context.measureText(label).width;
        context.fillStyle = 'rgba(5, 150, 105, 0.94)';
        context.fillRect(detection.center.x - textWidth / 2 - 9, detection.center.y - 34, textWidth + 18, 27);
        context.fillStyle = '#ffffff';
        context.fillText(label, detection.center.x - textWidth / 2, detection.center.y - 15);
      }
    };

    const scanFrame = (timestamp: number) => {
      if (cancelled) return;
      animationFrame = requestAnimationFrame(scanFrame);
      const video = videoRef.current;
      if (!video || !processingContext || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
      if (timestamp - lastFrame < 145) return;
      lastFrame = timestamp;

      const scale = Math.min(1, 680 / video.videoWidth, 960 / video.videoHeight);
      const frameWidth = Math.max(1, Math.round(video.videoWidth * scale));
      const frameHeight = Math.max(1, Math.round(video.videoHeight * scale));
      if (processing.width !== frameWidth || processing.height !== frameHeight) {
        processing.width = frameWidth;
        processing.height = frameHeight;
      }
      processingContext.drawImage(video, 0, 0, processing.width, processing.height);
      const frame = processingContext.getImageData(0, 0, processing.width, processing.height);
      const { studentsByCard, record } = scanContextRef.current;
      const detections = detectPlickerCards(frame).filter(item => studentsByCard.has(item.cardId));
      renderDetections(detections, studentsByCard);
      const stable = consensusRef.current.update(detections, timestamp);
      for (const detection of stable) {
        const student = studentsByCard.get(detection.cardId);
        if (student) record(student, detection.cardId, detection.answer, detection.confidence, 'camera');
      }

      measuredFrames += 1;
      if (timestamp - measurementStarted >= 750) {
        setCameraStats({
          fps: Math.round((measuredFrames * 1000) / (timestamp - measurementStarted)),
          candidates: detections.length,
          confidence: detections.length
            ? Math.round(detections.reduce((sum, item) => sum + item.confidence, 0) * 100 / detections.length)
            : 0,
        });
        measuredFrames = 0;
        measurementStarted = timestamp;
      }
    };

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Trình duyệt không hỗ trợ camera. Hãy sử dụng Chrome hoặc Edge mới nhất.');
        }
        const portraitScanner = window.innerHeight > window.innerWidth;
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: portraitScanner ? 720 : 1280 },
            height: { ideal: portraitScanner ? 1280 : 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) throw new Error('Màn hình quét chưa sẵn sàng. Hãy mở lại camera.');
        attachedVideo = video;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setScanError('');
        animationFrame = requestAnimationFrame(scanFrame);
      } catch (error) {
        if (!cancelled) {
          setScanError(readableCameraError(error));
          setScanning(false);
        }
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach(track => track.stop());
      if (attachedVideo?.srcObject === stream) attachedVideo.srcObject = null;
      const overlay = overlayRef.current;
      overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    };
  }, [cameraActive, deviceRole, showProjector]);

  const publishLiveSession = async (session: PlickerLiveSession) => {
    if (!liveRoomReference || !ownerUid) return;
    const previous = currentRoomRef.current;
    const room: PlickerLiveRoom = {
      kind: 'plicker_live_session',
      ownerUid,
      authorId: ownerUid,
      librarySets: mergePlickerQuestionSets(
        sets.map(sanitizePlickerQuestionSet),
        previous?.librarySets || [],
        deletedQuestionSetIdsRef.current,
      ),
      deletedQuestionSetIds: deletedQuestionSetIdsRef.current,
      deletedClassIds: deletedClassIdsRef.current,
      rosters: { ...previous?.rosters, [session.classId]: session.students },
      devices: {
        ...previous?.devices,
        [deviceRole]: { deviceId: deviceIdRef.current, updatedAt: Date.now() },
      },
      activeSession: session,
      updatedAt: Date.now(),
    };
    currentRoomRef.current = room;
    setLiveRoom(room);

    if (!canWriteToFirestore()) return;
    try {
      await setDoc(liveRoomReference, room);
      setSyncError('');
    } catch (error) {
      reportSynchronizationError(error);
    }
  };

  const switchView = (next: ClassroomView) => {
    if (next !== 'session' && scanning) {
      setScanning(false);
      void updateLiveSessionFields({ 'activeSession.phase': 'results' });
    }
    setView(next);
    setNotice('');
  };

  const startSession = () => {
    if (!selectedClass || classStudents.length === 0) {
      setNotice('Hãy chọn lớp có học sinh trước khi bắt đầu buổi học.');
      setView('classes');
      return;
    }
    if (!selectedSet || selectedSet.questions.length === 0) {
      setNotice('Hãy chọn hoặc tạo bộ câu hỏi trước khi bắt đầu.');
      setView('library');
      return;
    }
    setQuestionIndex(0);
    setAnswersByQuestion({});
    sessionIdRef.current = createIdentifier('session');
    setShowCorrect(false);
    setShowGraph(false);
    setScanError('');
    setView('session');

    try {
      const session = createPlickerLiveSession({
        sessionId: sessionIdRef.current,
        ownerUid,
        classId: selectedClass.id,
        className: selectedClass.title,
        students: classStudents,
        questionSet: selectedSet,
        controllerDeviceId: deviceIdRef.current,
      });
      followedSessionIdRef.current = session.sessionId;
      void publishLiveSession(session);
      if (deviceRole === 'display' && !isPlickerDeviceOnline(currentRoomRef.current?.devices.scanner, Date.now())) {
        setShowPairingHelp(true);
      }
      setNotice('Buổi học đã sẵn sàng. Điện thoại cùng tài khoản sẽ tự nhận phiên; nếu là lần đầu, chỉ cần quét mã QR mở nhanh.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không thể tạo buổi học đồng bộ.');
    }
  };

  const startScanningCards = () => {
    setDeviceRole('scanner');
    if (!currentRoomRef.current?.activeSession || currentRoomRef.current.activeSession.phase === 'finished') {
      startSession();
    }
    setScanError('');
    setScanning(true);
    void updateLiveSessionFields({
      'activeSession.phase': 'scanning',
      'activeSession.controllerDeviceId': deviceIdRef.current,
      'activeSession.showCorrect': false,
      'activeSession.showGraph': false,
    });
  };

  const stopScanningCards = () => {
    setScanning(false);
    void updateLiveSessionFields({ 'activeSession.phase': 'results' });
  };

  const changeQuestion = (nextIndex: number) => {
    if (!selectedSet) return;
    const safeIndex = Math.max(0, Math.min(selectedSet.questions.length - 1, nextIndex));
    setScanning(false);
    setQuestionIndex(safeIndex);
    setShowCorrect(false);
    setShowGraph(false);
    consensusRef.current.reset();
    void updateLiveSessionFields({
      'activeSession.questionIndex': safeIndex,
      'activeSession.phase': 'launch',
      'activeSession.showCorrect': false,
      'activeSession.showGraph': false,
      'activeSession.controllerDeviceId': deviceIdRef.current,
    });
  };

  const toggleCorrectAnswer = () => {
    const next = !showCorrect;
    setShowCorrect(next);
    void updateLiveSessionFields({ 'activeSession.showCorrect': next });
  };

  const toggleAnswerGraph = () => {
    const next = !showGraph;
    setShowGraph(next);
    void updateLiveSessionFields({ 'activeSession.showGraph': next });
  };

  const resetCurrentAnswers = () => {
    if (!questionKey) return;
    setAnswersByQuestion(previous => ({ ...previous, [questionKey]: [] }));
    consensusRef.current.reset();
    void updateLiveSessionFields({ [`activeSession.answersByQuestion.${questionKey}`]: {} });
  };

  const openClassroomDisplay = () => {
    setDeviceRole('display');
    setScanning(false);
    setShowProjector(true);
  };

  const finishSession = () => {
    setScanning(false);
    if (!selectedClass || !selectedSet) return;
    const report: ClassroomReport = {
      id: sessionIdRef.current,
      teacherId: ownerUid,
      classId: selectedClass.id,
      className: selectedClass.title,
      setTitle: selectedSet.title,
      completedAt: new Date().toISOString(),
      studentCount: classStudents.length,
      students: classStudents.map(student => ({
        id: student.id,
        classId: student.classId,
        name: student.name,
        ...(student.cardId ? { cardId: student.cardId } : {}),
      })),
      questions: selectedSet.questions.map(question => ({
        text: question.text,
        correctAnswer: question.correctAnswer,
        gradingType: question.gradingType,
        points: normalizePlickerQuestionPoints(question.points),
        responses: answersByQuestion[`${selectedSet.id}:${question.id}`] || [],
      })),
    };
    setReports(previous => [report, ...previous.filter(item => item.id !== report.id)].slice(0, 100));
    if (ownerUid) {
      const portableReport = JSON.parse(JSON.stringify(report)) as ClassroomReport;
      void setDoc(doc(db, 'wall_posts', createPlickerReportDocumentId(ownerUid, report.id)), {
        kind: 'plicker_report',
        authorId: ownerUid,
        teacherId: ownerUid,
        report: portableReport,
        createdAt: report.completedAt,
      }).catch(error => {
        console.error('Không thể đồng bộ báo cáo lớp học riêng của giáo viên:', error);
        setNotice('Báo cáo đã lưu trên thiết bị nhưng chưa đồng bộ lên tài khoản.');
      });
    }
    setSelectedReportId(report.id);
    setView('reports');
    setNotice('Đã dừng buổi học và lưu báo cáo.');
    void updateLiveSessionFields({
      'activeSession.phase': 'finished',
      'activeSession.showGraph': true,
    });
  };

  const openNewSet = () => {
    const now = new Date().toISOString();
    setEditingSet({
      id: createIdentifier('set'),
      title: 'Bộ câu hỏi mới',
      questions: [defaultQuestion()],
      createdAt: now,
      updatedAt: now,
    });
  };

  const saveSet = () => {
    if (!editingSet) return;
    const cleaned = sanitizePlickerQuestionSet({
      ...editingSet,
      title: editingSet.title.trim() || 'Bộ câu hỏi chưa đặt tên',
      questions: editingSet.questions.filter(question => question.text.trim()),
      updatedAt: new Date().toISOString(),
    }) as ClassroomQuestionSet;
    if (cleaned.questions.length === 0) {
      setNotice('Bộ câu hỏi cần có ít nhất một câu hỏi.');
      return;
    }
    const nextLibrary = sets.some(item => item.id === cleaned.id)
      ? sets.map(item => item.id === cleaned.id ? cleaned : item)
      : [cleaned, ...sets];
    if (new TextEncoder().encode(JSON.stringify(nextLibrary)).length > 720_000) {
      setNotice('Bộ câu hỏi có quá nhiều tệp đính kèm để đồng bộ. Hãy dùng video YouTube hoặc đường dẫn hình ảnh/âm thanh trực tuyến.');
      return;
    }
    setSets(previous => {
      const exists = previous.some(item => item.id === cleaned.id);
      return exists ? previous.map(item => item.id === cleaned.id ? cleaned : item) : [cleaned, ...previous];
    });
    setSelectedSetId(cleaned.id);
    setEditingSet(null);
    setView('library');
  };

  const openQuestionImport = (target: 'new' | 'editing' = 'new') => {
    setQuestionImportTarget(target);
    setQuestionImportTitle(target === 'editing' && editingSet
      ? editingSet.title
      : 'Bộ câu hỏi nhập nhanh');
    setQuestionImportText('');
    setQuestionImportSource('');
    setQuestionImportError('');
    setQuestionImportOpen(true);
  };

  const pickQuestionWordFile = (target: 'new' | 'editing' = 'new') => {
    setQuestionImportTarget(target);
    setQuestionImportError('');
    questionImportInputRef.current?.click();
  };

  const importQuestionWordFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setQuestionImportBusy(true);
    setQuestionImportError('');
    setQuestionImportOpen(true);
    try {
      const imported = await readPlickerQuestionFile(file);
      setQuestionImportText(imported.text);
      if (questionImportTarget === 'new') setQuestionImportTitle(imported.title);
      setQuestionImportSource(imported.fileName);
      if (parsePlickerQuestionText(imported.text).questions.length === 0) {
        setQuestionImportError('Đã đọc tệp Word nhưng chưa nhận ra câu hỏi. Hãy kiểm tra mẫu Câu 1, A., B., C., D. bên dưới.');
      }
    } catch (error) {
      setQuestionImportError(error instanceof Error ? error.message : 'Không thể đọc tệp Word.');
    } finally {
      setQuestionImportBusy(false);
    }
  };

  const applyImportedQuestions = () => {
    if (questionImportPreview.questions.length === 0) {
      setQuestionImportError('Chưa nhận ra câu hỏi hợp lệ. Mỗi câu cần nội dung và ít nhất hai phương án A, B.');
      return;
    }

    if (questionImportTarget === 'editing' && editingSet) {
      const existing = editingSet.questions.filter(question => question.text.trim());
      const firstId = Math.max(...editingSet.questions.map(question => question.id), 0) + 1;
      const imported = questionImportPreview.questions.map((question, index) => ({
        ...question,
        id: firstId + index,
        points: PLICKER_DEFAULT_QUESTION_POINTS,
      }));
      setEditingSet({
        ...editingSet,
        questions: [...existing, ...imported],
        updatedAt: new Date().toISOString(),
      });
      setNotice(`Đã thêm ${imported.length} câu hỏi vào bộ đang soạn. Hãy nhấn “Lưu bộ câu hỏi”.`);
    } else {
      const now = new Date().toISOString();
      const importedSet: ClassroomQuestionSet = {
        id: createIdentifier('set'),
        title: questionImportTitle.trim() || questionImportSource.replace(/\.[^.]+$/u, '') || 'Bộ câu hỏi nhập nhanh',
        questions: questionImportPreview.questions.map(question => ({
          ...question,
          points: PLICKER_DEFAULT_QUESTION_POINTS,
        })),
        createdAt: now,
        updatedAt: now,
      };
      setSets(previous => [importedSet, ...previous]);
      setSelectedSetId(importedSet.id);
      setQuestionIndex(0);
      setView('library');
      setNotice(`Đã tạo bộ “${importedSet.title}” với ${importedSet.questions.length} câu hỏi.`);
    }

    setQuestionImportOpen(false);
    setQuestionImportError('');
    setQuestionImportText('');
    setQuestionImportSource('');
  };

  const confirmReportDeletion = () => {
    if (!deletingReport) return;
    const result = deletePlickerReport(reports, deletingReport.id, selectedReportId);
    const reportOwnerUid = deletingReport.teacherId || ownerUid;
    if (reportOwnerUid && deletingReport.teacherId) {
      void deleteDoc(doc(db, 'wall_posts', createPlickerReportDocumentId(reportOwnerUid, deletingReport.id)))
        .catch(error => console.error('Không thể xóa báo cáo đã đồng bộ:', error));
    }
    setReports(result.reports);
    setSelectedReportId(result.selectedReportId);
    setDeletingReport(null);
    setNotice(`Đã xóa báo cáo lớp ${deletingReport.className}: ${deletingReport.setTitle}.`);
  };

  const confirmQuestionSetDeletion = () => {
    if (!deletingSet) return;
    const deletedAt = Date.now();
    const deleted = mergePlickerDeletedQuestionSets(
      deletedQuestionSetIdsRef.current,
      { [deletingSet.id]: deletedAt },
    );
    const remaining = sets.filter(set => set.id !== deletingSet.id);
    const currentSession = currentRoomRef.current?.activeSession;
    const endsActiveSession = Boolean(
      currentSession && currentSession.phase !== 'finished' &&
      currentSession.questionSet.id === deletingSet.id,
    );
    const finishedSession = currentSession && endsActiveSession
      ? { ...currentSession, phase: 'finished' as const, updatedAt: deletedAt }
      : currentSession;

    deletedQuestionSetIdsRef.current = deleted;
    setDeletedQuestionSetIds(deleted);
    setSets(remaining);
    if (selectedSetId === deletingSet.id) {
      setSelectedSetId(remaining[0]?.id || '');
      setQuestionIndex(0);
    }
    if (editingSet?.id === deletingSet.id) setEditingSet(null);
    if (endsActiveSession) {
      setScanning(false);
      if (view === 'session') setView('library');
    }

    if (currentRoomRef.current) {
      const nextRoom: PlickerLiveRoom = {
        ...currentRoomRef.current,
        librarySets: remaining.map(sanitizePlickerQuestionSet),
        deletedQuestionSetIds: deleted,
        activeSession: finishedSession || null,
        updatedAt: deletedAt,
      };
      currentRoomRef.current = nextRoom;
      setLiveRoom(nextRoom);
    }

    void saveRoomFields({
      librarySets: remaining.map(sanitizePlickerQuestionSet),
      deletedQuestionSetIds: deleted,
      ...(endsActiveSession ? { activeSession: finishedSession } : {}),
    });
    setNotice(`Đã xóa bộ câu hỏi “${deletingSet.title}” trên các thiết bị đã kết nối.`);
    setDeletingSet(null);
  };

  const confirmClassDeletion = async () => {
    if (!deletingClass || deletingClassBusy) return;
    const classroom = deletingClass;
    const studentCount = allStudents.filter(student => student.classId === classroom.id).length;
    setDeletingClassBusy(true);

    try {
      await onDeleteClass(classroom.id);
      const deletedAt = Date.now();
      const deleted = mergePlickerDeletedClasses(
        deletedClassIdsRef.current,
        { [classroom.id]: deletedAt },
      );
      const currentSession = currentRoomRef.current?.activeSession;
      const endsActiveSession = Boolean(
        currentSession && currentSession.phase !== 'finished' && currentSession.classId === classroom.id,
      );
      const finishedSession = currentSession && endsActiveSession
        ? { ...currentSession, phase: 'finished' as const, updatedAt: deletedAt }
        : currentSession;

      deletedClassIdsRef.current = deleted;
      setDeletedClassIds(deleted);
      if (selectedClassId === classroom.id) {
        setSelectedClassId(categories.find(item => item.id !== classroom.id)?.id || '');
      }
      setAddStudentsModal(false);
      setEditingStudent(null);
      setDeletingStudent(null);
      setPrintCards(false);
      if (endsActiveSession) {
        setScanning(false);
        setShowProjector(false);
        if (view === 'session') setView('classes');
      }

      if (currentRoomRef.current) {
        const nextRoom: PlickerLiveRoom = {
          ...currentRoomRef.current,
          deletedClassIds: deleted,
          rosters: { ...currentRoomRef.current.rosters, [classroom.id]: [] },
          activeSession: finishedSession || null,
          updatedAt: deletedAt,
        };
        currentRoomRef.current = nextRoom;
        setLiveRoom(nextRoom);
      }

      void saveRoomFields({
        rosters: { [classroom.id]: [] },
        deletedClassIds: deleted,
        ...(endsActiveSession ? { activeSession: finishedSession } : {}),
      });
      setNotice(`Đã xóa lớp “${classroom.title}” và ${studentCount} học sinh trên các thiết bị đã kết nối.`);
      setDeletingClass(null);
    } catch (error) {
      console.error('Không thể xóa lớp học tương tác thẻ:', error);
      setNotice('Không thể xóa lớp học. Hãy kiểm tra kết nối mạng rồi thử lại.');
    } finally {
      setDeletingClassBusy(false);
    }
  };

  const submitClass = () => {
    const title = classTitle.trim();
    if (!title) return;
    const names = studentText.split(/\r?\n/).map(name => name.trim()).filter(Boolean).slice(0, PLICKER_CARD_LIMIT);
    onCreateClass(title, names);
    setPendingClassTitle(title);
    setClassModal(false);
    setClassTitle('');
    setStudentText('');
    setNotice(`Đã tạo lớp ${title} với ${names.length} học sinh.`);
  };

  const submitStudents = () => {
    if (!selectedClassId) return;
    const capacity = Math.max(0, PLICKER_CARD_LIMIT - classStudents.length);
    const names = studentText.split(/\r?\n/).map(name => name.trim()).filter(Boolean).slice(0, capacity);
    if (names.length === 0) return;
    onAddStudents(selectedClassId, names);
    setAddStudentsModal(false);
    setStudentText('');
    setNotice(`Đã thêm ${names.length} học sinh và cấp mã thẻ tự động.`);
  };

  const openStudentEditor = (student: Student) => {
    setEditingStudent(student);
    setEditingStudentName(student.name);
  };

  const submitStudentEdit = () => {
    const name = editingStudentName.trim();
    if (!editingStudent || !name) return;
    onUpdateStudent(editingStudent.id, name);
    setAnswersByQuestion(previous => Object.fromEntries(
      Object.entries(previous).map(([key, responses]: [string, ClassroomResponse[]]) => [
        key,
        responses.map(response => response.studentId === editingStudent.id
          ? { ...response, studentName: name }
          : response),
      ]),
    ));
    setNotice(`Đã cập nhật tên học sinh thành ${name}. Mã thẻ được giữ nguyên.`);
    setEditingStudent(null);
    setEditingStudentName('');
  };

  const confirmStudentDeletion = () => {
    if (!deletingStudent) return;
    onDeleteStudent(deletingStudent.id);
    setAnswersByQuestion(previous => Object.fromEntries(
      Object.entries(previous).map(([key, responses]: [string, ClassroomResponse[]]) => [
        key,
        responses.filter(response => response.studentId !== deletingStudent.id),
      ]),
    ));
    consensusRef.current.reset();
    setNotice(`Đã xóa học sinh ${deletingStudent.name}. Mã thẻ của các học sinh khác được giữ nguyên.`);
    setDeletingStudent(null);
  };

  const navigation: { id: ClassroomView; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'classes', label: 'Lớp học', icon: <Users className="h-4 w-4" /> },
    { id: 'library', label: 'Bộ câu hỏi', icon: <Layers className="h-4 w-4" /> },
    { id: 'session', label: 'Buổi học', icon: <ScanLine className="h-4 w-4" /> },
    { id: 'cards', label: 'In thẻ', icon: <QrCode className="h-4 w-4" /> },
    { id: 'reports', label: 'Báo cáo', icon: <BarChart3 className="h-4 w-4" /> },
  ];

  const totalRecorded = reports.reduce((sum, report) =>
    sum + report.questions.reduce((questionSum, question) => questionSum + question.responses.length, 0), 0);
  const scannerConnected = isPlickerDeviceOnline(liveRoom?.devices.scanner, presenceNow);
  const displayConnected = isPlickerDeviceOnline(liveRoom?.devices.display, presenceNow);
  const answerDistribution = summarizePlickerLiveAnswers(currentAnswers);
  const scannerUrlObject = new URL(createPlickerDevicePath(import.meta.env.BASE_URL, 'scanner'), window.location.origin);
  if (sessionInProgress) scannerUrlObject.searchParams.set('section', 'session');
  const scannerUrl = scannerUrlObject.toString();
  const displayUrl = new URL(createPlickerDevicePath(import.meta.env.BASE_URL, 'display'), window.location.origin).toString();

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(scannerUrl, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then(dataUrl => {
        if (!cancelled) setScannerQrCode(dataUrl);
      })
      .catch(error => {
        console.error('Không thể tạo mã QR kết nối điện thoại:', error);
        if (!cancelled) setScannerQrCode('');
      });
    return () => { cancelled = true; };
  }, [scannerUrl]);

  const installClassroomApplication = async () => {
    const result = await promptPwaInstallation();
    if (result === 'accepted') {
      setPwaInstalled(true);
      setNotice('Đã cài ứng dụng Thẻ tương tác lớp học lên thiết bị.');
    } else if (result === 'unavailable') {
      setShowInstallHelp(true);
    }
  };

  if (deviceRole === 'scanner' && view === 'session' && currentQuestion && selectedClass && !showProjector) {
    return (
      <PlickerMobileScanner
        className={selectedClass.title}
        question={currentQuestion}
        questionIndex={questionIndex}
        questionCount={selectedSet?.questions.length || 1}
        students={classStudents}
        responses={currentAnswers}
        distribution={answerDistribution}
        scanning={scanning}
        scanError={scanError}
        connected={syncReady && isOnline && !syncError}
        displayConnected={displayConnected}
        showCorrect={showCorrect}
        showGraph={showGraph}
        videoRef={videoRef}
        overlayRef={overlayRef}
        onStartScan={startScanningCards}
        onStopScan={stopScanningCards}
        onPrevious={() => changeQuestion(questionIndex - 1)}
        onNext={() => changeQuestion(questionIndex + 1)}
        onClearResponses={resetCurrentAnswers}
        onToggleCorrect={toggleCorrectAnswer}
        onToggleGraph={toggleAnswerGraph}
        onExit={() => switchView('overview')}
      />
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50 text-slate-900">
      <input
        ref={questionImportInputRef}
        type="file"
        accept=".docx,.doc,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={event => void importQuestionWordFile(event)}
        className="hidden"
        aria-label="Chọn tệp Word chứa câu hỏi"
      />
      <header className="sticky top-0 z-30 border-b border-indigo-400/20 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} aria-label="Quay lại thư viện" className="rounded-xl border border-white/15 p-2 text-slate-200 hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="rounded-xl bg-indigo-500 p-2"><ScanLine className="h-5 w-5" /></div>
            <div>
              <h1 className="text-base font-bold md:text-lg">Thẻ tương tác lớp học</h1>
              <p className="text-xs text-indigo-200">Điện thoại quét · Máy tính trình chiếu · Tối đa 63 thẻ</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPairingHelp(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                syncReady && isOnline && !syncError
                  ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-300/40 bg-amber-500/10 text-amber-100'
              }`}
            >
              {syncReady && isOnline && !syncError ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {scannerConnected && displayConnected ? '2 thiết bị đang online' : scannerConnected ? 'Điện thoại đã sẵn sàng' : 'Kết nối điện thoại'}
            </button>
            <button type="button" onClick={openClassroomDisplay} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10">
              <MonitorPlay className="h-4 w-4" /> Màn hình lớp học
            </button>
            {!pwaInstalled && (
              <button
                type="button"
                onClick={() => void installClassroomApplication()}
                title={pwaPromptReady ? 'Cài ứng dụng lên điện thoại' : 'Xem hướng dẫn cài trên điện thoại'}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-300/45 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/25"
              >
                <Smartphone className="h-4 w-4" /> Cài ứng dụng
              </button>
            )}
            <button
              type="button"
              onClick={sessionInProgress ? finishSession : startSession}
              aria-pressed={sessionInProgress}
              data-session-action={sessionInProgress ? 'stop' : 'start'}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                sessionInProgress
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-indigo-500 text-white hover:bg-indigo-400'
              }`}
            >
              {sessionInProgress ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4" />}
              {sessionInProgress ? 'Dừng buổi học' : 'Bắt đầu buổi học'}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-3 md:px-5">
          {navigation.map(item => (
            <button
              key={item.id}
              onClick={() => switchView(item.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                view === item.id ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >{item.icon}{item.label}</button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">
        {(!isOnline || syncError) && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{syncError || 'Thiết bị đang ngoại tuyến. Kết nối Internet để điện thoại và máy tính cập nhật cùng lúc.'}</span>
          </div>
        )}
        {notice && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            <span>{notice}</span><button onClick={() => setNotice('')} aria-label="Đóng thông báo"><X className="h-4 w-4" /></button>
          </div>
        )}

        {view === 'overview' && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-6 text-white md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-100">Kiểm tra nhanh không cần thiết bị học sinh</p>
              <h2 className="mt-3 max-w-2xl text-2xl font-bold leading-tight md:text-4xl">Mỗi học sinh một thẻ. Cả lớp trả lời trong vài giây.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100">Tạo danh sách lớp, in thẻ mã riêng và dùng camera điện thoại hoặc laptop để nhận diện đáp án A, B, C, D theo hướng xoay của thẻ.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={startSession} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700">Mở buổi học</button>
                <button onClick={() => switchView('cards')} className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold">Xem bộ thẻ</button>
                {!pwaInstalled && (
                  <button onClick={() => void installClassroomApplication()} className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold">
                    <Smartphone className="h-4 w-4" /> Cài trên điện thoại
                  </button>
                )}
              </div>
            </section>

            <section className="grid gap-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><Smartphone className="h-6 w-6" /></div>
                <div><h3 className="font-semibold">Điện thoại: điều khiển và quét thẻ</h3><p className="mt-1 text-sm leading-6 text-slate-500">Chọn câu hỏi, bật camera, chuyển câu và hiện đáp án.</p></div>
              </div>
              <Link2 className="mx-auto h-6 w-6 text-indigo-400" />
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><MonitorPlay className="h-6 w-6" /></div>
                <div><h3 className="font-semibold">Máy tính: trình chiếu thời gian thực</h3><p className="mt-1 text-sm leading-6 text-slate-500">Hiển thị câu hỏi, học sinh đã trả lời và biểu đồ kết quả.</p></div>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-3">
                <button type="button" onClick={openClassroomDisplay} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><MonitorPlay className="h-4 w-4" />Mở màn hình trình chiếu</button>
                <button type="button" onClick={() => setShowPairingHelp(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><Smartphone className="h-4 w-4" />Hướng dẫn ghép thiết bị</button>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Lớp đã tạo" value={categories.length} note="Danh sách được gắn mã thẻ tự động" accent="bg-blue-50 text-blue-600" icon={<GraduationCap className="h-5 w-5" />} />
              <MetricCard title="Học sinh" value={registeredStudents.length} note="Mỗi lớp tối đa 63 mã thẻ riêng" accent="bg-emerald-50 text-emerald-600" icon={<Users className="h-5 w-5" />} />
              <MetricCard title="Bộ câu hỏi" value={visibleQuestionSets.length} note="Hỗ trợ câu hỏi và khảo sát A/B/C/D" accent="bg-amber-50 text-amber-600" icon={<Layers className="h-5 w-5" />} />
              <MetricCard title="Câu trả lời" value={totalRecorded} note={`${reports.length} buổi học đã lưu`} accent="bg-violet-50 text-violet-600" icon={<BarChart3 className="h-5 w-5" />} />
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {[
                { number: '01', title: 'Tạo lớp và in thẻ', text: 'Dán danh sách học sinh, hệ thống cấp mã thẻ từ 1 đến 63.', action: () => switchView('classes') },
                { number: '02', title: 'Soạn bộ câu hỏi', text: 'Nhập câu hỏi trắc nghiệm, chọn đáp án đúng hoặc chế độ khảo sát.', action: () => switchView('library') },
                { number: '03', title: 'Quét và xem báo cáo', text: 'Camera đọc đồng thời mã học sinh và cạnh A/B/C/D hướng lên trên.', action: startSession },
              ].map(step => (
                <button key={step.number} onClick={step.action} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-indigo-300">
                  <span className="text-sm font-bold text-indigo-500">{step.number}</span>
                  <h3 className="mt-2 font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{step.text}</p>
                </button>
              ))}
            </section>
          </div>
        )}

        {view === 'classes' && (
          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Lớp học</h2><button onClick={() => setClassModal(true)} className="rounded-lg bg-indigo-50 p-2 text-indigo-600" aria-label="Tạo lớp"><Plus className="h-4 w-4" /></button></div>
              <div className="space-y-2">
                {categories.map(item => {
                  const count = registeredStudents.filter(student => student.classId === item.id).length;
                  return <button key={item.id} onClick={() => setSelectedClassId(item.id)} className={`w-full rounded-xl border p-3 text-left ${item.id === selectedClassId ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}><div className="font-semibold">{item.title}</div><div className="mt-1 text-xs text-slate-500">{count} học sinh</div></button>;
                })}
                {categories.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Chưa có lớp. Chọn dấu + để tạo lớp đầu tiên.</p>}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-bold">{selectedClass?.title || 'Chọn lớp học'}</h2><p className="text-sm text-slate-500">{classStudents.length}/{PLICKER_CARD_LIMIT} mã thẻ đã cấp</p></div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={!selectedClass} onClick={() => setAddStudentsModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><UserPlus className="h-4 w-4" />Thêm học sinh</button>
                  <button disabled={!classStudents.length} onClick={() => setPrintCards(true)} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-50" aria-label="In thẻ"><Printer className="h-4 w-4" /></button>
                  <button
                    type="button"
                    disabled={!selectedClass}
                    onClick={() => selectedClass && setDeletingClass(selectedClass)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Xóa lớp ${selectedClass?.title || ''}`}
                    title="Xóa lớp học"
                  >
                    <Trash2 className="h-4 w-4" />Xóa lớp
                  </button>
                </div>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[590px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="pb-3">Mã thẻ</th>
                      <th className="pb-3">Họ và tên</th>
                      <th className="pb-3">Thẻ nhận diện</th>
                      <th className="pb-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.map((student, index) => {
                      const cardId = student.cardId || index + 1;
                      return (
                        <tr key={student.id} className="border-b border-slate-100">
                          <td className="py-3 font-semibold text-indigo-600">#{String(cardId).padStart(2, '0')}</td>
                          <td className="py-3 font-medium">{student.name}</td>
                          <td className="py-3"><MarkerSvg cardId={cardId} className="h-10 w-10" /></td>
                          <td className="py-3 text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openStudentEditor(student)}
                                aria-label={`Sửa học sinh ${student.name}`}
                                title="Sửa học sinh"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-200 text-indigo-600 transition-colors hover:bg-indigo-50"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingStudent(student)}
                                aria-label={`Xóa học sinh ${student.name}`}
                                title="Xóa học sinh"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {selectedClass && classStudents.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Lớp chưa có học sinh. Nhấn “Thêm học sinh” để dán danh sách.</p>}
              </div>
            </section>
          </div>
        )}

        {view === 'library' && !editingSet && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Thư viện câu hỏi</h2>
                <p className="text-sm text-slate-500">Tạo, dán, nhập Word hoặc chọn bộ câu hỏi để đưa vào buổi học.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openQuestionImport('new')}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  <ClipboardPaste className="h-4 w-4" />Dán câu hỏi
                </button>
                <button
                  type="button"
                  onClick={() => pickQuestionWordFile('new')}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  <FileUp className="h-4 w-4" />Nhập Word
                </button>
                <button
                  type="button"
                  onClick={openNewSet}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />Tạo bộ câu hỏi
                </button>
              </div>
            </div>

            {visibleQuestionSets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                <Layers className="mx-auto h-12 w-12 text-indigo-300" />
                <h3 className="mt-4 text-lg font-semibold">Chưa có bộ câu hỏi</h3>
                <p className="mt-2 text-sm text-slate-500">Tạo mới, dán nội dung hoặc chọn một tệp Word để bắt đầu.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleQuestionSets.map(set => (
                  <article
                    key={set.id}
                    className={`rounded-2xl border bg-white p-5 shadow-sm ${
                      selectedSetId === set.id ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Layers className="h-5 w-5" /></div>
                      <div className="flex items-center gap-2">
                        {selectedSetId === set.id && (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Đang chọn</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeletingSet(set)}
                          aria-label={`Xóa bộ câu hỏi ${set.title}`}
                          title="Xóa bộ câu hỏi"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-500 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <h3 className="mt-4 font-bold">{set.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{set.questions.length} câu hỏi · {formatDate(set.updatedAt)}</p>
                    <p className="mt-3 line-clamp-2 min-h-10 text-sm text-slate-600">{set.questions[0]?.text || 'Chưa có câu hỏi'}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSetId(set.id)}
                        className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"
                      >
                        Chọn bộ
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSet(JSON.parse(JSON.stringify(set)) as ClassroomQuestionSet)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium"
                      >
                        Chỉnh sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectedSetId(set.id); setTimeout(startSession, 0); }}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium"
                      >
                        Dạy ngay
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {editingSet && (
          <PlickerQuestionEditor
            questionSet={editingSet}
            ownerUid={ownerUid}
            onChange={updated => setEditingSet(updated)}
            onSave={saveSet}
            onCancel={() => setEditingSet(null)}
            onImportPaste={() => openQuestionImport('editing')}
            onImportWord={() => pickQuestionWordFile('editing')}
            onNotice={setNotice}
          />
        )}

        {view === 'session' && !editingSet && (
          <div className="space-y-5">
            <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]">
              <label className="text-xs font-medium text-slate-500">
                Lớp học
                <select value={selectedClassId} onChange={event => { setSelectedClassId(event.target.value); setScanning(false); }} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-900">
                  <option value="">Chọn lớp...</option>
                  {categories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">
                Bộ câu hỏi
                <select value={selectedSetId} onChange={event => { setSelectedSetId(event.target.value); setQuestionIndex(0); setScanning(false); }} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-900">
                  <option value="">Chọn bộ câu hỏi...</option>
                  {visibleQuestionSets.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button onClick={openClassroomDisplay} className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Mở màn hình trình chiếu"><Maximize2 className="h-5 w-5" /></button>
                <button onClick={finishSession} disabled={!currentQuestion} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Lưu báo cáo</button>
              </div>
            </section>

            {!selectedClass || !currentQuestion ? (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <ScanLine className="mx-auto h-12 w-12 text-indigo-400" />
                <h2 className="mt-4 font-bold">Sẵn sàng cho buổi học</h2>
                <p className="mt-2 text-sm text-slate-500">Chọn lớp và bộ câu hỏi để bắt đầu quét thẻ.</p>
              </section>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
                <section className="space-y-4">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Câu {questionIndex + 1}/{selectedSet?.questions.length || 0}</span>
                        {currentQuestion.correctAnswer && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Đáp án giáo viên: {currentQuestion.correctAnswer}</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => changeQuestion(questionIndex - 1)} disabled={questionIndex === 0} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40" aria-label="Câu hỏi trước"><ChevronLeft className="h-4 w-4" /></button>
                        <button onClick={() => changeQuestion(questionIndex + 1)} disabled={questionIndex >= (selectedSet?.questions.length || 1) - 1} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40" aria-label="Câu hỏi tiếp theo"><ChevronRight className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <h2 className="text-xl font-bold leading-8 md:text-2xl"><PlickerRichContent text={currentQuestion.text} html={currentQuestion.richText}><PlickerDisplayMath text={currentQuestion.text} /></PlickerRichContent></h2>
                    <PlickerQuestionMediaGallery media={currentQuestion.media} compact />
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {ANSWERS.map(answer => (
                        <div key={answer} className={`flex items-center gap-3 rounded-xl border p-3 ${showCorrect && currentQuestion.correctAnswer === answer ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${ANSWER_COLORS[answer]}`}>{answer}</span>
                          <span className="text-sm"><PlickerRichContent text={currentQuestion.options[answer] || '—'} html={currentQuestion.optionRichText?.[answer]}><PlickerDisplayMath text={currentQuestion.options[answer] || '—'} /></PlickerRichContent></span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button onClick={toggleCorrectAnswer} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        {showCorrect ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showCorrect ? 'Ẩn đáp án trên máy chiếu' : 'Hiện đáp án trên máy chiếu'}
                      </button>
                      <button onClick={toggleAnswerGraph} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <BarChart3 className="h-4 w-4" />{showGraph ? 'Ẩn biểu đồ trên máy chiếu' : 'Hiện biểu đồ trên máy chiếu'}
                      </button>
                      <button onClick={resetCurrentAnswers} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />Quét lại câu này</button>
                    </div>
                  </article>

                  <article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
                      <div className="flex items-center gap-2"><Camera className="h-4 w-4 text-indigo-300" /><span className="text-sm font-semibold">Camera quét thẻ</span></div>
                      <div className="flex items-center gap-3 text-xs text-slate-300"><span>{cameraStats.fps} khung/s</span><span>{cameraStats.candidates} thẻ</span>{cameraStats.confidence > 0 && <span>{cameraStats.confidence}% tin cậy</span>}</div>
                    </div>
                    <div className="relative aspect-video min-h-56 bg-slate-900">
                      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-contain" />
                      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
                      {!scanning && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 p-5 text-center text-white">
                          <ScanLine className="h-12 w-12 text-indigo-300" />
                          <p className="mt-3 text-sm text-slate-300">Đưa camera điện thoại về phía lớp. Máy tính sẽ thống kê đồng thời.</p>
                          <button onClick={startScanningCards} disabled={!classStudents.length} className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"><Play className="h-4 w-4" />Bắt đầu quét</button>
                        </div>
                      )}
                      {scanning && <button onClick={stopScanningCards} className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"><Square className="h-4 w-4" />Dừng quét</button>}
                    </div>
                    {scanError && <div className="border-t border-red-400/30 bg-red-950/70 p-3 text-sm text-red-100">{scanError}</div>}
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between"><h3 className="font-semibold">Kết quả trực tiếp</h3><span className="text-sm text-slate-500">{currentAnswers.length}/{classStudents.length} học sinh</span></div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {ANSWERS.map(answer => {
                        const count = answerDistribution[answer];
                        const percentage = currentAnswers.length ? Math.round(count * 100 / currentAnswers.length) : 0;
                        return <div key={answer} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${ANSWER_COLORS[answer]}`}>{answer}</span><span className="text-xs text-slate-500">{percentage}%</span></div><div className="mt-3 text-xl font-bold">{count}</div><div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${ANSWER_COLORS[answer]}`} style={{ width: `${percentage}%` }} /></div></div>;
                      })}
                    </div>
                  </article>
                </section>

                <aside className="space-y-4">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between"><h3 className="font-bold">Tiến độ lớp học</h3><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{classStudents.length ? Math.round(currentAnswers.length * 100 / classStudents.length) : 0}%</span></div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${classStudents.length ? currentAnswers.length * 100 / classStudents.length : 0}%` }} /></div>
                    {currentQuestion.correctAnswer && <p className="mt-3 text-xs text-slate-500">{correctCount} đúng · {Math.max(0, currentAnswers.length - correctCount)} chưa đúng</p>}
                    <div className="mt-4 max-h-[390px] space-y-2 overflow-y-auto">
                      {classStudents.map((student, index) => {
                        const response = currentAnswers.find(item => item.studentId === student.id);
                        return <div key={student.id} className={`rounded-xl border p-3 ${response ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200'}`}><div className="flex items-center justify-between"><span className="min-w-0 truncate text-sm font-medium"><span className="mr-2 text-xs text-slate-400">#{student.cardId || index + 1}</span>{student.name}</span>{response ? <span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${ANSWER_COLORS[response.answer]}`}>{response.answer}</span> : <span className="text-xs text-slate-400">Chưa quét</span>}</div><div className="mt-2 flex gap-1">{ANSWERS.map(answer => <button key={answer} onClick={() => recordAnswer(student, student.cardId || index + 1, answer, 1, 'manual')} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600">{answer}</button>)}</div></div>;
                      })}
                      {classStudents.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Lớp chưa có học sinh.</p>}
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-slate-500">Có thể chọn A/B/C/D thủ công nếu camera tạm thời không khả dụng.</p>
                  </section>
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4" />Xử lý trực tiếp trên thiết bị</div><p className="mt-2 text-xs leading-5 text-emerald-700">Hình ảnh camera được phân tích ngay trên điện thoại. Chỉ mã thẻ và đáp án được đồng bộ đến màn hình máy tính.</p></section>
                </aside>
              </div>
            )}
          </div>
        )}

        {view === 'cards' && (
          <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Thẻ trả lời học sinh</h2><p className="text-sm text-slate-500">Mỗi thẻ chứa mã riêng; xoay cạnh A/B/C/D lên trên để trả lời.</p></div><div className="flex gap-2"><select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Chọn lớp</option>{categories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button onClick={() => setPrintCards(true)} disabled={!classStudents.length} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Printer className="h-4 w-4" />In thẻ</button></div></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Sử dụng bộ thẻ do ứng dụng này tạo. Mẫu mã tương tác được thiết kế riêng và không cam kết đọc thẻ thương mại Plickers.</div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{classStudents.map((student, index) => <article key={student.id} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><div className="text-sm font-semibold text-slate-800">#{student.cardId || index + 1} · {student.name}</div><div className="relative mx-auto my-7 w-36"><span className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-bold text-blue-600">A</span><span className="absolute top-1/2 -right-5 -translate-y-1/2 text-sm font-bold text-amber-600">B</span><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-sm font-bold text-emerald-600">C</span><span className="absolute top-1/2 -left-5 -translate-y-1/2 text-sm font-bold text-fuchsia-600">D</span><MarkerSvg cardId={student.cardId || index + 1} className="h-36 w-36" /></div><p className="text-xs text-slate-500">Đưa cạnh đáp án lên phía trên</p></article>)}</div>{classStudents.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Chọn lớp có học sinh để xem và in thẻ.</p>}</section>
        )}

        {view === 'reports' && (
          <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-bold">Lịch sử buổi học</h2>
              <div className="mt-4 space-y-2">
                {reports.map(report => (
                  <div
                    key={report.id}
                    className={`group flex w-full items-start gap-1 rounded-xl border p-2 ${selectedReportId === report.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReportId(report.id);
                        setReportSettings(previous => ({ ...previous, examDate: '' }));
                      }}
                      className="min-w-0 flex-1 rounded-lg p-1 text-left"
                    >
                      <p className="font-medium">{report.className}</p>
                      <p className="mt-1 text-xs text-slate-500">{report.setTitle}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(report.completedAt)}</p>
                    </button>
                    <button
                      type="button"
                      aria-label={`Xóa báo cáo lớp ${report.className}`}
                      title="Xóa báo cáo"
                      onClick={() => setDeletingReport(report)}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {reports.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Chưa có buổi học được lưu.</p>}
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {selectedReport ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">{selectedReport.className}</h2>
                      <p className="text-sm text-slate-500">{selectedReport.setTitle} · {formatDate(selectedReport.completedAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => downloadScoreReport(selectedReport, selectedReportStudents, {
                          ...reportSettings,
                          examDate: reportSettings.examDate || selectedReport.completedAt.slice(0, 10),
                        })}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                      ><Download className="h-4 w-4" />Xuất bảng điểm Excel</button>
                      <button
                        onClick={() => downloadDetailedReport(selectedReport)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                      >CSV chi tiết</button>
                      <button
                        type="button"
                        onClick={() => setDeletingReport(selectedReport)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      ><Trash2 className="h-4 w-4" />Xóa báo cáo</button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    <label className="text-xs font-semibold text-slate-600">Tên trường
                      <input value={reportSettings.schoolName} onChange={event => setReportSettings(previous => ({ ...previous, schoolName: event.target.value }))} placeholder="Ví dụ: THCS Kim Lư" className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Môn học
                      <input value={reportSettings.subject} onChange={event => setReportSettings(previous => ({ ...previous, subject: event.target.value }))} placeholder={selectedReport.setTitle} className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Năm học
                      <input value={reportSettings.schoolYear} onChange={event => setReportSettings(previous => ({ ...previous, schoolYear: event.target.value }))} placeholder="2026 - 2027" className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Ngày kiểm tra
                      <input type="date" value={reportSettings.examDate || selectedReport.completedAt.slice(0, 10)} onChange={event => setReportSettings(previous => ({ ...previous, examDate: event.target.value }))} className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Giáo viên bộ môn
                      <input value={reportSettings.teacherName} onChange={event => setReportSettings(previous => ({ ...previous, teacherName: event.target.value }))} placeholder="Họ tên giáo viên" className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400" />
                    </label>
                    <div className="flex items-end"><p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700">{selectedReportStudents.length} học sinh · Tối đa {formatPlickerScore(getPlickerReportMaximumScore(selectedReport))} điểm</p></div>
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr>
                          <th rowSpan={2} className="border border-slate-200 px-3 py-2 text-center">STT</th>
                          <th rowSpan={2} className="min-w-40 border border-slate-200 px-3 py-2 text-left">Họ và tên</th>
                          <th colSpan={Math.max(1, selectedReport.questions.length)} className="border border-slate-200 px-3 py-2 text-center">Điểm câu hỏi</th>
                          <th rowSpan={2} className="min-w-24 border border-slate-200 px-3 py-2 text-center">Tổng điểm</th>
                        </tr>
                        <tr>{selectedReport.questions.map((question, index) => <th key={`${question.text}-${index}`} className="min-w-14 border border-slate-200 px-3 py-2 text-center">{index + 1}</th>)}</tr>
                      </thead>
                      <tbody>
                        {selectedReportScores.map((row, index) => (
                          <tr key={row.student.id} className="odd:bg-white even:bg-slate-50/60">
                            <td className="border border-slate-200 px-3 py-2 text-center">{index + 1}</td>
                            <td className="border border-slate-200 px-3 py-2 font-medium">{row.student.name}</td>
                            {row.questionScores.map((score, scoreIndex) => <td key={scoreIndex} className={`border border-slate-200 px-3 py-2 text-center ${score !== null && score > 0 ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{score === null ? '—' : formatPlickerScore(score)}</td>)}
                            <td className="border border-slate-200 px-3 py-2 text-center font-bold text-indigo-700">{formatPlickerScore(row.totalScore)}</td>
                          </tr>
                        ))}
                        {selectedReportScores.length === 0 && <tr><td colSpan={selectedReport.questions.length + 3} className="px-4 py-5 text-center text-slate-500">Lớp chưa có học sinh để lập bảng điểm.</td></tr>}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5 space-y-4">
                    {selectedReport.questions.map((question, index) => {
                      const correct = question.correctAnswer ? question.responses.filter(response => response.answer === question.correctAnswer).length : 0;
                      return (
                        <article key={`${question.text}-${index}`} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-medium">Câu {index + 1}: {question.text}</h3>
                            <div className="flex items-center gap-2">
                              {question.gradingType !== 'survey' && <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{formatPlickerScore(normalizePlickerQuestionPoints(question.points))} điểm</span>}
                              {question.correctAnswer && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Đáp án {question.correctAnswer}</span>}
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{question.responses.length}/{selectedReportStudents.length} trả lời{question.correctAnswer ? ` · ${correct} đúng` : ' · Câu khảo sát'}</p>
                          <div className="mt-3 flex flex-wrap gap-2">{ANSWERS.map(answer => <span key={answer} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium">{answer}: {question.responses.filter(response => response.answer === answer).length}</span>)}</div>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <BarChart3 className="h-12 w-12 text-indigo-300" />
                  <h3 className="mt-3 font-semibold">Chọn buổi học để xem kết quả</h3>
                  <p className="mt-2 text-sm text-slate-500">Xuất bảng điểm Excel gồm danh sách học sinh, điểm từng câu và tổng điểm.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {showPairingHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="plicker-pairing-title" className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><Link2 className="h-6 w-6" /></div>
                <div><h2 id="plicker-pairing-title" className="text-lg font-bold">Kết nối điện thoại tự động</h2><p className="mt-1 text-sm text-slate-500">Cùng tài khoản là tự nhận phiên. QR chỉ dùng để mở nhanh trên điện thoại.</p></div>
              </div>
              <button type="button" onClick={() => setShowPairingHelp(false)} aria-label="Đóng hướng dẫn ghép thiết bị" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <section className="mt-5 grid gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 sm:grid-cols-[auto_1fr] sm:items-center">
    <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-2xl border border-white bg-white shadow-sm">
      {scannerQrCode ? <img src={scannerQrCode} alt="Mã QR mở ứng dụng quét thẻ trên điện thoại" className="h-full w-full" /> : <LoaderCircle className="h-8 w-8 animate-spin text-indigo-500" />}
    </div>
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-500">Mở nhanh một lần</p>
      <h3 className="mt-1 text-lg font-bold text-slate-900">Quét QR bằng camera điện thoại</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">Sau khi đăng nhập cùng tài khoản, điện thoại tự nhận lớp, bộ câu hỏi và buổi học đang chạy. Không nhập mã phòng, không chọn lại phiên.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={scannerUrl} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"><Smartphone className="h-4 w-4" />Mở trên điện thoại này</a>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(scannerUrl).then(() => setNotice('Đã sao chép liên kết mở nhanh trên điện thoại.')).catch(() => setNotice('Không thể sao chép tự động. Hãy dùng mã QR.'))}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700"
        ><Link2 className="h-4 w-4" />Sao chép liên kết</button>
      </div>
      <p className={`mt-3 text-xs font-semibold ${scannerConnected ? 'text-emerald-700' : 'text-amber-700'}`}>{scannerConnected ? '● Điện thoại đang online và đã tự ghép' : '○ Chưa thấy điện thoại — quét QR để mở nhanh'}</p>
    </div>
  </section>

  <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-indigo-900"><Smartphone className="h-5 w-5" />1. Điện thoại quét</div>
                <p className="mt-2 text-sm leading-6 text-indigo-800">Mở ứng dụng/PWA. Nếu máy tính đã bắt đầu buổi học, điện thoại sẽ tự vào đúng phiên và chỉ cần nhấn nút quét.</p>
                <a href={scannerUrl} className="mt-3 block break-all rounded-lg bg-white p-2 text-xs text-indigo-700">{scannerUrl}</a>
                <p className={`mt-3 text-xs font-semibold ${scannerConnected ? 'text-emerald-700' : 'text-amber-700'}`}>{scannerConnected ? '● Điện thoại đã kết nối' : '○ Chưa thấy điện thoại'}</p>
              </section>
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-900"><MonitorPlay className="h-5 w-5" />2. Máy tính trình chiếu</div>
                <p className="mt-2 text-sm leading-6 text-emerald-800">Mở màn hình lớp học, kết nối máy chiếu và chờ câu hỏi từ điện thoại.</p>
                <a href={displayUrl} className="mt-3 block break-all rounded-lg bg-white p-2 text-xs text-emerald-700">{displayUrl}</a>
                <p className={`mt-3 text-xs font-semibold ${displayConnected ? 'text-emerald-700' : 'text-amber-700'}`}>{displayConnected ? '● Màn hình đã kết nối' : '○ Chưa thấy màn hình'}</p>
              </section>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">Khi cả hai thiết bị dùng cùng tài khoản, phiên học và trạng thái được đồng bộ tự động. Điện thoại là remote + scanner; máy tính tự trình chiếu và cập nhật kết quả theo thời gian thực.</p>
            <button type="button" onClick={() => setShowPairingHelp(false)} className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Đã hiểu</button>
          </div>
        </div>
      )}

      {showInstallHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="plicker-install-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><Smartphone className="h-6 w-6" /></div>
                <div>
                  <h2 id="plicker-install-title" className="text-lg font-bold text-slate-900">Cài Thẻ tương tác lớp học</h2>
                  <p className="text-sm text-slate-500">Ứng dụng trực tiếp trên điện thoại</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowInstallHelp(false)} aria-label="Đóng hướng dẫn cài ứng dụng" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
              {getPwaInstallationInstructions(navigator.userAgent)}
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">Sau khi cài, biểu tượng <strong>Thẻ lớp học</strong> sẽ xuất hiện trên màn hình chính. Ứng dụng mở toàn màn hình và vẫn sử dụng camera để quét thẻ.</p>
            <button type="button" onClick={() => setShowInstallHelp(false)} className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Đã hiểu</button>
          </div>
        </div>
      )}

      {questionImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plicker-question-import-title"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 md:px-6">
              <div>
                <h2 id="plicker-question-import-title" className="text-lg font-bold text-slate-900">
                  {questionImportTarget === 'editing' ? 'Thêm câu hỏi vào bộ đang soạn' : 'Nhập bộ câu hỏi nhanh'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Dán văn bản hoặc chọn tệp Microsoft Word .docx.</p>
              </div>
              <button
                type="button"
                onClick={() => { setQuestionImportOpen(false); setQuestionImportError(''); }}
                aria-label="Đóng cửa sổ nhập câu hỏi"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
              {questionImportTarget === 'new' && (
                <label htmlFor="plicker-import-set-title" className="block text-sm font-semibold text-slate-700">
                  Tên bộ câu hỏi
                  <input
                    id="plicker-import-set-title"
                    value={questionImportTitle}
                    onChange={event => setQuestionImportTitle(event.target.value)}
                    maxLength={160}
                    className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                    placeholder="Ví dụ: Toán 8 - Đơn thức"
                  />
                </label>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="plicker-import-question-text" className="text-sm font-semibold text-slate-700">
                  Nội dung câu hỏi
                </label>
                <button
                  type="button"
                  onClick={() => pickQuestionWordFile(questionImportTarget)}
                  disabled={questionImportBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                >
                  {questionImportBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                  {questionImportBusy ? 'Đang đọc Word...' : 'Chọn tệp Word'}
                </button>
              </div>

              {questionImportSource && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <FileText className="h-3.5 w-3.5" />{questionImportSource}
                </p>
              )}

              <textarea
                id="plicker-import-question-text"
                value={questionImportText}
                onChange={event => { setQuestionImportText(event.target.value); setQuestionImportError(''); }}
                className="mt-2 min-h-64 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm leading-6 outline-none focus:border-indigo-500 focus:bg-white"
                placeholder={'Câu 1: Thủ đô Việt Nam là thành phố nào?\nA. Hải Phòng\n*B. Hà Nội\nC. Đà Nẵng\nD. Huế\n\nCâu 2: 7 × 8 bằng bao nhiêu?\nA. 48\nB. 54\nC. 56\nD. 64\nĐáp án: C'}
              />

              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">
                Mỗi câu bắt đầu bằng <strong>Câu 1:</strong> hoặc <strong>1.</strong>; các lựa chọn dùng
                <strong> A.</strong>, <strong>B.</strong>, <strong>C.</strong>, <strong>D.</strong>. Đánh dấu đáp án đúng bằng
                <strong> *B.</strong>, <strong> B. ... (đúng)</strong> hoặc dòng <strong>Đáp án: B</strong>.
                Hỗ trợ tối đa {PLICKER_IMPORT_QUESTION_LIMIT} câu mỗi lần nhập.
              </div>

              {questionImportError && (
                <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {questionImportError}
                </p>
              )}

              {questionImportPreview.questions.length > 0 && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-emerald-900">Đã nhận ra {questionImportPreview.questions.length} câu hỏi</h3>
                    <span className="text-xs text-emerald-700">
                      {questionImportPreview.questions.filter(question => question.correctAnswer).length} câu có đáp án đúng
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-emerald-800">
                    {questionImportPreview.questions.slice(0, 4).map((question, index) => (
                      <p key={`${question.id}-${index}`} className="truncate">
                        {index + 1}. {question.text}{question.correctAnswer ? ` · Đáp án ${question.correctAnswer}` : ''}
                      </p>
                    ))}
                    {questionImportPreview.questions.length > 4 && (
                      <p>… và {questionImportPreview.questions.length - 4} câu hỏi khác.</p>
                    )}
                  </div>
                  {questionImportPreview.skipped > 0 && (
                    <p className="mt-2 text-xs text-amber-700">Bỏ qua {questionImportPreview.skipped} câu chưa đủ hai đáp án.</p>
                  )}
                  {questionImportPreview.truncated && (
                    <p className="mt-2 text-xs text-amber-700">Chỉ nhập {PLICKER_IMPORT_QUESTION_LIMIT} câu đầu tiên.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 md:px-6">
              <button
                type="button"
                onClick={() => { setQuestionImportOpen(false); setQuestionImportError(''); }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={applyImportedQuestions}
                disabled={questionImportBusy || questionImportPreview.questions.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ClipboardPaste className="h-4 w-4" />
                {questionImportTarget === 'editing' ? 'Thêm vào bộ câu hỏi' : 'Tạo bộ câu hỏi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="plicker-delete-report-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-50 p-2.5 text-red-600"><Trash2 className="h-5 w-5" /></div>
              <div>
                <h2 id="plicker-delete-report-title" className="text-lg font-bold text-slate-900">Xóa báo cáo buổi học?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Xóa báo cáo lớp <strong>{deletingReport.className}</strong>, bộ câu hỏi <strong>{deletingReport.setTitle}</strong>?
                  Bảng điểm và lịch sử trả lời của buổi học này sẽ bị xóa khỏi thiết bị.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeletingReport(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Hủy</button>
              <button type="button" onClick={confirmReportDeletion} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                Xóa báo cáo
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingSet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="plicker-delete-question-set-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-50 p-2.5 text-red-600"><Trash2 className="h-5 w-5" /></div>
              <div>
                <h2 id="plicker-delete-question-set-title" className="text-lg font-bold text-slate-900">Xóa bộ câu hỏi?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Xóa <strong>{deletingSet.title}</strong> gồm {deletingSet.questions.length} câu hỏi?
                  Bộ này cũng sẽ bị xóa khỏi điện thoại và máy tính đang đồng bộ.
                </p>
                {liveSession?.phase !== 'finished' && liveSession?.questionSet.id === deletingSet.id && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-800">
                    Bộ câu hỏi đang được sử dụng; buổi học hiện tại sẽ kết thúc nếu tiếp tục xóa.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeletingSet(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Hủy</button>
              <button type="button" onClick={confirmQuestionSetDeletion} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                Xóa bộ câu hỏi
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="plicker-delete-class-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-50 p-2.5 text-red-600"><Trash2 className="h-5 w-5" /></div>
              <div>
                <h2 id="plicker-delete-class-title" className="text-lg font-bold text-slate-900">Xóa lớp học?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Xóa vĩnh viễn lớp <strong>{deletingClass.title}</strong> và {allStudents.filter(student => student.classId === deletingClass.id).length} học sinh?
                  Lớp cũng sẽ biến mất trên điện thoại và máy tính đang đồng bộ. Các báo cáo buổi học cũ vẫn được giữ lại.
                </p>
                {liveSession?.phase !== 'finished' && liveSession?.classId === deletingClass.id && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-800">
                    Lớp đang có buổi học; buổi học hiện tại sẽ kết thúc nếu tiếp tục xóa.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={deletingClassBusy} onClick={() => setDeletingClass(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50">Hủy</button>
              <button type="button" disabled={deletingClassBusy} onClick={() => void confirmClassDeletion()} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {deletingClassBusy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Xóa lớp học
              </button>
            </div>
          </div>
        </div>
      )}

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={event => {
              event.preventDefault();
              submitStudentEdit();
            }}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Sửa thông tin học sinh</h2>
              <button
                type="button"
                onClick={() => {
                  setEditingStudent(null);
                  setEditingStudentName('');
                }}
                aria-label="Đóng cửa sổ sửa học sinh"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label htmlFor="plicker-student-name" className="mt-5 block text-sm font-medium text-slate-700">
              Họ và tên học sinh
            </label>
            <input
              id="plicker-student-name"
              value={editingStudentName}
              onChange={event => setEditingStudentName(event.target.value)}
              autoFocus
              maxLength={120}
              className="mt-2 block w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-indigo-500"
              placeholder="Nhập họ và tên học sinh"
            />
            <p className="mt-2 text-xs text-slate-500">
              Mã thẻ #{String(editingStudent.cardId || classStudents.indexOf(editingStudent) + 1).padStart(2, '0')} được giữ nguyên sau khi sửa.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingStudent(null);
                  setEditingStudentName('');
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!editingStudentName.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}

      {deletingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="plicker-delete-student-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-50 p-2.5 text-red-600"><Trash2 className="h-5 w-5" /></div>
              <div>
                <h2 id="plicker-delete-student-title" className="text-lg font-bold text-slate-900">Xóa học sinh?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Xóa <strong>{deletingStudent.name}</strong> khỏi lớp {selectedClass?.title}? Mã thẻ của những học sinh còn lại vẫn được giữ nguyên.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeletingStudent(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
                Hủy
              </button>
              <button type="button" onClick={confirmStudentDeletion} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                Xóa học sinh
              </button>
            </div>
          </div>
        </div>
      )}

      {(classModal || addStudentsModal) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{classModal ? 'Tạo lớp học mới' : `Thêm học sinh vào ${selectedClass?.title || ''}`}</h2><button onClick={() => { setClassModal(false); setAddStudentsModal(false); setStudentText(''); }} aria-label="Đóng"><X className="h-5 w-5 text-slate-500" /></button></div>{classModal && <label className="mt-4 block text-sm font-medium">Tên lớp<input value={classTitle} onChange={event => setClassTitle(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2.5 outline-none focus:border-indigo-500" placeholder="Ví dụ: Lớp 8A - Trường Kim Lư" /></label>}<label className="mt-4 block text-sm font-medium">Danh sách học sinh<textarea value={studentText} onChange={event => setStudentText(event.target.value)} className="mt-1 min-h-44 w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-indigo-500" placeholder={'Nguyễn Văn An\nTrần Thị Bình\nPhạm Minh Châu'} /></label><p className="mt-2 text-xs text-slate-500">Mỗi dòng một học sinh. Có thể sao chép trực tiếp từ Excel. Tối đa 63 học sinh/lớp.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => { setClassModal(false); setAddStudentsModal(false); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Hủy</button><button onClick={classModal ? submitClass : submitStudents} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">{classModal ? 'Tạo lớp và cấp thẻ' : 'Thêm học sinh'}</button></div></div></div>}

      {showProjector && (
        <PlickerDisplayScreen
          className={liveSession?.className || selectedClass?.title || ''}
          setTitle={selectedSet?.title || liveSession?.questionSet.title || ''}
          question={liveSession && liveSession.phase !== 'finished' ? currentQuestion : null}
          questionIndex={questionIndex}
          questionCount={selectedSet?.questions.length || 0}
          students={classStudents}
          responses={currentAnswers}
          distribution={answerDistribution}
          phase={liveSession?.phase || null}
          showCorrect={showCorrect}
          showGraph={showGraph}
          scannerConnected={scannerConnected}
          connected={syncReady && isOnline && !syncError}
          scannerUrl={scannerUrl}
          onToggleCorrect={toggleCorrectAnswer}
          onToggleGraph={toggleAnswerGraph}
          onClose={() => setShowProjector(false)}
        />
      )}

      {printCards && <div className="fixed inset-0 z-[60] overflow-y-auto bg-white"><style>{`@media print { @page { size: A4; margin: 10mm; } body * { visibility: hidden; } #plicker-print-root, #plicker-print-root * { visibility: visible; } #plicker-print-root { position: absolute; inset: 0; width: 100%; } .plicker-no-print { display: none !important; } .plicker-card { break-inside: avoid; page-break-inside: avoid; } }`}</style><div id="plicker-print-root" className="mx-auto max-w-5xl p-5"><div className="plicker-no-print sticky top-0 z-10 mb-8 flex items-center justify-between border-b bg-white pb-4"><div><h2 className="font-bold">In thẻ lớp {selectedClass?.title}</h2><p className="text-xs text-slate-500">{classStudents.length} thẻ · Cạnh A/B/C/D hướng lên trên là đáp án</p></div><div className="flex gap-2"><button onClick={() => setPrintCards(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Đóng</button><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><Printer className="h-4 w-4" />In thẻ</button></div></div><div className="grid grid-cols-1 gap-8 sm:grid-cols-2 print:grid-cols-2 print:gap-5">{classStudents.map((student, index) => <article key={student.id} className="plicker-card flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-slate-200 p-8"><h3 className="text-center text-lg font-bold">#{student.cardId || index + 1} · {student.name}</h3><div className="relative my-9 w-44"><span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xl font-bold">A</span><span className="absolute -right-7 top-1/2 -translate-y-1/2 text-xl font-bold">B</span><span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xl font-bold">C</span><span className="absolute -left-7 top-1/2 -translate-y-1/2 text-xl font-bold">D</span><MarkerSvg cardId={student.cardId || index + 1} className="h-44 w-44" /></div><p className="text-xs text-slate-500">Xoay đáp án mong muốn lên phía trên</p></article>)}</div></div></div>}
    </div>
  );
}
