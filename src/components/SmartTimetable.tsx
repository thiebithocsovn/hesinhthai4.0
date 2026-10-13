import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  Database,
  Download,
  DoorOpen,
  FileDown,
  FileUp,
  GraduationCap,
  Lock,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  Users,
  WandSparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  TIMETABLE_DAYS,
  activeTimetableDays,
  analyzeTimetableScenario,
  createDefaultTimetableScenario,
  normalizeTimetableScenario,
  optimizeTimetable,
  parseTimetableSlot,
  timetableSlotKey,
  type ScheduleEntry,
  type SchoolLevel,
  type TeachingAssignment,
  type TimetableScenario,
  type TimetableSolution,
} from '../lib/smartTimetable';
import {
  TIMETABLE_IMPORT_COLUMNS,
  scenarioFromAssignmentRows,
  timetableEntityId,
  type TimetableImportRow,
} from '../lib/smartTimetableImport';

interface SmartTimetableProps {
  onBack: () => void;
  storageKey: string;
  trialMode?: boolean;
}

type WorkspaceTab = 'overview' | 'catalog' | 'assignments' | 'constraints' | 'schedule' | 'diagnostics';
type CatalogKind = 'teacher' | 'class' | 'subject' | 'room';
type ConstraintKind = 'teacher' | 'class' | 'room';
type ScheduleView = 'class' | 'teacher' | 'room';

interface PersistedWorkspace {
  scenario: TimetableScenario;
  solution: TimetableSolution | null;
  versions: TimetableSolution[];
}

interface TimetableWorkerResponse {
  ok: boolean;
  solution?: TimetableSolution;
  error?: string;
}

function normalizeSolution(solution: TimetableSolution | null | undefined): TimetableSolution | null {
  if (!solution?.entries || !solution.diagnostics) return null;
  const teacherGaps = Number(solution.diagnostics.teacherGaps || 0);
  return {
    ...solution,
    diagnostics: {
      ...solution.diagnostics,
      hardConflicts: solution.diagnostics.hardConflicts || [],
      warnings: solution.diagnostics.warnings || [],
      unscheduled: solution.diagnostics.unscheduled || [],
      teacherGaps,
      preflight: solution.diagnostics.preflight || [],
      quality: solution.diagnostics.quality || {
        teacherGaps,
        classGaps: 0,
        lateCorePeriods: 0,
        dailyImbalance: 0,
      },
    },
  };
}

function readWorkspace(storageKey: string): PersistedWorkspace {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null') as PersistedWorkspace | null;
    if (parsed?.scenario?.teachers && parsed?.scenario?.classes && parsed?.scenario?.assignments) {
      return {
        scenario: normalizeTimetableScenario(parsed.scenario),
        solution: normalizeSolution(parsed.solution),
        versions: Array.isArray(parsed.versions) ? parsed.versions.map(normalizeSolution).filter(Boolean).slice(0, 8) as TimetableSolution[] : [],
      };
    }
  } catch {
    // Fall through to sample data.
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

function safeSheetName(name: string, suffix = ''): string {
  return `${name}${suffix}`.replace(/[\\/?*\[\]:]/g, '-').slice(0, 31);
}

export default function SmartTimetable({ onBack, storageKey, trialMode = false }: SmartTimetableProps) {
  const initial = useMemo(() => readWorkspace(storageKey), [storageKey]);
  const [scenario, setScenario] = useState<TimetableScenario>(initial.scenario);
  const [solution, setSolution] = useState<TimetableSolution | null>(initial.solution);
  const [versions, setVersions] = useState<TimetableSolution[]>(initial.versions);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [catalogKind, setCatalogKind] = useState<CatalogKind>('teacher');
  const [catalogName, setCatalogName] = useState('');
  const [catalogLevel, setCatalogLevel] = useState<SchoolLevel>('THCS');

  const [draft, setDraft] = useState<Partial<TeachingAssignment>>({
    classId: initial.scenario.classes[0]?.id,
    subjectId: initial.scenario.subjects[0]?.id,
    teacherId: initial.scenario.teachers[0]?.id,
    periodsPerWeek: 2,
    maxPerDay: 1,
    blockSize: 1,
    session: 'any',
  });
  const [fixedDay, setFixedDay] = useState(-1);
  const [fixedPeriod, setFixedPeriod] = useState(1);

  const [constraintKind, setConstraintKind] = useState<ConstraintKind>('teacher');
  const [constraintId, setConstraintId] = useState(initial.scenario.teachers[0]?.id || '');
  const [constraintDay, setConstraintDay] = useState(0);
  const [constraintPeriod, setConstraintPeriod] = useState(1);

  const [scheduleView, setScheduleView] = useState<ScheduleView>('class');
  const [scheduleResourceId, setScheduleResourceId] = useState(initial.scenario.classes[0]?.id || '');

  const excelInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ scenario, solution, versions } satisfies PersistedWorkspace));
    } catch {
      // Workspace stays usable without browser storage.
    }
  }, [scenario, solution, storageKey, versions]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const days = activeTimetableDays(scenario);
  const totalRequiredPeriods = useMemo(() => scenario.assignments.reduce((sum, item) => sum + item.periodsPerWeek, 0), [scenario.assignments]);
  const scheduledPeriods = solution?.entries.length || 0;
  const unscheduledPeriods = solution?.diagnostics.unscheduled.reduce((sum, item) => sum + item.remaining, 0) || 0;
  const lockedEntries = solution?.entries.filter(item => item.locked && !item.fixed) || [];
  const preflight = useMemo(() => analyzeTimetableScenario(scenario), [scenario]);

  const lookup = useMemo(() => ({
    teachers: new Map(scenario.teachers.map(item => [item.id, item])),
    classes: new Map(scenario.classes.map(item => [item.id, item])),
    subjects: new Map(scenario.subjects.map(item => [item.id, item])),
    rooms: new Map(scenario.rooms.map(item => [item.id, item])),
    assignments: new Map(scenario.assignments.map(item => [item.id, item])),
  }), [scenario]);

  const scheduleResources = scheduleView === 'class' ? scenario.classes : scheduleView === 'teacher' ? scenario.teachers : scenario.rooms;

  useEffect(() => {
    const resources = scheduleView === 'class' ? scenario.classes : scheduleView === 'teacher' ? scenario.teachers : scenario.rooms;
    if (!resources.some(item => item.id === scheduleResourceId)) setScheduleResourceId(resources[0]?.id || '');
  }, [scenario.classes, scenario.rooms, scenario.teachers, scheduleResourceId, scheduleView]);

  useEffect(() => {
    const resources = constraintKind === 'teacher' ? scenario.teachers : constraintKind === 'class' ? scenario.classes : scenario.rooms;
    if (!resources.some(item => item.id === constraintId)) setConstraintId(resources[0]?.id || '');
  }, [constraintId, constraintKind, scenario.classes, scenario.rooms, scenario.teachers]);

  const resetSolution = () => {
    setSolution(null);
    setMessage('Dữ liệu đã thay đổi. Hãy xếp lại để cập nhật phương án.');
  };

  const acceptSolution = (next: TimetableSolution) => {
    setSolution(next);
    setVersions(previous => [next, ...previous].slice(0, 8));
    setBusy(false);
    setActiveTab(next.diagnostics.hardConflicts.length || next.diagnostics.unscheduled.length ? 'diagnostics' : 'schedule');
  };

  const runOptimizer = () => {
    setBusy(true);
    setMessage('');
    workerRef.current?.terminate();
    workerRef.current = null;
    const iterations = trialMode ? 80 : 320;

    if (typeof Worker === 'undefined') {
      window.setTimeout(() => acceptSolution(optimizeTimetable(scenario, lockedEntries, trialMode ? 60 : 140)), 20);
      return;
    }

    try {
      const worker = new Worker(new URL('../workers/timetable.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      let settled = false;
      const fallback = (reason: string) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        workerRef.current = null;
        setMessage(`${reason} Hệ thống đã chuyển sang bộ tối ưu dự phòng.`);
        window.setTimeout(() => acceptSolution(optimizeTimetable(scenario, lockedEntries, trialMode ? 60 : 140)), 20);
      };

      worker.onmessage = (event: MessageEvent<TimetableWorkerResponse>) => {
        if (settled) return;
        if (!event.data.ok || !event.data.solution) {
          fallback(event.data.error || 'Web Worker không trả về phương án hợp lệ.');
          return;
        }
        settled = true;
        worker.terminate();
        workerRef.current = null;
        acceptSolution(event.data.solution);
      };
      worker.onerror = () => fallback('Không thể chạy bộ tối ưu nền trên thiết bị này.');
      worker.postMessage({ scenario, lockedEntries, iterations });
    } catch {
      window.setTimeout(() => acceptSolution(optimizeTimetable(scenario, lockedEntries, trialMode ? 60 : 140)), 20);
    }
  };

  const toggleEntryLock = (entry: ScheduleEntry) => {
    if (entry.fixed) return;
    const nextLocked = !entry.locked;
    setSolution(previous => previous ? {
      ...previous,
      entries: previous.entries.map(item => (entry.blockId && item.blockId === entry.blockId) || (!entry.blockId && item.id === entry.id)
        ? { ...item, locked: nextLocked }
        : item),
    } : previous);
  };

  const addCatalogItem = () => {
    const name = catalogName.trim();
    if (!name) return;
    setScenario(previous => {
      if (catalogKind === 'teacher') {
        if (previous.teachers.some(item => item.name.toLowerCase() === name.toLowerCase())) return previous;
        return { ...previous, teachers: [...previous.teachers, { id: timetableEntityId('gv', name), name, level: catalogLevel, maxPeriodsPerDay: 6, maxConsecutivePeriods: 4 }] };
      }
      if (catalogKind === 'class') {
        if (previous.classes.some(item => item.name.toLowerCase() === name.toLowerCase())) return previous;
        return { ...previous, classes: [...previous.classes, { id: timetableEntityId('lop', name), name, level: catalogLevel === 'Tiểu học' ? 'Tiểu học' : 'THCS', maxPeriodsPerDay: previous.periodsPerDay }] };
      }
      if (catalogKind === 'subject') {
        if (previous.subjects.some(item => item.name.toLowerCase() === name.toLowerCase())) return previous;
        return { ...previous, subjects: [...previous.subjects, { id: timetableEntityId('mon', name), name }] };
      }
      if (previous.rooms.some(item => item.name.toLowerCase() === name.toLowerCase())) return previous;
      return { ...previous, rooms: [...previous.rooms, { id: timetableEntityId('phong', name), name }] };
    });
    setCatalogName('');
    resetSolution();
  };

  const removeCatalogItem = (kind: CatalogKind, id: string) => {
    setScenario(previous => {
      const assignments = previous.assignments.filter(item =>
        kind === 'teacher' ? item.teacherId !== id :
          kind === 'class' ? item.classId !== id :
            kind === 'subject' ? item.subjectId !== id : item.roomId !== id,
      );
      if (kind === 'teacher') return { ...previous, teachers: previous.teachers.filter(item => item.id !== id), assignments };
      if (kind === 'class') return { ...previous, classes: previous.classes.filter(item => item.id !== id), assignments };
      if (kind === 'subject') return { ...previous, subjects: previous.subjects.filter(item => item.id !== id), assignments };
      return { ...previous, rooms: previous.rooms.filter(item => item.id !== id), assignments };
    });
    resetSolution();
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
    setScenario(previous => ({ ...previous, assignments: [...previous.assignments, item] }));
    resetSolution();
  };

  const resourceSlots = (kind: ConstraintKind, id: string): string[] => {
    const collection = kind === 'teacher' ? scenario.teachers : kind === 'class' ? scenario.classes : scenario.rooms;
    return collection.find(item => item.id === id)?.unavailableSlots || [];
  };

  const updateResourceSlots = (kind: ConstraintKind, id: string, slots: string[]) => {
    setScenario(previous => {
      if (kind === 'teacher') return { ...previous, teachers: previous.teachers.map(item => item.id === id ? { ...item, unavailableSlots: slots } : item) };
      if (kind === 'class') return { ...previous, classes: previous.classes.map(item => item.id === id ? { ...item, unavailableSlots: slots } : item) };
      return { ...previous, rooms: previous.rooms.map(item => item.id === id ? { ...item, unavailableSlots: slots } : item) };
    });
    resetSolution();
  };

  const addUnavailableSlot = () => {
    if (!constraintId) return;
    const slot = timetableSlotKey(constraintDay, constraintPeriod);
    updateResourceSlots(constraintKind, constraintId, [...new Set([...resourceSlots(constraintKind, constraintId), slot])]);
  };

  const resetWorkspace = () => {
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
    setConstraintId(next.teachers[0]?.id || '');
    setMessage('Đã khôi phục dữ liệu mẫu liên cấp.');
    setActiveTab('overview');
  };

  const importExcel = async (file: File) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer());
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<TimetableImportRow>(firstSheet, { defval: '' });
      const next = scenarioFromAssignmentRows(rows, {
        ...scenario,
        teachers: [], classes: [], subjects: [], rooms: [], assignments: [],
      });
      if (!next.assignments.length) throw new Error('Không tìm thấy các cột Lớp, Môn và Giáo viên trong sheet đầu tiên.');
      setScenario(next);
      setSolution(null);
      setVersions([]);
      setScheduleResourceId(next.classes[0]?.id || '');
      setConstraintId(next.teachers[0]?.id || '');
      setMessage(`Đã nhập ${next.assignments.length} phân công, ${next.teachers.length} giáo viên và ${next.classes.length} lớp từ Excel.`);
      setActiveTab('overview');
    } catch (error) {
      setMessage(error instanceof Error ? `Không thể nhập Excel: ${error.message}` : 'Không thể nhập Excel.');
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const downloadExcelTemplate = () => {
    const sample = [
      Object.fromEntries(TIMETABLE_IMPORT_COLUMNS.map(column => [column, ''])),
      {
        'Cấp': 'Tiểu học', 'Lớp': '5A', 'Môn': 'Tin học', 'Giáo viên': 'Nguyễn Văn A', 'Cấp GV': 'Liên cấp', 'GVCN': '',
        'Phòng': 'Phòng Tin học', 'Tiết/tuần': 2, 'Tối đa/ngày': 2, 'Tiết đôi': 'Có', 'Buổi': 'Bất kỳ',
        'Ưu tiên sáng': '', 'Tránh tiết cuối': 'Có', 'Tiết cố định': '', 'Tiết cấm': '', 'Tiết ưu tiên': 'T3-2;T5-2',
      },
      {
        'Cấp': 'THCS', 'Lớp': '6A', 'Môn': 'Sinh hoạt lớp', 'Giáo viên': 'Trần Thị B', 'Cấp GV': 'THCS', 'GVCN': 'Có',
        'Phòng': '', 'Tiết/tuần': 1, 'Tối đa/ngày': 1, 'Tiết đôi': '', 'Buổi': 'Sáng',
        'Ưu tiên sáng': '', 'Tránh tiết cuối': '', 'Tiết cố định': 'T6-5', 'Tiết cấm': '', 'Tiết ưu tiên': '',
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(sample, { header: [...TIMETABLE_IMPORT_COLUMNS] });
    sheet['!cols'] = TIMETABLE_IMPORT_COLUMNS.map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Phan cong');
    XLSX.writeFile(workbook, 'Mau-nhap-phan-cong-TKB.xlsx');
  };

  const exportBackup = () => downloadBlob(
    `Sao-luu-TKB-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ version: 2, scenario, solution, versions }, null, 2),
    'application/json;charset=utf-8',
  );

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<PersistedWorkspace> & { scenario?: TimetableScenario };
      if (!parsed.scenario?.teachers || !parsed.scenario.classes || !parsed.scenario.assignments) throw new Error('Tệp sao lưu không đúng cấu trúc.');
      const nextScenario = normalizeTimetableScenario(parsed.scenario);
      setScenario(nextScenario);
      setSolution(normalizeSolution(parsed.solution));
      setVersions(Array.isArray(parsed.versions) ? parsed.versions.map(normalizeSolution).filter(Boolean).slice(0, 8) as TimetableSolution[] : []);
      setMessage('Đã khôi phục dữ liệu từ tệp sao lưu.');
    } catch (error) {
      setMessage(error instanceof Error ? `Không thể khôi phục: ${error.message}` : 'Không thể khôi phục dữ liệu.');
    } finally {
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

  const exportExcel = () => {
    if (!solution) return;
    const workbook = XLSX.utils.book_new();
    const summaryRows: (string | number)[][] = [
      ['TRƯỜNG', scenario.name],
      ['Số ngày học/tuần', days.length],
      ['Số tiết/ngày', scenario.periodsPerDay],
      ['Tổng tiết yêu cầu', totalRequiredPeriods],
      ['Đã xếp', solution.entries.length],
      ['Chưa xếp', unscheduledPeriods],
      ['Điểm phạt', solution.score],
      [],
      ['Lớp', 'Cấp', 'Số tiết'],
      ...scenario.classes.map(classroom => [classroom.name, classroom.level, solution.entries.filter(item => item.classId === classroom.id).length]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Tong hop');

    const appendScheduleSheet = (name: string, predicate: (entry: ScheduleEntry) => boolean, mode: ScheduleView) => {
      const rows: (string | number)[][] = [['Tiết', ...days]];
      for (let period = 1; period <= scenario.periodsPerDay; period += 1) {
        const row: (string | number)[] = [period];
        for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
          const entry = solution.entries.find(item => predicate(item) && item.dayIndex === dayIndex && item.period === period);
          if (!entry) { row.push(''); continue; }
          const subject = lookup.subjects.get(entry.subjectId)?.name || entry.subjectId;
          const teacher = lookup.teachers.get(entry.teacherId)?.name || entry.teacherId;
          const classroom = lookup.classes.get(entry.classId)?.name || entry.classId;
          const room = entry.roomId ? lookup.rooms.get(entry.roomId)?.name || entry.roomId : '';
          row.push(mode === 'class' ? [subject, teacher, room].filter(Boolean).join(' - ') : mode === 'teacher' ? [classroom, subject, room].filter(Boolean).join(' - ') : [classroom, subject, teacher].filter(Boolean).join(' - '));
        }
        rows.push(row);
      }
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [{ wch: 8 }, ...days.map(() => ({ wch: 28 }))];
      XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(name));
    };

    scenario.classes.forEach(item => appendScheduleSheet(`Lop ${item.name}`, entry => entry.classId === item.id, 'class'));
    scenario.teachers.forEach(item => appendScheduleSheet(`GV ${item.name}`, entry => entry.teacherId === item.id, 'teacher'));
    XLSX.writeFile(workbook, `Thoi-khoa-bieu-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const visibleEntries = solution?.entries.filter(entry =>
    scheduleView === 'class' ? entry.classId === scheduleResourceId : scheduleView === 'teacher' ? entry.teacherId === scheduleResourceId : entry.roomId === scheduleResourceId,
  ) || [];

  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'catalog', label: 'Danh mục' },
    { id: 'assignments', label: 'Phân công' },
    { id: 'constraints', label: 'Ràng buộc' },
    { id: 'schedule', label: 'Thời khóa biểu' },
    { id: 'diagnostics', label: 'Chẩn đoán' },
  ];

  const catalogGroups: { kind: CatalogKind; title: string; icon: typeof Users; items: { id: string; name: string; meta?: string }[] }[] = [
    { kind: 'teacher', title: 'Giáo viên', icon: Users, items: scenario.teachers.map(item => ({ id: item.id, name: item.name, meta: item.level })) },
    { kind: 'class', title: 'Lớp học', icon: GraduationCap, items: scenario.classes.map(item => ({ id: item.id, name: item.name, meta: item.level })) },
    { kind: 'subject', title: 'Môn học', icon: BookOpen, items: scenario.subjects.map(item => ({ id: item.id, name: item.name })) },
    { kind: 'room', title: 'Phòng học', icon: DoorOpen, items: scenario.rooms.map(item => ({ id: item.id, name: item.name })) },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={event => event.target.files?.[0] && void importExcel(event.target.files[0])} />
      <input ref={jsonInputRef} type="file" accept="application/json,.json" className="hidden" onChange={event => event.target.files?.[0] && void importBackup(event.target.files[0])} />

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onBack} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Quay lại"><ArrowLeft className="h-5 w-5" /></button>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><CalendarRange className="h-6 w-6" /></div>
            <div className="min-w-0"><h1 className="truncate text-lg font-extrabold md:text-xl">Xếp thời khóa biểu thông minh</h1><p className="truncate text-xs text-slate-500">Liên cấp Tiểu học + THCS · Constraint optimizer v2</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportExcel} disabled={!solution} className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40 md:flex"><Download className="h-4 w-4" />Xuất Excel</button>
            <button type="button" onClick={runOptimizer} disabled={busy || scenario.assignments.length === 0} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-50"><WandSparkles className="h-4 w-4" />{busy ? 'Đang tối ưu...' : 'Xếp tự động'}</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-7">
        {message && <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{message}</div>}
        <div className="mb-5 overflow-x-auto"><div className="flex min-w-max gap-2 rounded-2xl border border-slate-200 bg-white p-2">{tabs.map(tab => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{tab.label}</button>)}</div></div>

        {activeTab === 'overview' && (
          <div className="space-y-5">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Lớp học', scenario.classes.length, GraduationCap],
                ['Giáo viên', scenario.teachers.length, Users],
                ['Tiết yêu cầu', totalRequiredPeriods, CalendarRange],
                ['Đã xếp', scheduledPeriods, CheckCircle2],
                ['Chưa xếp', unscheduledPeriods, AlertTriangle],
              ].map(([label, value, Icon]) => { const CardIcon = Icon as typeof GraduationCap; return <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><CardIcon className="h-5 w-5" /></div><div className="text-3xl font-extrabold">{String(value)}</div><div className="mt-1 text-sm text-slate-500">{String(label)}</div></div>; })}
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Cấu hình nhà trường</p><h2 className="mt-1 text-2xl font-extrabold">{scenario.name}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Dùng chung tài nguyên giáo viên và phòng học giữa Tiểu học – THCS; hỗ trợ 2 buổi, 5/6 ngày, tiết đôi và tiết cố định.</p></div><Sparkles className="h-7 w-7 text-amber-500" /></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-bold text-slate-600 sm:col-span-2">Tên trường<input value={scenario.name} onChange={event => { setScenario(previous => ({ ...previous, name: event.target.value })); resetSolution(); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs font-bold text-slate-600">Ngày/tuần<select value={scenario.daysPerWeek || 5} onChange={event => { setScenario(previous => ({ ...previous, daysPerWeek: Number(event.target.value) === 6 ? 6 : 5 })); resetSolution(); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value={5}>5 ngày</option><option value={6}>6 ngày</option></select></label>
                  <label className="text-xs font-bold text-slate-600">Tiết/ngày<input type="number" min={4} max={12} value={scenario.periodsPerDay} onChange={event => { const periodsPerDay = Math.max(4, Math.min(12, Number(event.target.value))); setScenario(previous => ({ ...previous, periodsPerDay, morningPeriods: Math.min(previous.morningPeriods || 5, periodsPerDay) })); resetSolution(); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs font-bold text-slate-600">Tiết buổi sáng<input type="number" min={1} max={scenario.periodsPerDay} value={scenario.morningPeriods || 5} onChange={event => { setScenario(previous => ({ ...previous, morningPeriods: Math.max(1, Math.min(previous.periodsPerDay, Number(event.target.value))) })); resetSolution(); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white md:p-7"><h3 className="text-lg font-bold">Chất lượng phương án</h3><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-400">Tiết khóa thủ công</span><b>{lockedEntries.length}</b></div><div className="flex justify-between"><span className="text-slate-400">Xung đột cứng</span><b className={solution?.diagnostics.hardConflicts.length ? 'text-rose-300' : 'text-emerald-300'}>{solution?.diagnostics.hardConflicts.length ?? '—'}</b></div><div className="flex justify-between"><span className="text-slate-400">Khoảng trống GV</span><b>{solution?.diagnostics.quality.teacherGaps ?? '—'}</b></div><div className="flex justify-between"><span className="text-slate-400">Môn chính sau buổi sáng</span><b>{solution?.diagnostics.quality.lateCorePeriods ?? '—'}</b></div><div className="flex justify-between"><span className="text-slate-400">Điểm phạt</span><b>{solution?.score ?? '—'}</b></div></div><button type="button" onClick={runOptimizer} className="mt-6 w-full rounded-xl bg-white px-4 py-3 font-bold text-slate-900 hover:bg-indigo-50">Tạo phương án tối ưu</button></div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="font-extrabold">Nhập dữ liệu & sao lưu</h3><p className="mt-1 text-sm text-slate-500">Có thể bắt đầu bằng Excel phân công chuyên môn thay vì nhập từng dòng.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={downloadExcelTemplate} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><FileDown className="h-4 w-4" />Tải file mẫu</button><button type="button" onClick={() => excelInputRef.current?.click()} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Upload className="h-4 w-4" />Nhập Excel</button><button type="button" onClick={exportBackup} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><Database className="h-4 w-4" />Sao lưu JSON</button><button type="button" onClick={() => jsonInputRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><FileUp className="h-4 w-4" />Khôi phục</button></div></div></section>

            {preflight.length > 0 && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 text-amber-900"><AlertTriangle className="h-5 w-5" /><h3 className="font-extrabold">Kiểm tra dữ liệu trước khi xếp</h3></div><div className="mt-3 space-y-1 text-sm text-amber-800">{preflight.slice(0, 8).map(item => <p key={item}>• {item}</p>)}</div></section>}
            <button type="button" onClick={resetWorkspace} className="flex w-fit items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"><RefreshCcw className="h-4 w-4" />Khôi phục dữ liệu mẫu</button>
          </div>
        )}

        {activeTab === 'catalog' && (
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="grid gap-3 md:grid-cols-[180px_1fr_180px_auto]"><select value={catalogKind} onChange={event => setCatalogKind(event.target.value as CatalogKind)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="teacher">Giáo viên</option><option value="class">Lớp học</option><option value="subject">Môn học</option><option value="room">Phòng học</option></select><input value={catalogName} onChange={event => setCatalogName(event.target.value)} placeholder="Nhập tên mới..." className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />{catalogKind === 'teacher' || catalogKind === 'class' ? <select value={catalogLevel} onChange={event => setCatalogLevel(event.target.value as SchoolLevel)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="Tiểu học">Tiểu học</option><option value="THCS">THCS</option>{catalogKind === 'teacher' && <option value="Liên cấp">Liên cấp</option>}</select> : <div className="hidden md:block" />}<button type="button" onClick={addCatalogItem} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Thêm</button></div></section>
            <div className="grid gap-5 md:grid-cols-2">{catalogGroups.map(group => { const Icon = group.icon; return <section key={group.kind} className="rounded-3xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2"><Icon className="h-5 w-5 text-indigo-600" /><h2 className="font-extrabold">{group.title}</h2><span className="ml-auto rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">{group.items.length}</span></div><div className="space-y-2">{group.items.length === 0 ? <p className="text-sm text-slate-400">Chưa có dữ liệu.</p> : group.items.map(item => <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3"><div className="min-w-0 flex-1"><div className="truncate font-semibold">{item.name}</div>{item.meta && <div className="text-xs text-slate-500">{item.meta}</div>}</div><button type="button" onClick={() => removeCatalogItem(group.kind, item.id)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-100"><Trash2 className="h-4 w-4" /></button></div>)}</div></section>; })}</div>
          </div>
        )}

        {activeTab === 'assignments' && (
          <div className="grid gap-5 lg:grid-cols-[390px_1fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-extrabold">Thêm phân công</h2><p className="mt-1 text-sm text-slate-500">Hỗ trợ tiết đôi, buổi học và một ô cố định.</p><div className="mt-5 space-y-3"><select value={draft.classId || ''} onChange={event => setDraft(previous => ({ ...previous, classId: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{scenario.classes.map(item => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select><select value={draft.subjectId || ''} onChange={event => setDraft(previous => ({ ...previous, subjectId: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{scenario.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={draft.teacherId || ''} onChange={event => setDraft(previous => ({ ...previous, teacherId: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{scenario.teachers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select><select value={draft.roomId || ''} onChange={event => setDraft(previous => ({ ...previous, roomId: event.target.value || undefined }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Phòng thường / không khóa phòng</option>{scenario.rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="grid grid-cols-3 gap-2"><label className="text-[11px] font-bold text-slate-600">Tiết/tuần<input type="number" min={1} max={30} value={draft.periodsPerWeek || 1} onChange={event => setDraft(previous => ({ ...previous, periodsPerWeek: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-sm" /></label><label className="text-[11px] font-bold text-slate-600">Tối đa/ngày<input type="number" min={1} max={8} value={draft.maxPerDay || 1} onChange={event => setDraft(previous => ({ ...previous, maxPerDay: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-sm" /></label><label className="text-[11px] font-bold text-slate-600">Block<select value={draft.blockSize || 1} onChange={event => setDraft(previous => ({ ...previous, blockSize: Number(event.target.value) as 1 | 2 | 3 }))} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-sm"><option value={1}>1 tiết</option><option value={2}>2 tiết liền</option><option value={3}>3 tiết liền</option></select></label></div><select value={draft.session || 'any'} onChange={event => setDraft(previous => ({ ...previous, session: event.target.value as TeachingAssignment['session'] }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="any">Bất kỳ buổi nào</option><option value="morning">Chỉ buổi sáng</option><option value="afternoon">Chỉ buổi chiều</option></select><div className="rounded-2xl bg-slate-50 p-3"><div className="mb-2 text-xs font-bold text-slate-600">Ô cố định (không bắt buộc)</div><div className="grid grid-cols-2 gap-2"><select value={fixedDay} onChange={event => setFixedDay(Number(event.target.value))} className="rounded-xl border border-slate-200 px-2 py-2 text-sm"><option value={-1}>Không cố định</option>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><select value={fixedPeriod} onChange={event => setFixedPeriod(Number(event.target.value))} disabled={fixedDay < 0} className="rounded-xl border border-slate-200 px-2 py-2 text-sm disabled:opacity-50">{Array.from({ length: scenario.periodsPerDay }, (_, index) => index + 1).map(period => <option key={period} value={period}>Tiết {period}</option>)}</select></div></div><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={Boolean(draft.avoidLastPeriod)} onChange={event => setDraft(previous => ({ ...previous, avoidLastPeriod: event.target.checked }))} />Hạn chế tiết cuối buổi/ngày</label><button type="button" onClick={addAssignment} disabled={!scenario.classes.length || !scenario.subjects.length || !scenario.teachers.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Thêm phân công</button></div></section>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-extrabold">Danh sách phân công</h2><p className="text-sm text-slate-500">{scenario.assignments.length} yêu cầu · {totalRequiredPeriods} tiết/tuần</p></div><div className="max-h-[680px] divide-y divide-slate-100 overflow-auto">{scenario.assignments.map(item => <div key={item.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><div className="font-bold text-slate-800">{lookup.classes.get(item.classId)?.name} · {lookup.subjects.get(item.subjectId)?.name}</div><div className="mt-1 text-xs leading-5 text-slate-500">{lookup.teachers.get(item.teacherId)?.name} · {item.roomId ? lookup.rooms.get(item.roomId)?.name : 'Phòng thường'} · {item.periodsPerWeek} tiết/tuần · block {item.blockSize || 1}{item.session && item.session !== 'any' ? ` · ${item.session === 'morning' ? 'sáng' : 'chiều'}` : ''}{item.fixedStartSlots?.length ? ` · cố định ${item.fixedStartSlots.map(slot => { const parsed = parseTimetableSlot(slot); return parsed ? `${TIMETABLE_DAYS[parsed.dayIndex]} tiết ${parsed.period}` : slot; }).join(', ')}` : ''}</div></div><button type="button" onClick={() => { setScenario(previous => ({ ...previous, assignments: previous.assignments.filter(value => value.id !== item.id) })); resetSolution(); }} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>)}</div></section>
          </div>
        )}

        {activeTab === 'constraints' && (
          <div className="grid gap-5 lg:grid-cols-[410px_1fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-extrabold">Khóa thời gian không khả dụng</h2><p className="mt-1 text-sm leading-6 text-slate-500">Áp dụng cho giáo viên, lớp hoặc phòng. Đây là ràng buộc cứng.</p><div className="mt-5 space-y-3"><select value={constraintKind} onChange={event => setConstraintKind(event.target.value as ConstraintKind)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="teacher">Giáo viên</option><option value="class">Lớp học</option><option value="room">Phòng học</option></select><select value={constraintId} onChange={event => setConstraintId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{(constraintKind === 'teacher' ? scenario.teachers : constraintKind === 'class' ? scenario.classes : scenario.rooms).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="grid grid-cols-2 gap-3"><select value={constraintDay} onChange={event => setConstraintDay(Number(event.target.value))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><select value={constraintPeriod} onChange={event => setConstraintPeriod(Number(event.target.value))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{Array.from({ length: scenario.periodsPerDay }, (_, index) => index + 1).map(period => <option key={period} value={period}>Tiết {period}</option>)}</select></div><button type="button" onClick={addUnavailableSlot} disabled={!constraintId} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-40">Khóa thời gian này</button></div></section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Các ô đang khóa</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{(constraintKind === 'teacher' ? scenario.teachers : constraintKind === 'class' ? scenario.classes : scenario.rooms).map(resource => <div key={resource.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="font-bold">{resource.name}</div><div className="mt-3 flex flex-wrap gap-2">{(resource.unavailableSlots || []).length === 0 ? <span className="text-sm text-slate-400">Chưa khóa giờ.</span> : (resource.unavailableSlots || []).map(slot => { const parsed = parseTimetableSlot(slot); return <button type="button" key={slot} onClick={() => updateResourceSlots(constraintKind, resource.id, (resource.unavailableSlots || []).filter(value => value !== slot))} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200">{parsed ? `${TIMETABLE_DAYS[parsed.dayIndex]} · tiết ${parsed.period}` : slot} ×</button>; })}</div></div>)}</div></section>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center"><div><h2 className="font-extrabold">Thời khóa biểu</h2><p className="text-sm text-slate-500">Xem theo lớp, giáo viên hoặc phòng. Khóa một block để giữ nguyên khi tối ưu lại.</p></div><div className="flex flex-wrap gap-2"><select value={scheduleView} onChange={event => setScheduleView(event.target.value as ScheduleView)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="class">Theo lớp</option><option value="teacher">Theo giáo viên</option><option value="room">Theo phòng</option></select><select value={scheduleResourceId} onChange={event => setScheduleResourceId(event.target.value)} className="min-w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm">{scheduleResources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={exportExcel} disabled={!solution} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40 md:hidden"><Download className="h-4 w-4" />Excel</button></div></div>
            {!solution ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><CalendarRange className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-4 font-bold">Chưa có phương án</h3><p className="mt-1 text-sm text-slate-500">Bấm “Xếp tự động” để chạy bộ tối ưu.</p></div> : <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white"><table className="w-full min-w-[920px] border-collapse text-sm"><thead><tr className="bg-slate-900 text-white"><th className="w-20 border-r border-slate-700 p-3">Tiết</th>{days.map(day => <th key={day} className="border-r border-slate-700 p-3">{day}</th>)}</tr></thead><tbody>{Array.from({ length: scenario.periodsPerDay }, (_, index) => index + 1).map(period => <React.Fragment key={period}><tr><th className="border-r border-t border-slate-200 bg-slate-50 p-3 text-slate-500">{period}{period === (scenario.morningPeriods || 5) ? <div className="mt-1 text-[9px] font-normal text-amber-600">Hết sáng</div> : null}</th>{days.map((day, dayIndex) => { const entry = visibleEntries.find(item => item.dayIndex === dayIndex && item.period === period); return <td key={day} className="h-28 border-r border-t border-slate-200 p-2 align-top">{entry ? <div className={`h-full rounded-xl border p-2.5 ${entryTone(entry, scenario)}`}><div className="flex items-start justify-between gap-2"><b>{lookup.subjects.get(entry.subjectId)?.name}</b><button type="button" onClick={() => toggleEntryLock(entry)} disabled={entry.fixed} className="rounded-md p-1 text-slate-500 hover:bg-white disabled:cursor-default" title={entry.fixed ? 'Tiết cố định' : entry.locked ? 'Bỏ khóa block' : 'Khóa block'}>{entry.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button></div><div className="mt-2 text-xs text-slate-600">{scheduleView !== 'class' && `${lookup.classes.get(entry.classId)?.name} · `}{lookup.teachers.get(entry.teacherId)?.name}</div>{entry.roomId && <div className="mt-1 text-[11px] text-slate-500">{lookup.rooms.get(entry.roomId)?.name}</div>}{entry.fixed && <div className="mt-2 text-[10px] font-bold uppercase text-amber-700">Cố định</div>}</div> : null}</td>; })}</tr>{period === (scenario.morningPeriods || 5) && period < scenario.periodsPerDay ? <tr><td colSpan={days.length + 1} className="bg-amber-50 px-4 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-amber-700">Chuyển buổi / nghỉ giữa ngày</td></tr> : null}</React.Fragment>)}</tbody></table></div>}
            {versions.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-extrabold">8 phương án gần nhất</h3><div className="mt-3 flex gap-3 overflow-x-auto pb-2">{versions.map((version, index) => <button type="button" key={`${version.generatedAt}-${index}`} onClick={() => setSolution(version)} className="min-w-36 rounded-2xl border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50"><div className="text-xs font-semibold text-slate-400">PA {index + 1}</div><div className="mt-1 text-xl font-extrabold">{version.score}</div><div className="text-xs text-slate-500">{version.diagnostics.unscheduled.reduce((sum, item) => sum + item.remaining, 0)} tiết thiếu</div></button>)}</div></section>}
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-500" /><h2 className="font-extrabold">Xung đột & cảnh báo</h2></div>{!solution ? <p className="mt-4 text-sm text-slate-500">Chưa có phương án. Kiểm tra khả thi hiện có {preflight.length} cảnh báo.</p> : <div className="mt-4 space-y-3"><div className={`rounded-2xl p-4 ${solution.diagnostics.hardConflicts.length ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}><b>{solution.diagnostics.hardConflicts.length ? `${solution.diagnostics.hardConflicts.length} xung đột cứng` : 'Không có xung đột cứng'}</b>{solution.diagnostics.hardConflicts.map(item => <p key={item} className="mt-1 text-sm">• {item}</p>)}</div>{solution.diagnostics.warnings.map(item => <div key={item} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{item}</div>)}</div>}</section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Chỉ số chất lượng</h2><div className="mt-4 grid grid-cols-2 gap-3">{[
              ['Khoảng trống GV', solution?.diagnostics.quality.teacherGaps ?? '—'],
              ['Khoảng trống lớp', solution?.diagnostics.quality.classGaps ?? '—'],
              ['Môn chính muộn', solution?.diagnostics.quality.lateCorePeriods ?? '—'],
              ['Lệch tải giữa ngày', solution?.diagnostics.quality.dailyImbalance ?? '—'],
            ].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><div className="text-2xl font-extrabold">{String(value)}</div><div className="mt-1 text-xs text-slate-500">{String(label)}</div></div>)}</div></section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Tiết chưa xếp được</h2>{!solution || solution.diagnostics.unscheduled.length === 0 ? <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800"><b>Đã xếp đủ các yêu cầu.</b><p className="mt-1">Có thể khóa các block tốt rồi tối ưu lại để giảm khoảng trống.</p></div> : <div className="mt-4 space-y-3">{solution.diagnostics.unscheduled.map(item => { const assignment = lookup.assignments.get(item.assignmentId); return <div key={item.assignmentId} className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="font-bold text-amber-900">{lookup.classes.get(assignment?.classId || '')?.name} · {lookup.subjects.get(assignment?.subjectId || '')?.name}: còn {item.remaining} tiết</div><p className="mt-1 text-sm leading-6 text-amber-800">{item.reason}</p></div>; })}</div>}</section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Khả thi của dữ liệu đầu vào</h2>{preflight.length === 0 ? <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">Không phát hiện bất khả thi rõ ràng trước khi xếp.</div> : <div className="mt-4 space-y-2">{preflight.map(item => <div key={item} className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">• {item}</div>)}</div>}</section>
          </div>
        )}
      </main>
    </div>
  );
}
