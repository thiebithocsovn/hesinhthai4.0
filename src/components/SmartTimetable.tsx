import TimetableEducationPanel, { TimetableEducationCatalogDetails, TimetableTeachingCalendarPanel } from './TimetableEducationPanel';
import { EDUCATION_PROFILES, educationLevels, entryClockLabel, inferEducationKind, scenarioForTeachingWeek, sessionForPeriod, SESSION_LABELS } from '../lib/timetableEducation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import TimetableAdminShell from './TimetableAdminShell';
import { TimetableAvailabilityPanel, TimetableBackupPanel, TimetableCatalogPanel, TimetableCurriculumPanel, TimetableGradesPanel, TimetableHomeroomPanel, TimetableOverviewPanel, TimetableSettingsPanel } from './TimetableAdminPanels';
import { TimetableAssignmentResources, TimetableCampusPanel, TimetableConcurrencyPanel, TimetableMergePanel, TimetableResourceDetails, TimetableSameSessionPanel, TimetableSplitPanel, TimetableTeacherDaysPanel } from './TimetableAdvancedPanels';
import { decodeWorkspace, type TimetableWorkspace as PersistedWorkspace } from '../lib/timetableWorkspace';
import { timetableCoverSignature } from '../lib/timetableCover';
import { assignmentClassIds, assignmentStudentGroupIds, assignmentTeacherIds } from '../lib/smartTimetableResources';
import { TIMETABLE_ADMIN_PAGES, type TimetableWorkspaceTab } from '../lib/timetableNavigation';
import { createBlankManualTimetable, moveTimetableBlock, placeManualTimetableBlock, removeManualTimetableBlock, swapTimetableBlocks } from '../lib/timetableAdmin';
import { auditTimetableSolution } from '../lib/smartTimetableAudit';
import { collectTimetableConstraintAlerts } from '../lib/timetableConstraintAlerts';
import { printTimetableView } from '../lib/timetablePrint';
import {
  AlertTriangle,
  CalendarRange,
  Download,
  FileDown,
  Lock,
  Plus,
  ShieldAlert,
  Trash2,
  Unlock,
  WandSparkles,
  Undo2,
  Redo2,
} from 'lucide-react';
import {
  TIMETABLE_DAYS,
  activeTimetableDays,
  createDefaultTimetableScenario,
  normalizeTimetableScenario,
  optimizeTimetable,
  parseTimetableSlot,
  timetableSlotKey,
  type ScheduleEntry,
  type TeachingAssignment,
  type TimetableScenario,
  type TimetableSolution,
} from '../lib/smartTimetable';
import {
  TIMETABLE_IMPORT_COLUMNS,
  scenarioFromAssignmentRows,
  type TimetableImportRow,
} from '../lib/smartTimetableImport';

// Load infrequently used timetable workspaces only when their tab is opened.
// This keeps the core assignment grid and scheduling interactions responsive on slow devices.
const TimetableAgentPanel = React.lazy(() => import('./TimetableAgentPanel'));
const TimetablePublicationPanel = React.lazy(() => import('./TimetablePublicationPanel'));
const TimetableExamRoomsPanel = React.lazy(() => import('./TimetableExamRoomsPanel'));
const TimetableSchoolBoard = React.lazy(() => import('./TimetableSchoolBoard'));
const TimetableCoverPanel = React.lazy(() => import('./TimetableCoverPanel'));


interface SmartTimetableProps {
  onBack: () => void;
  storageKey: string;
  initialWorkspace?: PersistedWorkspace;
  onWorkspaceChange?: (next: PersistedWorkspace) => void;
  accountStatus?: React.ReactNode;
  trialMode?: boolean;
}

type WorkspaceTab = TimetableWorkspaceTab;
type CatalogKind = 'teacher' | 'class' | 'subject' | 'room';
type ConstraintKind = 'teacher' | 'class' | 'room';
type ScheduleView = 'class' | 'teacher' | 'room';

interface TimetableWorkerResponse {
  ok: boolean;
  solution?: TimetableSolution;
  error?: string;
}

function readWorkspace(storageKey: string): PersistedWorkspace {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return decodeWorkspace(JSON.parse(raw));
  } catch {
    // Standalone preview can start from its sample.
  }
  return { scenario: createDefaultTimetableScenario(), solution: null, versions: [] };
}

function entryTone(entry: ScheduleEntry, scenario: TimetableScenario): string {
  const classroom = scenario.classes.find(item => item.id === entry.classId);
  if (entry.fixed) return 'border-amber-300 bg-amber-50';
  return classroom?.level === 'Tiểu học' ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-200 bg-indigo-50';
}

function downloadBlob(filename: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function SmartTimetable({ onBack, storageKey, initialWorkspace, onWorkspaceChange, accountStatus, trialMode = false }: SmartTimetableProps) {
  const initial = useMemo(() => initialWorkspace ?? readWorkspace(storageKey), [initialWorkspace, storageKey]);
  const persisted = useRef(initial);
  const [scenario, setScenario] = useState<TimetableScenario>(initial.scenario);
  const [solution, setSolution] = useState<TimetableSolution | null>(initial.solution);
  const [versions, setVersions] = useState<TimetableSolution[]>(initial.versions);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [pageId, setPageId] = useState('overview');
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [manualSlot, setManualSlot] = useState<{ dayIndex: number; period: number } | null>(null);
  const [manualSubjectId, setManualSubjectId] = useState('');
  const [manualTeacherId, setManualTeacherId] = useState('');
  const [manualAssignmentId, setManualAssignmentId] = useState('');
  const [manualError, setManualError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [undoHistory, setUndoHistory] = useState<PersistedWorkspace[]>([]);
  const [redoHistory, setRedoHistory] = useState<PersistedWorkspace[]>([]);
  const [pendingImport, setPendingImport] = useState<{ scenario: TimetableScenario; rows: number; ignored: number; issues: string[] } | null>(null);

  const [catalogKind, setCatalogKind] = useState<CatalogKind>('teacher');

  const [draft, setDraft] = useState<Partial<TeachingAssignment>>({
    classId: initial.scenario.classes[0]?.id,
    subjectId: initial.scenario.subjects[0]?.id,
    teacherId: initial.scenario.teachers[0]?.id,
    periodsPerWeek: 2,
    maxPerDay: 1,
    blockSize: 1,
    session: 'any',
  });
  useEffect(() => {
    setDraft(previous => {
      const next = { ...previous,
        classId: scenario.classes.some(item => item.id === previous.classId) ? previous.classId : scenario.classes[0]?.id,
        teacherId: scenario.teachers.some(item => item.id === previous.teacherId) ? previous.teacherId : scenario.teachers[0]?.id,
        subjectId: scenario.subjects.some(item => item.id === previous.subjectId) ? previous.subjectId : scenario.subjects[0]?.id,
        roomId: scenario.rooms.some(item => item.id === previous.roomId) ? previous.roomId : undefined,
      };
      return next.classId === previous.classId && next.teacherId === previous.teacherId && next.subjectId === previous.subjectId && next.roomId === previous.roomId ? previous : next;
    });
  }, [scenario.classes, scenario.teachers, scenario.subjects, scenario.rooms]);
  const [fixedDay, setFixedDay] = useState(-1);
  const [fixedPeriod, setFixedPeriod] = useState(1);

  const [constraintKind, setConstraintKind] = useState<ConstraintKind>('teacher');

  const [scheduleLevel, setScheduleLevel] = useState('all');
  const [scheduleView, setScheduleView] = useState<ScheduleView>('class');
  const [scheduleResourceId, setScheduleResourceId] = useState(initial.scenario.classes[0]?.id || '');

  const excelInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const optimizerGeneration = useRef(0);
  const cancelOptimizer = () => { optimizerGeneration.current++; workerRef.current?.terminate(); workerRef.current = null; setBusy(false); };
  useEffect(() => { const title = document.title; document.title = 'Thời khóa biểu'; return () => { document.title = title; }; }, []);

  useEffect(() => {
    if (onWorkspaceChange) {
      if (scenario !== persisted.current.scenario || solution !== persisted.current.solution || versions !== persisted.current.versions) {
        persisted.current = { scenario, solution, versions };
        onWorkspaceChange(persisted.current);
      }
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ scenario, solution, versions } satisfies PersistedWorkspace));
    } catch {
      // Workspace stays usable without browser storage.
    }
  }, [onWorkspaceChange, scenario, solution, storageKey, versions]);

  useEffect(() => () => {
    optimizerGeneration.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const educationProfile = EDUCATION_PROFILES.find(profile => profile.id === inferEducationKind(scenario));
  const educationName = educationProfile?.id === 'custom' ? educationLevels(scenario).join(' + ') || educationProfile.name : educationProfile?.name;
  const timetableTitle = educationName ? `Thời khóa biểu ${educationName}` : 'Thời khóa biểu';
  const days = activeTimetableDays(scenario);
  const weeklyScenario = useMemo(() => scenarioForTeachingWeek(scenario), [scenario]);
  const totalRequiredPeriods = weeklyScenario.assignments.reduce((sum, item) => sum + item.periodsPerWeek, 0);
  const unscheduledPeriods = solution?.diagnostics.unscheduled.reduce((sum, item) => sum + item.remaining, 0) || 0;
  const lockedEntries = solution?.entries.filter(item => item.locked && !item.fixed) || [];
  const constraintAlerts = useMemo(() => collectTimetableConstraintAlerts(scenario), [scenario]);
  const preflight = constraintAlerts.map(alert => alert.message);

  const lookup = useMemo(() => ({
    teachers: new Map(scenario.teachers.map(item => [item.id, item])),
    classes: new Map(scenario.classes.map(item => [item.id, item])),
    subjects: new Map(scenario.subjects.map(item => [item.id, item])),
    rooms: new Map(scenario.rooms.map(item => [item.id, item])),
    assignments: new Map(scenario.assignments.map(item => [item.id, item])),
  }), [scenario]);

  const scheduleResources = scheduleView === 'class' ? scenario.classes.filter(c => scheduleLevel === 'all' || c.level === scheduleLevel) : scheduleView === 'teacher' ? scenario.teachers : scenario.rooms;
  const audit = useMemo(() => auditTimetableSolution(scenario, solution), [scenario, solution]);
  const draftAudit = useMemo(() => auditTimetableSolution(scenario, solution, { allowIncomplete: true }), [scenario, solution]);
  const manualCandidates = weeklyScenario.assignments.filter(item =>
    scheduleView === 'class' && assignmentClassIds(item).includes(scheduleResourceId) &&
    (solution?.entries.filter(entry => entry.assignmentId === item.id).length || 0) < item.periodsPerWeek);
  const selectedManualSubjectId = manualCandidates.some(item => item.subjectId === manualSubjectId) ? manualSubjectId : manualCandidates[0]?.subjectId || '';
  const subjectCandidates = manualCandidates.filter(item => item.subjectId === selectedManualSubjectId);
  const selectedManualTeacherId = subjectCandidates.some(item => item.teacherId === manualTeacherId) ? manualTeacherId : subjectCandidates[0]?.teacherId || '';
  const assignmentCandidates = subjectCandidates.filter(item => item.teacherId === selectedManualTeacherId);
  const selectedManualAssignment = assignmentCandidates.find(item => item.id === manualAssignmentId) || assignmentCandidates[0];

  const navigatePage = (id: string) => {
    const page = TIMETABLE_ADMIN_PAGES.find(item => item.id === id);
    if (!page) return;
    setPageId(id);
    setActiveTab(page.tab);
    setSelectedEntryId('');
    setManualSlot(null);
    setManualError('');
    if (page.catalog) setCatalogKind(page.catalog);
    if (page.constraint) setConstraintKind(page.constraint);
    if (page.view) setScheduleView(page.view);
  };

  useEffect(() => {
    if (TIMETABLE_ADMIN_PAGES.find(item => item.id === pageId)?.tab !== activeTab) {
      setPageId(TIMETABLE_ADMIN_PAGES.find(item => item.tab === activeTab)?.id || 'overview');
    }
  }, [activeTab, pageId]);

  useEffect(() => {
    const resources = scheduleView === 'class' ? scenario.classes.filter(c => scheduleLevel === 'all' || c.level === scheduleLevel) : scheduleView === 'teacher' ? scenario.teachers : scenario.rooms;
    if (!resources.some(item => item.id === scheduleResourceId)) setScheduleResourceId(resources[0]?.id || '');
  }, [scenario.classes, scenario.rooms, scenario.teachers, scheduleResourceId, scheduleView, scheduleLevel]);

  const resetSolution = () => {
    cancelOptimizer();
    setSolution(null);
    setSelectedEntryId('');
    setManualSlot(null);
    setMessage('Dữ liệu đã thay đổi. Hãy xếp lại để cập nhật phương án.');
  };

  const changeScenario = (next: TimetableScenario) => {
    setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20));
    setRedoHistory([]);
    setScenario(next);
    resetSolution();
  };

  const restoreWorkspace = (workspace: PersistedWorkspace) => { cancelOptimizer(); setScenario(workspace.scenario); setSolution(workspace.solution); setVersions(workspace.versions); setSelectedEntryId(''); setManualSlot(null); };
  const undo = () => {
    const previous = undoHistory[undoHistory.length - 1]; if (!previous) return;
    setRedoHistory(history => [...history, { scenario, solution, versions }].slice(-20)); setUndoHistory(history => history.slice(0, -1)); restoreWorkspace(previous); setMessage('Đã hoàn tác thay đổi dữ liệu.');
  };
  const redo = () => {
    const next = redoHistory[redoHistory.length - 1]; if (!next) return;
    setUndoHistory(history => [...history, { scenario, solution, versions }].slice(-20)); setRedoHistory(history => history.slice(0, -1)); restoreWorkspace(next); setMessage('Đã áp dụng lại thay đổi.');
  };

  const restoreVersion = (version: TimetableSolution) => {
    const report = auditTimetableSolution(scenario, version, { allowIncomplete: true });
    if (!report.valid) {
      setMessage('Phương án này không khớp dữ liệu hoặc ràng buộc hiện tại. Khôi phục bản JSON tương ứng hoặc xếp lại lịch.');
      return;
    }
    setSolution(version);
    navigatePage('schedule');
    setMessage('Đã mở phương án và kiểm tra độc lập.');
  };

  const beginManualTimetable = () => {
    if (!weeklyScenario.assignments.length || !scenario.classes.length) {
      setMessage('Hãy khai báo lớp, môn, giáo viên và phân công trước khi xếp thủ công.');
      navigatePage('assignments');
      return;
    }
    if (solution?.entries.length && !window.confirm('Tạo thời khóa biểu trống sẽ thay phương án đang mở. Bản cũ vẫn nằm trong lịch sử phương án. Tiếp tục?')) return;
    setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20));
    setRedoHistory([]);
    const blank = createBlankManualTimetable(scenario);
    setVersions(previous => solution?.entries.length ? [solution, ...previous].slice(0, 8) : previous);
    setSolution(blank);
    setScheduleView('class');
    setScheduleResourceId(scenario.classes[0]?.id || '');
    setSelectedEntryId('');
    setManualSlot(null);
    setManualError('');
    navigatePage('schedule');
    setMessage('Đã tạo bảng trống. Chọn lớp, nhấn vào ô trống và chọn môn cùng giáo viên để xếp từng tiết.');
  };

  const addManualLesson = () => {
    if (!solution || !manualSlot || !selectedManualAssignment || busy) return;
    const result = placeManualTimetableBlock(scenario, solution, selectedManualAssignment.id, manualSlot.dayIndex, manualSlot.period);
    if (!result.solution) {
      const problem = result.errors.slice(0, 3).join(' ');
      setManualError(problem);
      setMessage('Không thể xếp tiết: ' + problem);
      return;
    }
    setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20));
    setRedoHistory([]);
    setSolution(result.solution);
    setVersions(previous => [result.solution!, ...previous].slice(0, 8));
    setManualSlot(null);
    setManualError('');
    setManualSubjectId('');
    setManualTeacherId('');
    setManualAssignmentId('');
    setMessage('Đã xếp tiết thủ công và kiểm tra ràng buộc. Tiếp tục chọn ô trống để xếp các tiết còn lại.');
  };

  const removeManualLesson = (entry: ScheduleEntry) => {
    if (!solution || busy) return;
    if (!window.confirm('Xóa tiết học này (cả block nếu là tiết đôi/ba)? Thời khóa biểu sẽ trở lại trạng thái bản nháp cho đến khi xếp đủ tiết.')) return;
    const result = removeManualTimetableBlock(scenario, solution, entry.id);
    if (!result.solution) { setMessage('Không thể xóa tiết: ' + result.errors.slice(0, 3).join(' ')); return; }
    setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20));
    setRedoHistory([]);
    setSolution(result.solution);
    setVersions(previous => [result.solution!, ...previous].slice(0, 8));
    setSelectedEntryId('');
    setMessage('Đã xóa block và cập nhật số tiết còn cần xếp.');
  };

  const moveEntry = (id: string, dayIndex: number, period: number) => {
    if (!solution || busy) return;
    const target = visibleEntries.find(e => e.dayIndex === dayIndex && e.period === period && e.id !== id);
    const result = target ? swapTimetableBlocks(scenario, solution, id, target.id) : moveTimetableBlock(scenario, solution, id, dayIndex, period);
    if (!result.solution) { setMessage(`Không thể chuyển tiết: ${result.errors.slice(0, 3).join(' ')}`); return; }
    setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20)); setRedoHistory([]);
    setSolution(result.solution);
    setVersions(previous => [result.solution!, ...previous].slice(0, 8));
    setSelectedEntryId('');
    setMessage('Đã chuyển toàn bộ block và kiểm tra độc lập: không trùng lớp, giáo viên hoặc phòng; tiếp tục xếp đủ tiết nếu lịch còn thiếu.');
  };

  const acceptSolution = (next: TimetableSolution, generation: number) => {
    if (generation !== optimizerGeneration.current) return;
    setSolution(next);
    setVersions(previous => [next, ...previous].slice(0, 8));
    setBusy(false);
    setActiveTab(next.diagnostics.hardConflicts.length || next.diagnostics.unscheduled.length ? 'diagnostics' : 'schedule');
  };

  const runOptimizer = () => {
    if (preflight.length) { setMessage('Cần xử lý cảnh báo dữ liệu trước khi xếp lịch.'); navigatePage('analysis'); return; }
    const generation = ++optimizerGeneration.current;
    setBusy(true);
    setMessage('');
    workerRef.current?.terminate();
    workerRef.current = null;
    const iterations = trialMode ? 80 : 320;

    if (typeof Worker === 'undefined') {
      window.setTimeout(() => acceptSolution(optimizeTimetable(scenario, lockedEntries, trialMode ? 60 : 140), generation), 20);
      return;
    }

    try {
      const worker = new Worker(new URL('../workers/timetable.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      let settled = false;
      const fallback = (reason: string) => {
        if (settled || generation !== optimizerGeneration.current) return;
        settled = true;
        worker.terminate();
        workerRef.current = null;
        setMessage(`${reason} Hệ thống đã chuyển sang bộ tối ưu dự phòng.`);
        window.setTimeout(() => acceptSolution(optimizeTimetable(scenario, lockedEntries, trialMode ? 60 : 140), generation), 20);
      };

      worker.onmessage = (event: MessageEvent<TimetableWorkerResponse>) => {
        if (settled || generation !== optimizerGeneration.current) return;
        if (!event.data.ok || !event.data.solution) {
          fallback(event.data.error || 'Web Worker không trả về phương án hợp lệ.');
          return;
        }
        settled = true;
        worker.terminate();
        workerRef.current = null;
        acceptSolution(event.data.solution, generation);
      };
      worker.onerror = () => fallback('Không thể chạy bộ tối ưu nền trên thiết bị này.');
      worker.postMessage({ scenario, lockedEntries, iterations });
    } catch {
      window.setTimeout(() => acceptSolution(optimizeTimetable(scenario, lockedEntries, trialMode ? 60 : 140), generation), 20);
    }
  };

  const toggleEntryLock = (entry: ScheduleEntry) => {
    if (entry.fixed) return;
    setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20)); setRedoHistory([]);
    const nextLocked = !entry.locked;
    setSolution(previous => previous ? {
      ...previous,
      entries: previous.entries.map(item => (entry.parallelEventId ? item.parallelEventId === entry.parallelEventId : (entry.blockId && item.blockId === entry.blockId) || (!entry.blockId && item.id === entry.id))
        ? { ...item, locked: nextLocked }
        : item),
    } : previous);
  };

  const addAssignment = () => {
    if (!draft.classId || !draft.subjectId || !draft.teacherId || !draft.periodsPerWeek) return;
    const blockSize = draft.blockSize === 2 || draft.blockSize === 3 ? draft.blockSize : 1;
    const fixedStartSlots = fixedDay >= 0 ? [timetableSlotKey(fixedDay, fixedPeriod)] : [];
    const item: TeachingAssignment = {
      id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      classId: draft.classId,
      subjectId: draft.subjectId,
      teacherId: draft.teacherId,
      ...(draft.roomId ? { roomId: draft.roomId } : {}),
      periodsPerWeek: Math.max(1, Number(draft.periodsPerWeek)),
      maxPerDay: Math.max(blockSize, Number(draft.maxPerDay || blockSize)),
      blockSize,
      session: draft.session || 'any',
      avoidLastPeriod: Boolean(draft.avoidLastPeriod),
      fixedStartSlots,
    };
    const proposed = { ...scenario, assignments: [...scenario.assignments, item] };
    const current = new Set(constraintAlerts.map(alert => alert.code + ':' + alert.message));
    const newlyIntroduced = collectTimetableConstraintAlerts(proposed).filter(alert => !current.has(alert.code + ':' + alert.message));
    if (newlyIntroduced.length) {
      setMessage('Không thể thêm phân công vì vi phạm ràng buộc: ' + newlyIntroduced.slice(0, 2).map(alert => alert.message + ' ' + alert.remedy).join(' '));
      return;
    }
    changeScenario(proposed);
  };

  const resetWorkspace = () => {
    setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20)); setRedoHistory([]);
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    const next = createDefaultTimetableScenario();
    setScenario(next);
    setSolution(null);
    setVersions([]);
    setScheduleView('class');
    setScheduleResourceId(next.classes[0]?.id || '');
    setConstraintKind('teacher');
    setMessage('Đã khôi phục dữ liệu mẫu liên cấp.');
    setActiveTab('overview');
  };

  const importExcel = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer());
      const firstSheet = workbook.Sheets[workbook.SheetNames.find(name => name === 'Phan cong') || workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<TimetableImportRow>(firstSheet, { defval: '' });
      const next = scenarioFromAssignmentRows(rows, {
        ...scenario,
        teachers: [], classes: [], subjects: [], rooms: [], assignments: [],
        grades: [], campuses: [], studentGroups: [], lessonGroups: [], examRoomPlan: undefined,
      });
      if (!next.assignments.length) throw new Error('Không tìm thấy các cột Lớp, Môn và Giáo viên trong sheet đầu tiên.');
      setPendingImport({ scenario: next, rows: rows.length, ignored: Math.max(0, rows.length - next.assignments.length), issues: collectTimetableConstraintAlerts(next).map(alert => alert.message + ' ' + alert.remedy) });
    } catch (error) {
      setMessage(error instanceof Error ? `Không thể nhập Excel: ${error.message}` : 'Không thể nhập Excel.');
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const downloadExcelTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const classNames = { 'Tiểu học': '5A', 'THCS': '6A', 'THPT': '10A', 'GDTX THCS': 'GDTX 6A', 'GDTX THPT': 'GDTX 10A', 'Đại học': 'CNTT K26' };
    const sample = [Object.fromEntries(TIMETABLE_IMPORT_COLUMNS.map(column => [column, ''])), ...educationLevels(scenario).map((level, i) => ({
      'Cấp': level, 'Lớp': classNames[level], 'Môn': level === 'Đại học' ? 'Nhập môn lập trình' : 'Tin học', 'Giáo viên': `Giáo viên ${i + 1}`, 'Cấp GV': level,
      'Phòng': `Phòng ${i + 1}`, 'Tiết/tuần': 2, 'Tối đa/ngày': 2, 'Tiết đôi': 2, 'Buổi': level.startsWith('GDTX') ? 'Tối' : 'Bất kỳ',
      'Mã học phần': level === 'Đại học' ? 'IT101' : '', 'Tín chỉ': level === 'Đại học' ? 3 : '', 'Mã lớp học phần': level === 'Đại học' ? 'IT101-01' : '',
      'Từ tuần': scenario.education ? 1 : '', 'Đến tuần': scenario.education?.weekCount || '', 'Tuần học': 'Tất cả',
    }))];
    const sheet = XLSX.utils.json_to_sheet(sample, { header: [...TIMETABLE_IMPORT_COLUMNS] });
    sheet['!cols'] = TIMETABLE_IMPORT_COLUMNS.map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Phan cong');
    XLSX.writeFile(workbook, 'Mau-nhap-phan-cong-TKB.xlsx');
    } catch (error) {
      setMessage(error instanceof Error ? 'Không thể tải file mẫu Excel: ' + error.message : 'Không thể tải file mẫu Excel.');
    }
  };

  const exportBackup = () => downloadBlob(
    `Sao-luu-TKB-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ version: 3, scenario, solution, versions }, null, 2),
    'application/json;charset=utf-8',
  );

  const restoreBackupText = (raw: string): boolean => {
    try {
      const next = decodeWorkspace(JSON.parse(raw));
      setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20));
      setRedoHistory([]);
      restoreWorkspace(next);
      setMessage('Đã khôi phục dữ liệu từ bản sao lưu.');
      return true;
    } catch (error) {
      setMessage(error instanceof SyntaxError ? 'Bản sao lưu chưa đúng định dạng JSON.' :
        error instanceof Error ? `Không thể khôi phục: ${error.message}` : 'Không thể khôi phục dữ liệu.');
      return false;
    }
  };

  const importBackup = async (file: File) => {
    try {
      restoreBackupText(await file.text());
    } catch {
      setMessage('Không đọc được tệp sao lưu.');
    } finally {
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

  const downloadDiagnostics = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = constraintAlerts.map((item, index) => ({
      STT: index + 1,
      'Mã cảnh báo': item.code,
      'Vấn đề': item.message,
      'Hướng xử lý': item.remedy,
      'Chức năng cần sửa': TIMETABLE_ADMIN_PAGES.find(page => page.id === item.pageId)?.label || item.pageId,
    }));
    const auditRows = [
      ...audit.errors.map((item, index) => ({ STT: index + 1, 'Mức độ': 'Lỗi cứng', 'Mô tả': item })),
      ...audit.warnings.map((item, index) => ({ STT: audit.errors.length + index + 1, 'Mức độ': 'Cảnh báo', 'Mô tả': item })),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Kết quả': 'Không có lỗi khai báo được phát hiện' }]), 'Loi_khai_bao');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(auditRows.length ? auditRows : [{ 'Kết quả': solution ? 'Không có lỗi kiểm toán' : 'Chưa có phương án xếp lịch' }]), 'Kiem_toan_TKB');
    XLSX.writeFile(wb, `Bao-cao-kiem-tra-TKB-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      setMessage(error instanceof Error ? 'Không thể tải báo cáo lỗi Excel: ' + error.message : 'Không thể tải báo cáo lỗi Excel.');
    }
  };

  const exportExcel = async () => {
    if (!solution) return;
    const report = auditTimetableSolution(scenario, solution);
    if (!report.valid || !report.complete) {
      setMessage('Không thể xuất thời khóa biểu chưa hợp lệ. ' + (report.errors[0] || 'Hãy xếp đủ tiết và kiểm tra độc lập trước khi xuất.'));
      navigatePage('analysis');
      return;
    }
    try {
      const [XLSX, { createTimetableWorkbook }] = await Promise.all([import('xlsx'), import('../lib/timetableExcel')]);
      XLSX.writeFile(createTimetableWorkbook(scenario, solution), `Thoi-khoa-bieu-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      setMessage(error instanceof Error ? 'Không thể xuất Excel: ' + error.message : 'Không thể xuất Excel.');
    }
  };

  const visibleEntries = solution?.entries.filter(entry =>
    (scheduleView === 'class' ? assignmentClassIds(entry).includes(scheduleResourceId) : scheduleView === 'teacher' ? assignmentTeacherIds(entry).includes(scheduleResourceId) : entry.roomId === scheduleResourceId) && (scheduleLevel === 'all' || assignmentClassIds(entry).some(id => lookup.classes.get(id)?.level === scheduleLevel)),
  ) || [];

  return (
    <TimetableAdminShell
      pageId={pageId}
      timetableTitle={timetableTitle}
      trialMode={trialMode}
      accountStatus={accountStatus}
      onNavigate={navigatePage}
      onBack={onBack}
      actions={<>
        {busy && <button type="button" className="tt-action-export" onClick={() => { cancelOptimizer(); setMessage('Đã dừng lượt xếp. Dữ liệu và phương án trước vẫn được giữ.'); }}>Dừng xếp</button>}
        <button type="button" onClick={undo} disabled={busy || !undoHistory.length} className="tt-action-export" aria-label="Hoàn tác thay đổi"><Undo2 size={14} />Hoàn tác</button>
        <button type="button" onClick={redo} disabled={busy || !redoHistory.length} className="tt-action-export" aria-label="Làm lại thay đổi"><Redo2 size={14} />Làm lại</button>
        <button type="button" onClick={exportExcel} disabled={!solution || busy || !audit.valid || !audit.complete} className="tt-action-export"><Download size={15} />Xuất Excel</button>
        <button type="button" onClick={beginManualTimetable} disabled={busy || !weeklyScenario.assignments.length} className="tt-action-export"><Plus size={15} />Xếp thủ công từ bảng trống</button>
        <button type="button" onClick={runOptimizer} disabled={busy || !scenario.assignments.length} className="tt-action-run"><WandSparkles size={15} />{busy ? 'Đang xếp lịch...' : 'Xếp tự động'}</button>
      </>}
    >
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={event => event.target.files?.[0] && void importExcel(event.target.files[0])} />
      <input ref={jsonInputRef} type="file" accept="application/json,.json" className="hidden" onChange={event => event.target.files?.[0] && void importBackup(event.target.files[0])} />
      {message && <div role="status" className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-800">{message}</div>}
      {constraintAlerts.length > 0 && <section role="alert" aria-label="Cảnh báo ràng buộc thời khóa biểu" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-extrabold"><AlertTriangle size={16} className="mr-2 inline" />{constraintAlerts.length} ràng buộc cần xử lý</p><p className="mt-1 text-xs">Phát hiện ngay khi khai báo. Chưa nên xếp lịch hoặc công bố cho tới khi sửa xong.</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold hover:bg-rose-100" onClick={downloadDiagnostics}><Download size={14} className="mr-1 inline" />Tải báo cáo lỗi Excel</button>
            <button type="button" className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold hover:bg-rose-100" onClick={() => navigatePage('analysis')}>Xem phân tích</button>
          </div>
        </div>
        <ol className="mt-3 space-y-2">
          {constraintAlerts.slice(0, 3).map((alert, index) => <li key={alert.code + alert.message} className="rounded-lg bg-white/85 px-3 py-2 text-xs leading-5">
            <b>{index + 1}. {alert.message}</b><p>{alert.remedy}</p>
            <button type="button" className="mt-1 font-bold underline underline-offset-2" onClick={() => navigatePage(alert.pageId)}>Mở nơi cần sửa</button>
          </li>)}
        </ol>
        {constraintAlerts.length > 3 && <details className="mt-2 text-xs"><summary className="cursor-pointer font-bold">Xem thêm {constraintAlerts.length - 3} cảnh báo</summary><ol className="mt-2 space-y-2">{constraintAlerts.slice(3).map((alert, index) => <li key={alert.code + alert.message} className="rounded bg-white/85 px-3 py-2"><b>{index + 4}. {alert.message}</b><p>{alert.remedy}</p><button type="button" className="mt-1 underline" onClick={() => navigatePage(alert.pageId)}>Mở nơi cần sửa</button></li>)}</ol></details>}
      </section>}
      {busy && <div role="status" className="mb-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">Đang xếp toàn trường. Các ô nhập tạm khóa để giữ nhất quán dữ liệu.</div>}
      {pendingImport && <section role="dialog" aria-modal="true" aria-label="Xem trước dữ liệu nhập Excel" className="tt-panel mb-5 border-indigo-300">
        <h3>Xem trước nhập Excel · chưa thay đổi dữ liệu hiện tại</h3>
        <p>{pendingImport.rows} dòng đọc được · {pendingImport.scenario.assignments.length} phân công · {pendingImport.scenario.classes.length} lớp · {pendingImport.scenario.teachers.length} giáo viên. {pendingImport.ignored} dòng trống hoặc thiếu cột bắt buộc sẽ bỏ qua.</p>
        {pendingImport.issues.map(issue => <p key={issue} className="!text-amber-700">{issue}</p>)}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="tt-button green" onClick={() => { changeScenario(pendingImport.scenario); setVersions([]); setPendingImport(null); navigatePage('analysis'); setMessage('Đã áp dụng dữ liệu nhập. Có thể hoàn tác nếu cần khôi phục dữ liệu trước.'); }}>Áp dụng nhập và thay dữ liệu hiện tại</button><button type="button" className="tt-button" onClick={() => setPendingImport(null)}>Hủy nhập</button></div>
      </section>}
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        {scenario.education && <div className="tt-panel flex flex-wrap items-center justify-between gap-3"><div className="text-sm"><b>{scenario.education.levels.join(' + ')}</b><span className="ml-3 text-slate-500">{scenario.education.academicYear} · {scenario.education.term}</span></div><label className="text-xs font-semibold">Tuần đang xếp <select aria-label="Chọn tuần xếp lịch" className="ml-2 rounded-md border px-3 py-2" value={scenario.education.activeWeek} onChange={e => changeScenario({ ...scenario, education: { ...scenario.education!, activeWeek: Number(e.target.value) } })}>{Array.from({ length: scenario.education.weekCount }, (_, i) => <option key={i} value={i + 1}>Tuần {i + 1} · {(i + 1) % 2 ? 'lẻ' : 'chẵn'}</option>)}</select></label></div>}
        <React.Suspense fallback={<div role="status" className="tt-panel py-8 text-center text-sm text-slate-600">Đang tải chức năng thời khóa biểu...</div>}>
        {activeTab === 'education' && <TimetableEducationPanel key={JSON.stringify(scenario.education || null)} scenario={scenario} onChange={changeScenario} />}
        {activeTab === 'schoolboard' && <TimetableSchoolBoard scenario={scenario} solution={solution} />}
        {activeTab === 'cover' && <TimetableCoverPanel key={timetableCoverSignature(scenario, solution)} scenario={scenario} solution={solution} storageKey={storageKey} />}
        {activeTab === 'overview' && <TimetableOverviewPanel scenario={scenario} solution={solution} navigate={navigatePage} onImport={() => excelInputRef.current?.click()} onTemplate={downloadExcelTemplate} />}
        {activeTab === 'catalog' && <><TimetableCatalogPanel key={catalogKind} scenario={scenario} kind={catalogKind} onChange={changeScenario} /><TimetableEducationCatalogDetails scenario={scenario} kind={catalogKind} onChange={changeScenario} />{(catalogKind === 'class' || catalogKind === 'room') && <TimetableResourceDetails scenario={scenario} onChange={changeScenario} />}</>}
        {activeTab === 'grades' && <TimetableGradesPanel scenario={scenario} onChange={changeScenario} />}
        {activeTab === 'homeroom' && <TimetableHomeroomPanel scenario={scenario} onChange={changeScenario} />}
        {activeTab === 'curriculum' && <><TimetableCurriculumPanel scenario={scenario} onChange={changeScenario} /><TimetableTeachingCalendarPanel scenario={scenario} onChange={changeScenario} /><TimetableAssignmentResources scenario={scenario} onChange={changeScenario} /></>}
        {activeTab === 'settings' && <><TimetableSettingsPanel pageId={pageId} scenario={scenario} onChange={changeScenario} />{pageId === 'limits' && <TimetableTeacherDaysPanel scenario={scenario} onChange={changeScenario} />}</>}
        {activeTab === 'advanced' && pageId === 'campuses' && <TimetableCampusPanel scenario={scenario} onChange={changeScenario} />}
        {activeTab === 'advanced' && pageId === 'merge' && <TimetableMergePanel scenario={scenario} onChange={changeScenario} />}
        {activeTab === 'advanced' && pageId === 'split' && <TimetableSplitPanel scenario={scenario} onChange={changeScenario} />}
        {activeTab === 'advanced' && pageId === 'same-session' && <TimetableSameSessionPanel scenario={scenario} onChange={changeScenario} />}
        {activeTab === 'advanced' && pageId === 'concurrency' && <TimetableConcurrencyPanel scenario={scenario} onChange={changeScenario} />}
        {activeTab === 'advanced' && pageId === 'exam-rooms' && <TimetableExamRoomsPanel scenario={scenario} onChange={next => { setUndoHistory(previous => [...previous, { scenario, solution, versions }].slice(-20)); setRedoHistory([]); setScenario(next); setMessage('Đã lưu đề xuất phân phòng thi.'); }} />}
        {activeTab === 'advanced' && pageId === 'public-links' && <TimetablePublicationPanel scenario={scenario} solution={solution} storageKey={storageKey} />}
        {activeTab === 'backup' && <TimetableBackupPanel solution={solution} versions={versions} onBackup={exportBackup} onRestore={() => jsonInputRef.current?.click()} onRestoreText={restoreBackupText} onExcel={exportExcel} onImport={() => excelInputRef.current?.click()} onTemplate={downloadExcelTemplate} onVersion={restoreVersion} onReset={() => { if (window.confirm('Thay dữ liệu hiện tại bằng dữ liệu mẫu? Hãy sao lưu JSON trước khi tiếp tục.')) resetWorkspace(); }} />}

        {activeTab === 'assignments' && (
          <div className="grid gap-5 lg:grid-cols-[390px_1fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-extrabold">Thêm phân công</h2><p className="mt-1 text-sm text-slate-500">Hỗ trợ tiết đôi, buổi học và một ô cố định.</p><div className="mt-5 space-y-3"><select value={draft.classId || ''} onChange={event => setDraft(previous => ({ ...previous, classId: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{scenario.classes.map(item => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select><select value={draft.subjectId || ''} onChange={event => setDraft(previous => ({ ...previous, subjectId: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{scenario.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={draft.teacherId || ''} onChange={event => setDraft(previous => ({ ...previous, teacherId: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{scenario.teachers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select><select value={draft.roomId || ''} onChange={event => setDraft(previous => ({ ...previous, roomId: event.target.value || undefined }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Phòng thường / không khóa phòng</option>{scenario.rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="grid grid-cols-3 gap-2"><label className="text-[11px] font-bold text-slate-600">Tiết/tuần<input type="number" min={1} max={30} value={draft.periodsPerWeek || 1} onChange={event => setDraft(previous => ({ ...previous, periodsPerWeek: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-sm" /></label><label className="text-[11px] font-bold text-slate-600">Tối đa/ngày<input type="number" min={1} max={8} value={draft.maxPerDay || 1} onChange={event => setDraft(previous => ({ ...previous, maxPerDay: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-sm" /></label><label className="text-[11px] font-bold text-slate-600">Block<select value={draft.blockSize || 1} onChange={event => setDraft(previous => ({ ...previous, blockSize: Number(event.target.value) as 1 | 2 | 3 }))} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-sm"><option value={1}>1 tiết</option><option value={2}>2 tiết liền</option><option value={3}>3 tiết liền</option></select></label></div><select value={draft.session || 'any'} onChange={event => setDraft(previous => ({ ...previous, session: event.target.value as TeachingAssignment['session'] }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="any">Bất kỳ buổi nào</option><option value="morning">Chỉ buổi sáng</option><option value="afternoon">Chỉ buổi chiều</option><option value="evening">Chỉ buổi tối</option></select><div className="rounded-2xl bg-slate-50 p-3"><div className="mb-2 text-xs font-bold text-slate-600">Ô cố định (không bắt buộc)</div><div className="grid grid-cols-2 gap-2"><select value={fixedDay} onChange={event => setFixedDay(Number(event.target.value))} className="rounded-xl border border-slate-200 px-2 py-2 text-sm"><option value={-1}>Không cố định</option>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><select value={fixedPeriod} onChange={event => setFixedPeriod(Number(event.target.value))} disabled={fixedDay < 0} className="rounded-xl border border-slate-200 px-2 py-2 text-sm disabled:opacity-50">{Array.from({ length: scenario.periodsPerDay }, (_, index) => index + 1).map(period => <option key={period} value={period}>Tiết {period}</option>)}</select></div></div><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={Boolean(draft.avoidLastPeriod)} onChange={event => setDraft(previous => ({ ...previous, avoidLastPeriod: event.target.checked }))} />Hạn chế tiết cuối buổi/ngày</label><button type="button" onClick={addAssignment} disabled={!scenario.classes.length || !scenario.subjects.length || !scenario.teachers.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Thêm phân công</button></div></section>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-extrabold">Danh sách phân công</h2><p className="text-sm text-slate-500">{scenario.assignments.length} yêu cầu · {totalRequiredPeriods} tiết tuần đang chọn</p></div><div className="max-h-[680px] divide-y divide-slate-100 overflow-auto">{scenario.assignments.length === 0 && <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"><CalendarRange className="h-9 w-9 text-slate-400" /><h3 className="text-base font-bold text-slate-800">Chưa có phân công giảng dạy</h3><p className="max-w-md text-sm leading-6 text-slate-600">Khai báo lớp, môn học và giáo viên; sau đó thêm phân công ở biểu mẫu bên trái hoặc nhập từ tệp Excel.</p><div className="flex flex-wrap items-center justify-center gap-3"><button type="button" onClick={() => navigatePage('teachers')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Khai báo giáo viên</button><button type="button" onClick={() => excelInputRef.current?.click()} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Nhập phân công Excel</button></div></div>}{scenario.assignments.map(item => <div key={item.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><div className="font-bold text-slate-800">{assignmentClassIds(item).map(id => lookup.classes.get(id)?.name).join(' + ')} · {lookup.subjects.get(item.subjectId)?.name}</div><div className="mt-1 text-xs leading-5 text-slate-500">{lookup.teachers.get((scenario.education?.activeWeek === 12 ? scenario.week12TeacherRemaps?.[item.teacherId] : undefined) || item.teacherId)?.name}{scenario.education?.activeWeek === 12 && scenario.week12TeacherRemaps?.[item.teacherId] ? ' · thay GV tuần 12' : ''} · {item.roomId ? lookup.rooms.get(item.roomId)?.name : 'Phòng thường'} · {item.periodsPerWeek} tiết/tuần · block {item.blockSize || 1}{item.session && item.session !== 'any' ? ` · ${SESSION_LABELS[item.session]}` : ''}{item.fixedStartSlots?.length ? ` · cố định ${item.fixedStartSlots.map(slot => { const parsed = parseTimetableSlot(slot); return parsed ? `${TIMETABLE_DAYS[parsed.dayIndex]} tiết ${parsed.period}` : slot; }).join(', ')}` : ''}</div></div><button type="button" onClick={() => { changeScenario({ ...scenario, assignments: scenario.assignments.filter(value => value.id !== item.id), lessonGroups: scenario.lessonGroups?.map(g => ({ ...g, assignmentIds: g.assignmentIds.filter(id => id !== item.id) })).filter(g => g.assignmentIds.length >= 2) }); }} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>)}</div></section>
          </div>
        )}

        {activeTab === 'constraints' && <TimetableAvailabilityPanel key={constraintKind} scenario={scenario} kind={constraintKind} onKind={setConstraintKind} onChange={changeScenario} />}

        {activeTab === 'diagnostics' && <div className="flex justify-end"><button type="button" className="tt-button" onClick={downloadDiagnostics}><Download size={15}/>Tải báo cáo kiểm tra Excel</button></div>}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="tt-panel flex flex-wrap items-center justify-between gap-3">
              <div><h3>Thời khóa biểu · {solution?.entries.length || 0}/{totalRequiredPeriods} tiết</h3><p>Chọn tiết rồi bấm ô trống để chuyển, ô có tiết để đổi chỗ; hỗ trợ kéo thả. Mọi thay đổi được kiểm tra độc lập.</p></div>
              <div className="flex flex-wrap gap-2">
                <select aria-label="Cấp học xem lịch" value={scheduleLevel} onChange={e => { setScheduleLevel(e.target.value); setSelectedEntryId(''); }} className="rounded-md border px-3 py-2 text-sm"><option value="all">Tất cả cấp / hệ</option>{educationLevels(scenario).map(l => <option key={l}>{l}</option>)}</select>
                <select aria-label="Chế độ xem thời khóa biểu" value={scheduleView} onChange={event => { setScheduleView(event.target.value as ScheduleView); setSelectedEntryId(''); }} className="rounded-md border border-slate-200 px-3 py-2 text-sm"><option value="class">Theo lớp</option><option value="teacher">Theo giáo viên</option><option value="room">Theo phòng</option></select>
                <select aria-label="Chọn đối tượng xem lịch" value={scheduleResourceId} onChange={event => { setScheduleResourceId(event.target.value); setSelectedEntryId(''); }} className="rounded-md border border-slate-200 px-3 py-2 text-sm">{scheduleResources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <button type="button" className="tt-button" onClick={() => { if (!solution) return; if (!audit.valid || !audit.complete) { setMessage('Chưa thể in: thời khóa biểu chưa qua kiểm tra độc lập.'); navigatePage('analysis'); return; } try { printTimetableView(scenario, solution, scheduleView, scheduleResourceId); } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể in thời khóa biểu.'); } }} disabled={!solution || !scheduleResourceId || !audit.valid || !audit.complete}><FileDown size={15} />In / PDF</button><button type="button" className="tt-button" disabled={!solution || !scheduleResources.length || !audit.valid || !audit.complete} onClick={() => { if (solution && audit.valid && audit.complete) { try { printTimetableView(scenario, solution, scheduleView, '*'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Không thể in.'); } } }}>In tất cả</button>
              </div>
            </div>
            {selectedEntryId && <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Đã chọn tiết. Bấm ô đích để chuyển cả block.<button type="button" className="tt-button" onClick={() => setSelectedEntryId('')}>Hủy chọn</button></div>}
            {!solution ? <div className="tt-panel py-12 text-center"><CalendarRange className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-4">Chưa có phương án</h3><p>Bấm <b>Xếp thủ công từ bảng trống</b> hoặc <b>Xếp tự động</b> để bắt đầu.</p><button type="button" onClick={beginManualTimetable} disabled={!weeklyScenario.assignments.length} className="tt-button primary mt-4"><Plus size={15}/>Xếp thủ công từ bảng trống</button></div> : <>
              <div role="status" className={`rounded-lg px-4 py-3 text-xs ${audit.valid && audit.complete ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{audit.valid && audit.complete
              ? 'Đã kiểm tra độc lập: đủ tiết, không trùng lớp, giáo viên hoặc phòng.'
              : draftAudit.valid
                ? `Đang xếp thủ công: ${solution.entries.length}/${totalRequiredPeriods} tiết. Bản nháp đã kiểm tra xung đột; chỉ được in, xuất và công bố khi xếp đủ tiết.`
                : `Bản nháp có ${draftAudit.errors.length} lỗi ràng buộc: ${draftAudit.errors.slice(0, 2).join(' ')}`}</div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[820px] border-collapse text-sm"><thead><tr className="bg-[#293c83] text-white"><th className="w-16 border-r border-white/15 p-3">Tiết</th>{days.map(day => <th key={day} className="border-r border-white/15 p-3">{day}</th>)}</tr></thead><tbody>
                {Array.from({ length: scenario.periodsPerDay }, (_, index) => index + 1).map(period => <React.Fragment key={period}><tr><th className="border-r border-t border-slate-200 bg-slate-50 p-3 text-slate-500">{period}<div className="mt-1 text-[9px] font-normal text-slate-400">{SESSION_LABELS[sessionForPeriod(scenario, period)]}</div></th>
                  {days.map((day, dayIndex) => {
                    const cellEntries = visibleEntries.filter(item => item.dayIndex === dayIndex && item.period === period);
                    return <td key={day} className="h-24 border-r border-t border-slate-200 p-1.5 align-top" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('text/timetable-entry'); if (id) moveEntry(id, dayIndex, period); }}>
                      {cellEntries.length ? cellEntries.map(entry => <div key={entry.id} draggable={!entry.fixed && !entry.locked} onDragStart={event => event.dataTransfer.setData('text/timetable-entry', entry.id)} className={`h-full rounded-md border p-2 ${entryTone(entry, scenario)} mb-1 ${selectedEntryId === entry.id ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="flex items-start justify-between gap-1"><button type="button" className="flex-1 text-left text-xs font-bold leading-5" aria-label={`Chọn ${lookup.subjects.get(entry.subjectId)?.name} ${day} tiết ${period}`} onClick={() => { if (selectedEntryId && selectedEntryId !== entry.id) moveEntry(selectedEntryId, dayIndex, period); else if (entry.fixed || entry.locked) setMessage('Tiết cố định hoặc đang khóa. Mở khóa trước khi chuyển.'); else setSelectedEntryId(selectedEntryId === entry.id ? '' : entry.id); }}>{lookup.subjects.get(entry.subjectId)?.name}</button><button type="button" onClick={() => toggleEntryLock(entry)} disabled={entry.fixed} className="rounded p-1 text-slate-500 hover:bg-white" aria-label={entry.fixed ? 'Tiết cố định' : entry.locked ? 'Bỏ khóa block' : 'Khóa block'}>{entry.locked || entry.fixed ? <Lock size={12} /> : <Unlock size={12} />}</button><button type="button" onClick={() => removeManualLesson(entry)} disabled={entry.fixed || entry.locked} className="rounded p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-30" title="Xóa tiết để xếp lại" aria-label="Xóa tiết học"><Trash2 size={12} /></button></div>
                        <div className="mt-1 text-[10px] leading-5 text-slate-600">{scheduleView !== 'class' && `${assignmentClassIds(entry).map(id => lookup.classes.get(id)?.name).join(' + ')} · `}{assignmentTeacherIds(entry).map(id => lookup.teachers.get(id)?.name).join(' + ')}</div>
                        {scenario.education && <div className="text-[10px] font-semibold text-blue-800">{entryClockLabel(scenario, entry)}</div>}{assignmentStudentGroupIds(entry).length > 0 && <div className="text-[10px] font-semibold text-indigo-700">{assignmentStudentGroupIds(entry).map(id => scenario.studentGroups?.find(g => g.id === id)?.name).join(' + ')}</div>}{entry.roomId && <div className="text-[10px] text-slate-500">{lookup.rooms.get(entry.roomId)?.name}</div>}{entry.fixed && <div className="text-[9px] font-bold text-amber-700">CỐ ĐỊNH</div>}
                      </div>) : <button type="button" className="flex min-h-20 w-full items-center justify-center rounded-md text-[10px] text-slate-300 hover:bg-blue-50 hover:text-blue-600" aria-label={`${day} tiết ${period} trống`} onClick={() => { if (selectedEntryId) moveEntry(selectedEntryId, dayIndex, period); else if (scheduleView === 'class') { setManualSlot({ dayIndex, period }); setManualError(''); setManualSubjectId(''); setManualTeacherId(''); setManualAssignmentId(''); } else setMessage('Hãy chuyển sang chế độ xem Theo lớp để xếp tiết thủ công vào ô trống.'); }}>{selectedEntryId ? 'Chuyển vào đây' : scheduleView === 'class' ? '+ Xếp tiết' : '—'}</button>}
                    </td>;
                  })}</tr>{period < scenario.periodsPerDay && sessionForPeriod(scenario, period) !== sessionForPeriod(scenario, period + 1) && <tr><td colSpan={days.length + 1} className="bg-amber-50 p-1 text-center text-[9px] font-semibold uppercase tracking-widest text-amber-700">Nghỉ giữa buổi</td></tr>}</React.Fragment>)}
              </tbody></table></div>
            </>}

            {manualSlot && solution && scheduleView === 'class' && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
                <section role="dialog" aria-modal="true" aria-label="Xếp tiết thủ công" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
                  <div><h3 className="text-lg font-extrabold text-slate-900">Xếp tiết thủ công</h3>
                    <p className="mt-1 text-sm text-slate-600">{lookup.classes.get(scheduleResourceId)?.name} · {days[manualSlot.dayIndex]} · Tiết {manualSlot.period} ({SESSION_LABELS[sessionForPeriod(scenario, manualSlot.period)]})</p></div>
                  {manualError && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{manualError}</div>}
                  {!manualCandidates.length ? <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Lớp này đã xếp hết số tiết được phân công, hoặc chưa có phân công. Hãy chọn lớp khác hoặc bổ sung phân công.</div> : <>
                    <label className="block text-sm font-semibold text-slate-700">Môn học
                      <select aria-label="Chọn môn học để xếp thủ công" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={selectedManualSubjectId}
                        onChange={event => { setManualSubjectId(event.target.value); setManualTeacherId(''); setManualAssignmentId(''); setManualError(''); }}>
                        {[...new Set(manualCandidates.map(item => item.subjectId))].map(id => <option key={id} value={id}>{lookup.subjects.get(id)?.name || id}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Giáo viên
                      <select aria-label="Chọn giáo viên để xếp thủ công" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={selectedManualTeacherId}
                        onChange={event => { setManualTeacherId(event.target.value); setManualAssignmentId(''); setManualError(''); }}>
                        {[...new Set(subjectCandidates.map(item => item.teacherId))].map(id => <option key={id} value={id}>{lookup.teachers.get(id)?.name || id}</option>)}
                      </select>
                    </label>
                    {assignmentCandidates.length > 1 && <label className="block text-sm font-semibold text-slate-700">Phân công / phòng
                      <select aria-label="Chọn phân công cụ thể" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={selectedManualAssignment?.id || ''} onChange={event => { setManualAssignmentId(event.target.value); setManualError(''); }}>
                        {assignmentCandidates.map(item => <option key={item.id} value={item.id}>{item.roomId ? lookup.rooms.get(item.roomId)?.name : 'Phòng thường'} · {item.periodsPerWeek - (solution.entries.filter(e => e.assignmentId === item.id).length)} tiết còn lại · {item.id}</option>)}
                      </select>
                    </label>}
                    {selectedManualAssignment && <p className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900">{selectedManualAssignment.periodsPerWeek - solution.entries.filter(e => e.assignmentId === selectedManualAssignment.id).length} tiết chưa xếp · Đặt {Math.min(selectedManualAssignment.blockSize || 1, selectedManualAssignment.periodsPerWeek - solution.entries.filter(e => e.assignmentId === selectedManualAssignment.id).length)} tiết liên tục. Hệ thống từ chối ô vi phạm ràng buộc.</p>}
                  </>}
                  <div className="flex justify-end gap-2"><button type="button" className="tt-button" onClick={() => setManualSlot(null)}>Hủy</button><button type="button" className="tt-button green" disabled={!selectedManualAssignment} onClick={addManualLesson}><Plus size={15}/>Xếp vào ô này</button></div>
                </section>
              </div>
            )}
            {versions.length > 0 && <section className="tt-panel"><h3>Các phương án gần nhất</h3><div className="mt-3 flex gap-2 overflow-auto">{versions.map((version, index) => <button type="button" key={`${version.generatedAt}-${index}`} onClick={() => restoreVersion(version)} className="tt-button min-w-32 flex-col !items-start"><b>Phương án {index + 1}</b><span className="text-xs">{version.entries.length} tiết · {version.score} điểm phạt</span></button>)}</div></section>}
          </div>
        )}

        {activeTab === 'agent' && (
          <TimetableAgentPanel
            scenario={scenario}
            solution={solution}
            busy={busy}
            onApply={nextScenario => {
              changeScenario(nextScenario);
              setMessage('Đã áp dụng ràng buộc do AI Agent đề xuất. Chưa xếp lại thời khóa biểu.');
            }}
            onRunOptimizer={runOptimizer}
          />
        )}

        {activeTab === 'diagnostics' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="lg:col-span-2"><button type="button" className="tt-button green" disabled={!solution || !audit.valid || !audit.complete} onClick={() => navigatePage('public-links')}>Mở bước công bố / xuất trang tra cứu</button></div>
            <section className="tt-panel lg:col-span-2"><h3>Kiểm tra độc lập trước khi công bố</h3>{!solution ? <p>Chưa chạy xếp lịch. Có {totalRequiredPeriods} tiết cần xếp.</p> : <><div className={`my-3 rounded-md px-4 py-3 text-sm ${audit.valid && audit.complete ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{audit.valid && audit.complete ? 'Đủ tiết, không phát hiện xung đột qua kiểm tra độc lập.' : `Bản nháp: ${audit.placedPeriods}/${audit.expectedPeriods} tiết, ${audit.errors.length} vấn đề cần xử lý.`}</div>{audit.errors.map(item => <p key={item} className="!text-rose-700">• {item}</p>)}{audit.warnings.map(item => <p key={item}>• {item}</p>)}</>}<div className="mt-4 tt-table-wrap"><table className="tt-table"><thead><tr><th>Giáo viên</th><th>Phân công</th><th>Tiết/tuần</th><th>Đã xếp</th><th>Giới hạn/ngày</th></tr></thead><tbody>{scenario.teachers.map(teacher => <tr key={teacher.id}><td>{teacher.name}</td><td>{weeklyScenario.assignments.filter(item => assignmentTeacherIds(item).includes(teacher.id)).length}</td><td>{weeklyScenario.assignments.filter(item => assignmentTeacherIds(item).includes(teacher.id)).reduce((sum, item) => sum + item.periodsPerWeek, 0)}</td><td>{solution ? solution.entries.filter(item => assignmentTeacherIds(item).includes(teacher.id)).length : '—'}</td><td>{teacher.maxPeriodsPerDay || 'Chưa đặt'}</td></tr>)}</tbody></table></div></section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-500" /><h2 className="font-extrabold">Xung đột & cảnh báo</h2></div>{!solution ? <p className="mt-4 text-sm text-slate-500">Chưa có phương án. Kiểm tra khả thi hiện có {preflight.length} cảnh báo.</p> : <div className="mt-4 space-y-3"><div className={`rounded-2xl p-4 ${solution.diagnostics.hardConflicts.length ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}><b>{solution.diagnostics.hardConflicts.length ? `${solution.diagnostics.hardConflicts.length} xung đột cứng` : 'Không có xung đột cứng'}</b>{solution.diagnostics.hardConflicts.map(item => <p key={item} className="mt-1 text-sm">• {item}</p>)}</div>{solution.diagnostics.warnings.map(item => <div key={item} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{item}</div>)}</div>}</section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Chỉ số chất lượng</h2><div className="mt-4 grid grid-cols-2 gap-3">{[
              ['Khoảng trống GV', solution?.diagnostics.quality.teacherGaps ?? '—'],
              ['Khoảng trống lớp', solution?.diagnostics.quality.classGaps ?? '—'],
              ['Môn chính muộn', solution?.diagnostics.quality.lateCorePeriods ?? '—'],
              ['Lệch tải giữa ngày', solution?.diagnostics.quality.dailyImbalance ?? '—'],
            ].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><div className="text-2xl font-extrabold">{String(value)}</div><div className="mt-1 text-xs text-slate-500">{String(label)}</div></div>)}</div></section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Tiết chưa xếp được</h2>{!solution ? <p className="mt-4 text-sm text-slate-500">Chưa chạy xếp lịch. Chưa có kết quả để kết luận.</p> : solution.diagnostics.unscheduled.length === 0 ? <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800"><b>Đã xếp đủ các yêu cầu.</b><p className="mt-1">Có thể khóa các block tốt rồi tối ưu lại để giảm khoảng trống.</p></div> : <div className="mt-4 space-y-3">{solution.diagnostics.unscheduled.map(item => { const assignment = lookup.assignments.get(item.assignmentId); return <div key={item.assignmentId} className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="font-bold text-amber-900">{lookup.classes.get(assignment?.classId || '')?.name} · {lookup.subjects.get(assignment?.subjectId || '')?.name}: còn {item.remaining} tiết</div><p className="mt-1 text-sm leading-6 text-amber-800">{item.reason}</p></div>; })}</div>}</section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Khả thi của dữ liệu đầu vào</h2>{preflight.length === 0 ? <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">Không phát hiện bất khả thi rõ ràng trước khi xếp.</div> : <div className="mt-4 space-y-2">{preflight.map(item => <div key={item} className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">• {item}</div>)}</div>}</section>
          </div>
        )}
        </React.Suspense>
      </fieldset>
    </TimetableAdminShell>
  );
}
