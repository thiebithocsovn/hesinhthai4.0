import { useSyncExternalStore } from 'react';

// Shared catalog for the teacher/admin "Thư viện tương tác" showcase.
// Cards rendered by AdminDashboard and by the standalone library portals all
// read the same category and search state, so filtering stays consistent.

export type LibraryCategory = 'games' | 'ai' | 'assessment' | 'tools';
export type LibraryFilter = 'all' | LibraryCategory;
export type LibraryArtKey =
  | 'gesture' | 'wheel' | 'cards' | 'plicker' | 'wall' | 'head-shake' | 'robot'
  | 'exam' | 'chest' | 'drag-drop' | 'excel' | 'pdf' | 'quiz' | 'timetable';

export interface LibraryEntry {
  id: string;
  title: string;
  category: LibraryCategory;
  art: LibraryArtKey;
  badge: string;
  footer: string;
  from: string;
  to: string;
  dark?: boolean;
  search: string;
}

export const LIBRARY_CATEGORIES: { id: LibraryFilter; label: string; emoji: string }[] = [
  { id: 'all', label: 'Tất cả', emoji: '' },
  { id: 'games', label: 'Trò chơi lớp học', emoji: '🎮' },
  { id: 'ai', label: 'Công nghệ AI', emoji: '🤖' },
  { id: 'assessment', label: 'Đánh giá & Quản lý', emoji: '✅' },
  { id: 'tools', label: 'Tiện ích', emoji: '🧰' },
];

const BROWSER = 'Không cần cài đặt';
const CLOUD = 'Lưu trên đám mây';
const LOCAL = 'Xử lý ngay trên máy';

export const LIBRARY_ENTRIES: Record<string, LibraryEntry> = {
  'gesture-class': { id: 'gesture-class', title: 'GestureClass', category: 'ai', art: 'gesture', badge: '✋ Điều khiển bằng tay', footer: BROWSER, from: '#e3ecff', to: '#c7d7ff', search: 'quản lý lớp ngân hàng câu hỏi trắc nghiệm cử chỉ lật thẻ gọi tên học sinh' },
  'lucky-draw': { id: 'lucky-draw', title: 'Vòng quay may mắn', category: 'games', art: 'wheel', badge: '🎯 Gọi tên ngẫu nhiên', footer: BROWSER, from: '#fff1c9', to: '#ffd47e', search: 'vòng quay ngẫu nhiên hứng thú hoạt động trên lớp' },
  'lucky-draw-cards': { id: 'lucky-draw-cards', title: 'Bốc thẻ', category: 'games', art: 'cards', badge: '🃏 Hiệu ứng lật thẻ', footer: BROWSER, from: '#7b5ce6', to: '#4b33b8', dark: true, search: 'bốc thẻ ngẫu nhiên lật thẻ điều khiển cử chỉ' },
  plicker: { id: 'plicker', title: 'Tương tác thẻ Plicker', category: 'assessment', art: 'plicker', badge: '📷 Quét bằng camera', footer: CLOUD, from: '#d6f5e4', to: '#9fe3c0', search: 'đánh giá trắc nghiệm nhanh thẻ mã qr plicker' },
  'learning-wall': { id: 'learning-wall', title: 'Tường học tập Ai', category: 'ai', art: 'wall', badge: '✨ AI phân tích bài làm', footer: CLOUD, from: '#ffe0dc', to: '#ffb9b0', search: 'tường học tập lớp học học sinh chấm điểm thư mục padlet bảng' },
  'head-shake-game': { id: 'head-shake-game', title: 'Trò chơi lắc đầu chọn đáp án', category: 'games', art: 'head-shake', badge: '🙆 Chơi bằng camera', footer: BROWSER, from: '#fff4cc', to: '#ffe08a', search: 'gật đầu lắc đầu chọn đáp án camera trò chơi' },
  chatbot: { id: 'chatbot', title: 'AI Giáo viên', category: 'ai', art: 'robot', badge: '🤖 Trợ lý AI', footer: 'AI Google Gemini', from: '#dcecff', to: '#b5d4ff', search: 'chatbot ai giáo viên giáo án năng lực số tâm lý học đường phụ huynh' },
  'kpi-manager': { id: 'kpi-manager', title: 'EduKPI AI', category: 'assessment', art: 'exam', badge: '📊 KPI viên chức', footer: CLOUD, from: '#e2e8ff', to: '#bac8ff', search: 'kpi viên chức tự chấm điểm giáo viên hàng tháng tổ chuyên môn xếp loại trường học' },
  'create-exam': { id: 'create-exam', title: 'Tạo kì thi', category: 'assessment', art: 'exam', badge: '⏱️ Thi trực tuyến', footer: CLOUD, from: '#d9f6ef', to: '#a8e8d8', search: 'tạo kì thi kiểm tra trực tuyến đề thi quản lý' },
  'secret-box': { id: 'secret-box', title: 'Mở ô bí mật', category: 'games', art: 'chest', badge: '🎁 Chơi theo đội', footer: BROWSER, from: '#fff0d6', to: '#ffd59e', search: 'ô bí mật phần thưởng câu hỏi trò chơi đội' },
  'drag-drop-game': { id: 'drag-drop-game', title: 'Kéo thả đúng chỗ', category: 'games', art: 'drag-drop', badge: '🧩 Kéo thả trực quan', footer: BROWSER, from: '#dff6fb', to: '#aee6f2', search: 'kéo thả đáp án vị trí hình ảnh văn bản bản đồ' },
  'excel-merger': { id: 'excel-merger', title: 'Gộp file Excel', category: 'tools', art: 'excel', badge: '⚡ Tiết kiệm thời gian', footer: LOCAL, from: '#dcf5dd', to: '#a9e2ad', search: 'gộp file excel bảng tính dữ liệu' },
  'pdf-merger': { id: 'pdf-merger', title: 'Tách, gộp file PDF', category: 'tools', art: 'pdf', badge: '✂️ Tách & gộp trang', footer: LOCAL, from: '#ffe3e6', to: '#ffbcc4', search: 'tách gộp file pdf trang' },
  'question-studio': { id: 'question-studio', title: 'Trắc nghiệm 10 dạng', category: 'assessment', art: 'quiz', badge: '🔟 10 dạng câu hỏi', footer: BROWSER, from: '#ece6ff', to: '#cfc2ff', search: 'trắc nghiệm 10 dạng ngân hàng câu hỏi question engine' },
  'smart-timetable': { id: 'smart-timetable', title: 'Xếp thời khóa biểu thông minh', category: 'tools', art: 'timetable', badge: '🧠 Tự động xếp lịch', footer: 'Tiểu học + THCS', from: '#e6ebff', to: '#c3cdfb', search: 'xếp thời khóa biểu lịch liên cấp tiểu học thcs giáo viên phòng học' },
};

export const LIBRARY_COUNTS: Record<LibraryFilter, number> = (() => {
  const counts: Record<LibraryFilter, number> = { all: 0, games: 0, ai: 0, assessment: 0, tools: 0 };
  for (const entry of Object.values(LIBRARY_ENTRIES)) { counts.all += 1; counts[entry.category] += 1; }
  return counts;
})();

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

export interface LibraryFilterState { filter: LibraryFilter; query: string }
let state: LibraryFilterState = { filter: 'all', query: '' };
const listeners = new Set<() => void>();

export function setLibraryFilter(patch: Partial<LibraryFilterState>): void {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLibraryFilter(): LibraryFilterState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function libraryEntryVisible(entry: LibraryEntry, current: LibraryFilterState): boolean {
  if (current.filter !== 'all' && entry.category !== current.filter) return false;
  const query = fold(current.query);
  if (!query) return true;
  return fold(`${entry.title} ${entry.badge} ${entry.search}`).includes(query);
}

export function visibleLibraryCount(current: LibraryFilterState): number {
  return Object.values(LIBRARY_ENTRIES).filter(entry => libraryEntryVisible(entry, current)).length;
}
