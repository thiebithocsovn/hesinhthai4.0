import type { ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  School,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  WandSparkles,
} from 'lucide-react';

export type TimetableWorkspaceTab =
  | 'overview'
  | 'catalog'
  | 'assignments'
  | 'constraints'
  | 'schedule'
  | 'diagnostics'
  | 'agent';

interface WorkspaceStats {
  classes: number;
  teachers: number;
  required: number;
  scheduled: number;
  unassigned: number;
  conflicts: number | null;
}

interface TimetableWorkspaceChromeProps {
  children: ReactNode;
  schoolName: string;
  activeTab: TimetableWorkspaceTab;
  onTabChange: (tab: TimetableWorkspaceTab) => void;
  onBack: () => void;
  onRun: () => void;
  onExport: () => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
  busy: boolean;
  canRun: boolean;
  canExport: boolean;
  preflightCount: number;
  stats: WorkspaceStats;
}

const NAV_GROUPS = [
  {
    title: 'KHỞI TẠO',
    items: [
      { id: 'overview', label: 'Tổng quan', Icon: LayoutDashboard },
      { id: 'catalog', label: 'Khối, lớp & danh mục', Icon: School },
      { id: 'assignments', label: 'Phân công giảng dạy', Icon: ClipboardList },
      { id: 'constraints', label: 'Ràng buộc & ưu tiên', Icon: Settings2 },
    ],
  },
  {
    title: 'XẾP LỊCH & KIỂM TRA',
    items: [
      { id: 'schedule', label: 'Thời khóa biểu', Icon: CalendarDays },
      { id: 'diagnostics', label: 'Kiểm tra xung đột', Icon: ShieldCheck },
      { id: 'agent', label: 'Trợ lý AI Agent', Icon: Sparkles },
    ],
  },
] as const;

const TAB_TITLES: Record<TimetableWorkspaceTab, { title: string; description: string }> = {
  overview: { title: 'Tổng quan hệ thống', description: 'Nắm tiến độ và bắt đầu quy trình xếp thời khóa biểu của nhà trường.' },
  catalog: { title: 'Quản lý danh mục', description: 'Thiết lập lớp, giáo viên, môn học và phòng học dùng chung.' },
  assignments: { title: 'Phân công chuyên môn', description: 'Phân công chính xác số tiết, giáo viên và lớp học trước khi xếp lịch.' },
  constraints: { title: 'Ràng buộc thời khóa biểu', description: 'Khai báo thời gian không khả dụng và các điều kiện cần tôn trọng.' },
  schedule: { title: 'Thời khóa biểu toàn trường', description: 'Xem lịch theo lớp, giáo viên hoặc phòng và khóa những tiết cần giữ.' },
  diagnostics: { title: 'Chẩn đoán & kiểm chứng', description: 'Theo dõi xung đột, cảnh báo và chất lượng của phương án.' },
  agent: { title: 'Trợ lý AITHEROVA', description: 'Xem trước các đề xuất và chủ động phê duyệt thay đổi.' },
};

export default function TimetableWorkspaceChrome({
  children,
  schoolName,
  activeTab,
  onTabChange,
  onBack,
  onRun,
  onExport,
  onImport,
  onDownloadTemplate,
  busy,
  canRun,
  canExport,
  preflightCount,
  stats,
}: TimetableWorkspaceChromeProps) {
  const percent = stats.required > 0
    ? Math.min(100, Math.round((stats.scheduled / stats.required) * 100))
    : 0;
  const complete = canExport && stats.required > 0 && stats.unassigned === 0 && stats.conflicts === 0;
  const hasData = stats.classes > 0 && stats.teachers > 0 && stats.required > 0;
  const status = !hasData
    ? 'Chưa đủ dữ liệu đầu vào'
    : !canExport
      ? 'Sẵn sàng kiểm tra / xếp lịch'
      : complete
        ? 'Đã xếp đủ, không có xung đột cứng'
        : 'Cần rà soát phương án';
  const current = TAB_TITLES[activeTab];

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onBack} aria-label="Quay lại hệ sinh thái"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50">
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.12em] text-indigo-600">AITHEROVA / SMART TIMETABLE</p>
              <h1 className="truncate text-base font-extrabold leading-6 md:text-lg">Trung tâm xếp thời khóa biểu</h1>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <button type="button" onClick={onImport}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <UploadCloud className="h-4 w-4" /> Nhập Excel
            </button>
            <button type="button" onClick={onExport} disabled={!canExport}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              <Download className="h-4 w-4" /> Xuất lịch
            </button>
            <button type="button" onClick={onRun} disabled={busy || !canRun}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
              <WandSparkles className="h-4 w-4" />{busy ? 'Đang xếp lịch...' : 'Xếp tự động'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] items-start gap-6 px-4 md:px-6 lg:px-8">
        <aside className="sticky top-[73px] hidden h-[calc(100vh-73px)] w-[246px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-200 py-6 pr-5 lg:flex">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><GraduationCap className="h-4 w-4 text-indigo-500" /> ĐƠN VỊ ĐANG LÀM VIỆC</div>
            <p className="mt-2 line-clamp-2 text-sm font-extrabold leading-5" title={schoolName}>{schoolName || 'Chưa đặt tên trường'}</p>
            <p className="mt-2 text-xs text-slate-500">Tiểu học · THCS · Liên cấp</p>
          </div>

          <nav aria-label="Điều hướng thời khóa biểu" className="space-y-5">
            {NAV_GROUPS.map(group => (
              <div key={group.title}>
                <p className="mb-2 px-3 text-[10px] font-extrabold tracking-[0.15em] text-slate-400">{group.title}</p>
                <div className="space-y-1">
                  {group.items.map(item => (
                    <button key={item.id} type="button" onClick={() => onTabChange(item.id)}
                      aria-current={activeTab === item.id ? 'page' : undefined}
                      className={'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ' +
                        (activeTab === item.id
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900')}>
                      <item.Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {activeTab === item.id && <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50 to-white p-4">
            <div className="flex items-center gap-2 font-bold text-indigo-900">
              <ShieldCheck className="h-4 w-4" /> Tiến độ xếp lịch
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{percent}%</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Tỷ lệ tiết đã xếp">
              <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: percent + '%' }} />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{stats.scheduled}/{stats.required} tiết được phân vào lịch</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-10 pt-5 md:pt-7">
          <div className="mb-4 lg:hidden">
            <label htmlFor="timetable-section" className="mb-2 block text-xs font-bold text-slate-500">CHỌN PHÂN HỆ</label>
            <select id="timetable-section" value={activeTab}
              onChange={event => onTabChange(event.target.value as TimetableWorkspaceTab)}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800">
              {NAV_GROUPS.flatMap(group => group.items).map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-600">
                <span>AITHEROVA</span><ChevronRight className="h-3.5 w-3.5" /><span>{current.title}</span>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">{current.title}</h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{current.description}</p>
            </div>
            <div className={'inline-flex max-w-full items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-bold ' +
              (complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                canExport ? 'border-amber-200 bg-amber-50 text-amber-800' :
                'border-slate-200 bg-white text-slate-600')}>
              {complete ? <CheckCircle2 className="h-4 w-4 shrink-0" /> :
                <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{status}</span>
            </div>
          </div>

          {activeTab === 'overview' && (
            <section className="mb-5 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-indigo-600">QUY TRÌNH TRIỂN KHAI</p>
                  <h3 className="mt-1 text-base font-extrabold text-slate-900">
                    {hasData ? 'Dữ liệu đã được khai báo — tiếp tục kiểm tra và xếp lịch' : 'Bắt đầu nhanh với dữ liệu phân công của trường'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {hasData ? 'Hệ thống giữ nguyên các thiết lập và lịch đã lưu trên thiết bị.' : 'Nhập Excel hoặc tải mẫu để chuẩn bị dữ liệu. Không cần nhập từng giáo viên thủ công.'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={onDownloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <FileSpreadsheet className="h-4 w-4" /> File mẫu
                  </button>
                  <button type="button" onClick={onImport} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-indigo-700">
                    <UploadCloud className="h-4 w-4" /> Nhập dữ liệu
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 md:grid-cols-4">
                {[
                  { label: '1. Danh mục', ready: stats.classes > 0 && stats.teachers > 0, tab: 'catalog' as const, Icon: BookOpen },
                  { label: '2. Phân công', ready: stats.required > 0, tab: 'assignments' as const, Icon: Users },
                  { label: '3. Kiểm tra', ready: hasData && preflightCount === 0, tab: 'diagnostics' as const, Icon: LockKeyhole },
                  { label: '4. Xếp & xuất', ready: complete, tab: 'schedule' as const, Icon: CalendarDays },
                ].map(step => (
                  <button key={step.label} type="button" onClick={() => onTabChange(step.tab)}
                    className="flex items-center gap-2 bg-white px-3 py-3 text-left text-xs font-bold text-slate-700 transition hover:bg-indigo-50 md:px-4">
                    <step.Icon className={'h-4 w-4 shrink-0 ' + (step.ready ? 'text-emerald-600' : 'text-slate-400')} />
                    <span className="flex-1">{step.label}</span>
                    {step.ready && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  </button>
                ))}
              </div>
            </section>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
