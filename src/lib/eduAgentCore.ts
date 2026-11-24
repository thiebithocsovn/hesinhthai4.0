import { ECOSYSTEM_APPLICATIONS, type EcosystemApplicationId } from '../ecosystem';

export type AgentAppId = EcosystemApplicationId | 'smart-timetable';
export type AgentContext = AgentAppId | 'desktop' | 'administration';
export type AgentRole = 'coordinator' | 'teaching' | 'assessment' | 'operations' | 'documents' | 'quality';
export const AGENT_ROLES: Record<AgentRole, { name: string; description: string }> = {
  coordinator: { name: 'Điều phối', description: 'Lập kế hoạch liên ứng dụng và lựa chọn công cụ phù hợp.' },
  teaching: { name: 'Dạy học', description: 'Soạn nội dung, câu hỏi và hoạt động học tập phù hợp lứa tuổi.' },
  assessment: { name: 'Kiểm tra – đánh giá', description: 'Dự thảo câu hỏi, tiêu chí đánh giá và cách phân tích kết quả.' },
  operations: { name: 'Vận hành', description: 'Lập lịch, ràng buộc, quản lý công việc và tổ chức lớp.' },
  documents: { name: 'Học liệu – dữ liệu', description: 'Hướng dẫn xử lý tệp, chuẩn hóa biểu mẫu và kiểm tra dữ liệu.' },
  quality: { name: 'Kiểm soát chất lượng', description: 'Rà soát căn cứ, tính chính xác, quyền truy cập và an toàn.' },
};
type Profile = { role: AgentRole; example: string; steps: string[]; related: AgentAppId[]; aliases: string[] };
export const AGENT_PROFILES: Record<AgentContext, Profile> = {
  desktop: { role: 'coordinator', example: 'Chuẩn bị tiết Toán 8: tạo câu hỏi, tổ chức hoạt động và đánh giá.', steps: ['Xác định mục tiêu, lớp và môn học.', 'Chọn công cụ theo từng bước; kiểm tra và duyệt kết quả trước khi chuyển dữ liệu.', 'Mở ứng dụng bằng nút đề xuất.'], related: ['chatbot', 'question-studio', 'exam-manager', 'smart-timetable'], aliases: [] },
  administration: { role: 'operations', example: 'Lập kế hoạch rà soát tài khoản giáo viên và phân quyền.', steps: ['Kiểm tra tài khoản và phạm vi được phép quản lý.', 'Lập danh sách thay đổi cần duyệt; không sửa quyền bằng lời nhắc AI.', 'Thực hiện trong màn hình quản trị hiện có.'], related: ['kpi-manager','smart-timetable','chatbot'], aliases: [] },
  'gesture-class': { role: 'teaching', example: 'Gợi ý hoạt động tương tác bằng tay về phân số cho lớp 5.', steps: ['Chọn chủ đề và mức độ.', 'Chuẩn bị câu hỏi, phương án và đáp án; duyệt nội dung.', 'Kiểm tra camera và tổ chức hoạt động trong GestureClass.'], related: ['question-studio','plicker'], aliases: ['gestureclass','cu chi tay'] },
  'question-studio': { role: 'assessment', example: 'Soạn 10 câu hỏi Toán 8 có đáp án và giải thích.', steps: ['Chọn mục tiêu, lớp và dạng câu hỏi.', 'Tạo dự thảo câu hỏi, kiểm tra đáp án và thang điểm.', 'Nhập câu hỏi đã duyệt vào ngân hàng; dùng luồng chuyển đề hiện có.'], related: ['exam-manager','gesture-class'], aliases: ['trac nghiem 10 dang','ngan hang cau hoi','question studio'] },
  'lucky-draw': { role: 'teaching', example: 'Gợi ý cách dùng vòng quay để ôn bài công bằng.', steps: ['Chuẩn bị danh sách hoặc nội dung quay.', 'Đặt quy tắc lượt tham gia công bằng.', 'Chạy vòng quay và kiểm tra kết quả trên ứng dụng.'], related: ['lucky-draw-cards','secret-box'], aliases: ['vong quay','may man'] },
  'lucky-draw-cards': { role: 'teaching', example: 'Tạo 12 nội dung thẻ ôn tập về số thập phân.', steps: ['Chọn chủ đề và số thẻ.', 'Rà soát nội dung và độ khó.', 'Nhập thẻ rồi tổ chức bốc thẻ trong lớp.'], related: ['lucky-draw','question-studio'], aliases: ['boc the','the tuong tac'] },
  plicker: { role: 'assessment', example: 'Thiết kế 5 câu hỏi A–D để kiểm tra nhanh cuối tiết.', steps: ['Soạn câu hỏi và đáp án A–D.', 'Kiểm tra danh sách lớp và mã thẻ trong Plicker.', 'Quét thẻ, kiểm tra phản hồi và xuất kết quả theo quyền.'], related: ['question-studio','exam-manager'], aliases: ['plicker','the plicker'] },
  'learning-wall': { role: 'assessment', example: 'Soạn rubric nhận xét bài giải phương trình, không dùng dữ liệu cá nhân.', steps: ['Xác định tiêu chí đánh giá và mục tiêu bài tập.', 'Mở AI chấm/nhận xét riêng trong Tường học tập để xử lý bài có quyền truy cập.', 'Giáo viên xác minh kết quả, căn cứ lỗi và duyệt trước khi công bố.'], related: ['question-studio','chatbot'], aliases: ['tuong hoc tap','truy goc loi','learning wall'] },
  'head-shake-game': { role: 'teaching', example: 'Soạn 8 câu nhận định đúng sai về kiến thức Tin học 6.', steps: ['Tạo nhận định ngắn, không mơ hồ.', 'Kiểm tra đáp án và điều kiện nhận diện camera.', 'Nhập câu hỏi vào trò chơi, thử trước khi sử dụng.'], related: ['question-studio','gesture-class'], aliases: ['lac dau','chon dap an'] },
  chatbot: { role: 'teaching', example: 'Lập dàn ý kế hoạch bài dạy tích hợp năng lực số.', steps: ['Chọn công cụ AI Giáo viên theo mục tiêu.', 'Dùng mô-đun chuyên biệt để xử lý Word, KHGD hoặc dự thảo SKKN.', 'Duyệt nội dung và căn cứ thật trước khi xuất.'], related: ['question-studio','learning-wall'], aliases: ['ai giao vien','giao an','nang luc so','skkn'] },
  'exam-manager': { role: 'assessment', example: 'Lập ma trận đề kiểm tra Toán 8 theo ba mức độ.', steps: ['Xác định yêu cầu cần đạt, ma trận, thời gian và thang điểm.', 'Tạo đề nháp trong ngân hàng câu hỏi hoặc quản lý kỳ thi.', 'Kiểm tra quyền, danh sách và đáp án; giáo viên quyết định công bố, chấm hoặc sửa điểm.'], related: ['question-studio','excel-merger'], aliases: ['quan ly ky thi','de thi','kiem tra','ky thi'] },
  'kpi-manager': { role: 'operations', example: 'Lập danh sách căn cứ cần chuẩn bị trước khi tự đánh giá KPI.', steps: ['Đọc tiêu chí đang áp dụng trong đơn vị.', 'Chuẩn bị minh chứng và điểm dự kiến dựa trên dữ liệu thật.', 'Nhập, xét duyệt và xuất Excel theo đúng quyền hiện có.'], related: ['excel-merger','chatbot'], aliases: ['edukpi','kpi'] },
  'secret-box': { role: 'teaching', example: 'Soạn bộ 9 câu hỏi cho trò chơi mở ô bí mật.', steps: ['Chọn từ khóa bí mật và các câu hỏi.', 'Duyệt đáp án, điểm và quy tắc chơi.', 'Nhập cấu hình trò chơi, chạy thử trước giờ học.'], related: ['question-studio','lucky-draw'], aliases: ['mo o bi mat','o bi mat'] },
  'drag-drop-game': { role: 'teaching', example: 'Gợi ý bài kéo thả nhãn trên sơ đồ cấu tạo máy tính.', steps: ['Chọn sơ đồ hoặc hình ảnh có quyền sử dụng.', 'Liệt kê nhãn, vị trí và đáp án.', 'Đặt vị trí trong công cụ kéo thả rồi thử nghiệm.'], related: ['gesture-class','question-studio'], aliases: ['keo tha','keo tha dung cho'] },
  'excel-merger': { role: 'documents', example: 'Hướng dẫn chuẩn hóa cột khi gộp nhiều bảng Excel.', steps: ['Sao lưu bản gốc; đối chiếu tên cột và kiểu dữ liệu.', 'Chọn tệp trong công cụ Excel, kiểm tra trang tính và tiêu đề.', 'Gộp, đối chiếu số dòng và tải bản kết quả.'], related: ['pdf-merger','kpi-manager'], aliases: ['gop excel','excel','bang tinh'] },
  'pdf-merger': { role: 'documents', example: 'Hướng dẫn tách trang PDF và đặt tên file theo thứ tự.', steps: ['Xác định thứ tự tệp hoặc khoảng trang cần tách.', 'Kiểm tra trang và sao lưu trước khi xử lý.', 'Tách/gộp cục bộ; kiểm tra số trang và tải kết quả.'], related: ['excel-merger','chatbot'], aliases: ['tach pdf','gop pdf','pdf'] },
  'smart-timetable': { role: 'operations', example: 'Kiểm tra ràng buộc và đề xuất cách xử lý xung đột lịch.', steps: ['Mở trợ lý thời khóa biểu với dữ liệu hiện hành.', 'Nhập lệnh rõ giáo viên/lớp, ngày và tiết; kiểm tra bản xem trước.', 'Xác nhận ràng buộc, xếp lại và kiểm toán độc lập trước khi công bố.'], related: ['kpi-manager','chatbot'], aliases: ['thoi khoa bieu','xep lich','tkb'] },
};
export const AGENT_APP_IDS: AgentAppId[] = [...ECOSYSTEM_APPLICATIONS.map(app => app.id), 'smart-timetable'];
export const agentAppName = (id: AgentContext) => id === 'desktop' ? 'Edu AI Desktop' : id === 'administration' ? 'Quản trị Edu AI' : id === 'smart-timetable' ? 'Thời khóa biểu' : ECOSYSTEM_APPLICATIONS.find(app => app.id === id)?.name || id;
export function isAgentAppId(value: unknown): value is AgentAppId { return typeof value === 'string' && (AGENT_APP_IDS as string[]).includes(value); }
export function resolveAgentContext(value: string): AgentContext { return value === 'create-exam' ? 'exam-manager' : value === 'admin' ? 'administration' : isAgentAppId(value) ? value : 'desktop'; }
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').trim();
export function buildAgentPlan(request: string, context: AgentContext, role: AgentRole) {
  const input = ' ' + fold(request) + ' ';
  const matched = AGENT_APP_IDS.filter(id => AGENT_PROFILES[id].aliases.some(alias => input.includes(' ' + alias + ' ')));
  const targets = [...new Set<AgentAppId>([...matched, ...(isAgentAppId(context) ? [context] : []), ...AGENT_PROFILES[context].related])].slice(0,5);
  const steps = matched.length ? matched.slice(0,3).flatMap(id => [agentAppName(id) + ': ' + AGENT_PROFILES[id].steps[0]]) : [...AGENT_PROFILES[context].steps];
  return { title: AGENT_ROLES[role].name + ' · Kế hoạch cục bộ', steps, targets, source: 'local' as const };
}
