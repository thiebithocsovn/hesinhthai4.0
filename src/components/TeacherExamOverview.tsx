import { Activity, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, FilePlus2, FileText, Users } from 'lucide-react';
import { summarizeTeacherExams, teacherExamState, type TeacherExamStatusFilter, type TeacherWorkspaceExam } from '../lib/teacherExamWorkspace';

interface Props {
  exams: readonly TeacherWorkspaceExam[];
  onCreateExam: () => void;
  onShowExams: (filter?: TeacherExamStatusFilter) => void;
  onShowStudents: () => void;
  onShowMonitoring: () => void;
  onShowResults: () => void;
}

export default function TeacherExamOverview({
  exams, onCreateExam, onShowExams, onShowStudents, onShowMonitoring, onShowResults,
}: Props) {
  const now = Date.now();
  const counts = summarizeTeacherExams(exams, now);
  const recentExams = [...exams].sort((a, b) =>
    (Date.parse(b.createdAt || b.startTime || '') || 0) - (Date.parse(a.createdAt || a.startTime || '') || 0)
  ).slice(0, 5);
  const statistics = [
    { name: 'Tổng số kỳ thi', value: counts.all, icon: ClipboardList, filter: 'all' as const, color: 'text-teal-700 bg-teal-50' },
    { name: 'Đang mở', value: counts.open, icon: Activity, filter: 'open' as const, color: 'text-blue-700 bg-blue-50' },
    { name: 'Sắp diễn ra', value: counts.upcoming, icon: CalendarClock, filter: 'upcoming' as const, color: 'text-amber-700 bg-amber-50' },
    { name: 'Đã đóng', value: counts.closed, icon: CheckCircle2, filter: 'closed' as const, color: 'text-slate-700 bg-slate-100' },
  ];

  return <section className="mx-auto max-w-7xl space-y-6" aria-label="Tổng quan kỳ thi giáo viên">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-teal-700">Bảng điều khiển</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Tổng quan kỳ thi</h2>
        <p className="mt-1 text-sm text-slate-500">Tình hình kỳ thi từ dữ liệu đang lưu của tài khoản giáo viên.</p>
      </div>
      <button type="button" onClick={onCreateExam}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
        <FilePlus2 className="h-5 w-5" aria-hidden="true" /> Tạo kỳ thi mới
      </button>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {statistics.map(({ name, value, icon: Icon, filter, color }) => (
        <button type="button" key={filter} onClick={() => onShowExams(filter)}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 sm:p-5">
          <span className={`inline-flex rounded-xl p-2 ${color}`}><Icon aria-hidden="true" className="h-5 w-5" /></span>
          <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{value}</p>
          <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm">{name}</p>
        </button>
      ))}
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(270px,1fr)]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div><h3 className="font-bold text-slate-900">Kỳ thi gần đây</h3><p className="text-xs text-slate-500">Hiển thị tối đa 5 kỳ thi mới nhất</p></div>
          <button type="button" onClick={() => onShowExams('all')} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">Xem tất cả <ArrowRight className="h-4 w-4" /></button>
        </div>
        {recentExams.length === 0
          ? <div className="px-5 py-12 text-center"><FileText className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">Chưa có kỳ thi</p><p className="mt-1 text-sm text-slate-500">Tạo kỳ thi đầu tiên để bắt đầu tổ chức kiểm tra.</p></div>
          : <ul className="divide-y divide-slate-100">
            {recentExams.map(exam => {
              const state = teacherExamState(exam, now);
              const label = { open: 'Đang mở', upcoming: 'Sắp diễn ra', draft: 'Bản nháp', closed: 'Đã đóng' }[state];
              return <li key={exam.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{exam.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{exam.questions?.length ?? 0} câu · {exam.startTime ? new Date(exam.startTime).toLocaleString('vi-VN') : 'Chưa đặt lịch'}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{label}</span>
              </li>;
            })}
          </ul>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Truy cập nhanh</h3>
        <p className="mt-1 text-sm text-slate-500">Chọn công việc cần thực hiện.</p>
        <div className="mt-4 space-y-2">
          {[
            { label: 'Quản lý lớp & học sinh', help: 'Danh sách lớp và tài khoản dự thi', icon: Users, onClick: onShowStudents },
            { label: 'Giám sát phòng thi', help: 'Theo dõi tiến độ trong giờ thi', icon: Activity, onClick: onShowMonitoring },
            { label: 'Chấm & xem kết quả', help: 'Chấm bài, in biên bản, xuất Excel', icon: CheckCircle2, onClick: onShowResults },
          ].map(action => (
            <button key={action.label} type="button" onClick={action.onClick}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition-colors hover:border-teal-200 hover:bg-teal-50">
              <action.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-teal-700" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">{action.label}</span><span className="block text-xs text-slate-500">{action.help}</span></span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{counts.draft} kỳ thi nháp.</strong> Kiểm tra câu hỏi, lịch và mã đề trước khi mở thi.
          <button type="button" onClick={() => onShowExams('draft')} className="mt-2 block font-semibold underline underline-offset-2">Xem bản nháp</button>
        </div>
      </section>
    </div>
  </section>;
}
