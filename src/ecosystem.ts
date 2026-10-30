export type EcosystemDependency = 'browser' | 'firebase' | 'ai-cloud' | 'ai-server';

export type EcosystemApplicationId =
  | 'gesture-class'
  | 'question-studio'
  | 'lucky-draw'
  | 'lucky-draw-cards'
  | 'plicker'
  | 'learning-wall'
  | 'head-shake-game'
  | 'chatbot'
  | 'exam-manager'
  | 'kpi-manager'
  | 'secret-box'
  | 'drag-drop-game'
  | 'excel-merger'
  | 'pdf-merger';

export interface EcosystemApplication {
  id: EcosystemApplicationId;
  name: string;
  description: string;
  dependency: EcosystemDependency;
  category: 'Cử chỉ' | 'Trò chơi' | 'Đánh giá' | 'Quản lý' | 'Công cụ' | 'AI giáo dục';
}

export const ECOSYSTEM_APPLICATIONS: EcosystemApplication[] = [
  {
    id: 'gesture-class',
    name: 'GestureClass',
    description: 'Quản lý lớp, ngân hàng trắc nghiệm 10 dạng, tổ chức hoạt động và tương tác bằng cử chỉ bàn tay.',
    dependency: 'browser',
    category: 'Cử chỉ',
  },
  {
    id: 'question-studio',
    name: 'Trắc nghiệm 10 dạng',
    description: 'Tạo ngân hàng câu hỏi với 10 dạng trắc nghiệm cơ bản, chấm điểm theo một Question Engine dùng chung và tách dữ liệu theo tài khoản giáo viên.',
    dependency: 'browser',
    category: 'Đánh giá',
  },
  {
    id: 'lucky-draw',
    name: 'Vòng quay may mắn',
    description: 'Chọn học sinh ngẫu nhiên bằng vòng quay, hỗ trợ nhập danh sách và điều khiển bằng camera.',
    dependency: 'browser',
    category: 'Trò chơi',
  },
  {
    id: 'lucky-draw-cards',
    name: 'Bốc thẻ tương tác',
    description: 'Bốc thẻ ngẫu nhiên với hiệu ứng lật thẻ và danh sách học sinh tùy chỉnh.',
    dependency: 'browser',
    category: 'Trò chơi',
  },
  {
    id: 'plicker',
    name: 'Tương tác thẻ Plicker',
    description: 'Soạn câu hỏi, quản lý lớp và nhận diện thẻ qua camera ngay trên thiết bị.',
    dependency: 'firebase',
    category: 'Đánh giá',
  },
  {
    id: 'learning-wall',
    name: 'Tường học tập Ai',
    description: 'Chia sẻ sản phẩm học tập, nhận xét và tổ chức nội dung theo lớp học.',
    dependency: 'firebase',
    category: 'Quản lý',
  },
  {
    id: 'head-shake-game',
    name: 'Lắc đầu chọn đáp án',
    description: 'Trả lời bằng chuyển động đầu; hỗ trợ nhập câu hỏi thủ công và từ Excel.',
    dependency: 'browser',
    category: 'Cử chỉ',
  },
  {
    id: 'chatbot',
    name: 'AI Giáo viên',
    description: 'Phân tích KHGD/PPCT/giáo án DOCX để tích hợp Năng lực số, Năng lực AI, giáo dục hòa nhập và nội dung tổng hợp; giáo viên duyệt trước khi xuất lại Word.',
    dependency: 'ai-cloud',
    category: 'AI giáo dục',
  },
  {
    id: 'kpi-manager',
    name: 'EduKPI AI',
    description: 'Chấm KPI viên chức hằng tháng: giáo viên chỉ nhập điểm, tổ chuyên môn xét duyệt, quản trị nhiều trường và xuất Excel.',
    dependency: 'firebase',
    category: 'Đánh giá',
  },
  {
    id: 'exam-manager',
    name: 'Quản lý kỳ thi',
    description: 'Tạo đề, quản lý lớp, tổ chức thi, theo dõi bài làm và tổng hợp kết quả.',
    dependency: 'firebase',
    category: 'Đánh giá',
  },
  {
    id: 'secret-box',
    name: 'Mở ô bí mật',
    description: 'Tổ chức trò chơi theo đội, mở câu hỏi ẩn và theo dõi điểm số trên lớp.',
    dependency: 'browser',
    category: 'Trò chơi',
  },
  {
    id: 'drag-drop-game',
    name: 'Kéo thả đúng chỗ',
    description: 'Tạo bài tập kéo thả nhãn lên bản đồ, hình ảnh hoặc sơ đồ kiến thức.',
    dependency: 'browser',
    category: 'Trò chơi',
  },
  {
    id: 'excel-merger',
    name: 'Gộp tệp Excel',
    description: 'Gộp dữ liệu từ nhiều bảng tính ngay trên thiết bị mà không tải tệp lên máy chủ.',
    dependency: 'browser',
    category: 'Công cụ',
  },
  {
    id: 'pdf-merger',
    name: 'Tách, gộp file PDF',
    description: 'Tách từng trang, trích khoảng trang hoặc gộp nhiều PDF an toàn ngay trên thiết bị.',
    dependency: 'browser',
    category: 'Công cụ',
  },
];

export const ECOSYSTEM_DEPENDENCY_LABELS: Record<EcosystemDependency, string> = {
  browser: 'Chạy trên trình duyệt',
  firebase: 'Cần dữ liệu Firebase',
  'ai-cloud': 'AI Google Gemini',
  'ai-server': 'Cần máy chủ AI',
};
