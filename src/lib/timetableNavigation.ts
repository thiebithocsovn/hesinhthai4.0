export type TimetableWorkspaceTab = 'overview' | 'catalog' | 'assignments' | 'constraints' | 'schedule' | 'diagnostics' | 'agent' | 'grades' | 'homeroom' | 'curriculum' | 'settings' | 'backup' | 'advanced';

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
    { id: 'grades', label: 'Khối / Khoa', tab: 'grades', description: 'Khai báo khối và sắp xếp các lớp theo khối.' },
    { id: 'classes', label: 'Lớp học', tab: 'catalog', catalog: 'class', description: 'Quản lý tên lớp, cấp học và khối lớp.' },
    { id: 'periods', label: 'Tiết học', tab: 'settings', description: 'Khai báo khung tiết học và ranh giới buổi sáng, buổi chiều.' },
    { id: 'subjects', label: 'Môn học', tab: 'catalog', catalog: 'subject', description: 'Danh mục môn học và ưu tiên xếp lịch.' },
    { id: 'teachers', label: 'Giáo viên', tab: 'catalog', catalog: 'teacher', description: 'Danh sách giáo viên dùng chung giữa các cấp học.' },
  ] },
  { title: 'Xếp lịch', pages: [
    { id: 'homeroom', label: 'Giáo viên chủ nhiệm', tab: 'homeroom', description: 'Phân công giáo viên chủ nhiệm cho từng lớp.' },
    { id: 'assignments', label: 'Phân công giảng dạy', tab: 'assignments', description: 'Phân công lớp, môn, giáo viên, phòng học và số tiết.' },
    { id: 'curriculum', label: 'Khối - môn - số tiết', tab: 'curriculum', description: 'Kiểm tra và điều chỉnh số tiết mỗi tuần theo lớp và môn.' },
    { id: 'analysis', label: 'Phân tích PCCM', tab: 'diagnostics', description: 'Kiểm tra tải giảng dạy và tính khả thi của phân công.' },
    { id: 'schedule', label: 'Xếp thời khóa biểu', tab: 'schedule', description: 'Xếp tự động, xem lịch lớp, giáo viên và phòng học.' },
    { id: 'refine', label: 'Tinh chỉnh TKB', tab: 'schedule', description: 'Chọn tiết rồi chuyển sang ô trống; mọi thay đổi được kiểm tra độc lập.' },
    { id: 'agent', label: 'Trợ lý thời khóa biểu', tab: 'agent', description: 'Nhập yêu cầu bằng tiếng Việt, xem trước rồi duyệt ràng buộc.' },
  ] },
  { title: 'Cấu hình', pages: [
    { id: 'campuses', label: 'Cơ sở trường học', tab: 'advanced', description: 'Phạm vi hỗ trợ cơ sở và tài nguyên dùng chung.' },
    { id: 'sessions', label: 'Buổi học', tab: 'settings', description: 'Cấu hình số tiết sáng và chiều trong ngày.' },
    { id: 'days', label: 'Ngày học', tab: 'settings', description: 'Chọn tuần học 5 hoặc 6 ngày.' },
    { id: 'breaks', label: 'Tiết nghỉ / giờ bận', tab: 'constraints', constraint: 'class', description: 'Khóa các ô thời gian không học của từng lớp.' },
    { id: 'class-session', label: 'Lớp - môn - buổi', tab: 'curriculum', description: 'Chọn buổi sáng, chiều hoặc bất kỳ cho mỗi phân công.' },
    { id: 'teacher-session', label: 'Giáo viên - buổi dạy', tab: 'constraints', constraint: 'teacher', description: 'Đánh dấu giờ bận theo từng giáo viên.' },
    { id: 'same-session', label: 'Môn cùng buổi', tab: 'advanced', description: 'Phạm vi hỗ trợ nhóm môn học cùng buổi.' },
    { id: 'fixed', label: 'Môn / tiết cố định', tab: 'curriculum', description: 'Đặt thời điểm bắt đầu cố định cho từng phân công.' },
    { id: 'limits', label: 'Giới hạn số tiết', tab: 'settings', description: 'Giới hạn tiết mỗi ngày, tiết liên tục của giáo viên.' },
    { id: 'concurrency', label: 'Giới hạn số lớp', tab: 'advanced', description: 'Phạm vi giới hạn số lớp học cùng môn một lúc.' },
  ] },
  { title: 'Ghép lớp / Tách lớp', pages: [
    { id: 'merge', label: 'Ghép lớp', tab: 'advanced', description: 'Đối chiếu khả năng ghép các lớp học chung.' },
    { id: 'split', label: 'Tách lớp', tab: 'advanced', description: 'Đối chiếu khả năng chia lớp thành nhóm học đồng thời.' },
  ] },
  { title: 'Xuất Excel / In TKB', pages: [
    { id: 'export', label: 'Xuất Excel toàn trường', tab: 'backup', description: 'Xuất bảng tổng hợp và thời khóa biểu từng lớp, từng giáo viên.' },
    { id: 'print-class', label: 'In TKB học sinh', tab: 'schedule', view: 'class', description: 'Chọn lớp và bấm In / PDF để in hoặc lưu thành tệp PDF.' },
    { id: 'print-teacher', label: 'In TKB giáo viên', tab: 'schedule', view: 'teacher', description: 'Chọn giáo viên và bấm In / PDF để in hoặc lưu thành tệp PDF.' },
  ] },
  { title: 'Công khai TKB', pages: [
    { id: 'publication', label: 'Kiểm tra trước công bố', tab: 'diagnostics', description: 'Kiểm tra độc lập trước khi chia sẻ file Excel hoặc PDF.' },
    { id: 'public-links', label: 'Liên kết tra cứu', tab: 'advanced', description: 'Phạm vi hỗ trợ liên kết tra cứu thời khóa biểu.' },
  ] },
  { title: 'Sao lưu TKB', pages: [
    { id: 'backup', label: 'Sao lưu / Khôi phục', tab: 'backup', description: 'Sao lưu JSON, nhập Excel và phục hồi các phương án.' },
  ] },
  { title: 'Xếp phòng', pages: [
    { id: 'rooms', label: 'Phòng học', tab: 'catalog', catalog: 'room', description: 'Khai báo phòng và tài nguyên dùng chung.' },
    { id: 'room-schedule', label: 'Thời khóa biểu phòng', tab: 'schedule', view: 'room', description: 'Xem lịch sử dụng và phòng đã được gán trong phân công.' },
    { id: 'room-availability', label: 'Phòng không khả dụng', tab: 'constraints', constraint: 'room', description: 'Khóa thời gian bảo trì hoặc phòng không thể sử dụng.' },
    { id: 'exam-rooms', label: 'Chia phòng thi', tab: 'advanced', description: 'Phạm vi chia phòng thi trong bộ thời khóa biểu.' },
  ] },
];

export const TIMETABLE_ADMIN_PAGES: TimetableAdminPage[] = [
  { id: 'overview', label: 'Tổng quan', tab: 'overview', description: 'Khai báo dữ liệu → phân công → kiểm tra → xếp lịch → xuất thời khóa biểu.' },
  ...TIMETABLE_ADMIN_GROUPS.flatMap(group => group.pages),
];

export const TIMETABLE_SETUP_STEPS = ['grades', 'classes', 'periods', 'subjects', 'teachers', 'homeroom', 'assignments', 'curriculum', 'schedule'];
