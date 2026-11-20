import React, { useMemo, useState } from 'react';
import { Download, FileDown, LayoutGrid, ListFilter, Search } from 'lucide-react';
import { educationLevels, entryClockLabel, SESSION_LABELS } from '../lib/timetableEducation';
import { activeTimetableDays, type TimetableScenario, type TimetableSolution } from '../lib/smartTimetable';
import { auditTimetableSolution } from '../lib/smartTimetableAudit';
import { assignmentStudentGroupIds, assignmentTeacherIds } from '../lib/smartTimetableResources';
import { buildSchoolBoard, schoolBoardMatrix, schoolBoardPrintHtml, type SchoolBoardSession } from '../lib/timetableSchoolBoard';

interface Props {
  scenario: TimetableScenario;
  solution: TimetableSolution | null;
  onOpenSchedule?: () => void;
}

export default function TimetableSchoolBoard({ scenario: s, solution, onOpenSchedule }: Props) {
  const [mode, setMode] = useState<'week' | 'day'>('week');
  const [day, setDay] = useState(0);
  const [level, setLevel] = useState('all');
  const [gradeId, setGradeId] = useState('all');
  const [session, setSession] = useState<SchoolBoardSession>('all');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const days = activeTimetableDays(s);
  const audit = useMemo(() => auditTimetableSolution(s, solution), [s, solution]);
  const exportReady = Boolean(solution && audit.valid && audit.complete);
  const board = useMemo(() => solution ? buildSchoolBoard(s, solution, {
    day: mode === 'week' ? 'all' : day, level, gradeId, session, query,
  }) : null, [s, solution, mode, day, level, gradeId, session, query]);
  const names = useMemo(() => ({
    subjects: new Map(s.subjects.map(item => [item.id, item.name])),
    teachers: new Map(s.teachers.map(item => [item.id, item.name])),
    rooms: new Map(s.rooms.map(item => [item.id, item.name])),
    groups: new Map((s.studentGroups || []).map(item => [item.id, item.name])),
  }), [s]);
  const grades = (s.grades || []).filter(g => level === 'all' || g.level === level);
  const lessonWeek = solution?.teachingWeek ?? s.education?.activeWeek;

  const exportExcel = async () => {
    if (!board || !exportReady) return;
    try {
      setMessage('');
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const rows: (string | number)[][] = [
        ['THỜI KHÓA BIỂU TOÀN TRƯỜNG', s.name],
        ['Năm học', s.education?.academicYear || ''],
        ['Học kỳ', s.education?.term || ''],
        ['Tuần học', lessonWeek ?? ''],
        ['Phạm vi', mode === 'week' ? 'Toàn tuần' : days[day] || '', 'Buổi', session === 'all' ? 'Cả ngày' : SESSION_LABELS[session]],
        [],
        ...schoolBoardMatrix(s, board),
      ];
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [{ wch: 18 }, { wch: 11 }, { wch: 9 }, ...board.classes.map(() => ({ wch: 36 }))];
      XLSX.utils.book_append_sheet(workbook, sheet, 'TKB toan truong');
      XLSX.writeFile(workbook, `TKB_toan_truong${lessonWeek ? '_tuan_' + lessonWeek : ''}.xlsx`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể xuất Excel toàn trường.');
    }
  };

  const printBoard = () => {
    if (!board || !solution || !exportReady) return;
    try {
      setMessage('');
      const printWindow = window.open('', '_blank');
      if (!printWindow) throw new Error('Trình duyệt chặn cửa sổ in. Hãy cho phép cửa sổ bật lên.');
      printWindow.opener = null;
      printWindow.document.open();
      printWindow.document.write(schoolBoardPrintHtml(s, board, lessonWeek));
      printWindow.document.close();
      printWindow.focus();
      printWindow.setTimeout(() => printWindow.print(), 350);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể mở bản in.');
    }
  };

  return <div className="space-y-4" data-testid="timetable-school-board">
    <section className="tt-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2"><LayoutGrid size={17} /> Thời khóa biểu toàn trường</h3>
          <p>Xem đồng thời các lớp của trường. Bảng chỉ đọc, tự cập nhật theo phương án đang xếp.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="tt-button" onClick={onOpenSchedule}>Mở xếp thời khóa biểu</button>
          <button type="button" className="tt-button" disabled={!exportReady || !board?.classes.length} onClick={exportExcel} title={!exportReady ? 'Chỉ xuất khi lịch đã đủ tiết và qua kiểm tra độc lập' : 'Xuất bảng đang lọc'}>
            <Download size={15} />Xuất Excel
          </button>
          <button type="button" className="tt-button primary" disabled={!exportReady || !board?.classes.length} onClick={printBoard} title={!exportReady ? 'Chỉ in khi lịch đã đủ tiết và qua kiểm tra độc lập' : 'In bảng đang lọc'}>
            <FileDown size={15} />In / PDF
          </button>
        </div>
      </div>
      <div className="tt-toolbar !mb-0">
        <div role="group" aria-label="Phạm vi thời khóa biểu" className="inline-flex overflow-hidden rounded-md border border-slate-300">
          <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')} className={`px-3 py-2 text-xs font-semibold ${mode === 'week' ? 'bg-indigo-700 text-white' : 'bg-white text-slate-600'}`}>Toàn tuần</button>
          <button type="button" aria-pressed={mode === 'day'} onClick={() => setMode('day')} className={`border-l border-slate-300 px-3 py-2 text-xs font-semibold ${mode === 'day' ? 'bg-indigo-700 text-white' : 'bg-white text-slate-600'}`}>Theo ngày</button>
        </div>
        {mode === 'day' && <label className="text-xs font-semibold">Ngày <select aria-label="Ngày xem toàn trường" className="ml-1 rounded-md border px-2 py-2" value={day} onChange={e => setDay(Number(e.target.value))}>
          {days.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select></label>}
        <label className="flex items-center gap-2 text-xs font-semibold"><ListFilter size={14} />Buổi
          <select aria-label="Buổi xem toàn trường" className="rounded-md border px-2 py-2" value={session} onChange={e => setSession(e.target.value as SchoolBoardSession)}>
            <option value="all">Tất cả buổi</option><option value="morning">Sáng</option><option value="afternoon">Chiều</option><option value="evening">Tối</option>
          </select>
        </label>
        <label className="text-xs font-semibold">Cấp học <select aria-label="Cấp học xem toàn trường" className="ml-1 rounded-md border px-2 py-2" value={level} onChange={e => { setLevel(e.target.value); setGradeId('all'); }}>
          <option value="all">Tất cả cấp học</option>{educationLevels(s).map(l => <option key={l} value={l}>{l}</option>)}
        </select></label>
        {grades.length > 0 && <label className="text-xs font-semibold">Khối <select aria-label="Khối xem toàn trường" className="ml-1 rounded-md border px-2 py-2" value={gradeId} onChange={e => setGradeId(e.target.value)}>
          <option value="all">Tất cả khối</option>{grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select></label>}
        <label className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs">
          <Search size={14} className="text-slate-500" />
          <input aria-label="Tìm lớp toàn trường" className="w-28 border-0 bg-transparent py-2 outline-none sm:w-40" placeholder="Tìm lớp..." value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <button type="button" className="tt-button" onClick={() => { setLevel('all'); setGradeId('all'); setSession('all'); setQuery(''); setMode('week'); setDay(0); }}>Xóa bộ lọc</button>
      </div>
      {board && <div className="flex flex-wrap items-center gap-2" role="status">
        <span className="tt-badge">{board.classes.length} lớp</span><span className="tt-badge">{board.lessonCells} ô tiết có lịch</span>
        <span className="tt-badge">{mode === 'week' ? 'Toàn tuần' : days[day]}</span>
        {lessonWeek && <span className="tt-badge">Tuần {lessonWeek}</span>}
      </div>}
      {!exportReady && solution && <p className="!text-amber-800">Đang xem bản nháp: có thể tra cứu lịch đã xếp, nhưng chỉ được in và xuất Excel sau khi lịch đủ tiết và đạt kiểm tra độc lập.</p>}
      {message && <p role="alert" className="!text-red-700">{message}</p>}
    </section>
    {!solution ? <div className="tt-empty tt-panel">Chưa có thời khóa biểu. Chọn “Xếp thời khóa biểu” để xếp thủ công hoặc xếp tự động.</div>
      : !board?.classes.length ? <div className="tt-empty tt-panel">Không có lớp phù hợp với bộ lọc. Hãy thử xóa bộ lọc.</div>
      : board.rows.length === 0 ? <div className="tt-empty tt-panel">Không có khung tiết phù hợp với buổi đã chọn.</div>
      : <div className="tt-table-wrap max-h-[75vh]" role="region" aria-label="Bảng thời khóa biểu toàn trường" tabIndex={0}>
        <table className="tt-table min-w-max border-separate border-spacing-0 text-center">
          <thead className="sticky top-0 z-30">
            <tr>
              <th scope="col" className="sticky left-0 z-40 !w-24 !min-w-24 !max-w-24 !text-center">Thứ</th>
              <th scope="col" className="sticky left-24 z-40 !w-20 !min-w-20 !max-w-20 !text-center">Tiết / Buổi</th>
              {board.classes.map(c => <th scope="col" key={c.id} className="!min-w-40 !max-w-48 !text-center">
                <strong className="block">{c.name}</strong><span className="block text-[10px] font-normal">{c.level}</span>
              </th>)}
            </tr>
          </thead>
          <tbody>
            {board.rows.map(row => <tr key={`${row.dayIndex}:${row.period}`}>
              <th scope="row" className="sticky left-0 z-20 !w-24 !min-w-24 !max-w-24 border-r border-slate-200 bg-slate-50 !text-center">{row.dayName}</th>
              <th scope="row" className="sticky left-24 z-20 !w-20 !min-w-20 !max-w-20 border-r border-slate-200 bg-slate-50 !text-center">
                {row.period}<small className="block font-normal text-slate-500">{SESSION_LABELS[row.session]}</small>
              </th>
              {board.classes.map(c => <td key={c.id} className="!min-w-40 !max-w-48 border-r border-slate-100 !p-1.5 align-top !whitespace-normal">
                {(row.cells.get(c.id) || []).map(entry => <div key={entry.id} className={`my-0.5 rounded-md p-2 text-xs leading-5 ${entry.fixed ? 'bg-amber-50' : c.level === 'Tiểu học' ? 'bg-emerald-50' : 'bg-indigo-50'}`}>
                  <b className="block">{names.subjects.get(entry.subjectId) || entry.subjectId}</b>
                  {s.education && <span className="block text-[10px] text-blue-800">{entryClockLabel(s, entry)}</span>}
                  <span className="block text-slate-600">{assignmentTeacherIds(entry).map(id => names.teachers.get(id) || id).join(' + ')}</span>
                  {assignmentStudentGroupIds(entry).length > 0 && <span className="block text-slate-600">{assignmentStudentGroupIds(entry).map(id => names.groups.get(id) || id).join(' + ')}</span>}
                  {entry.roomId && <span className="block text-slate-500">{names.rooms.get(entry.roomId) || entry.roomId}</span>}
                </div>)}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>}
  </div>;
}
