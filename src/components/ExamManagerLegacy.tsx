import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, Edit2, Play, CheckCircle, Clock, Users, FileText, LogOut, ChevronRight, ChevronLeft, Save, PlayCircle, StopCircle, Calendar, Upload, X, Download, Shuffle, Activity, ArrowRight, Camera, GraduationCap, BookOpen, Bell, ShieldCheck, UserRound, KeyRound, CalendarClock, Loader2, Printer } from 'lucide-react';
import { RichTextEditor } from './RichTextEditor';
import OMRScanner from './OMRScanner';
import ExamReceiptDialog from './ExamReceiptDialog';
import TeacherExamPrintStation from './TeacherExamPrintStation';
import { loadExamRosterMetadata } from '../lib/examRoster';
import { gradeSubmittedExam } from '../lib/teacherExamPrinting';
import { buildExamReceiptHtml, DEFAULT_EXAM_RECEIPT_SETTINGS, getExamReceiptSettings, getReceiptStudentClassId, type ExamReceiptSettings } from '../lib/examReceipt';
import * as XLSX from 'xlsx';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { describeExamAccessError } from '../lib/examAccessError';
import { buildStudentExamSchedule, canStudentEnterExam, formatExamScheduleDate, getExamScheduleState } from '../lib/examSchedule';
import {
  createExamAccessDocumentId,
  createPublicExamSchedule,
  createPublicExamScheduleId,
  createSecureExamAccessCode,
  openProtectedExamAccess,
  protectExamForAccess,
  PUBLIC_EXAM_ACCESS_COLLECTION,
  PUBLIC_EXAM_SCHEDULES_COLLECTION,
  type ProtectedExamAccess,
  type PublicExamSchedule,
} from '../lib/examPrivacy';
import {
  canAccessTeacherOwnedRecord,
  createStudentRosterLookupKey,
  createTeacherStorageKey,
  filterTeacherOwnedRecords,
  isValidTeacherUid,
  resolveTeacherAccessScope,
  type PrivateStudentRosterEntry,
} from '../lib/teacherIsolation';

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  type?: 'multiple_choice' | 'short_answer' | 'matching';
  correctTextAnswer?: string;
  matchingPairs?: { id: string; left: string; right: string }[];
  shuffledRight?: { id: string; right: string }[];
}

interface Exam {
  id: string;
  title: string;
  durationMinutes: number;
  questions: Question[];
  status: 'draft' | 'published' | 'closed';
  createdAt: string;
  startTime?: string;
  isShuffled?: boolean;
  versionCodes?: string[];
  shuffledVersions?: {
    code: string;
    questions: Question[];
  }[];
  teacherId?: string;
  studentDirectory?: Record<string, PrivateStudentRosterEntry>;
  receiptSettings?: Partial<ExamReceiptSettings>;
  classNames?: Record<string, string>;
  accessVersionCode?: string;
}

interface StudentClass {
  id: string;
  name: string;
  teacherId?: string;
}

interface StudentAccount {
  id: string;
  code: string;
  name: string;
  classId?: string;
  teacherId?: string;
  examId?: string;
}

interface ExamResult {
  id: string;
  examId: string;
  studentId: string;
  score: number;
  totalQuestions: number;
  submittedAt: string;
  teacherGradedAt?: string;
  answers?: Record<string, any>;
  cheatEvents?: {
    rightClicks: number;
    tabChanges: number;
    windowResizes: number;
  };
  examVersion?: string;
  teacherId?: string;
}

interface ExamSession {
  id: string;
  examId: string;
  studentId: string;
  startTime: string;
  lastActive: string;
  status: 'taking' | 'submitted';
  teacherId?: string;
  examVersion?: string;
}

interface ExamManagerProps {
  onBack: () => void;
  initialMode?: 'landing' | 'teacher' | 'student';
  currentUser?: any;
}

const EXAM_SESSION_HEARTBEAT_INTERVAL_MS = 60_000;
const EXAM_SESSION_ONLINE_WINDOW_MS = 90_000;

async function synchronizeExamPublication(exam: Exam, previousExam: Exam = exam, savePrivateExam = true): Promise<void> {
  if (!isValidTeacherUid(exam.teacherId)) {
    throw new Error('Kỳ thi chưa được gắn với tài khoản giáo viên hợp lệ.');
  }

  if (exam.status === 'published') {
    exam = { ...exam, ...await loadExamRosterMetadata(db, exam.teacherId, exam.id) };
  }

  // Save the private exam, all access codes and its notice in one transaction.
  // A denied public write must never leave the teacher UI showing an open exam.
  const batch = writeBatch(db);
  if (savePrivateExam) batch.set(doc(db, 'exams', exam.id), exam);
  const previousCodes = [previousExam.id, ...(previousExam.shuffledVersions || []).map(version => version.code)];
  if (exam.status !== 'published') {
    if (previousExam.status === 'published') {
      batch.delete(doc(db, PUBLIC_EXAM_SCHEDULES_COLLECTION,
        await createPublicExamScheduleId(exam.teacherId, previousExam.id)));
      for (const code of previousCodes) {
        batch.delete(doc(db, PUBLIC_EXAM_ACCESS_COLLECTION, await createExamAccessDocumentId(code)));
      }
    }
    await batch.commit();
    return;
  }

  const authorizedExams: { code: string; exam: Exam }[] = [{ code: exam.id, exam }];
  for (const version of exam.shuffledVersions || []) {
    const selectedVersion: Exam = { ...exam, questions: version.questions, accessVersionCode: version.code };
    delete selectedVersion.shuffledVersions;
    delete selectedVersion.versionCodes;
    authorizedExams.push({ code: version.code, exam: selectedVersion });
  }
  for (const authorized of authorizedExams) {
    batch.set(doc(db, PUBLIC_EXAM_ACCESS_COLLECTION, await createExamAccessDocumentId(authorized.code)),
      await protectExamForAccess(authorized.exam, authorized.code));
  }
  const schedule = await createPublicExamSchedule(exam);
  batch.set(doc(db, PUBLIC_EXAM_SCHEDULES_COLLECTION, schedule.id), schedule);
  const activeCodes = new Set(authorizedExams.map(authorized => authorized.code));
  for (const code of previousCodes.filter(code => !activeCodes.has(code))) {
    batch.delete(doc(db, PUBLIC_EXAM_ACCESS_COLLECTION, await createExamAccessDocumentId(code)));
  }
  await batch.commit();
}

export default function ExamManager({ onBack, initialMode = 'landing', currentUser }: ExamManagerProps) {
  const [appMode, setAppMode] = useState<'landing' | 'teacher' | 'student'>(initialMode);
  const [teacherTab, setTeacherTab] = useState<'exams' | 'students' | 'monitoring' | 'results' | 'scanning'>('exams');

  // --- Mock Data & State ---
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [activeSessions, setActiveSessions] = useState<ExamSession[]>([]);
  const restoredPublishedExamIds = useRef(new Set<string>());
  const [publicationError, setPublicationError] = useState('');
  const [publicationRetry, setPublicationRetry] = useState(0);

  useEffect(() => {
    if (appMode !== 'teacher') return;
    const accessScope = resolveTeacherAccessScope(currentUser, auth.currentUser?.uid);
    setExams([]);
    setStudents([]);
    setClasses([]);
    setResults([]);
    setActiveSessions([]);
    if (accessScope.role === 'guest') {
      return;
    }

    let examsQuery: any = collection(db, 'exams');
    let studentsQuery: any = collection(db, 'students');
    let classesQuery: any = collection(db, 'classes');
    let resultsQuery: any = collection(db, 'results');
    let sessionsQuery: any = collection(db, 'exam_sessions');

    if (accessScope.role === 'teacher') {
      examsQuery = query(collection(db, 'exams'), where('teacherId', '==', accessScope.ownerUid));
      studentsQuery = query(collection(db, 'students'), where('teacherId', '==', accessScope.ownerUid));
      classesQuery = query(collection(db, 'classes'), where('teacherId', '==', accessScope.ownerUid));
      resultsQuery = query(collection(db, 'results'), where('teacherId', '==', accessScope.ownerUid));
      sessionsQuery = query(collection(db, 'exam_sessions'), where('teacherId', '==', accessScope.ownerUid));
    }

    const subscriptions: (() => void)[] = [];
    subscriptions.push(onSnapshot(examsQuery, { includeMetadataChanges: true }, (snapshot: any) => {
      if (snapshot.metadata.hasPendingWrites) return;
      setExams(filterTeacherOwnedRecords(accessScope,
        snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() } as Exam))));
    }, () => setExams([])));

    if (teacherTab !== 'exams') {
      subscriptions.push(onSnapshot(studentsQuery, (snapshot: any) => {
        setStudents(filterTeacherOwnedRecords(accessScope,
          snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() } as StudentAccount))));
      }, () => setStudents([])));
      subscriptions.push(onSnapshot(classesQuery, (snapshot: any) => {
        setClasses(filterTeacherOwnedRecords(accessScope,
          snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() } as StudentClass))));
      }, () => setClasses([])));
    }

    if (teacherTab === 'results') {
      subscriptions.push(onSnapshot(resultsQuery, (snapshot: any) => {
        setResults(filterTeacherOwnedRecords(accessScope,
          snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() } as ExamResult))));
      }, () => setResults([])));
    }

    let pendingSessions: ExamSession[] | null = null;
    let sessionUpdateTimer: NodeJS.Timeout | null = null;

    if (teacherTab === 'monitoring') {
      subscriptions.push(onSnapshot(sessionsQuery, (snapshot: any) => {
        pendingSessions = filterTeacherOwnedRecords(accessScope,
          snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() } as ExamSession)));
        if (!sessionUpdateTimer) {
          sessionUpdateTimer = setTimeout(() => {
            if (pendingSessions) {
              setActiveSessions(pendingSessions);
            }
            sessionUpdateTimer = null;
          }, 2000);
        }
      }, () => setActiveSessions([])));
    }

    return () => {
      subscriptions.forEach(unsubscribe => unsubscribe());
      if (sessionUpdateTimer) clearTimeout(sessionUpdateTimer);
    };
  }, [currentUser, appMode, teacherTab]);

  useEffect(() => {
    if (appMode !== 'teacher') return;
    const accessScope = resolveTeacherAccessScope(currentUser, auth.currentUser?.uid);
    if (accessScope.role === 'guest') return;

    for (const exam of exams) {
      if (exam.status !== 'published' || exam.teacherId !== accessScope.ownerUid ||
          restoredPublishedExamIds.current.has(exam.id)) continue;
      restoredPublishedExamIds.current.add(exam.id);
      // Repair both the notice and encrypted access, including partially published older exams.
      void synchronizeExamPublication(exam, exam, false).catch(error => {
        setPublicationError(describeExamAccessError(error, 'publish'));
        console.error('Không thể khôi phục lịch thi và đề thi bảo mật:', error);
      });
    }
  }, [appMode, currentUser, exams, publicationRetry]);

  // --- Teacher State ---
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedExamIdForScan, setSelectedExamIdForScan] = useState<string>('');
  
  // --- Student State ---
  const [currentStudent, setCurrentStudent] = useState<StudentAccount | null>(() => {
    const saved = sessionStorage.getItem('currentStudent');
    return saved ? JSON.parse(saved) : null;
  });
  const [studentCodeInput, setStudentCodeInput] = useState('');
  const [examCodeInput, setExamCodeInput] = useState('');
  const [activeExam, setActiveExam] = useState<Exam | null>(() => {
    const saved = sessionStorage.getItem('activeExam');
    return saved ? JSON.parse(saved) : null;
  });
  const [examVersion, setExamVersion] = useState<string>(() => {
    const saved = sessionStorage.getItem('examVersion');
    return saved ? saved : 'Gốc';
  });
  const [studentAnswers, setStudentAnswers] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [examStatus, setExamStatus] = useState<'login' | 'waiting' | 'taking' | 'finished'>('login');
  const [studentScore, setStudentScore] = useState<{score: number, total: number} | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [publishedStudentExams, setPublishedStudentExams] = useState<PublicExamSchedule[]>([]);
  const [studentScheduleLoading, setStudentScheduleLoading] = useState(false);
  const [studentScheduleError, setStudentScheduleError] = useState('');
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [examToDelete, setExamToDelete] = useState<string | null>(null);
  const [resultToDelete, setResultToDelete] = useState<string | null>(null);
  const [historyToDeleteExamId, setHistoryToDeleteExamId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [isStudentImportModalOpen, setIsStudentImportModalOpen] = useState(false);
  const [studentImportText, setStudentImportText] = useState('');
  const [selectedExamIdForResults, setSelectedExamIdForResults] = useState<string>('');
  const [selectedClassIdForResults, setSelectedClassIdForResults] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [editingClass, setEditingClass] = useState<StudentClass | null>(null);
  const [classToDelete, setClassToDelete] = useState<string | null>(null);
  const [cheatEvents, setCheatEvents] = useState({ rightClicks: 0, tabChanges: 0, windowResizes: 0 });
  const [cheatWarning, setCheatWarning] = useState<string | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [receiptHtml, setReceiptHtml] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const submissionRef = useRef(false);
  const startedAtRef = useRef('');

  useEffect(() => {
    if (appMode !== 'student' || examStatus !== 'login') return;

    setStudentScheduleLoading(true);
    setStudentScheduleError('');
    const publishedExamsQuery = query(collection(db, PUBLIC_EXAM_SCHEDULES_COLLECTION),
      where('status', '==', 'published'));

    const unsubscribe = onSnapshot(
      publishedExamsQuery,
      (snapshot: any) => {
        setPublishedStudentExams(snapshot.docs.map((examDoc: any) =>
          ({ id: examDoc.id, ...examDoc.data() } as PublicExamSchedule)));
        setStudentScheduleLoading(false);
      },
      (error) => {
        console.error('Error loading student exam schedule:', error);
        setPublishedStudentExams([]);
        setStudentScheduleError('Chưa thể tải lịch thi. Vui lòng kiểm tra kết nối và thử lại.');
        setStudentScheduleLoading(false);
      },
    );

    return unsubscribe;
  }, [appMode, examStatus]);

  useEffect(() => {
    if (appMode !== 'student' || examStatus !== 'login') return;
    setScheduleNow(Date.now());
    const timer = setInterval(() => setScheduleNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [appMode, examStatus]);

  const studentExamSchedule = buildStudentExamSchedule(publishedStudentExams, scheduleNow);

  // --- Teacher Functions ---
  const handleCreateExam = () => {
    const accessScope = resolveTeacherAccessScope(currentUser, auth.currentUser?.uid);
    if (accessScope.role === 'guest') return;
    setEditingExam({
      id: createSecureExamAccessCode(),
      title: 'Kỳ thi mới',
      durationMinutes: 45,
      questions: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
      startTime: new Date().toISOString().slice(0, 16),
      teacherId: accessScope.ownerUid,
      receiptSettings: { ...DEFAULT_EXAM_RECEIPT_SETTINGS, autoPrint: true },
    });
    setIsExamModalOpen(true);
  };

  const handleExportExcel = () => {
    const examToExport = exams.find(e => e.id === (selectedExamIdForResults || exams[0]?.id));
    if (!examToExport) return;

    let examResults = results.filter(r => r.examId === examToExport.id);
    if (selectedClassIdForResults !== 'all') {
      examResults = examResults.filter(r => {
        const student = students.find(s => s.id === r.studentId);
        return getReceiptStudentClassId(exams.find(exam => exam.id === r.examId) || {}, student || { id: r.studentId }, r) === selectedClassIdForResults;
      });
    }
    
    // Deduplicate by studentId, keeping the latest submission
    const latestResultsMap = new Map<string, ExamResult>();
    examResults.forEach(r => {
      const existing = latestResultsMap.get(r.studentId);
      if (!existing || new Date(r.submittedAt).getTime() > new Date(existing.submittedAt).getTime()) {
        latestResultsMap.set(r.studentId, r);
      }
    });
    examResults = Array.from(latestResultsMap.values());

    // Sort alphabetically by student first name (last word)
    examResults.sort((a, b) => {
      const studentA = students.find(s => s.id === a.studentId)?.name || '';
      const studentB = students.find(s => s.id === b.studentId)?.name || '';
      
      const getFirstName = (fullName: string) => {
        const parts = fullName.trim().split(' ');
        return parts[parts.length - 1];
      };

      const firstNameA = getFirstName(studentA);
      const firstNameB = getFirstName(studentB);

      const compare = firstNameA.localeCompare(firstNameB, 'vi');
      if (compare !== 0) return compare;
      return studentA.localeCompare(studentB, 'vi');
    });

    const data = examResults.map((result, index) => {
      const student = students.find(s => s.id === result.studentId);
      const studentClass = classes.find(c => c.id === getReceiptStudentClassId(examToExport, student || { id: result.studentId }, result));
      const pendingTeacherGrade = getExamReceiptSettings(examToExport).autoPrint && !result.teacherGradedAt;
      const percentage = Math.round((result.score / result.totalQuestions) * 100);
      const calculatedScore = Math.round((result.score / result.totalQuestions) * 100) / 10;
      const rowData: any = {
        'STT': index + 1,
        'Họ tên': student?.name || 'Unknown',
        'Lớp': studentClass?.name || examToExport.classNames?.[getReceiptStudentClassId(examToExport, student || { id: result.studentId }, result) || ''] || 'Unknown',
        'Điểm': pendingTeacherGrade ? 'Chờ máy giáo viên chấm' : calculatedScore,
        'Tỉ lệ %': pendingTeacherGrade ? '' : `${percentage}%`,
        'Mã đề': result.examVersion || 'Gốc',
      };

      examToExport.questions.forEach((q, qIndex) => {
        const answerVal = result.answers?.[q.id];
        let answerStr = '—';
        if (answerVal !== undefined) {
          if (q.type === 'short_answer') {
            answerStr = String(answerVal);
          } else if (q.type === 'matching') {
            if (typeof answerVal === 'object' && answerVal !== null) {
              // Format: 1-A, 2-B, etc.
              const matches = [];
              if (q.matchingPairs) {
                q.matchingPairs.forEach((pair, idx) => {
                  const selectedLeftId = (answerVal as Record<string, string>)[pair.id];
                  if (selectedLeftId) {
                    const leftIdx = q.matchingPairs!.findIndex(p => p.id === selectedLeftId);
                    if (leftIdx !== -1) {
                      matches.push(`${leftIdx + 1} -> ${pair.right}`);
                    }
                  }
                });
              }
              answerStr = matches.join(', ');
            }
          } else if (typeof answerVal === 'number') {
            answerStr = String.fromCharCode(65 + answerVal);
          }
        }
        rowData[`Q${qIndex + 1}`] = answerStr;
      });

      rowData['Thời gian nộp bài'] = new Date(result.submittedAt).toLocaleString('vi-VN');
      
      let cheatStr = 'Không có';
      if (result.cheatEvents) {
        const parts = [];
        if (result.cheatEvents.rightClicks > 0) parts.push(`Chuột phải: ${result.cheatEvents.rightClicks}`);
        if (result.cheatEvents.tabChanges > 0) parts.push(`Đổi tab: ${result.cheatEvents.tabChanges}`);
        if (result.cheatEvents.windowResizes > 0) parts.push(`Đổi kích thước: ${result.cheatEvents.windowResizes}`);
        if (parts.length > 0) cheatStr = parts.join(', ');
      }
      rowData['Chống gian lận'] = cheatStr;
      rowData['Học sinh ký nộp bài'] = '';

      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Kết quả thi");
    XLSX.writeFile(workbook, `Ket_qua_thi_${examToExport.title.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
  };

  const handleDeleteResult = (resultId: string) => {
    setResultToDelete(resultId);
  };

  const handleClearMonitoringHistory = async () => {
    if (!historyToDeleteExamId) return;

    try {
      const sessionsToDelete = activeSessions.filter(s => s.examId === historyToDeleteExamId);
      await Promise.all(sessionsToDelete.map(session => deleteDoc(doc(db, 'exam_sessions', session.id))));
      setHistoryToDeleteExamId(null);
    } catch (error) {
      console.error("Error clearing monitoring history:", error);
    }
  };

  const handleSaveExam = async () => {
    if (editingExam) {
      try {
        const accessScope = resolveTeacherAccessScope(currentUser, auth.currentUser?.uid);
        if (!canAccessTeacherOwnedRecord(accessScope, editingExam)) {
          throw new Error('Bạn không có quyền thay đổi kỳ thi của giáo viên khác.');
        }
        const examToSave = { ...editingExam };
        const previousExam = exams.find(exam => exam.id === editingExam.id) || editingExam;
        await synchronizeExamPublication(examToSave, previousExam);
        setIsExamModalOpen(false);
        setEditingExam(null);
      } catch (error) {
        console.error("Error saving exam:", error);
        alert(describeExamAccessError(error, 'publish'));
      }
    }
  };

  const handleAddQuestion = () => {
    if (editingExam) {
      setEditingExam({
        ...editingExam,
        questions: [
          ...editingExam.questions,
          {
            id: Math.random().toString(36).substr(2, 9),
            text: 'Câu hỏi mới',
            options: ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
            correctAnswer: 0,
            type: 'multiple_choice'
          }
        ]
      });
    }
  };

  const handleAddTrueFalseQuestion = () => {
    if (editingExam) {
      setEditingExam({
        ...editingExam,
        questions: [
          ...editingExam.questions,
          {
            id: Math.random().toString(36).substr(2, 9),
            text: 'Câu hỏi Đúng/Sai mới',
            options: ['Đúng', 'Sai'],
            correctAnswer: 0,
            type: 'multiple_choice'
          }
        ]
      });
    }
  };

  const handleAddShortAnswerQuestion = () => {
    if (editingExam) {
      setEditingExam({
        ...editingExam,
        questions: [
          ...editingExam.questions,
          {
            id: Math.random().toString(36).substr(2, 9),
            text: 'Câu hỏi trả lời ngắn mới',
            options: [],
            correctAnswer: 0,
            type: 'short_answer',
            correctTextAnswer: ''
          }
        ]
      });
    }
  };

  const handleAddMatchingQuestion = () => {
    if (editingExam) {
      setEditingExam({
        ...editingExam,
        questions: [
          ...editingExam.questions,
          {
            id: Math.random().toString(36).substr(2, 9),
            text: 'Câu hỏi ghép nối mới',
            options: [],
            correctAnswer: 0,
            type: 'matching',
            matchingPairs: [
              { id: Math.random().toString(36).substr(2, 9), left: 'Vế trái 1', right: 'Vế phải 1' },
              { id: Math.random().toString(36).substr(2, 9), left: 'Vế trái 2', right: 'Vế phải 2' },
              { id: Math.random().toString(36).substr(2, 9), left: 'Vế trái 3', right: 'Vế phải 3' }
            ]
          }
        ]
      });
    }
  };

  const handleUpdateQuestion = (qId: string, field: string, value: any, optionIndex?: number, matchingSide?: 'left' | 'right') => {
    if (editingExam) {
      setEditingExam({
        ...editingExam,
        questions: editingExam.questions.map(q => {
          if (q.id === qId) {
            if (field === 'options' && optionIndex !== undefined) {
              const newOptions = [...q.options];
              newOptions[optionIndex] = value;
              return { ...q, options: newOptions };
            }
            if (field === 'matchingPairs' && optionIndex !== undefined && matchingSide) {
              const newPairs = [...(q.matchingPairs || [])];
              newPairs[optionIndex] = { ...newPairs[optionIndex], [matchingSide]: value };
              return { ...q, matchingPairs: newPairs };
            }
            if (field === 'addMatchingPair') {
              const newPairs = [...(q.matchingPairs || []), { id: Math.random().toString(36).substr(2, 9), left: 'Vế trái mới', right: 'Vế phải mới' }];
              return { ...q, matchingPairs: newPairs };
            }
            if (field === 'removeMatchingPair' && optionIndex !== undefined) {
              const newPairs = [...(q.matchingPairs || [])];
              newPairs.splice(optionIndex, 1);
              return { ...q, matchingPairs: newPairs };
            }
            return { ...q, [field]: value };
          }
          return q;
        })
      });
    }
  };

  const handleDeleteQuestion = (qId: string) => {
    if (editingExam) {
      setEditingExam({
        ...editingExam,
        questions: editingExam.questions.filter(q => q.id !== qId)
      });
    }
  };

  const handleImportQuestions = () => {
    if (!importText.trim() || !editingExam) return;

    const newQuestions: Question[] = [];
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = importText;

    const stripPrefix = (html: string, regex: RegExp) => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                if (regex.test(node.textContent || '')) {
                    node.textContent = (node.textContent || '').replace(regex, '');
                    return true;
                }
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    if (walk(node.childNodes[i])) return true;
                }
            }
            return false;
        };
        walk(temp);
        return temp.innerHTML.trim();
    };

    const tables = tempDiv.querySelectorAll('table');
    if (tables.length > 0) {
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 3) {
                    let qText = stripPrefix(cells[0].innerHTML, /^\s*(Câu|Bài|Question)\s*\d+([:.]\s*|\s*)/i);
                    
                    const lastCellText = cells[cells.length - 1].textContent?.toUpperCase().trim() || '';
                    const isLastCellAnswer = /^[A-D]$/.test(lastCellText);
                    
                    const numOptions = isLastCellAnswer ? cells.length - 2 : cells.length - 1;
                    
                    if (numOptions >= 2) {
                        const options = [];
                        for (let i = 1; i <= numOptions; i++) {
                            options.push(stripPrefix(cells[i].innerHTML, /^\s*[A-D][.:]\s*/i));
                        }
                        
                        let correctAnswer = 0;
                        if (isLastCellAnswer) {
                            if (lastCellText === 'A') correctAnswer = 0;
                            if (lastCellText === 'B') correctAnswer = 1;
                            if (lastCellText === 'C') correctAnswer = 2;
                            if (lastCellText === 'D') correctAnswer = 3;
                        }
                        
                        newQuestions.push({
                          id: Math.random().toString(36).substr(2, 9),
                          text: qText,
                          options,
                          correctAnswer: correctAnswer < options.length ? correctAnswer : 0,
                          type: 'multiple_choice'
                        });
                    } else if (cells.length === 2) {
                        // Short answer format: Question | Answer
                        newQuestions.push({
                          id: Math.random().toString(36).substr(2, 9),
                          text: qText,
                          options: [],
                          correctAnswer: 0,
                          type: 'short_answer',
                          correctTextAnswer: cells[1].textContent?.trim() || ''
                        });
                    }
                }
            });
        });
    } else {
        let tempQText = '';
        let tempOptions: string[] = [];
        let tempCorrectAnswer = 0;
        let tempCorrectTextAnswer = '';
        let tempIsShortAnswer = false;
        
        const saveCurrentQuestion = () => {
            const validOptions = tempOptions.filter(opt => opt !== undefined);
            if (tempQText && (validOptions.length >= 2 || tempIsShortAnswer)) {
                newQuestions.push({
                    id: Math.random().toString(36).substr(2, 9),
                    text: tempQText,
                    options: validOptions,
                    correctAnswer: tempCorrectAnswer < validOptions.length ? tempCorrectAnswer : 0,
                    type: tempIsShortAnswer ? 'short_answer' : 'multiple_choice',
                    correctTextAnswer: tempCorrectTextAnswer
                });
            }
            tempQText = '';
            tempOptions = [];
            tempCorrectAnswer = 0;
            tempCorrectTextAnswer = '';
            tempIsShortAnswer = false;
        };

        const processHtmlNode = (html: string, text: string) => {
            if (/^\s*(Câu|Bài|Question)\s*\d+([:.]|\s)/i.test(text)) {
                saveCurrentQuestion();
                tempQText = stripPrefix(html, /^\s*(Câu|Bài|Question)\s*\d+([:.]\s*|\s*)/i);
            } else if (/^\s*[A-D][.:]\s*/i.test(text)) {
                const optionChar = text.match(/^\s*([A-D])/i)?.[1]?.toUpperCase();
                const optionIndex = optionChar === 'A' ? 0 : optionChar === 'B' ? 1 : optionChar === 'C' ? 2 : 3;
                
                const isBold = html.includes('<strong') || html.includes('<b') || text.includes('[[BOLD]]');
                
                tempOptions[optionIndex] = stripPrefix(html, /^\s*[A-D][.:]\s*/i);
                
                if (isBold) {
                    tempCorrectAnswer = optionIndex;
                }
            } else if (/^\s*(Đáp án|Correct|Answer)([:.]|\s)\s*[A-D]/i.test(text)) {
                const ansChar = text.match(/^\s*(Đáp án|Correct|Answer)([:.]|\s)\s*([A-D])/i)?.[3]?.toUpperCase();
                if (ansChar === 'A') tempCorrectAnswer = 0;
                if (ansChar === 'B') tempCorrectAnswer = 1;
                if (ansChar === 'C') tempCorrectAnswer = 2;
                if (ansChar === 'D') tempCorrectAnswer = 3;
            } else if (/^\s*(Đáp án|Correct|Answer)([:.]|\s)/i.test(text) && !/^\s*(Đáp án|Correct|Answer)([:.]|\s)\s*[A-D]/i.test(text)) {
                // Short answer format: Đáp án: [Nội dung]
                tempIsShortAnswer = true;
                tempCorrectTextAnswer = stripPrefix(html, /^\s*(Đáp án|Correct|Answer)([:.]\s*|\s*)/i);
            } else {
                if (tempOptions.length === 4 && !/^\s*(Đáp án|Correct|Answer)([:.]|\s)/i.test(text)) {
                    tempOptions[3] += '<br>' + html;
                } else if (tempOptions.length === 3) {
                    tempOptions[2] += '<br>' + html;
                } else if (tempOptions.length === 2) {
                    tempOptions[1] += '<br>' + html;
                } else if (tempOptions.length === 1) {
                    tempOptions[0] += '<br>' + html;
                } else if (tempIsShortAnswer) {
                    tempCorrectTextAnswer += '<br>' + html;
                } else if (tempQText) {
                    tempQText += '<br>' + html;
                }
            }
        };

        const htmlBlocks = tempDiv.innerHTML.split(/<p[^>]*>|<\/p>|<div[^>]*>|<\/div>|<li[^>]*>|<\/li>|<h[1-6][^>]*>|<\/h[1-6]>|<br\s*\/?>|\n/i);
        htmlBlocks.forEach(html => {
            const tempSpan = document.createElement('span');
            tempSpan.innerHTML = html;
            const text = tempSpan.textContent?.trim() || '';
            if (!text && !html.includes('<img') && !html.includes('<iframe')) return;
            processHtmlNode(html, text);
        });
        
        saveCurrentQuestion();
    }

    if (newQuestions.length > 0) {
      setEditingExam({
        ...editingExam,
        questions: [...editingExam.questions, ...newQuestions]
      });
      setIsImportModalOpen(false);
      setImportText('');
    } else {
      alert('Không tìm thấy câu hỏi nào hợp lệ. Vui lòng kiểm tra lại định dạng.');
    }
  };

  const toggleExamStatus = async (examId: string) => {
    const exam = exams.find(e => e.id === examId);
    if (exam) {
      try {
        const newStatus = exam.status === 'published' ? 'closed' : 'published';
        const nextExam: Exam = { ...exam, status: newStatus };
        await synchronizeExamPublication(nextExam, exam);
      } catch (error) {
        console.error("Error updating exam status:", error);
        alert(describeExamAccessError(error, 'publish'));
      }
    }
  };

  const handleShuffleExam = async (examId: string) => {
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;

    try {
      if (exam.isShuffled) {
        // Turn off shuffle
        const nextExam = { ...exam, isShuffled: false, shuffledVersions: [], versionCodes: [] };
        await synchronizeExamPublication(nextExam, exam);
        alert('Đã tắt chế độ tự động trộn đề.');
      } else {
        // Turn on shuffle and generate 5 versions
        const versions = [];
        const versionCodes = [];
        for (let i = 0; i < 5; i++) {
          let code = createSecureExamAccessCode(10);
          while (code === exam.id || versionCodes.includes(code)) code = createSecureExamAccessCode(10);
          versionCodes.push(code);
          const shuffledQuestions = [...exam.questions].sort(() => Math.random() - 0.5).map(q => {
            const optionsWithIndex = q.options.map((opt, index) => ({ text: opt, isCorrect: index === q.correctAnswer }));
            const shuffledOptions = optionsWithIndex.sort(() => Math.random() - 0.5);
            const newCorrectAnswerIndex = shuffledOptions.findIndex(opt => opt.isCorrect);
            return {
              ...q,
              options: shuffledOptions.map(opt => opt.text),
              correctAnswer: newCorrectAnswerIndex
            };
          });
          versions.push({ code, questions: shuffledQuestions });
        }
        const nextExam = { ...exam, isShuffled: true, shuffledVersions: versions, versionCodes };
        await synchronizeExamPublication(nextExam, exam);
        alert(`Đã tạo 5 mã đề: ${versions.map(v => v.code).join(', ')}`);
      }
    } catch (error) {
      console.error("Error updating shuffle status:", error);
      alert(describeExamAccessError(error, 'publish'));
    }
  };

  const handleExportAnswers = (examId: string) => {
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;

    let htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Đáp án kỳ thi</title>
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 14pt; }
          h1 { font-size: 16pt; text-align: center; text-transform: uppercase; margin-bottom: 20px; }
          h2 { font-size: 14pt; font-weight: bold; margin-top: 20px; text-decoration: underline; }
          p { margin: 5px 0; }
        </style>
      </head>
      <body>
        <h1>ĐÁP ÁN KỲ THI: ${exam.title}</h1>
    `;

    const formatQuestionAnswer = (q: Question, index: number) => {
      let ans = `<b>Câu ${index + 1}:</b> `;
      if (q.type === 'short_answer') {
        ans += q.correctTextAnswer || '';
      } else if (q.type === 'matching') {
        ans += (q.matchingPairs || []).map(p => `${p.left} - ${p.right}`).join(' | ');
      } else {
        ans += String.fromCharCode(65 + q.correctAnswer);
      }
      return `<p>${ans}</p>`;
    };

    htmlContent += `<h2>MÃ ĐỀ: GỐC</h2>`;
    exam.questions.forEach((q, i) => {
      htmlContent += formatQuestionAnswer(q, i);
    });

    if (exam.isShuffled && exam.shuffledVersions) {
      exam.shuffledVersions.forEach(v => {
        htmlContent += `<h2>MÃ ĐỀ: ${v.code}</h2>`;
        v.questions.forEach((q, i) => {
          htmlContent += formatQuestionAnswer(q, i);
        });
      });
    }

    htmlContent += `</body></html>`;

    // \ufeff is the BOM (Byte Order Mark) to ensure Word reads it as UTF-8 correctly
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Dap_an_${exam.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddStudent = async () => {
    if (!selectedClassId) {
      alert('Vui lòng chọn lớp trước khi thêm học sinh.');
      return;
    }
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newStudent = {
      id: Math.random().toString(36).substr(2, 9),
      code: newCode,
      name: 'Học sinh mới',
      classId: selectedClassId,
      teacherId: resolveTeacherAccessScope(currentUser, auth.currentUser?.uid).ownerUid,
    };
    try {
      await setDoc(doc(db, 'students', newStudent.id), newStudent);
    } catch (error) {
      console.error("Error adding student:", error);
    }
  };

  const handleImportStudents = async () => {
    if (!studentImportText.trim() || !selectedClassId) return;

    const names = studentImportText.split('\n').map(n => n.trim()).filter(n => n);
    const newStudents = names.map(name => ({
      id: Math.random().toString(36).substr(2, 9),
      code: Math.floor(100000 + Math.random() * 900000).toString(),
      name: name,
      classId: selectedClassId,
      teacherId: resolveTeacherAccessScope(currentUser, auth.currentUser?.uid).ownerUid,
    }));

    try {
      await Promise.all(newStudents.map(student => setDoc(doc(db, 'students', student.id), student)));
      setIsStudentImportModalOpen(false);
      setStudentImportText('');
    } catch (error) {
      console.error("Error importing students:", error);
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    try {
      if (editingClass) {
        await setDoc(doc(db, 'classes', editingClass.id), { ...editingClass, name: newClassName.trim() });
        setEditingClass(null);
      } else {
        const newClass = {
          id: Math.random().toString(36).substr(2, 9),
          name: newClassName.trim(),
          teacherId: resolveTeacherAccessScope(currentUser, auth.currentUser?.uid).ownerUid,
        };
        await setDoc(doc(db, 'classes', newClass.id), newClass);
        setSelectedClassId(newClass.id);
      }
      setNewClassName('');
      setIsClassModalOpen(false);
    } catch (error) {
      console.error("Error creating/updating class:", error);
    }
  };

  const handleDeleteClass = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setClassToDelete(id);
  };

  const handleUpdateStudent = async (id: string, name: string) => {
    const student = students.find(s => s.id === id);
    if (student) {
      try {
        await setDoc(doc(db, 'students', id), { ...student, name });
      } catch (error) {
        console.error("Error updating student:", error);
      }
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'students', id));
    } catch (error) {
      console.error("Error deleting student:", error);
    }
  };

  // --- Student Functions ---
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const normalizedStudentName = studentCodeInput.trim();
    const normalizedExamCode = examCodeInput.trim();
    if (!normalizedStudentName || !normalizedExamCode) {
      setLoginError('Vui lòng nhập đầy đủ họ tên và mã kỳ thi.');
      return;
    }

    try {
      // Resolve exactly one encrypted exam payload without listing any teacher's private exams.
      const accessId = await createExamAccessDocumentId(normalizedExamCode);
      const encryptedExam = await getDoc(doc(db, PUBLIC_EXAM_ACCESS_COLLECTION, accessId));
      if (!encryptedExam.exists()) {
        setLoginError('Mã kỳ thi không hợp lệ hoặc kỳ thi chưa mở!');
        return;
      }

      const exam = await openProtectedExamAccess<Exam>(
        encryptedExam.data() as ProtectedExamAccess,
        normalizedExamCode,
      );
      let versionCode = exam.accessVersionCode || 'Gốc';
      let studentExam: Exam = { ...exam };

      if (!canStudentEnterExam(exam)) {
        setLoginError(`Kỳ thi chưa đến giờ mở. Thời gian dự kiến: ${formatExamScheduleDate(exam.startTime)}.`);
        return;
      }

      if (exam.isShuffled && exam.shuffledVersions && exam.shuffledVersions.length > 0 && versionCode === 'Gốc') {
        // Entered main code, but exam is shuffled. Pick a random version.
        const randomVersion = exam.shuffledVersions[Math.floor(Math.random() * exam.shuffledVersions.length)];
        studentExam = { ...exam, questions: randomVersion.questions };
        versionCode = randomVersion.code;
      }

      // Shuffle matching right side for student
      if (studentExam && studentExam.questions) {
        studentExam.questions = studentExam.questions.map(q => {
          if (q.type === 'matching' && q.matchingPairs) {
            const shuffledRight = [...q.matchingPairs].map(p => ({ id: p.id, right: p.right })).sort(() => Math.random() - 0.5);
            return { ...q, shuffledRight };
          }
          return q;
        });
      }

      // Resolve a roster entry without exposing names, student codes or the private roster.
      const teacherOwnerUid = exam.teacherId;
      if (!isValidTeacherUid(teacherOwnerUid)) {
        setLoginError('Kỳ thi chưa được gắn với tài khoản giáo viên hợp lệ.');
        return;
      }
      const rosterLookupKey = await createStudentRosterLookupKey(teacherOwnerUid, exam.id, normalizedStudentName);
      const rosterEntry = exam.studentDirectory?.[rosterLookupKey];
      let student: StudentAccount | undefined = rosterEntry
        ? {
          id: rosterEntry.id,
          code: '',
          name: normalizedStudentName,
          ...(rosterEntry.classId ? { classId: rosterEntry.classId } : {}),
          teacherId: teacherOwnerUid,
        }
        : undefined;
      
      if (!student) {
        // Auto-create student if not found to ensure they can take the exam
        const newStudent: StudentAccount = {
          id: Math.random().toString(36).substr(2, 9),
          code: Math.floor(100000 + Math.random() * 900000).toString(),
          name: normalizedStudentName,
          teacherId: teacherOwnerUid,
          examId: exam.id,
        };
        await setDoc(doc(db, 'students', newStudent.id), newStudent);
        student = newStudent;
      }

      // Students never need permission to read teachers' private result collections.
      const submittedExamKey = createTeacherStorageKey(
        `submitted_exam_${student.id}_${exam.id}`,
        exam.teacherId,
      );
      if (sessionStorage.getItem(submittedExamKey) === '1') {
        setLoginError('Bạn đã hoàn thành bài thi này rồi!');
        return;
      }

      setCurrentStudent(student);
      setActiveExam(studentExam);
      setExamVersion(versionCode);
      setExamStatus('waiting');
      sessionStorage.setItem('currentStudent', JSON.stringify(student));
      sessionStorage.setItem('activeExam', JSON.stringify(studentExam));
      sessionStorage.setItem('examVersion', versionCode);
    } catch (error) {
      console.error("Error during login:", error);
      setLoginError('Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại.');
    }
  };

  const handleStartExam = async () => {
    if (activeExam && currentStudent) {
      setExamStatus('taking');
      startedAtRef.current = new Date().toISOString();
      submissionRef.current = false;
      setReceiptHtml('');
      setTimeRemaining(activeExam.durationMinutes * 60);
      setStudentAnswers({});
      
      try {
        const sessionId = `${currentStudent.id}_${activeExam.id}`;
        await setDoc(doc(db, 'exam_sessions', sessionId), {
          id: sessionId,
          examId: activeExam.id,
          studentId: currentStudent.id,
          startTime: startedAtRef.current,
          lastActive: new Date().toISOString(),
          status: 'taking',
          teacherId: activeExam.teacherId || '',
          examVersion: examVersion
        });
      } catch (error) {
        console.error("Error creating exam session:", error);
      }
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (examStatus === 'taking' && timeRemaining !== null && timeRemaining > 0) {
      timer = setInterval(() => {
        setTimeRemaining(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (examStatus === 'taking' && timeRemaining === 0) {
      setAutoSubmitted(true);
      handleSubmitExam();
    }
    return () => clearInterval(timer);
  }, [examStatus, timeRemaining]);

  useEffect(() => {
    let pingTimer: NodeJS.Timeout;
    if (examStatus === 'taking' && currentStudent && activeExam) {
      pingTimer = setInterval(() => {
        const sessionId = `${currentStudent.id}_${activeExam.id}`;
        setDoc(doc(db, 'exam_sessions', sessionId), { lastActive: new Date().toISOString() }, { merge: true }).catch(console.error);
      }, EXAM_SESSION_HEARTBEAT_INTERVAL_MS);
    }
    return () => clearInterval(pingTimer);
  }, [examStatus, currentStudent, activeExam]);

  useEffect(() => {
    if (examStatus !== 'taking') return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setCheatEvents(prev => ({ ...prev, rightClicks: prev.rightClicks + 1 }));
      setCheatWarning('Cảnh báo: Không được phép sử dụng chuột phải trong khi làm bài!');
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setCheatEvents(prev => ({ ...prev, tabChanges: prev.tabChanges + 1 }));
        setCheatWarning('Cảnh báo: Không được phép chuyển tab hoặc ẩn cửa sổ trong khi làm bài!');
      }
    };

    const handleResize = () => {
      setCheatEvents(prev => ({ ...prev, windowResizes: prev.windowResizes + 1 }));
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
    };
  }, [examStatus]);

  const handleSubmitExam = async () => {
    if (submissionRef.current || examStatus !== 'taking') return;
    if (activeExam && currentStudent) {
      submissionRef.current = true;
      let score = 0;
      (getExamReceiptSettings(activeExam).autoPrint ? [] : activeExam.questions).forEach(q => {
        if (q.type === 'short_answer') {
          const studentAns = (studentAnswers[q.id] as string || '').trim().toLowerCase();
          const correctAns = (q.correctTextAnswer || '').trim().toLowerCase();
          if (studentAns === correctAns && correctAns !== '') {
            score++;
          }
        } else if (q.type === 'matching') {
          const studentAns = studentAnswers[q.id] || {};
          let isCorrect = true;
          if (!q.matchingPairs || q.matchingPairs.length === 0) isCorrect = false;
          else {
            for (const pair of q.matchingPairs) {
              if (studentAns[pair.id] !== pair.id) {
                isCorrect = false;
                break;
              }
            }
          }
          if (isCorrect) score++;
        } else {
          if (studentAnswers[q.id] === q.correctAnswer) {
            score++;
          }
        }
      });

      const newResult: ExamResult = {
        id: `${currentStudent.id}_${activeExam.id}`,
        examId: activeExam.id,
        studentId: currentStudent.id,
        score,
        totalQuestions: activeExam.questions.length,
        submittedAt: new Date().toISOString(),
        answers: studentAnswers,
        cheatEvents: { ...cheatEvents },
        examVersion: examVersion,
        teacherId: activeExam.teacherId || '',
      };

      try {
        await setDoc(doc(db, 'results', newResult.id), newResult);
        try { sessionStorage.setItem(createTeacherStorageKey(
          `submitted_exam_${currentStudent.id}_${activeExam.id}`,
          activeExam.teacherId,
        ), '1'); } catch { /* Result already saved. */ }
        
        const sessionId = `${currentStudent.id}_${activeExam.id}`;
        void setDoc(doc(db, 'exam_sessions', sessionId), { status: 'submitted', lastActive: newResult.submittedAt }, { merge: true }).catch(console.error);
        setReceiptHtml(buildExamReceiptHtml(activeExam, currentStudent, newResult, startedAtRef.current));

        setStudentScore({ score, total: activeExam.questions.length });
        setExamStatus('finished');
        setCheatEvents({ rightClicks: 0, tabChanges: 0, windowResizes: 0 }); // Reset for next exam
      } catch (error) {
        console.error("Error submitting exam:", error);
        submissionRef.current = false;
        setLoginError('Không thể nộp bài. Bài thi có thể đã được nộp hoặc kết nối vừa bị gián đoạn.');
      }
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --- Renderers ---
  if (appMode === 'landing') {
    return (
      <div className="flex-1 flex flex-col h-full bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 flex items-center gap-4 shrink-0">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-600" />
            Hệ thống Kỳ thi Trực tuyến
          </h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-2xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
            <div 
              onClick={() => setAppMode('teacher')}
              className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center group hover:border-teal-500"
            >
              <div className="w-20 h-20 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Giáo viên</h2>
              <p className="text-slate-500">Tạo kỳ thi, quản lý học sinh và xem kết quả</p>
            </div>
            <div 
              onClick={() => setAppMode('student')}
              className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center group hover:border-blue-500"
            >
              <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FileText className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Học sinh</h2>
              <p className="text-slate-500">Đăng nhập và làm bài thi trực tuyến</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appMode === 'student') {
    return (
      <div className={`flex-1 flex flex-col h-full ${examStatus === 'login' ? 'bg-gradient-to-br from-blue-100 via-indigo-50 to-violet-100' : 'bg-slate-50'}`}>
        <header className={`relative z-20 px-4 md:px-8 py-4 flex items-center justify-between shrink-0 ${examStatus === 'login' ? 'bg-white/60 border-b border-blue-200/70 backdrop-blur-md' : 'bg-white border-b border-slate-200'}`}>
          <div className="flex items-center gap-4">
            {examStatus === 'login' && (
              <button 
                onClick={() => initialMode === 'student' ? onBack() : setAppMode('landing')} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
            )}
            <h1 className="text-lg md:text-2xl font-bold text-slate-900 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                {examStatus === 'login' ? <GraduationCap className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
              </span>
              <span>
                <span className="block text-[10px] md:text-xs font-bold tracking-[0.18em] text-blue-600 uppercase">Hệ thống thi trực tuyến</span>
                Cổng thi Học sinh
              </span>
            </h1>
          </div>
          {currentStudent && (
            <div className="flex items-center gap-3">
              <span className="font-medium text-slate-700">{currentStudent.name}</span>
              {examStatus !== 'taking' && (
                <button 
                  onClick={() => {
                    setCurrentStudent(null);
                    setActiveExam(null);
                    setExamVersion('Gốc');
                    setExamStatus('login');
                    setAutoSubmitted(false);
                    sessionStorage.removeItem('currentStudent');
                    sessionStorage.removeItem('activeExam');
                    sessionStorage.removeItem('examVersion');
                  }}
                  className="p-2 text-slate-400 hover:text-red-500 rounded-full"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </header>

        <div className={`relative flex-1 overflow-auto flex flex-col items-center ${examStatus === 'login' ? 'p-3 md:p-8 lg:p-10' : 'p-4 md:p-8'}`}>
          {examStatus === 'login' && (
            <>
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -left-16 top-20 h-64 w-64 rounded-full border border-white/60" />
                <div className="absolute left-12 top-40 h-28 w-28 rotate-12 rounded-[32px] border border-blue-200/70" />
                <div className="absolute -right-20 bottom-10 h-80 w-80 rounded-full border border-white/70" />
                <div className="absolute right-24 top-20 h-24 w-24 rotate-45 rounded-3xl border border-indigo-200/70" />
                <div className="absolute bottom-20 left-[15%] h-px w-56 rotate-12 bg-white/70" />
                <div className="absolute right-[12%] top-[38%] h-px w-52 -rotate-45 bg-white/70" />
              </div>

              <div className="relative z-10 mb-5 flex w-full max-w-6xl items-center justify-center gap-3 text-center text-blue-900 md:mb-7">
                <BookOpen className="hidden h-9 w-9 text-blue-600 sm:block" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Nền tảng lớp học thông minh 4.0</p>
                  <h2 className="mt-1 text-xl font-black uppercase tracking-tight md:text-3xl">Hệ thống thi và kiểm tra trực tuyến</h2>
                </div>
              </div>

              <section className="relative z-10 w-full max-w-6xl pb-8" aria-label="Đăng nhập và thông báo lịch thi">
                <div className="absolute inset-x-6 top-5 -bottom-1 rounded-[32px] bg-blue-300/80 shadow-[0_30px_70px_rgba(37,99,235,0.22)]" aria-hidden="true" />
                <div className="relative grid min-h-[520px] grid-cols-1 overflow-hidden rounded-[24px] border border-white/90 bg-white shadow-[0_24px_70px_rgba(30,64,175,0.20)] lg:grid-cols-2 lg:rounded-t-[44px] lg:rounded-b-[16px]">
                  <div className="relative px-6 py-8 md:px-12 md:py-12 lg:px-16">
                    <div className="absolute right-0 top-14 hidden h-[76%] w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent lg:block" aria-hidden="true" />
                    <div className="mx-auto max-w-md">
                      <div className="mb-7">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 lg:hidden">
                          <ShieldCheck className="h-6 w-6" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900">ĐĂNG NHẬP</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">Nhập đúng họ tên trong danh sách lớp và mã kỳ thi do giáo viên cung cấp.</p>
                      </div>

                      <form onSubmit={handleStudentLogin} className="space-y-5">
                        <div>
                          <label htmlFor="student-exam-name" className="mb-2 block text-sm font-bold text-slate-700">Họ tên học sinh <span className="text-red-500">(*)</span></label>
                          <div className="relative">
                            <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                            <input
                              id="student-exam-name"
                              type="text"
                              required
                              autoComplete="name"
                              value={studentCodeInput}
                              onChange={e => setStudentCodeInput(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-slate-800 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                              placeholder="Nhập đầy đủ họ và tên"
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="student-exam-code" className="mb-2 block text-sm font-bold text-slate-700">Mã kỳ thi <span className="text-red-500">(*)</span></label>
                          <div className="relative">
                            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                            <input
                              id="student-exam-code"
                              type="text"
                              required
                              autoComplete="off"
                              inputMode="numeric"
                              value={examCodeInput}
                              onChange={e => setExamCodeInput(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 font-mono font-bold tracking-wider text-slate-800 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                              placeholder="Nhập mã kỳ thi"
                            />
                          </div>
                        </div>

                        {loginError && (
                          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                            {loginError}
                          </div>
                        )}

                        <button
                          type="submit"
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
                        >
                          <ShieldCheck className="h-5 w-5" />
                          Đăng nhập vào phòng thi
                        </button>
                      </form>

                      <div className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        Hệ thống chỉ cho phép làm bài đối với kỳ thi đã được giáo viên công bố.
                      </div>
                    </div>
                  </div>

                  <div className="relative border-t border-slate-200 bg-gradient-to-br from-white to-blue-50/60 px-6 py-8 md:px-10 md:py-12 lg:border-l-0 lg:border-t-0 lg:px-12">
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-blue-700">
                          <Bell className="h-5 w-5" />
                          <span className="text-xs font-black uppercase tracking-[0.18em]">Cập nhật trực tiếp</span>
                        </div>
                        <h3 className="mt-2 text-2xl font-black text-slate-900">THÔNG BÁO LỊCH THI</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">Các kỳ thi đã được giáo viên công bố trên hệ thống.</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                        Trực tuyến
                      </span>
                    </div>

                    <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
                      {studentScheduleLoading && (
                        <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-white/70 text-blue-700">
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Đang tải lịch thi...
                        </div>
                      )}

                      {!studentScheduleLoading && studentScheduleError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-700">
                          {studentScheduleError}
                        </div>
                      )}

                      {!studentScheduleLoading && !studentScheduleError && studentExamSchedule.length === 0 && (
                        <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-white/70 p-6 text-center">
                          <CalendarClock className="mb-3 h-10 w-10 text-blue-300" />
                          <p className="font-bold text-slate-700">Chưa có kỳ thi được công bố</p>
                          <p className="mt-1 text-sm text-slate-500">Lịch thi sẽ tự động xuất hiện khi giáo viên mở kỳ thi.</p>
                        </div>
                      )}

                      {!studentScheduleLoading && !studentScheduleError && studentExamSchedule.map(exam => {
                        const scheduleState = getExamScheduleState(exam, scheduleNow);
                        const isUpcoming = scheduleState === 'upcoming';
                        return (
                          <article
                            key={exam.id}
                            className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-2 font-bold text-slate-900">{exam.title}</p>
                                <div className="mt-2 flex items-start gap-2 text-sm text-slate-600">
                                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                                  <span>{formatExamScheduleDate(exam.startTime)}</span>
                                </div>
                              </div>
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${isUpcoming ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {isUpcoming ? 'Sắp diễn ra' : 'Đang mở'}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{exam.durationMinutes} phút</span>
                              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{exam.questionCount} câu</span>
                              <span className="ml-auto font-bold text-blue-700">Mã thi do giáo viên cung cấp</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="mt-5 flex items-start gap-2 border-t border-blue-100 pt-4 text-xs leading-5 text-slate-500">
                      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                      Danh sách được cập nhật tự động từ mục Tạo kỳ thi của giáo viên. Mã đăng nhập kỳ thi vẫn được giáo viên cung cấp riêng cho học sinh.
                    </div>
                  </div>
                </div>
                <div className="pointer-events-none absolute -bottom-3 left-1/2 hidden h-16 w-28 -translate-x-1/2 bg-white [clip-path:polygon(0_0,50%_100%,100%_0)] lg:block" aria-hidden="true" />
              </section>
            </>
          )}

          {examStatus === 'waiting' && activeExam && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-lg w-full mt-10 text-center">
              <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">{activeExam.title}</h2>
              <div className="flex items-center justify-center gap-6 text-slate-600 mb-8">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  <span>{activeExam.durationMinutes} phút</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>{activeExam.questions.length} câu hỏi</span>
                </div>
              </div>
              <button 
                onClick={handleStartExam}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold transition-colors text-lg"
              >
                Bắt đầu làm bài
              </button>
            </div>
          )}

          {examStatus === 'taking' && activeExam && (
            <div className="max-w-3xl w-full flex flex-col h-full">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4 flex items-center justify-between sticky top-0 z-10">
                <h2 className="font-bold text-slate-800">{activeExam.title}</h2>
                <div className={`flex items-center gap-2 font-mono text-xl font-bold px-4 py-2 rounded-lg ${timeRemaining && timeRemaining < 300 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
                  <Clock className="w-5 h-5" />
                  {timeRemaining !== null ? formatTime(timeRemaining) : '00:00'}
                </div>
              </div>

              <div className="flex-1 overflow-auto space-y-6 pb-20">
                {activeExam.questions.map((q, idx) => (
                  <div key={q.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-medium text-slate-800 mb-4 flex gap-2">
                      <span className="font-bold shrink-0">Câu {idx + 1}:</span>
                      <div className="prose prose-sm max-w-none [&>p:first-child]:mt-0 [&>p:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: q.text }} />
                    </h3>
                    <div className="space-y-3">
                      {q.type === 'short_answer' ? (
                        <div className="p-4 rounded-lg border border-slate-200 bg-white">
                          <input 
                            type="text"
                            value={studentAnswers[q.id] || ''}
                            onChange={(e) => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            placeholder="Nhập câu trả lời của bạn..."
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      ) : q.type === 'matching' ? (
                        <div className="p-4 rounded-lg border border-slate-200 bg-white">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h4 className="font-medium text-slate-700 mb-2">Cột A</h4>
                              {q.matchingPairs?.map((pair, pIdx) => (
                                <div key={`left-${pair.id}`} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3">
                                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">{pIdx + 1}</span>
                                  <span className="text-slate-700">{pair.left}</span>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-2">
                              <h4 className="font-medium text-slate-700 mb-2">Cột B (Chọn số tương ứng ở Cột A)</h4>
                              {(q.shuffledRight || q.matchingPairs)?.map((rightItem, pIdx) => {
                                // For matching, studentAnswers[q.id] is an object mapping right pair.id to left pair.id
                                const currentAnswers = studentAnswers[q.id] || {};
                                return (
                                  <div key={`right-${rightItem.id}`} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3">
                                    <select 
                                      className="w-16 px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                                      value={currentAnswers[rightItem.id] || ''}
                                      onChange={(e) => {
                                        setStudentAnswers(prev => ({
                                          ...prev,
                                          [q.id]: {
                                            ...(prev[q.id] || {}),
                                            [rightItem.id]: e.target.value
                                          }
                                        }));
                                      }}
                                    >
                                      <option value="">-</option>
                                      {q.matchingPairs?.map((_, idx) => (
                                        <option key={idx} value={q.matchingPairs![idx].id}>{idx + 1}</option>
                                      ))}
                                    </select>
                                    <span className="text-slate-700">{rightItem.right}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        q.options.map((opt, optIdx) => (
                          <label 
                            key={optIdx} 
                            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                              studentAnswers[q.id] === optIdx 
                                ? 'border-blue-500 bg-blue-50' 
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input 
                              type="radio" 
                              name={`question-${q.id}`}
                              checked={studentAnswers[q.id] === optIdx}
                              onChange={() => setStudentAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                              className="w-5 h-5 text-blue-600 mt-0.5 shrink-0"
                            />
                            <div className="prose prose-sm max-w-none text-slate-700 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: opt }} />
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mt-4 flex justify-between items-center">
                <div className="text-slate-500">
                  Đã làm: <span className="font-bold text-slate-800">{Object.keys(studentAnswers).length}/{activeExam.questions.length}</span> câu
                </div>
                <button 
                  onClick={() => setShowSubmitConfirm(true)}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors"
                >
                  Nộp bài
                </button>
              </div>

              {/* Submit Confirmation Modal */}
              {showSubmitConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Xác nhận nộp bài</h3>
                    <p className="text-slate-500 mb-6">Bạn có chắc chắn muốn nộp bài? Bạn sẽ không thể thay đổi đáp án sau khi nộp.</p>
                    <div className="flex items-center gap-3 justify-center">
                      <button 
                        onClick={() => setShowSubmitConfirm(false)}
                        className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                      >
                        Hủy
                      </button>
                      <button 
                        onClick={() => {
                          setShowSubmitConfirm(false);
                          handleSubmitExam();
                        }}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                      >
                        Nộp bài
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Cheat Warning Modal */}
              {cheatWarning && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-red-900/50 backdrop-blur-sm p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center border-2 border-red-500">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <X className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Cảnh báo vi phạm</h3>
                    <p className="text-slate-600 mb-6">{cheatWarning}</p>
                    <button 
                      onClick={() => setCheatWarning(null)}
                      className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
                    >
                      Tôi đã hiểu
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showReceipt && receiptHtml && <ExamReceiptDialog html={receiptHtml} onClose={() => setShowReceipt(false)} />}
          {examStatus === 'finished' && studentScore && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full mt-10 text-center">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-12 h-12" />
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-2">Hoàn thành!</h2>
              <p className="text-slate-500 mb-8">
                {autoSubmitted 
                  ? 'Đã hết thời gian làm bài. Hệ thống đã tự động nộp bài của bạn.' 
                  : 'Bạn đã nộp bài thi thành công.'}
              </p>
              
              {activeExam && getExamReceiptSettings(activeExam).autoPrint ? <div className="mb-6 rounded-xl bg-blue-50 p-5 text-blue-800">Đã chuyển bài đến máy giáo viên để chấm và in phiếu. Em nhận phiếu từ giáo viên và ký xác nhận.</div> : <><div className="bg-slate-50 p-6 rounded-xl mb-8">
                <div className="text-sm text-slate-500 mb-1">Điểm số của bạn</div>
                <div className="text-5xl font-black text-blue-600">
                  {studentScore.score} <span className="text-2xl text-slate-400 font-medium">/ {studentScore.total}</span>
                </div>
              </div>

              <button type="button" onClick={() => setShowReceipt(true)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-bold text-white"><Printer size={18} />Xem / in phiếu ký</button></>}
              <button 
                onClick={() => {
                  setCurrentStudent(null);
                  setActiveExam(null);
                  setExamVersion('Gốc');
                  setExamStatus('login');
                  setAutoSubmitted(false);
                  sessionStorage.removeItem('currentStudent');
                  sessionStorage.removeItem('activeExam');
                  sessionStorage.removeItem('examVersion');
                }}
                className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold transition-colors"
              >
                Về trang chủ
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Teacher Mode
  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => initialMode === 'teacher' ? onBack() : setAppMode('landing')} 
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600" />
            Quản lý Kỳ thi (Giáo viên)
          </h1>
        </div>
      </header>

      {publicationError && <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p>{publicationError}</p>
        <button type="button" className="mt-2 font-bold underline" onClick={() => { restoredPublishedExamIds.current.clear(); setPublicationError(''); setPublicationRetry(value => value + 1); }}>Thử đồng bộ lại kỳ thi</button>
      </div>}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col py-4">
          <nav className="space-y-1 px-3">
            <button 
              onClick={() => setTeacherTab('exams')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${teacherTab === 'exams' ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <FileText className="w-5 h-5" />
              Quản lý kỳ thi
            </button>
            <button 
              onClick={() => {
                setTeacherTab('students');
                setSelectedClassId('');
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${teacherTab === 'students' ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Users className="w-5 h-5" />
              Quản lý lớp học
            </button>
            <button 
              onClick={() => setTeacherTab('monitoring')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${teacherTab === 'monitoring' ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Activity className="w-5 h-5" />
              Giám sát phòng thi
            </button>
            <button 
              onClick={() => setTeacherTab('results')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${teacherTab === 'results' ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <CheckCircle className="w-5 h-5" />
              Tổng hợp kết quả
            </button>
            <button 
              onClick={() => setTeacherTab('scanning')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${teacherTab === 'scanning' ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Camera className="w-5 h-5" />
              Chấm phiếu OMR
            </button>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6 md:p-8">
          <TeacherExamPrintStation key={auth.currentUser?.uid || 'guest'} exams={exams} authenticatedUid={resolveTeacherAccessScope(currentUser, auth.currentUser?.uid).role === 'guest' ? '' : auth.currentUser?.uid || ''} />
          {teacherTab === 'exams' && (
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Danh sách kỳ thi</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {exams.length} kỳ thi · Theo dõi thời gian, mã đề và thao tác trên từng dòng.
                  </p>
                </div>
                <button 
                  onClick={handleCreateExam}
                  className="inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Tạo kỳ thi mới
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-[1080px] w-full border-collapse text-left">
                    <caption className="sr-only">Danh sách quản lý kỳ thi của giáo viên</caption>
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th scope="col" className="w-16 px-4 py-4">STT</th>
                        <th scope="col" className="min-w-[230px] px-4 py-4">Tên kỳ thi</th>
                        <th scope="col" className="min-w-[165px] px-4 py-4">Thời gian mở</th>
                        <th scope="col" className="min-w-[105px] px-4 py-4">Bài thi</th>
                        <th scope="col" className="min-w-[160px] px-4 py-4">Mã thi / mã đề</th>
                        <th scope="col" className="min-w-[120px] px-4 py-4">Trạng thái</th>
                        <th scope="col" className="min-w-[200px] px-4 py-4">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {exams.map((exam, index) => (
                        <tr key={exam.id} className="align-top transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-5 text-sm font-medium text-slate-400">
                            {String(index + 1).padStart(2, '0')}
                          </td>
                          <td className="px-4 py-5">
                            <div className="font-semibold leading-6 text-slate-800">{exam.title}</div>
                            <p className="mt-1 text-xs text-slate-500">
                              {exam.isShuffled && exam.shuffledVersions?.length
                                ? `${exam.shuffledVersions.length} mã đề đã tạo`
                                : 'Đề thi gốc'}
                            </p>
                          </td>
                          <td className="px-4 py-5">
                            <div className="flex items-start gap-2 text-sm text-slate-600">
                              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                              <span>{exam.startTime ? formatExamScheduleDate(exam.startTime) : 'Chưa đặt lịch'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <div className="space-y-2 text-sm text-slate-600">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <Clock className="h-4 w-4 text-slate-400" />
                                {exam.durationMinutes} phút
                              </div>
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <FileText className="h-4 w-4 text-slate-400" />
                                {exam.questions.length} câu
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <div className="space-y-2">
                              <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-700">
                                {exam.id}
                              </span>
                              {exam.isShuffled && exam.shuffledVersions && exam.shuffledVersions.length > 0 && (
                                <div className="flex max-w-[180px] flex-wrap gap-1">
                                  {exam.shuffledVersions.map(version => (
                                    <span key={version.code} className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-indigo-700">
                                      {version.code}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                              exam.status === 'published'
                                ? getExamScheduleState(exam) === 'upcoming'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                                : exam.status === 'closed'
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-amber-100 text-amber-700'
                            }`}>
                              {exam.status === 'published'
                                ? getExamScheduleState(exam) === 'upcoming' ? 'Sắp diễn ra' : 'Đang mở'
                                : exam.status === 'closed' ? 'Đã đóng' : 'Bản nháp'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingExam(exam);
                                  setIsExamModalOpen(true);
                                }}
                                className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                                title="Chỉnh sửa kỳ thi"
                              >
                                <Edit2 className="h-3.5 w-3.5" /> Sửa
                              </button>
                              <button
                                onClick={() => handleShuffleExam(exam.id)}
                                className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                title="Tạo mã đề mới với câu hỏi và đáp án được trộn ngẫu nhiên"
                              >
                                <Shuffle className="h-3.5 w-3.5" /> Trộn
                              </button>
                              <button
                                onClick={() => handleExportAnswers(exam.id)}
                                className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                title="Xuất đáp án các mã đề"
                              >
                                <Download className="h-3.5 w-3.5" /> Đáp án
                              </button>
                              <button
                                onClick={() => setExamToDelete(exam.id)}
                                className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                title="Xóa kỳ thi"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Xóa
                              </button>
                              <button
                                onClick={() => toggleExamStatus(exam.id)}
                                className={`col-span-2 inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                                  exam.status === 'published'
                                    ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {exam.status === 'published'
                                  ? <><StopCircle className="h-3.5 w-3.5" /> Đóng thi</>
                                  : <><PlayCircle className="h-3.5 w-3.5" /> Mở thi</>}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {exams.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-500">
                            Chưa có kỳ thi nào. Hãy tạo kỳ thi đầu tiên!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  Hiển thị {exams.length} kỳ thi. Kéo ngang để xem đầy đủ trên màn hình nhỏ.
                </div>
              </div>
            </div>
          )}

          {teacherTab === 'students' && (
            <div className="max-w-5xl mx-auto">
              {!selectedClassId ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800">Quản lý lớp học</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {classes.length} lớp học · Theo dõi sĩ số và quản lý học sinh trên từng dòng.
                      </p>
                    </div>
                    <button 
                      onClick={() => setIsClassModalOpen(true)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                      Thêm lớp
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="min-w-[760px] w-full border-collapse text-left">
                        <caption className="sr-only">Danh sách lớp học của giáo viên</caption>
                        <thead className="border-b border-slate-200 bg-slate-50">
                          <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <th scope="col" className="w-20 px-5 py-4">STT</th>
                            <th scope="col" className="min-w-[220px] px-5 py-4">Tên lớp học</th>
                            <th scope="col" className="min-w-[130px] px-5 py-4">Sĩ số</th>
                            <th scope="col" className="min-w-[180px] px-5 py-4">Danh sách học sinh</th>
                            <th scope="col" className="min-w-[190px] px-5 py-4 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {classes.map((c, index) => {
                            const studentCount = students.filter(s => s.classId === c.id).length;
                            return (
                              <tr
                                key={c.id}
                                onClick={() => setSelectedClassId(c.id)}
                                className="cursor-pointer transition-colors hover:bg-slate-50/70"
                              >
                                <td className="px-5 py-4 text-sm font-medium text-slate-400">
                                  {String(index + 1).padStart(2, '0')}
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                                      <Users className="h-5 w-5" />
                                    </span>
                                    <span className="font-semibold text-slate-800">{c.name}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                                    {studentCount} học sinh
                                  </span>
                                </td>
                                <td className="px-5 py-4">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedClassId(c.id);
                                    }}
                                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 transition-colors hover:text-teal-800"
                                  >
                                    Xem danh sách <ChevronRight className="h-4 w-4" />
                                  </button>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingClass(c);
                                        setNewClassName(c.name);
                                        setIsClassModalOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                                      title="Sửa tên lớp"
                                    >
                                      <Edit2 className="h-4 w-4" /> Sửa
                                    </button>
                                    <button
                                      onClick={(e) => handleDeleteClass(c.id, e)}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                      title="Xóa lớp"
                                    >
                                      <Trash2 className="h-4 w-4" /> Xóa
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {classes.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-16 text-center text-sm text-slate-500">
                                Chưa có lớp học nào. Hãy thêm lớp mới!
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
                      Hiển thị {classes.length} lớp học. Chọn tên lớp hoặc “Xem danh sách” để quản lý học sinh.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setSelectedClassId('')}
                        className="p-2 hover:bg-slate-200 bg-slate-100 text-slate-600 rounded-full transition-colors"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <h2 className="text-2xl font-bold text-slate-800">
                        Tài khoản học sinh - {classes.find(c => c.id === selectedClassId)?.name}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button 
                        onClick={() => setIsStudentImportModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                      >
                        <Upload className="w-5 h-5" />
                        Nhập danh sách
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-20 text-center">STT</th>
                          <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Họ và tên</th>
                          <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {students.filter(s => s.classId === selectedClassId).map((student, index) => (
                          <tr key={student.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-center">
                              <span className="font-medium text-slate-500">{index + 1}</span>
                            </td>
                            <td className="px-6 py-4">
                              <input 
                                type="text" 
                                value={student.name}
                                onChange={(e) => handleUpdateStudent(student.id, e.target.value)}
                                className="bg-transparent border-none focus:ring-0 p-0 font-medium text-slate-800 w-full"
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleDeleteStudent(student.id)}
                                className="text-slate-400 hover:text-red-500 p-1"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {students.filter(s => s.classId === selectedClassId).length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                              Chưa có học sinh nào trong lớp này.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {teacherTab === 'monitoring' && (
            <div className="max-w-full mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Giám sát phòng thi</h2>
                <div className="flex flex-wrap items-center gap-4">
                  {exams.length > 0 && (
                    <>
                      <select
                        value={selectedExamIdForResults || exams[0]?.id || ''}
                        onChange={(e) => setSelectedExamIdForResults(e.target.value)}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none min-w-[200px]"
                      >
                        {exams.map(exam => (
                          <option key={exam.id} value={exam.id}>{exam.title}</option>
                        ))}
                      </select>
                      {activeSessions.filter(s => s.examId === (selectedExamIdForResults || exams[0]?.id)).length > 0 && (
                        <button
                          onClick={() => setHistoryToDeleteExamId(selectedExamIdForResults || exams[0]?.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors border border-red-200"
                        >
                          <Trash2 className="w-4 h-4" />
                          Xóa lịch sử
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Học sinh</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Lớp</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Mã đề</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Hoạt động cuối</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeSessions
                      .filter(s => s.examId === (selectedExamIdForResults || exams[0]?.id))
                      .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime())
                      .map(session => {
                        const student = students.find(s => s.id === session.studentId);
                        const studentClass = classes.find(c => c.id === student?.classId);
                        const isOnline = new Date().getTime() - new Date(session.lastActive).getTime() < EXAM_SESSION_ONLINE_WINDOW_MS;
                        
                        return (
                          <tr key={session.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-800">{student?.name || 'Không xác định'}</td>
                            <td className="px-6 py-4 text-slate-600">{studentClass?.name || '---'}</td>
                            <td className="px-6 py-4 text-slate-600 font-mono">{session.examVersion || 'Gốc'}</td>
                            <td className="px-6 py-4">
                              {session.status === 'submitted' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  <CheckCircle className="w-3.5 h-3.5" /> Đã nộp bài
                                </span>
                              ) : isOnline ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span> Đang làm bài
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                  <Clock className="w-3.5 h-3.5" /> Mất kết nối
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {new Date(session.lastActive).toLocaleTimeString('vi-VN')}
                            </td>
                          </tr>
                        );
                      })}
                    {activeSessions.filter(s => s.examId === (selectedExamIdForResults || exams[0]?.id)).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                          Chưa có học sinh nào tham gia kỳ thi này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {teacherTab === 'results' && (
            <div className="max-w-full mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Tổng hợp kết quả</h2>
                <div className="flex flex-wrap items-center gap-4">
                  {exams.length > 0 && (
                    <select
                      value={selectedExamIdForResults || exams[0]?.id || ''}
                      onChange={(e) => setSelectedExamIdForResults(e.target.value)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none min-w-[200px]"
                    >
                      {exams.map(exam => (
                        <option key={exam.id} value={exam.id}>{exam.title}</option>
                      ))}
                    </select>
                  )}
                  <select
                    value={selectedClassIdForResults}
                    onChange={(e) => setSelectedClassIdForResults(e.target.value)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none min-w-[150px]"
                  >
                    <option value="all">Tất cả các lớp</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {exams.length > 0 && results.filter(r => r.examId === (selectedExamIdForResults || exams[0]?.id)).length > 0 && (
                    <button
                      onClick={handleExportExcel}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg font-medium transition-colors border border-emerald-200"
                    >
                      <Download className="w-5 h-5" />
                      Xuất Excel
                    </button>
                  )}
                </div>
              </div>
              
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap border-collapse">
                  <thead className="bg-white border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-sm font-bold text-slate-800 tracking-wider sticky left-0 bg-white z-20 border-r border-slate-200 min-w-[250px] max-w-[250px] w-[250px]">
                        Người tham gia
                      </th>
                      <th className="px-4 py-4 text-sm font-bold text-slate-800 tracking-wider text-center sticky left-[250px] bg-white z-20 border-r border-slate-200 min-w-[120px] max-w-[120px] w-[120px]">
                        <div className="flex flex-col items-center">
                          <span>Điểm</span>
                          <span className="text-xs font-normal text-slate-500 mt-1">
                            Hết {(exams.find(e => e.id === (selectedExamIdForResults || exams[0]?.id))?.questions.length) || 0}
                          </span>
                        </div>
                      </th>
                      <th className="px-4 py-4 text-sm font-bold text-slate-800 tracking-wider text-center sticky left-[370px] bg-white z-20 border-r border-slate-200 min-w-[100px] max-w-[100px] w-[100px]">
                        Mã đề
                      </th>
                      {exams.find(e => e.id === (selectedExamIdForResults || exams[0]?.id))?.questions.map((q, idx) => {
                        const currentExamId = selectedExamIdForResults || exams[0]?.id;
                        let examResults = results.filter(r => r.examId === currentExamId);
                        if (selectedClassIdForResults !== 'all') {
                          examResults = examResults.filter(r => {
                            const student = students.find(s => s.id === r.studentId);
                            return getReceiptStudentClassId(exams.find(exam => exam.id === r.examId) || {}, student || { id: r.studentId }, r) === selectedClassIdForResults;
                          });
                        }
                        const correctCount = examResults.filter(r => r.answers?.[q.id] === q.correctAnswer).length;
                        const percentage = examResults.length > 0 ? Math.round((correctCount / examResults.length) * 100) : 0;
                        
                        return (
                          <th key={idx} className="px-2 py-4 text-sm font-bold text-slate-800 tracking-wider text-center border-r border-slate-200 min-w-[60px]">
                            <div className="flex flex-col items-center gap-1">
                              <span>Q{idx + 1}</span>
                            </div>
                          </th>
                        );
                      })}
                      <th className="px-6 py-4 text-sm font-bold text-slate-800 tracking-wider text-center border-l border-slate-200 min-w-[150px]">
                        Thời gian nộp bài
                      </th>
                      <th className="px-6 py-4 text-sm font-bold text-slate-800 tracking-wider text-center border-l border-slate-200 min-w-[200px]">
                        Chống gian lận
                      </th>
                      <th className="px-6 py-4 text-sm font-bold text-slate-800 tracking-wider text-center border-l border-slate-200 min-w-[100px]">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(() => {
                      let filtered = results
                        .filter(r => r.examId === (selectedExamIdForResults || exams[0]?.id))
                        .filter(r => {
                          if (selectedClassIdForResults === 'all') return true;
                          const student = students.find(s => s.id === r.studentId);
                          return getReceiptStudentClassId(exams.find(exam => exam.id === r.examId) || {}, student || { id: r.studentId }, r) === selectedClassIdForResults;
                        });

                      // Deduplicate by studentId, keeping the latest submission
                      const latestResultsMap = new Map<string, ExamResult>();
                      filtered.forEach(r => {
                        const existing = latestResultsMap.get(r.studentId);
                        if (!existing || new Date(r.submittedAt).getTime() > new Date(existing.submittedAt).getTime()) {
                          latestResultsMap.set(r.studentId, r);
                        }
                      });
                      filtered = Array.from(latestResultsMap.values());

                      // Sort alphabetically by student first name (last word)
                      filtered.sort((a, b) => {
                        const studentA = students.find(s => s.id === a.studentId)?.name || '';
                        const studentB = students.find(s => s.id === b.studentId)?.name || '';
                        
                        const getFirstName = (fullName: string) => {
                          const parts = fullName.trim().split(' ');
                          return parts[parts.length - 1];
                        };

                        const firstNameA = getFirstName(studentA);
                        const firstNameB = getFirstName(studentB);

                        const compare = firstNameA.localeCompare(firstNameB, 'vi');
                        if (compare !== 0) return compare;
                        return studentA.localeCompare(studentB, 'vi');
                      });

                      return filtered.map(result => {
                        const exam = exams.find(e => e.id === result.examId);
                        const student = students.find(s => s.id === result.studentId);
                        const percentage = Math.round((result.score / result.totalQuestions) * 100);
                        const calculatedScore = Math.round((result.score / result.totalQuestions) * 100) / 10;
                        
                        return (
                          <tr key={result.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 min-w-[250px] max-w-[250px] w-[250px] truncate">
                              <div className="font-bold text-slate-800 truncate" title={student?.name || 'Học sinh đã xóa'}>{student?.name || 'Học sinh đã xóa'}</div>
                              <div className="text-xs text-slate-500 mt-0.5">{exam && (classes.find(item => item.id === getReceiptStudentClassId(exam, student || { id: result.studentId }, result))?.name || exam.classNames?.[getReceiptStudentClassId(exam, student || { id: result.studentId }, result) || '']) || 'Chưa được gán lớp'}</div>
                            </td>
                            <td className="px-4 py-3 sticky left-[250px] bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 text-center font-medium text-slate-800 min-w-[120px] max-w-[120px] w-[120px]">
                              {exam && getExamReceiptSettings(exam).autoPrint && !result.teacherGradedAt ? <span className="text-xs text-amber-700">Chờ máy giáo viên chấm</span> : result.score === 0 ? '0' : `${calculatedScore} (${percentage}%)`}
                            </td>
                          <td className="px-4 py-3 sticky left-[370px] bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 text-center font-medium text-slate-600 min-w-[100px] max-w-[100px] w-[100px]">
                            {result.examVersion || 'Gốc'}
                          </td>
                          {exam ? (
                            exam.questions.map((q, idx) => {
                              const studentAns = result.answers?.[q.id];
                              const isCorrect = studentAns === q.correctAnswer;
                              const isUnanswered = studentAns === undefined;
                              const ansLetter = isUnanswered ? '—' : ['A', 'B', 'C', 'D'][studentAns];
                              
                              let bgColor = 'bg-slate-50/50';
                              let cellContent = <span className="font-bold text-slate-400">—</span>;
                              
                              if (!isUnanswered) {
                                if (isCorrect) {
                                  bgColor = 'bg-emerald-50/30';
                                  cellContent = <span className="font-bold text-lg text-emerald-600">{ansLetter}</span>;
                                } else {
                                  bgColor = 'bg-red-50/50';
                                  cellContent = (
                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 text-white font-bold text-sm">
                                      {ansLetter}
                                    </span>
                                  );
                                }
                              }
                              
                              return (
                                <td key={q.id} className={`px-2 py-3 text-center border-r border-slate-200 ${bgColor}`}>
                                  <div title={`Câu ${idx + 1}: ${isUnanswered ? 'Chưa trả lời' : isCorrect ? 'Đúng' : `Sai (Đáp án đúng: ${['A', 'B', 'C', 'D'][q.correctAnswer]})`}`}>
                                    {cellContent}
                                  </div>
                                </td>
                              );
                            })
                          ) : (
                            <td colSpan={100} className="px-6 py-4 text-slate-400 text-sm">Không có dữ liệu chi tiết</td>
                          )}
                          <td className="px-6 py-4 text-center text-sm text-slate-500 border-l border-slate-200">
                            {new Date(result.submittedAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-6 py-4 text-center text-sm text-slate-500 border-l border-slate-200">
                            {result.cheatEvents ? (
                              <div className="flex flex-col gap-1 items-start text-xs">
                                {result.cheatEvents.rightClicks > 0 && (
                                  <span className="text-red-600 bg-red-50 px-2 py-1 rounded-md w-full text-left">
                                    Chuột phải: {result.cheatEvents.rightClicks} lần
                                  </span>
                                )}
                                {result.cheatEvents.tabChanges > 0 && (
                                  <span className="text-orange-600 bg-orange-50 px-2 py-1 rounded-md w-full text-left">
                                    Đổi tab/ẩn: {result.cheatEvents.tabChanges} lần
                                  </span>
                                )}
                                {result.cheatEvents.windowResizes > 0 && (
                                  <span className="text-yellow-600 bg-yellow-50 px-2 py-1 rounded-md w-full text-left">
                                    Đổi kích thước: {result.cheatEvents.windowResizes} lần
                                  </span>
                                )}
                                {result.cheatEvents.rightClicks === 0 && result.cheatEvents.tabChanges === 0 && result.cheatEvents.windowResizes === 0 && (
                                  <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md w-full text-center">
                                    Không có
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center border-l border-slate-200">
                            <button type="button" disabled={!exam || !student} onClick={async () => {
                              if (!exam || !student) return;
                              const receiptExam = { ...exam, classNames: { ...exam.classNames, ...Object.fromEntries(classes.map(item => [item.id, item.name])) } };
                              try {
                                const grade = getExamReceiptSettings(exam).autoPrint ? gradeSubmittedExam(exam, { ...result, teacherId: result.teacherId || exam.teacherId || '' }) : { score: result.score, totalQuestions: result.totalQuestions };
                                if (getExamReceiptSettings(exam).autoPrint) await setDoc(doc(db, 'results', result.id), { ...grade, teacherGradedAt: new Date().toISOString() }, { merge: true });
                                setReceiptHtml(buildExamReceiptHtml(receiptExam, student, { ...result, ...grade }, activeSessions.find(item => item.studentId === result.studentId && item.examId === result.examId)?.startTime));
                                setShowReceipt(true);
                              } catch (error) { alert(error instanceof Error ? error.message : 'Không thể chấm và mở phiếu.'); }
                            }} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 disabled:opacity-40" title="Xem / in phiếu ký" aria-label="Xem / in phiếu ký"><Printer className="h-5 w-5" /></button>
                            <button
                              onClick={() => handleDeleteResult(result.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Xóa kết quả"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })})()}
                    {results
                      .filter(r => r.examId === (selectedExamIdForResults || exams[0]?.id))
                      .filter(r => {
                        if (selectedClassIdForResults === 'all') return true;
                        const student = students.find(s => s.id === r.studentId);
                        return getReceiptStudentClassId(exams.find(exam => exam.id === r.examId) || {}, student || { id: r.studentId }, r) === selectedClassIdForResults;
                      }).length === 0 && (
                      <tr>
                        <td colSpan={100} className="px-6 py-8 text-center text-slate-500">
                          Chưa có kết quả thi nào cho kỳ thi này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {teacherTab === 'scanning' && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>
                  Chấm phiếu trắc nghiệm bằng AI
                </h2>
                <p className="text-slate-600 mb-8 max-w-2xl">
                  Tính năng OMR AI giúp bạn chấm điểm các bài thi trắc nghiệm trên giấy một cách tự động. 
                  Sử dụng camera để quét mã Số báo danh, Mã đề thi và Đáp án học sinh đã chọn.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                        Bước 1: Chọn kỳ thi
                      </label>
                      <div className="relative">
                        <select 
                          className="w-full pl-4 pr-10 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all"
                          value={selectedExamIdForScan}
                          onChange={e => setSelectedExamIdForScan(e.target.value)}
                        >
                          <option value="">-- Danh sách kỳ thi --</option>
                          {exams.filter(e => e.status !== 'draft').map(exam => (
                            <option key={exam.id} value={exam.id}>{exam.title}</option>
                          ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ChevronRight className="w-5 h-5 text-slate-400 rotate-90" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-wide">
                        Bước 2: Quét phiếu
                      </label>
                      <button 
                        disabled={!selectedExamIdForScan}
                        onClick={() => setIsScannerOpen(true)}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-indigo-200 group"
                      >
                        <Camera className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        Bắt đầu Camera & Quét
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold shrink-0">1</div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Căn chỉnh phiếu</h4>
                        <p className="text-xs text-slate-500">Giữ camera vuông góc, đảm bảo thấy rõ các ô tròn SBD và Mã đề.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold shrink-0">2</div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Nhận diện tự động</h4>
                        <p className="text-xs text-slate-500">AI sẽ tự động đọc Số báo danh và Mã đề thi để gán điểm cho đúng học sinh.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold shrink-0">3</div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">So sánh đáp án</h4>
                        <p className="text-xs text-slate-500">Hệ thống so sánh với đáp án (kể cả đề đã trộn) và tính điểm ngay lập tức.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {isScannerOpen && (
                <OMRScanner 
                  examId={selectedExamIdForScan}
                  exams={exams}
                  students={students}
                  classes={classes}
                  teacherId={currentUser === 'admin' ? auth.currentUser?.uid || 'admin' : currentUser?.id || ''}
                  isAdministrator={currentUser === 'admin'}
                  onClose={() => setIsScannerOpen(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {showReceipt && receiptHtml && <ExamReceiptDialog html={receiptHtml} onClose={() => setShowReceipt(false)} />}
      {/* Exam Editor Modal */}
      {isExamModalOpen && editingExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="text-xl font-bold text-slate-800">Tạo / Chỉnh sửa Kỳ thi</h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    setIsExamModalOpen(false);
                    setEditingExam(null);
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                >
                  Hủy
                </button>
                <button 
                  onClick={handleSaveExam}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Lưu kỳ thi
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50">
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Exam Settings */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <h4 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">Thông tin chung</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tên kỳ thi</label>
                      <input 
                        type="text" 
                        value={editingExam.title}
                        onChange={(e) => setEditingExam({...editingExam, title: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian làm bài (phút)</label>
                      <input 
                        type="number" 
                        min="1"
                        value={editingExam.durationMinutes}
                        onChange={(e) => setEditingExam({...editingExam, durationMinutes: parseInt(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian mở thi</label>
                      <input 
                        type="datetime-local" 
                        value={editingExam.startTime || ''}
                        onChange={(e) => setEditingExam({...editingExam, startTime: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h4 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Printer size={20} />Phiếu xác nhận nộp bài</h4>
                  <p className="text-sm text-slate-500">Phiếu A4 theo Mẫu số 01: thông tin học sinh, bảng đáp án, kết quả và chữ ký học sinh / giám thị. Máy giáo viên nhận bài, chấm lại theo đúng mã đề, lưu điểm rồi lần lượt gửi lệnh in.</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">Tên trường<input value={getExamReceiptSettings(editingExam).schoolName} onChange={event => setEditingExam({ ...editingExam, receiptSettings: { ...getExamReceiptSettings(editingExam), schoolName: event.target.value } })} placeholder="TH & THCS Na Rì 1" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                    <label className="text-sm font-medium text-slate-700">Môn kiểm tra<input value={getExamReceiptSettings(editingExam).subject} onChange={event => setEditingExam({ ...editingExam, receiptSettings: { ...getExamReceiptSettings(editingExam), subject: event.target.value } })} placeholder="Ví dụ: Toán 8" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                    <label className="text-sm font-medium text-slate-700 md:col-span-2">Họ và tên giám thị<input type="text" maxLength={160} value={getExamReceiptSettings(editingExam).invigilatorName} onChange={event => setEditingExam({ ...editingExam, receiptSettings: { ...getExamReceiptSettings(editingExam), invigilatorName: event.target.value } })} placeholder="Nhập họ và tên giám thị để in trên phiếu" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  </div>
                  <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={getExamReceiptSettings(editingExam).autoPrint} onChange={event => setEditingExam({ ...editingExam, receiptSettings: { ...getExamReceiptSettings(editingExam), autoPrint: event.target.checked } })} />Tự động in tại máy giáo viên khi nhận bài nộp</label>
                  <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={getExamReceiptSettings(editingExam).includeCorrectAnswers} onChange={event => setEditingExam({ ...editingExam, receiptSettings: { ...getExamReceiptSettings(editingExam), includeCorrectAnswers: event.target.checked } })} />In đáp án đúng và kết quả từng câu trên phiếu</label>
                  <p className="text-xs text-slate-500">Bật trạm in trên máy giáo viên trước giờ thi và cấu hình Chrome in không cần xác nhận. Máy học sinh chỉ nộp bài; giáo viên có thể in lại tại tab Kết quả. Nếu các học sinh khác còn thi, thầy có thể bỏ chọn in đáp án đúng.</p>
                </div>

                {/* Questions */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-lg">Danh sách câu hỏi ({editingExam.questions.length})</h4>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsImportModalOpen(true)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Upload className="w-4 h-4" /> Nhập từ Word/Excel
                      </button>
                      <button 
                        onClick={handleAddMatchingQuestion}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Thêm câu hỏi Ghép nối
                      </button>
                      <button 
                        onClick={handleAddShortAnswerQuestion}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Thêm câu hỏi Trả lời ngắn
                      </button>
                      <button 
                        onClick={handleAddTrueFalseQuestion}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Thêm câu hỏi Đúng/Sai
                      </button>
                      <button 
                        onClick={handleAddQuestion}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Thêm câu hỏi
                      </button>
                    </div>
                  </div>

                  {editingExam.questions.map((q, qIdx) => (
                    <div key={q.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group">
                      <button 
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                        title="Xóa câu hỏi"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      
                      <div className="mb-4 pr-10">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Câu {qIdx + 1}:</label>
                        <RichTextEditor
                          value={q.text}
                          onChange={(val) => handleUpdateQuestion(q.id, 'text', val)}
                          placeholder="Nhập nội dung câu hỏi..."
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {q.type === 'short_answer' ? (
                          <div className="flex items-start gap-2">
                            <div className="flex-1 flex flex-col gap-2">
                              <label className="text-sm font-medium text-slate-700">Đáp án đúng:</label>
                              <input 
                                type="text"
                                value={q.correctTextAnswer || ''}
                                onChange={(e) => handleUpdateQuestion(q.id, 'correctTextAnswer', e.target.value)}
                                placeholder="Nhập đáp án đúng (học sinh cần nhập chính xác)"
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>
                        ) : q.type === 'matching' ? (
                          <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-sm font-medium text-slate-700">Các cặp ghép nối (Vế trái - Vế phải):</label>
                              <button
                                onClick={() => handleUpdateQuestion(q.id, 'addMatchingPair', null)}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                              >
                                <Plus className="w-4 h-4" /> Thêm cặp
                              </button>
                            </div>
                            {q.matchingPairs?.map((pair, pIdx) => (
                              <div key={pair.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="flex-1 flex flex-col gap-2">
                                  <input 
                                    type="text"
                                    value={pair.left}
                                    onChange={(e) => handleUpdateQuestion(q.id, 'matchingPairs', e.target.value, pIdx, 'left')}
                                    placeholder="Vế trái"
                                    className="w-full px-3 py-2 rounded border border-slate-300 text-sm"
                                  />
                                </div>
                                <div className="flex items-center justify-center pt-2">
                                  <ArrowRight className="w-5 h-5 text-slate-400" />
                                </div>
                                <div className="flex-1 flex flex-col gap-2">
                                  <input 
                                    type="text"
                                    value={pair.right}
                                    onChange={(e) => handleUpdateQuestion(q.id, 'matchingPairs', e.target.value, pIdx, 'right')}
                                    placeholder="Vế phải"
                                    className="w-full px-3 py-2 rounded border border-slate-300 text-sm"
                                  />
                                </div>
                                <button
                                  onClick={() => handleUpdateQuestion(q.id, 'removeMatchingPair', null, pIdx)}
                                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="Xóa cặp này"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          q.options.map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-start gap-2">
                              <input 
                                type="radio" 
                                name={`correct-${q.id}`}
                                checked={q.correctAnswer === optIdx}
                                onChange={() => handleUpdateQuestion(q.id, 'correctAnswer', optIdx)}
                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 cursor-pointer mt-3 shrink-0"
                                title="Chọn làm đáp án đúng"
                              />
                              <div className="flex-1 flex items-start gap-2">
                                <span className="w-8 text-center font-bold text-slate-400 mt-2 shrink-0">{['A', 'B', 'C', 'D'][optIdx]}</span>
                                <RichTextEditor
                                  value={opt}
                                  onChange={(val) => handleUpdateQuestion(q.id, 'options', val, optIdx)}
                                  placeholder={`Nhập đáp án ${['A', 'B', 'C', 'D'][optIdx]}`}
                                  className={`flex-1 ${q.correctAnswer === optIdx ? 'border-teal-300 ring-1 ring-teal-300' : 'border-slate-200'}`}
                                  minHeight="min-h-[40px]"
                                />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {editingExam.questions.length === 0 && (
                    <div className="text-center py-10 bg-white border border-slate-200 border-dashed rounded-xl text-slate-500">
                      Chưa có câu hỏi nào. Nhấn "Thêm câu hỏi" để bắt đầu.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Exam Confirmation Modal */}
      {examToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Xóa kỳ thi</h3>
            <p className="text-slate-500 mb-6">Bạn có chắc chắn muốn xóa kỳ thi này? Hành động này không thể hoàn tác.</p>
            <div className="flex items-center gap-3 justify-center">
              <button 
                onClick={() => setExamToDelete(null)}
                className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={async () => {
                  if (examToDelete) {
                    try {
                      const existingExam = exams.find(exam => exam.id === examToDelete);
                      if (existingExam?.status === 'published') {
                        await synchronizeExamPublication({ ...existingExam, status: 'closed' }, existingExam);
                      }
                      await deleteDoc(doc(db, 'exams', examToDelete));
                    } catch (error) {
                      console.error("Error deleting exam:", error);
                    }
                  }
                  setExamToDelete(null);
                }}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
              >
                Xóa kỳ thi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Result Confirmation Modal */}
      {resultToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Xóa kết quả</h3>
            <p className="text-slate-500 mb-6">Bạn có chắc chắn muốn xóa kết quả này? Hành động này không thể hoàn tác.</p>
            <div className="flex items-center gap-3 justify-center">
              <button 
                onClick={() => setResultToDelete(null)}
                className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={async () => {
                  if (resultToDelete) {
                    try {
                      await deleteDoc(doc(db, 'results', resultToDelete));
                    } catch (error) {
                      console.error("Error deleting result:", error);
                    }
                  }
                  setResultToDelete(null);
                }}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
              >
                Xóa kết quả
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Monitoring History Confirmation Modal */}
      {historyToDeleteExamId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Xóa lịch sử giám sát</h3>
            <p className="text-slate-500 mb-6">Bạn có chắc chắn muốn xóa toàn bộ lịch sử giám sát của kỳ thi này? Hành động này không thể hoàn tác.</p>
            <div className="flex items-center gap-3 justify-center">
              <button 
                onClick={() => setHistoryToDeleteExamId(null)}
                className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={handleClearMonitoringHistory}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
              >
                Xóa lịch sử
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Class Confirmation Modal */}
      {classToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Xóa lớp học</h3>
            <p className="text-slate-500 mb-6">Bạn có chắc chắn muốn xóa lớp học này? Tất cả học sinh trong lớp cũng sẽ bị xóa khỏi lớp.</p>
            <div className="flex items-center gap-3 justify-center">
              <button 
                onClick={() => setClassToDelete(null)}
                className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={async () => {
                  if (classToDelete) {
                    try {
                      await deleteDoc(doc(db, 'classes', classToDelete));
                      const studentsInClass = students.filter(s => s.classId === classToDelete);
                      await Promise.all(studentsInClass.map(s => {
                        const { classId, ...rest } = s;
                        return setDoc(doc(db, 'students', s.id), rest);
                      }));
                    } catch (error) {
                      console.error("Error deleting class:", error);
                    }
                  }
                  if (selectedClassId === classToDelete) {
                    setSelectedClassId('');
                  }
                  setClassToDelete(null);
                }}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
              >
                Xóa lớp học
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Questions Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Nhập câu hỏi từ Word/Excel</h3>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <div className="mb-4 text-sm text-slate-600 bg-blue-50 p-4 rounded-lg border border-blue-100">
                <p className="font-bold mb-2">Định dạng hỗ trợ:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1"><strong>Cách 1 (Word - 4 đáp án):</strong></p>
                    <pre className="bg-white p-2 rounded border border-blue-200 text-xs mb-3 font-mono whitespace-pre-wrap">
Câu 1: Nội dung câu hỏi...
A. Đáp án A
B. Đáp án B
C. Đáp án C
D. Đáp án D
Đáp án: A
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1"><strong>Cách 2 (Word - Đúng/Sai):</strong></p>
                    <pre className="bg-white p-2 rounded border border-blue-200 text-xs mb-3 font-mono whitespace-pre-wrap">
Câu 2: Nội dung câu hỏi...
A. Đúng
B. Sai
Đáp án: A
                    </pre>
                  </div>
                  <div className="md:col-span-2">
                    <p className="mb-1"><strong>Cách 3 (Word - Trả lời ngắn):</strong></p>
                    <pre className="bg-white p-2 rounded border border-blue-200 text-xs mb-3 font-mono whitespace-pre-wrap">
Câu 3: Nội dung câu hỏi...
Đáp án: [Nội dung trả lời]
                    </pre>
                  </div>
                </div>
                <p className="mb-1"><strong>Cách 4 (Excel):</strong> Copy các cột liên tiếp (Câu hỏi, Các đáp án, Đáp án đúng).</p>
                <pre className="bg-white p-2 rounded border border-blue-200 text-xs font-mono whitespace-pre-wrap overflow-x-auto mb-3">
Nội dung câu hỏi... | Đáp án A | Đáp án B | Đáp án C | Đáp án D | A
Nội dung câu hỏi... | Đúng | Sai | A
Nội dung câu hỏi... | [Nội dung trả lời]
                </pre>
                <p className="text-xs text-slate-500 italic">* Lưu ý: Câu hỏi ghép nối hiện tại chỉ hỗ trợ tạo thủ công qua nút "Thêm câu hỏi Ghép nối".</p>
              </div>
              <RichTextEditor
                value={importText}
                onChange={setImportText}
                placeholder="Dán nội dung câu hỏi vào đây..."
                className="w-full"
                minHeight="min-h-[250px]"
              />
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="px-6 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={handleImportQuestions}
                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
              >
                Nhập câu hỏi
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Import Students Modal */}
      {isStudentImportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Nhập danh sách học sinh</h3>
              <button 
                onClick={() => setIsStudentImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <div className="mb-4 text-sm text-slate-600 bg-blue-50 p-4 rounded-lg border border-blue-100">
                <p className="font-bold mb-2">Hướng dẫn:</p>
                <p>Copy và dán danh sách họ tên học sinh từ Excel hoặc Word. Mỗi dòng là một học sinh.</p>
              </div>
              <textarea
                value={studentImportText}
                onChange={(e) => setStudentImportText(e.target.value)}
                placeholder="Nguyễn Văn A&#10;Trần Thị B&#10;..."
                className="w-full h-64 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none resize-none font-sans text-sm"
              ></textarea>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button 
                onClick={() => setIsStudentImportModalOpen(false)}
                className="px-6 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={handleImportStudents}
                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
              >
                Nhập danh sách
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class Modal */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">{editingClass ? 'Sửa tên lớp' : 'Thêm lớp mới'}</h3>
              <button onClick={() => {
                setIsClassModalOpen(false);
                setEditingClass(null);
                setNewClassName('');
              }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Tên lớp</label>
              <input 
                type="text" 
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="VD: Lớp 10A1"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateClass();
                }}
              />
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setIsClassModalOpen(false);
                  setEditingClass(null);
                  setNewClassName('');
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={handleCreateClass}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
              >
                {editingClass ? 'Lưu thay đổi' : 'Tạo lớp'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
