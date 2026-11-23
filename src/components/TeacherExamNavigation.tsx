import { Activity, BarChart3, BookOpenText, CalendarDays, ClipboardList, GraduationCap, LayoutDashboard, ScanLine, Users, type LucideIcon } from 'lucide-react';

export type TeacherWorkspaceView = 'overview' | 'exams' | 'calendar' | 'bank' | 'students' | 'monitoring' | 'results' | 'analytics' | 'scanning';

interface NavigationItem {
  id: TeacherWorkspaceView;
  label: string;
  icon: LucideIcon;
  group: 'Quản lý' | 'Tổ chức & đánh giá';
}

const ITEMS: NavigationItem[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard, group: 'Quản lý' },
  { id: 'exams', label: 'Kỳ thi & đề thi', icon: ClipboardList, group: 'Quản lý' },
  { id: 'bank', label: 'Ngân hàng câu hỏi', icon: BookOpenText, group: 'Quản lý' },
  { id: 'calendar', label: 'Lịch thi', icon: CalendarDays, group: 'Quản lý' },
  { id: 'students', label: 'Lớp & học sinh', icon: Users, group: 'Quản lý' },
  { id: 'monitoring', label: 'Giám sát phòng thi', icon: Activity, group: 'Tổ chức & đánh giá' },
  { id: 'results', label: 'Chấm & kết quả', icon: GraduationCap, group: 'Tổ chức & đánh giá' },
  { id: 'analytics', label: 'Phân tích & báo cáo', icon: BarChart3, group: 'Tổ chức & đánh giá' },
  { id: 'scanning', label: 'Chấm phiếu OMR', icon: ScanLine, group: 'Tổ chức & đánh giá' },
];

interface Props {
  current: TeacherWorkspaceView;
  onNavigate: (view: TeacherWorkspaceView) => void;
  compact?: boolean;
}

export default function TeacherExamNavigation({ current, onNavigate, compact = false }: Props) {
  const item = ({ id, label, icon: Icon }: NavigationItem) => (
    <button key={id} type="button" onClick={() => onNavigate(id)}
      aria-current={current === id ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${current === id ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'} ${compact ? '' : 'w-full'}`}>
      <Icon aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
      <span>{label}</span>
    </button>
  );

  if (compact) {
    return <nav aria-label="Điều hướng quản lý kỳ thi trên điện thoại" className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
      {ITEMS.map(item)}
    </nav>;
  }

  return <aside className="hidden w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-200 bg-white px-3 py-5 lg:flex">
    <div className="flex items-center gap-3 rounded-xl bg-teal-50 px-3 py-3 text-teal-900">
      <BookOpenText className="h-6 w-6 shrink-0" aria-hidden="true" />
      <div><p className="text-sm font-bold">Trung tâm khảo thí</p><p className="text-xs text-teal-700">Không gian giáo viên</p></div>
    </div>
    <nav aria-label="Điều hướng quản lý kỳ thi" className="space-y-5">
      {(['Quản lý', 'Tổ chức & đánh giá'] as const).map(group => (
        <div key={group} className="space-y-1">
          <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{group}</p>
          {ITEMS.filter(item => item.group === group).map(item)}
        </div>
      ))}
    </nav>
    <p className="mt-auto border-t border-slate-100 px-3 pt-4 text-xs leading-relaxed text-slate-500">
      Dữ liệu kỳ thi, học sinh và kết quả được giữ theo tài khoản giáo viên hiện tại.
    </p>
  </aside>;
}
