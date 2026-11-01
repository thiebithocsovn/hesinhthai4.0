import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle, Clock, Eye, EyeOff, FileText, GraduationCap, LoaderCircle, Printer, X } from 'lucide-react';
import { collection, doc, getDoc, getDocFromServer, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { describeExamAccessError } from '../lib/examAccessError';
import { getExamStudentClasses, guestExamStudentRecord, withExamStudentClass } from '../lib/examStudentClasses';
import { buildStudentExamSchedule, canStudentEnterExam, formatExamScheduleDate, getExamScheduleState } from '../lib/examSchedule';
import {
  createExamAccessDocumentId,
  createPublicExamScheduleId,
  openProtectedExamAccess,
  PUBLIC_EXAM_ACCESS_COLLECTION,
  PUBLIC_EXAM_SCHEDULES_COLLECTION,
  type ProtectedExamAccess,
  type PublicExamSchedule,
} from '../lib/examPrivacy';
import { evaluateQuestion, type QuestionDefinition, type QuestionResponse } from '../lib/questionEngine';
import { isQuestionEngineExamQuestion } from '../lib/questionExamBridge';
import {
  createStudentRosterLookupKey,
  createExamGuestStudentId,
  createTeacherStorageKey,
  isValidTeacherUid,
  type PrivateStudentRosterEntry,
} from '../lib/teacherIsolation';
import QuestionEngineStudentQuestion, { questionTypeLabel } from './QuestionEngineStudentQuestion';
import ExamManualStudentQuestion from './ExamManualStudentQuestion';
import {
  answersPayloadBytes,
  examHasManualQuestions,
  examUsesWeightedScoring,
  formatFileSize,
  formatPoints,
  isManualQuestion,
  MAX_ANSWERS_PAYLOAD_BYTES,
  questionMaxPoints,
  summarizeExamScore,
  type GradableQuestion,
} from '../lib/examManualGrading';
import { StudentExamPortalBackdrop, StudentExamPortalBook, StudentExamPortalCap, StudentExamPortalIdea } from './StudentExamPortalArtwork';
import './student-exam-portal.css';
import ExamReceiptDialog from './ExamReceiptDialog';
import { buildExamReceiptHtml, getExamReceiptSettings, receiptSignTiming, type ExamReceiptSettings } from '../lib/examReceipt';

interface LegacyMatchingPair {
  id: string;
  left: string;
  right: string;
}

interface UnifiedExamQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  type?: 'multiple_choice' | 'short_answer' | 'matching' | 'question_engine' | 'essay' | 'practical';
  correctTextAnswer?: string;
  matchingPairs?: LegacyMatchingPair[];
  shuffledRight?: { id: string; right: string }[];
  engineQuestion?: QuestionDefinition;
  points?: number;
  rubric?: GradableQuestion['rubric'];
  practicalMode?: GradableQuestion['practicalMode'];
  acceptedFiles?: string;
}

interface UnifiedExam {
  id: string;
  title: string;
  durationMinutes: number;
  questions: UnifiedExamQuestion[];
  status: 'draft' | 'published' | 'closed';
  createdAt: string;
  startTime?: string;
  teacherId?: string;
  studentDirectory?: Record<string, PrivateStudentRosterEntry>;
  receiptSettings?: Partial<ExamReceiptSettings>;
  classNames?: Record<string, string>;
  accessVersionCode?: string;
  isShuffled?: boolean;
  shuffledVersions?: { code: string; questions: UnifiedExamQuestion[] }[];
  roundScoreToInteger?: boolean;
}

interface StudentAccount {
  id: string;
  code: string;
  name: string;
  classId?: string;
  teacherId?: string;
  examId?: string;
}

interface UnifiedStudentExamRunnerProps {
  onBack: () => void;
}

const HEARTBEAT_MS = 60_000;

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

function engineQuestionForExam(question: UnifiedExamQuestion): QuestionDefinition | null {
  if (!isQuestionEngineExamQuestion(question) || !question.engineQuestion) return null;
  return {
    ...question.engineQuestion,
    id: question.id,
    prompt: question.text || question.engineQuestion.prompt,
  };
}

function legacyQuestionIsCorrect(question: UnifiedExamQuestion, answer: unknown): boolean {
  if (isManualQuestion(question)) return false;
  if (question.type === 'short_answer') {
    const actual = String(answer ?? '').trim().toLocaleLowerCase('vi-VN');
    const expected = String(question.correctTextAnswer || '').trim().toLocaleLowerCase('vi-VN');
    return Boolean(expected) && actual === expected;
  }
  if (question.type === 'matching') {
    const values = answer && typeof answer === 'object' ? answer as Record<string, string> : {};
    return Boolean(question.matchingPairs?.length) && question.matchingPairs!.every(pair => values[pair.id] === pair.id);
  }
  return answer === question.correctAnswer;
}

export default function UnifiedStudentExamRunner({ onBack }: UnifiedStudentExamRunnerProps) {
  const [studentName, setStudentName] = useState('');
  const [examCode, setExamCode] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [classExam, setClassExam] = useState<{ code: string; exam: UnifiedExam } | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [showExamCode, setShowExamCode] = useState(false);
  const [showLoginHelp, setShowLoginHelp] = useState(false);
  const [schedule, setSchedule] = useState<PublicExamSchedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const [activeExam, setActiveExam] = useState<UnifiedExam | null>(() => {
    try {
      const saved = sessionStorage.getItem('activeExam');
      return saved ? JSON.parse(saved) as UnifiedExam : null;
    } catch {
      return null;
    }
  });
  const [currentStudent, setCurrentStudent] = useState<StudentAccount | null>(() => {
    try {
      const saved = sessionStorage.getItem('currentStudent');
      return saved ? JSON.parse(saved) as StudentAccount : null;
    } catch {
      return null;
    }
  });
  const [examVersion, setExamVersion] = useState(() => sessionStorage.getItem('examVersion') || 'Gốc');
  const [status, setStatus] = useState<'login' | 'waiting' | 'taking' | 'finished' | 'closed'>(() => activeExam && currentStudent ? 'waiting' : 'login');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [score, setScore] = useState<{ correct: number; total: number; objectiveEarned?: number; objectiveMax?: number; manualCount?: number; weighted?: boolean; score10?: number } | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [cheatEvents, setCheatEvents] = useState({ rightClicks: 0, tabChanges: 0, windowResizes: 0 });
  const [cheatWarning, setCheatWarning] = useState('');
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [examLive, setExamLive] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [draftSupported, setDraftSupported] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const startedAtRef = useRef('');
  const [receiptHtml, setReceiptHtml] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);


  useEffect(() => {
    if (status !== 'login') return;
    setScheduleLoading(true);
    setScheduleError('');
    const published = query(collection(db, PUBLIC_EXAM_SCHEDULES_COLLECTION), where('status', '==', 'published'));
    return onSnapshot(published, snapshot => {
      setSchedule(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as PublicExamSchedule)));
      setScheduleLoading(false);
    }, error => {
      console.error('Không thể tải lịch thi công khai:', error);
      setSchedule([]);
      setScheduleError(describeExamAccessError(error, 'schedule'));
      setScheduleLoading(false);
    });
  }, [status]);

  useEffect(() => {
    if (status !== 'login') return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const visibleSchedule = useMemo(() => buildStudentExamSchedule(schedule, now), [schedule, now]);
  const studentClasses = classExam?.code === examCode.trim() ? getExamStudentClasses(classExam.exam) : [];

  useEffect(() => {
    if (status !== 'login') return;
    let cancelled = false;
    setClassExam(null);
    setSelectedClassId('');
    setClassError('');
    const code = examCode.trim();
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(code)) { setClassLoading(false); return; }
    setClassLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const accessId = await createExamAccessDocumentId(code);
        const snapshot = await getDoc(doc(db, PUBLIC_EXAM_ACCESS_COLLECTION, accessId));
        if (!snapshot.exists()) throw new Error('Mã kỳ thi không hợp lệ hoặc bài kiểm tra chưa được giao.');
        const exam = await openProtectedExamAccess<UnifiedExam>(snapshot.data() as ProtectedExamAccess, code);
        if (!cancelled) setClassExam({ code, exam });
      } catch (error) {
        if (!cancelled) setClassError(describeExamAccessError(error, 'login'));
      } finally {
        if (!cancelled) setClassLoading(false);
      }
    }, 500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [examCode, status]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loginBusy) return;
    setLoginError('');
    const normalizedName = studentName.trim().normalize('NFC').replace(/\s+/g, ' ');
    const normalizedCode = examCode.trim();
    if (!normalizedName || !normalizedCode) {
      setLoginError('Vui lòng nhập đầy đủ họ tên và mã kỳ thi.');
      return;
    }

    setLoginBusy(true);
    try {
      const accessId = await createExamAccessDocumentId(normalizedCode);
      const encrypted = await getDoc(doc(db, PUBLIC_EXAM_ACCESS_COLLECTION, accessId));
      if (!encrypted.exists()) {
        setLoginError('Mã kỳ thi không hợp lệ hoặc bài kiểm tra chưa được giao.');
        return;
      }

      const exam = await openProtectedExamAccess<UnifiedExam>(encrypted.data() as ProtectedExamAccess, normalizedCode);
      setClassExam({ code: normalizedCode, exam });
      const classes = getExamStudentClasses(exam);
      const selectedClass = classes.find(item => item.id === selectedClassId);
      if (classes.length && !selectedClass) {
        setLoginError('Vui lòng chọn lớp của em trước khi đăng nhập.');
        return;
      }
      if (!canStudentEnterExam(exam)) {
        setLoginError(`Bài kiểm tra chưa đến giờ mở. Thời gian dự kiến: ${formatExamScheduleDate(exam.startTime)}.`);
        return;
      }

      let selectedExam: UnifiedExam = { ...exam };
      let selectedVersion = exam.accessVersionCode || 'Gốc';
      if (exam.isShuffled && exam.shuffledVersions?.length && selectedVersion === 'Gốc') {
        const version = exam.shuffledVersions[Math.floor(Math.random() * exam.shuffledVersions.length)];
        selectedExam = { ...exam, questions: version.questions };
        selectedVersion = version.code;
      }

      selectedExam.questions = selectedExam.questions.map(question => {
        if (question.type === 'matching' && question.matchingPairs) {
          return {
            ...question,
            shuffledRight: [...question.matchingPairs]
              .map(pair => ({ id: pair.id, right: pair.right }))
              .sort(() => Math.random() - 0.5),
          };
        }
        return question;
      });

      if (!isValidTeacherUid(exam.teacherId)) {
        setLoginError('Bài kiểm tra chưa được gắn với tài khoản giáo viên hợp lệ.');
        return;
      }

      const lookupKey = await createStudentRosterLookupKey(exam.teacherId, exam.id, normalizedName);
      const classLookupKey = selectedClass ? await createStudentRosterLookupKey(exam.teacherId, exam.id, normalizedName, selectedClass.id) : lookupKey;
      const roster = exam.studentDirectory?.[classLookupKey] || exam.studentDirectory?.[lookupKey];
      if (selectedClass && roster?.classId && roster.classId !== selectedClass.id) {
        setLoginError('Họ tên và lớp chưa khớp với danh sách đăng ký. Hãy kiểm tra với giáo viên.');
        return;
      }
      // A rostered class requires a real roster match; unknown names cannot
      // bypass a known student ID by creating another anonymous identity.
      const classHasRoster = Boolean(selectedClass && Object.values(exam.studentDirectory || {})
        .some(entry => entry.classId === selectedClass.id));
      if (classHasRoster && !exam.studentDirectory?.[classLookupKey]) {
        setLoginError('Không tìm thấy họ tên trong danh sách lớp đã đăng ký dự thi. Hãy kiểm tra chính tả hoặc liên hệ giáo viên.');
        return;
      }
      let student: StudentAccount | undefined = roster && (!selectedClass || roster.classId) ? {
        id: roster.id,
        code: '',
        name: normalizedName,
        ...(roster.classId ? { classId: roster.classId } : {}),
        teacherId: exam.teacherId,
      } : undefined;

      if (!student) {
        student = {
          id: await createExamGuestStudentId(exam.teacherId, exam.id, normalizedName, selectedClass?.id),
          code: Math.floor(100000 + Math.random() * 900000).toString(),
          name: normalizedName,
          teacherId: exam.teacherId,
          examId: exam.id,
          ...(selectedClass ? { classId: selectedClass.id } : {}),
        };
        // Reserve a one-time identity only at the moment the student starts the exam.
      }

      const submittedKey = createTeacherStorageKey(`submitted_exam_${student.id}_${exam.id}`, exam.teacherId);
      if (sessionStorage.getItem(submittedKey) === '1') {
        setLoginError('Em đã hoàn thành bài kiểm tra này rồi.');
        return;
      }

      setCurrentStudent(student);
      setActiveExam(selectedExam);
      setExamVersion(selectedVersion);
      setStatus('waiting');
      sessionStorage.setItem('currentStudent', JSON.stringify(student));
      sessionStorage.setItem('activeExam', JSON.stringify(selectedExam));
      sessionStorage.setItem('examVersion', selectedVersion);
    } catch (error) {
      console.error('Không thể mở bài kiểm tra:', error);
      setLoginError(describeExamAccessError(error, 'login'));
    } finally {
      setLoginBusy(false);
    }
  };

  const startExam = async () => {
    if (!activeExam || !currentStudent || !isValidTeacherUid(activeExam.teacherId) || !examLive) return;
    const sessionId = `${currentStudent.id}_${activeExam.id}`;
    try {
      const scheduleId = await createPublicExamScheduleId(activeExam.teacherId, activeExam.id);
      const schedule = await getDocFromServer(doc(db, PUBLIC_EXAM_SCHEDULES_COLLECTION, scheduleId));
      if (!schedule.exists() || schedule.data().status !== 'published') {
        setStatus('closed');
        return;
      }
      // A guest may CREATE an exam-scoped identity once. The Firestore
      // update rule denies another creation with the same stable student ID.
      if (currentStudent.examId === activeExam.id) {
        try {
          await setDoc(doc(db, 'students', currentStudent.id), guestExamStudentRecord(currentStudent));
        } catch (error) {
          if ((error as { code?: string })?.code === 'permission-denied') {
            setLoginError('Họ tên này đã đăng ký một lượt thi trong kỳ thi này. Không thể thi lần thứ hai; nếu có nhầm lẫn hãy báo giáo viên.');
            return;
          }
          throw error;
        }
      }
      startedAtRef.current = new Date().toISOString();
      const initialSession = {
        id: sessionId, examId: activeExam.id, studentId: currentStudent.id,
        startTime: startedAtRef.current, lastActive: startedAtRef.current,
        status: 'taking', teacherId: activeExam.teacherId, examVersion,
      };
      try {
        await setDoc(doc(db, 'exam_sessions', sessionId), {
          ...initialSession,
          draftAnswers: withExamStudentClass({}, currentStudent.classId),
          draftCheatEvents: { rightClicks: 0, tabChanges: 0, windowResizes: 0 },
        });
        setDraftSupported(true);
      } catch (error) {
        // Existing live Firestore rules may not yet allow new draft fields.
        // Continue the exam without silently claiming automatic collection works.
        if ((error as { code?: string })?.code !== 'permission-denied') throw error;
        await setDoc(doc(db, 'exam_sessions', sessionId), initialSession);
        setDraftSupported(false);
        setDraftStatus('error');
      }
      setAnswers({});
      setTimeRemaining(activeExam.durationMinutes * 60);
      setStatus('taking');
    } catch (error) {
      console.error('Không thể tạo phiên làm bài:', error);
      setLoginError((error as { code?: string })?.code === 'permission-denied'
        ? 'Học sinh này đã bắt đầu hoặc đã hoàn thành kỳ thi trên một phiên khác. Mỗi học sinh chỉ được làm một lượt; nếu có sự cố hãy báo giáo viên.'
        : 'Không thể bắt đầu bài kiểm tra. Kỳ thi có thể đã đóng hoặc mất kết nối.');
    }
  };

  // The public notice disappears when the teacher closes the exam.
  // This watches metadata only; neither private questions nor scores are exposed.
  useEffect(() => {
    if (!activeExam || !isValidTeacherUid(activeExam.teacherId) || (status !== 'waiting' && status !== 'taking')) return;
    let cancelled = false;
    let unsubscribe = () => {};
    setExamLive(false);
    void createPublicExamScheduleId(activeExam.teacherId, activeExam.id).then(scheduleId => {
      if (cancelled) return;
      unsubscribe = onSnapshot(
        query(collection(db, PUBLIC_EXAM_SCHEDULES_COLLECTION), where('status', '==', 'published')),
        { includeMetadataChanges: true },
        snapshot => {
          if (snapshot.metadata.fromCache) { setExamLive(false); return; }
          const open = snapshot.docs.some(item => item.id === scheduleId);
          setExamLive(open);
          if (!open) {
            setShowSubmitConfirm(false);
            setCheatWarning('');
            setStatus('closed');
          }
        },
        error => { console.error('Mất kết nối trạng thái kỳ thi:', error); setExamLive(false); },
      );
    }).catch(error => { console.error('Không thể kiểm tra lịch thi:', error); setExamLive(false); });
    return () => { cancelled = true; unsubscribe(); };
  }, [activeExam?.id, activeExam?.teacherId, status]);

  // Teacher-side collection uses only answers last acknowledged by Firestore.
  useEffect(() => {
    if (status !== 'taking' || !examLive || !draftSupported || !activeExam || !currentStudent) return;
    const draftAnswers = withExamStudentClass(answers, currentStudent.classId);
    if (answersPayloadBytes(draftAnswers) > MAX_ANSWERS_PAYLOAD_BYTES) {
      setDraftStatus('error');
      return;
    }
    setDraftStatus('saving');
    const timer = window.setTimeout(() => {
      const sessionId = `${currentStudent.id}_${activeExam.id}`;
      void updateDoc(doc(db, 'exam_sessions', sessionId), {
        draftAnswers, draftCheatEvents: cheatEvents, lastActive: new Date().toISOString(),
      }).then(() => setDraftStatus('saved')).catch(error => {
        console.error('Không thể đồng bộ bản nháp:', error);
        setDraftStatus('error');
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [status, examLive, draftSupported, activeExam?.id, currentStudent?.id, answers, cheatEvents]);

  useEffect(() => {
    if (status !== 'taking' || timeRemaining === null) return;
    if (timeRemaining <= 0) {
      setAutoSubmitted(true);
      void submitExam();
      return;
    }
    const timer = window.setTimeout(() => setTimeRemaining(value => value === null ? null : Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [status, timeRemaining]);

  useEffect(() => {
    if (status !== 'taking' || !currentStudent || !activeExam) return;
    const timer = window.setInterval(() => {
      const sessionId = `${currentStudent.id}_${activeExam.id}`;
      void setDoc(doc(db, 'exam_sessions', sessionId), { lastActive: new Date().toISOString() }, { merge: true });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [status, currentStudent, activeExam]);

  useEffect(() => {
    if (status !== 'taking') return;
    const onContext = (event: MouseEvent) => {
      event.preventDefault();
      setCheatEvents(previous => ({ ...previous, rightClicks: previous.rightClicks + 1 }));
      setCheatWarning('Không được sử dụng chuột phải trong khi làm bài.');
    };
    // Practical tasks need Word, Paint or Scratch, so leaving the page is recorded for the teacher but not interrupted.
    const allowsOtherApps = Boolean(activeExam?.questions.some(question => question.type === 'practical'));
    const onVisibility = () => {
      if (!document.hidden) return;
      setCheatEvents(previous => ({ ...previous, tabChanges: previous.tabChanges + 1 }));
      if (!allowsOtherApps) setCheatWarning('Không được chuyển tab hoặc ẩn cửa sổ khi đang làm bài.');
    };
    const onResize = () => setCheatEvents(previous => ({ ...previous, windowResizes: previous.windowResizes + 1 }));
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, [status, activeExam]);

  const submitExam = async () => {
    if (!activeExam || !currentStudent || status !== 'taking' || submittingRef.current || !examLive) return;
    const payloadBytes = answersPayloadBytes(answers);
    if (payloadBytes > MAX_ANSWERS_PAYLOAD_BYTES) {
      setLoginError(`Bài làm có tệp quá lớn (${formatFileSize(payloadBytes)}). Em hãy thay tệp bằng ảnh chụp màn hình rồi nộp lại.`);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setLoginError('');
    const teacherPrinting = getExamReceiptSettings(activeExam).autoPrint;
    let correct = 0;
    for (const question of teacherPrinting ? [] : activeExam.questions) {
      const engine = engineQuestionForExam(question);
      if (engine) {
        const evaluation = evaluateQuestion(engine, answers[question.id] as QuestionResponse);
        if (evaluation.correct) correct += 1;
      } else if (legacyQuestionIsCorrect(question, answers[question.id])) {
        correct += 1;
      }
    }

    const resultId = `${currentStudent.id}_${activeExam.id}`;
    const submittedAt = new Date().toISOString();
    try {
      await setDoc(doc(db, 'results', resultId), {
        id: resultId,
        examId: activeExam.id,
        studentId: currentStudent.id,
        score: correct,
        totalQuestions: activeExam.questions.length,
        submittedAt,
        answers: withExamStudentClass(answers, currentStudent.classId),
        cheatEvents,
        examVersion,
        teacherId: activeExam.teacherId || '',
      });
      // The saved result is authoritative. A failed heartbeat update must not ask the student to submit again.
      void setDoc(doc(db, 'exam_sessions', resultId), { status: 'submitted', lastActive: submittedAt }, { merge: true }).catch(error => console.error('Không thể cập nhật trạng thái phiên đã nộp:', error));
      try { sessionStorage.setItem(createTeacherStorageKey(`submitted_exam_${currentStudent.id}_${activeExam.id}`, activeExam.teacherId), '1'); } catch { /* The server result has already been saved. */ }
      setReceiptHtml(buildExamReceiptHtml(activeExam, currentStudent, { id: resultId, score: correct, totalQuestions: activeExam.questions.length, submittedAt, answers, examVersion }, startedAtRef.current));
      setCheatWarning('');
      const weighted = examUsesWeightedScoring(activeExam);
      const objective = weighted ? summarizeExamScore(activeExam, { answers }, (question, answer) => {
        const engine = engineQuestionForExam(question);
        return engine ? evaluateQuestion(engine, answer as QuestionResponse).correct : legacyQuestionIsCorrect(question, answer);
      }) : null;
      setScore({ correct, total: activeExam.questions.length, weighted, objectiveEarned: objective?.objectiveEarned, objectiveMax: objective?.objectiveMax, manualCount: objective?.manualCount, score10: objective?.score10 });
      setStatus('finished');
      setDraftStatus('idle');
    } catch (error) {
      console.error('Không thể nộp bài:', error);
      setLoginError('Không thể nộp bài. Vui lòng kiểm tra kết nối và thử lại.');
      submittingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    submittingRef.current = false;
    setReceiptHtml('');
    setShowReceipt(false);
    setCurrentStudent(null);
    setActiveExam(null);
    setExamVersion('Gốc');
    setAnswers({});
    setScore(null);
    setLoginError('');
    setStatus('login');
    setAutoSubmitted(false);
    setExamLive(false);
    setDraftStatus('idle');
    setDraftSupported(true);
    sessionStorage.removeItem('currentStudent');
    sessionStorage.removeItem('activeExam');
    sessionStorage.removeItem('examVersion');
  };

  return (
    <div className={status === 'login' ? 'student-exam-portal' : 'flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-900'}>
      {status === 'login' ? (
        <>
          <StudentExamPortalBackdrop />
          <header className="sep-header">
            <StudentExamPortalCap />
            <div>
              <p className="sep-brand">LỚP HỌC THÔNG MINH 4.0</p>
              <h1>CỔNG THI HỌC SINH</h1>
            </div>
            <StudentExamPortalIdea />
          </header>
        </>
      ) : (
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><GraduationCap className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Lớp Học Thông Minh 4.0</p>
              <h1 className="text-base font-bold md:text-xl">Cổng làm bài học sinh</h1>
            </div>
          </div>
          {currentStudent && <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 sm:inline">{currentStudent.name}</span>}
        </header>
      )}

      {status === 'login' && (
        <>
          <main className="sep-main">
            <StudentExamPortalBook />
            <div className="sep-columns">
              <section className="sep-login" aria-labelledby="sep-login-heading">
                <h2 id="sep-login-heading">ĐĂNG NHẬP</h2>
                <p className="sep-intro">Nhập họ tên, mã kỳ thi và chọn lớp của em.</p>
                <form onSubmit={login} className="sep-form" aria-busy={loginBusy}>
                  <div className="sep-field">
                    <label htmlFor="sep-student-name">Họ và tên học sinh <span className="sep-required">(*)</span></label>
                    <input id="sep-student-name" name="studentName" value={studentName} onChange={event => setStudentName(event.target.value)} placeholder="Nhập đầy đủ họ và tên" autoComplete="name" required disabled={loginBusy} aria-describedby={loginError ? 'sep-login-error' : undefined} />
                  </div>
                  <div className="sep-field">
                    <label htmlFor="sep-exam-code">Mã đăng nhập / mã kỳ thi <span className="sep-required">(*)</span></label>
                    <div className="sep-input-wrap">
                      <input id="sep-exam-code" name="examCode" type={showExamCode ? 'text' : 'password'} inputMode="numeric" value={examCode} onChange={event => setExamCode(event.target.value)} placeholder="Mã kỳ thi gồm 12 chữ số" autoComplete="off" spellCheck={false} required disabled={loginBusy} aria-describedby={`sep-code-help${loginError ? ' sep-login-error' : ''}`} aria-invalid={Boolean(loginError)} />
                      <button type="button" className="sep-code-toggle" onClick={() => setShowExamCode(value => !value)} aria-label={showExamCode ? 'Ẩn mã kỳ thi' : 'Hiện mã kỳ thi'} aria-pressed={showExamCode} aria-controls="sep-exam-code">
                        {showExamCode ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>
                  <div className="sep-field">
                    <label htmlFor="sep-student-class">Lớp {studentClasses.length > 0 && <span className="sep-required">(*)</span>}</label>
                    <select id="sep-student-class" name="studentClass" value={selectedClassId} onChange={event => { setSelectedClassId(event.target.value); setLoginError(''); }} required={studentClasses.length > 0} disabled={loginBusy || classLoading || studentClasses.length === 0} aria-describedby="sep-class-help">
                      <option value="">{classLoading ? 'Đang tải danh sách lớp…' : studentClasses.length ? 'Chọn lớp của em' : classExam?.code === examCode.trim() ? 'Kỳ thi chưa có danh sách lớp' : 'Nhập mã kỳ thi để tải danh sách lớp'}</option>
                      {studentClasses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <p id="sep-class-help" className="sep-code-help">{classError || (classExam?.code === examCode.trim() && studentClasses.length === 0 ? 'Giáo viên cần tạo lớp và mở lại kỳ thi để cập nhật danh sách lớp.' : 'Danh sách chỉ gồm các lớp do giáo viên của kỳ thi tạo.')}</p>
                  </div>
                  <p id="sep-code-help" className="sep-code-help">Chưa có mã đăng nhập? Em hãy liên hệ giáo viên phụ trách kỳ thi.</p>
                  {loginError && <div id="sep-login-error" role="alert" className="sep-login-error">{loginError}</div>}
                  <button type="submit" className="sep-submit" disabled={loginBusy}>
                    {loginBusy && <LoaderCircle size={17} className="sep-loading-icon" aria-hidden="true" />}
                    {loginBusy ? 'Đang mở bài kiểm tra…' : 'Đăng nhập'}
                  </button>
                </form>
                <button type="button" className="sep-help-button" onClick={() => setShowLoginHelp(value => !value)} aria-expanded={showLoginHelp} aria-controls="sep-login-help"><BookOpen size={16} aria-hidden="true" />Hướng dẫn vào thi</button>
                {showLoginHelp && <div id="sep-login-help" className="sep-help"><ol><li>Nhập đầy đủ họ tên và mã kỳ thi giáo viên đã cấp, rồi chọn lớp trong danh sách.</li><li>Chọn <strong>Đăng nhập</strong>, kiểm tra tên bài và thời gian, rồi chọn <strong>Bắt đầu làm bài</strong>.</li><li>Làm bài trong thời gian quy định và chọn <strong>Nộp bài</strong> khi hoàn thành.</li></ol></div>}
              </section>

              <section className="sep-notices" aria-labelledby="sep-notice-heading">
                <h2 id="sep-notice-heading">THÔNG BÁO LỊCH THI</h2>
                <p className="sep-notice-intro">Các bài kiểm tra đang mở và sắp diễn ra được cập nhật tại đây. Học sinh sử dụng <strong>mã kỳ thi do giáo viên cung cấp</strong> để đăng nhập.</p>
                <div aria-live="polite" aria-busy={scheduleLoading}>
                  {scheduleLoading ? <p className="sep-schedule-loading"><LoaderCircle size={16} className="sep-loading-icon" aria-hidden="true" />Đang tải thông báo lịch thi…</p> : scheduleError ? (
                    <div className="sep-empty"><strong>Chưa thể tải thông báo lịch thi.</strong><p>{scheduleError}</p></div>
                  ) : visibleSchedule.length ? (
                    <div className="sep-schedule">
                      {visibleSchedule.map(item => {
                        const upcoming = getExamScheduleState(item, now) === 'upcoming';
                        return (
                          <article key={item.id} className="sep-exam">
                            <div className="sep-exam-top"><h3>{item.title}</h3><span className="sep-exam-state" data-state={upcoming ? 'upcoming' : 'open'}>{upcoming ? 'Sắp diễn ra' : 'Đang mở'}</span></div>
                            <p className="sep-exam-date"><CalendarDays size={14} aria-hidden="true" />{formatExamScheduleDate(item.startTime)}</p>
                            <div className="sep-exam-meta"><span><Clock size={13} aria-hidden="true" />{item.durationMinutes} phút</span><span><FileText size={13} aria-hidden="true" />{item.questionCount} câu</span></div>
                          </article>
                        );
                      })}
                    </div>
                  ) : <div className="sep-empty"><strong>Hiện chưa có bài kiểm tra nào được giáo viên mở.</strong><p>Em theo dõi thông báo của giáo viên để biết lịch thi và nhận mã đăng nhập.</p></div>}
                </div>
                <p className="sep-notice-footnote">Danh sách được cập nhật tự động từ mục Tạo kỳ thi của giáo viên. Mã đăng nhập được giáo viên cung cấp riêng cho học sinh.</p>
                <p className="sep-student-note"><strong>Học sinh lưu ý:</strong> Mỗi họ tên trong cùng một lớp chỉ được bắt đầu một lượt cho mỗi kỳ thi. Nhập đúng họ tên theo danh sách lớp; trường hợp trùng họ tên hoặc gián đoạn thi cần báo giáo viên. Chuẩn bị kết nối mạng ổn định trước khi bắt đầu.</p>
              </section>
            </div>
          </main>
          <footer className="sep-footer"><button type="button" onClick={onBack} className="sep-back"><ArrowLeft size={15} aria-hidden="true" />Về trang chủ</button><p>Lớp Học Thông Minh 4.0 · Cổng thi dành cho học sinh</p></footer>
        </>
      )}

      {status === 'waiting' && activeExam && (
        <main className="flex flex-1 items-center justify-center p-4"><section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-600"><FileText className="h-10 w-10" /></div><h2 className="text-2xl font-bold">{activeExam.title}</h2><div className="my-6 flex justify-center gap-6 text-sm text-slate-600"><span>{activeExam.durationMinutes} phút</span><span>{activeExam.questions.length} câu</span></div><button type="button" onClick={startExam} disabled={!examLive} className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-lg font-bold text-white hover:bg-emerald-600 disabled:opacity-50">{examLive ? 'Bắt đầu làm bài' : 'Đang kiểm tra kết nối kỳ thi…'}</button>{loginError && <p className="mt-3 text-sm text-red-600">{loginError}</p>}</section></main>
      )}

      {status === 'taking' && activeExam && (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col p-4 md:p-6">
          <div className="sticky top-[65px] z-20 mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><h2 className="font-bold text-slate-800">{activeExam.title}</h2><p className="text-xs text-slate-500">Đã trả lời {Object.keys(answers).length}/{activeExam.questions.length} câu</p></div><div className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xl font-bold ${timeRemaining !== null && timeRemaining < 300 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-700'}`}><Clock className="h-5 w-5" />{timeRemaining !== null ? formatTime(timeRemaining) : '00:00'}</div></div>
          <fieldset disabled={submitting || !examLive} className="space-y-5 pb-28">
            {activeExam.questions.map((question, index) => {
              const engine = engineQuestionForExam(question);
              return (
                <section key={question.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                  <div className="mb-4 flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">Câu {index + 1}</span>{engine && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{questionTypeLabel(engine)}</span>}{question.type === 'essay' && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">Tự luận</span>}{question.type === 'practical' && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Thực hành</span>}{examUsesWeightedScoring(activeExam) && <span className="ml-auto text-xs font-semibold text-slate-500">{formatPoints(questionMaxPoints(question))} điểm</span>}</div>
                  <div className="mb-5 text-base font-medium leading-7 text-slate-800" dangerouslySetInnerHTML={{ __html: question.text }} />
                  {isManualQuestion(question) ? (
                    <ExamManualStudentQuestion question={question} answer={answers[question.id]} onChange={value => setAnswers(previous => { const next = { ...previous }; if (value === undefined || value === '') delete next[question.id]; else next[question.id] = value; return next; })} />
                  ) : engine ? (
                    <QuestionEngineStudentQuestion question={engine} answer={answers[question.id] as QuestionResponse} onChange={value => setAnswers(previous => ({ ...previous, [question.id]: value }))} />
                  ) : question.type === 'short_answer' ? (
                    <input value={String(answers[question.id] ?? '')} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Nhập câu trả lời..." />
                  ) : question.type === 'matching' ? (
                    <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><h4 className="font-semibold text-slate-700">Cột A</h4>{question.matchingPairs?.map((pair, pairIndex) => <div key={pair.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><b className="mr-2 text-blue-600">{pairIndex + 1}.</b>{pair.left}</div>)}</div><div className="space-y-2"><h4 className="font-semibold text-slate-700">Cột B</h4>{(question.shuffledRight || question.matchingPairs || []).map(item => { const current = answers[question.id] && typeof answers[question.id] === 'object' ? answers[question.id] as Record<string, string> : {}; return <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"><select value={current[item.id] || ''} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: { ...(current || {}), [item.id]: event.target.value } }))} className="rounded border border-slate-300 px-2 py-1"><option value="">-</option>{question.matchingPairs?.map((pair, idx) => <option key={pair.id} value={pair.id}>{idx + 1}</option>)}</select><span>{item.right}</span></div>; })}</div></div>
                  ) : (
                    <div className="space-y-3">{question.options.map((option, optionIndex) => <label key={optionIndex} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${answers[question.id] === optionIndex ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}><input type="radio" checked={answers[question.id] === optionIndex} onChange={() => setAnswers(previous => ({ ...previous, [question.id]: optionIndex }))} className="mt-0.5 h-5 w-5 text-blue-600" /><span dangerouslySetInnerHTML={{ __html: option }} /></label>)}</div>
                  )}
                </section>
              );
            })}
          </fieldset>
          <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 p-4 backdrop-blur"><div className="mx-auto flex max-w-4xl items-center justify-between"><div><span className="text-sm text-slate-500">{!examLive ? 'Mất kết nối máy chủ: bài làm đang tạm khóa.' : !draftSupported ? 'Hệ thống chưa bật lưu nháp trên Firebase; cần giáo viên cập nhật cấu hình.' : draftStatus === 'error' ? 'Bản nháp chưa được đồng bộ – hãy kiểm tra mạng.' : draftStatus === 'saving' ? 'Đang đồng bộ bài làm…' : 'Bài làm được lưu tự động.'}</span>{loginError && <p role="alert" className="text-sm text-red-600">{loginError}</p>}</div><button type="button" disabled={submitting || !examLive} onClick={() => setShowSubmitConfirm(true)} className="rounded-xl bg-blue-600 px-7 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Đang lưu bài…' : 'Nộp bài'}</button></div></div>
        </main>
      )}

      {status === 'closed' && (
        <main className="flex flex-1 items-center justify-center p-4">
          <section className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
            <Clock className="mx-auto h-14 w-14 text-amber-600" />
            <h2 className="mt-4 text-2xl font-bold text-amber-800">Kỳ thi đã đóng</h2>
            <p className="mt-3 text-slate-600">Giáo viên đã kết thúc kỳ thi. Em không thể làm tiếp hoặc thay đổi đáp án. Bài đã lưu trên máy chủ được thu và tổng hợp; câu tự luận/thực hành chờ giáo viên chấm.</p>
            <button type="button" onClick={reset} className="mt-6 rounded-xl bg-slate-900 px-6 py-3 font-bold text-white">Về cổng học sinh</button>
          </section>
        </main>
      )}

      {status === 'finished' && score && (
        <main className="flex flex-1 items-center justify-center p-4"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle className="h-12 w-12" /></div><h2 className="text-3xl font-bold">Hoàn thành!</h2>
          <p className="mt-2 text-slate-500">{autoSubmitted ? 'Đã hết thời gian và hệ thống tự động nộp bài.' : 'Bài làm đã được ghi nhận thành công.'}</p>
          {activeExam && getExamReceiptSettings(activeExam).autoPrint ? <div className="my-7 rounded-2xl bg-blue-50 p-6"><p className="font-semibold text-blue-800">Đã chuyển bài đến máy giáo viên để chấm và in phiếu.</p><p className="mt-2 text-sm text-slate-600">{receiptSignTiming(activeExam) === 'after-grading' ? 'Phiếu ký được in một lần sau khi giáo viên chấm xong phần tự luận / thực hành. Em ký xác nhận khi nhận phiếu, không phải ký thêm lần nào nữa.' : 'Em nhận phiếu từ giáo viên và ký xác nhận một lần. Máy học sinh không cần in.'}</p></div> : <>{score.weighted && activeExam && examHasManualQuestions(activeExam) ? <div className="my-7 rounded-2xl bg-slate-50 p-6 text-left"><div className="text-sm text-slate-500">Phần chấm tự động</div><div className="mt-1 text-3xl font-black text-blue-600">{formatPoints(score.objectiveEarned || 0)}<span className="text-lg font-medium text-slate-400"> / {formatPoints(score.objectiveMax || 0)} điểm</span></div><p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Phần tự luận / thực hành ({score.manualCount} câu) sẽ được giáo viên chấm. Điểm tổng có sau khi giáo viên chấm xong.</p></div> : score.weighted && activeExam ? <div className="my-7 rounded-2xl bg-slate-50 p-6"><div className="text-sm text-slate-500">Kết quả</div><div className="mt-1 text-5xl font-black text-blue-600">{formatPoints(score.score10 || 0)}<span className="text-2xl font-medium text-slate-400"> / 10</span></div><div className="mt-2 text-sm text-slate-500">{formatPoints(score.objectiveEarned || 0)}/{formatPoints(score.objectiveMax || 0)} điểm</div></div> : <div className="my-7 rounded-2xl bg-slate-50 p-6"><div className="text-sm text-slate-500">Kết quả</div><div className="mt-1 text-5xl font-black text-blue-600">{score.total ? Math.round((score.correct / score.total) * 100) / 10 : 0}<span className="text-2xl font-medium text-slate-400"> / 10</span></div><div className="mt-2 text-sm text-slate-500">{score.correct}/{score.total} câu đúng</div></div>}{activeExam && receiptSignTiming(activeExam) === 'after-grading' ? <p className="mb-3 rounded-xl bg-violet-50 p-3 text-sm text-violet-900">Phiếu ký sẽ được giáo viên in một lần, sau khi chấm xong phần tự luận / thực hành. Em chỉ ký một lần trên phiếu có điểm cuối cùng.</p> : <button type="button" onClick={() => setShowReceipt(true)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"><Printer size={18} />Xem / in phiếu ký</button>}</>}
          <button type="button" onClick={reset} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-black">Về cổng học sinh</button>
        </section></main>
      )}

      {showReceipt && receiptHtml && <ExamReceiptDialog html={receiptHtml} onClose={() => setShowReceipt(false)} />}
      {showSubmitConfirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"><h3 className="text-xl font-bold">Xác nhận nộp bài</h3><p className="my-4 text-sm text-slate-500">Sau khi nộp, em không thể thay đổi đáp án.</p><div className="flex justify-center gap-3"><button type="button" onClick={() => setShowSubmitConfirm(false)} className="rounded-lg px-5 py-2 text-slate-600 hover:bg-slate-100">Hủy</button><button type="button" disabled={submitting} onClick={() => { setShowSubmitConfirm(false); void submitExam(); }} className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">Nộp bài</button></div></div></div>}
      {cheatWarning && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-red-900/40 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl border-2 border-red-400 bg-white p-6 text-center shadow-xl"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600"><X className="h-7 w-7" /></div><h3 className="text-lg font-bold">Cảnh báo</h3><p className="my-3 text-sm text-slate-600">{cheatWarning}</p><button type="button" onClick={() => setCheatWarning('')} className="w-full rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white">Tôi đã hiểu</button></div></div>}
    </div>
  );
}
