export type TimetableWorkspaceTab = 'education' | 'overview' | 'catalog' | 'assignments' | 'constraints' | 'schedule' | 'diagnostics' | 'cover' | 'agent' | 'grades' | 'homeroom' | 'curriculum' | 'settings' | 'backup' | 'advanced' | 'schoolboard';

export interface TimetableAdminPage {
  id: string;
  label: string;
  tab: TimetableWorkspaceTab;
  description: string;
  catalog?: 'teacher' | 'class' | 'subject' | 'room';
  constraint?: 'teacher' | 'class' | 'room';
  view?: 'class' | 'teacher' | 'room';
}

export const TIMETABLE_ADMIN_GROUPS: { title: string; pages: TimetableAdminPage[] }[] = [
  { title: 'Khai báo', pages: [
    { id: 'education', label: 'Loại thời khóa biểu', tab: 'education', description: 'Chọn cấp/hệ đào tạo, năm học, học kỳ và khung giờ riêng từng cấp.' },
    { id: 'grades', label: 'Khối / Khoa', tab: 'grades', description: 'Khai báo khối và sắp xếp các lớp theo khối.' },
    { id: 'classes', label: 'Lớp học', tab: 'catalog', catalog: 'class', description: 'Quản lý tên lớp, cấp học và khối lớp.' },
    { id: 'periods', label: 'Tiết học', tab: 'settings', description: 'Khai báo khung tiết học và ranh giới buổi sáng, chiều và tối.' },
    { id: 'subjects', label: 'Môn học', tab: 'catalog', catalog: 'subject', description: 'Danh mục môn học và ưu tiên xếp lịch.' },
    { id: 'teachers', label: 'Giáo viên', tab: 'catalog', catalog: 'teacher', description: 'Danh sách giáo viên dùng chung giữa các cấp học.' },
  ] },
  { title: 'Xếp lịch', pages: [
    { id: 'homeroom', label: 'Giáo viên chủ nhiệm', tab: 'homeroom', description: 'Phân công giáo viên chủ nhiệm cho từng lớp.' },
    { id: 'assignments', label: 'Phân công giảng dạy', tab: 'assignments', description: 'Phân công lớp, môn, giáo viên, phòng học và số tiết.' },
    { id: 'curriculum', label: 'Khối - môn - số tiết', tab: 'curriculum', description: 'Kiểm tra và điều chỉnh số tiết mỗi tuần theo lớp và môn.' },
    { id: 'analysis', label: 'Phân tích PCCM', tab: 'diagnostics', description: 'Kiểm tra tải giảng dạy và tính khả thi của phân công.' },
    { id: 'schedule', label: 'Xếp thời khóa biểu', tab: 'schedule', description: 'Xếp tự động, xem lịch lớp, giáo viên và phòng học.' },
    { id: 'schoolboard', label: 'Bảng lịch toàn trường', tab: 'schoolboard', description: 'Xem tất cả lớp trên cùng một bảng, lọc theo ngày và cấp học.' },
    { id: 'refine', label: 'Tinh chỉnh TKB', tab: 'schedule', description: 'Chọn tiết rồi chuyển sang ô trống; mọi thay đổi được kiểm tra độc lập.' },
    { id: 'cover', label: 'Điều động dạy thay', tab: 'cover', description: 'Đăng ký dạy thay theo ngày, kiểm tra trùng lịch và xuất danh sách dự kiến; không đổi lịch gốc.' },
    { id: 'agent', label: 'Trợ lý thời khóa biểu', tab: 'agent', description: 'Nhập yêu cầu bằng tiếng Việt, xem trước rồi duyệt ràng buộc.' },
  ] },
  { title: 'Cấu hình', pages: [
    { id: 'campuses', label: 'Cơ sở trường học', tab: 'advanced', description: 'Quản lý điểm trường, sĩ số, sức chứa phòng và khoảng nghỉ chuyển cơ sở.' },
    { id: 'sessions', label: 'Buổi học', tab: 'settings', description: 'Cấu hình số tiết sáng, chiều và tối trong ngày.' },
    { id: 'days', label: 'Ngày học', tab: 'settings', description: 'Chọn tuần học 5, 6 hoặc 7 ngày.' },
    { id: 'breaks', label: 'Tiết nghỉ / giờ bận', tab: 'constraints', constraint: 'class', description: 'Khóa các ô thời gian không học của từng lớp.' },
    { id: 'class-session', label: 'Lớp - môn - buổi', tab: 'curriculum', description: 'Chọn buổi sáng, chiều, tối hoặc bất kỳ cho mỗi phân công.' },
    { id: 'teacher-session', label: 'Giáo viên - buổi dạy', tab: 'constraints', constraint: 'teacher', description: 'Đánh dấu giờ bận theo từng giáo viên.' },
    { id: 'same-session', label: 'Môn cùng buổi', tab: 'advanced', description: 'Đồng bộ các buổi tương ứng của nhiều phân công trong cùng ngày và buổi.' },
    { id: 'fixed', label: 'Môn / tiết cố định', tab: 'curriculum', description: 'Đặt thời điểm bắt đầu cố định cho từng phân công.' },
    { id: 'limits', label: 'Giới hạn số tiết', tab: 'settings', description: 'Giới hạn tiết mỗi ngày, tiết liên tục của giáo viên.' },
    { id: 'concurrency', label: 'Giới hạn số lớp', tab: 'advanced', description: 'Giới hạn số lớp có thể học cùng một môn tại mỗi tiết.' },
  ] },
  { title: 'Ghép lớp / Tách lớp', pages: [
    { id: 'merge', label: 'Ghép lớp', tab: 'advanced', description: 'Ghép nhiều lớp học chung, giữ giờ cho toàn bộ giáo viên đồng giảng.' },
    { id: 'split', label: 'Tách lớp', tab: 'advanced', description: 'Chia lớp thành các nhóm không trùng học sinh và đồng bộ lịch song song.' },
  ] },
  { title: 'Xuất Excel / In TKB', pages: [
    { id: 'export', label: 'Xuất Excel toàn trường', tab: 'backup', description: 'Xuất bảng tổng hợp và thời khóa biểu từng lớp, từng giáo viên.' },
    { id: 'print-class', label: 'In TKB học sinh', tab: 'schedule', view: 'class', description: 'Chọn lớp và bấm In / PDF để in hoặc lưu thành tệp PDF.' },
    { id: 'print-teacher', label: 'In TKB giáo viên', tab: 'schedule', view: 'teacher', description: 'Chọn giáo viên và bấm In / PDF để in hoặc lưu thành tệp PDF.' },
  ] },
  { title: 'Công khai TKB', pages: [
    { id: 'publication', label: 'Kiểm tra trước công bố', tab: 'diagnostics', description: 'Kiểm tra độc lập trước khi chia sẻ file Excel hoặc PDF.' },
    { id: 'public-links', label: 'Liên kết tra cứu', tab: 'advanced', description: 'Phát hành bản lịch được kiểm tra, tạo trang tra cứu hoặc xuất HTML độc lập.' },
  ] },
  { title: 'Sao lưu TKB', pages: [
    { id: 'backup', label: 'Sao lưu / Khôi phục', tab: 'backup', description: 'Sao lưu JSON, nhập Excel và phục hồi các phương án.' },
  ] },
  { title: 'Xếp phòng', pages: [
    { id: 'rooms', label: 'Phòng học', tab: 'catalog', catalog: 'room', description: 'Khai báo phòng và tài nguyên dùng chung.' },
    { id: 'room-schedule', label: 'Thời khóa biểu phòng', tab: 'schedule', view: 'room', description: 'Xem lịch sử dụng và phòng đã được gán trong phân công.' },
    { id: 'room-availability', label: 'Phòng không khả dụng', tab: 'constraints', constraint: 'room', description: 'Khóa thời gian bảo trì hoặc phòng không thể sử dụng.' },
    { id: 'exam-rooms', label: 'Chia phòng thi', tab: 'advanced', description: 'Chia thí sinh theo sức chứa phòng và xuất danh sách đã kiểm tra.' },
  ] },
];

export const TIMETABLE_ADMIN_PAGES: TimetableAdminPage[] = [
  { id: 'overview', label: 'Tổng quan', tab: 'overview', description: 'Khai báo dữ liệu → phân công → kiểm tra → xếp lịch → xuất thời khóa biểu.' },
  ...TIMETABLE_ADMIN_GROUPS.flatMap(group => group.pages),
];

export const TIMETABLE_SETUP_STEPS = ['education', 'grades', 'classes', 'periods', 'subjects', 'teachers', 'homeroom', 'assignments', 'curriculum', 'schedule'];
