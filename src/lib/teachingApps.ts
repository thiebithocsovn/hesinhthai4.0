export const TEACHING_APPS = [
  {
    "id": "teaching-race",
    "name": "Đua ngẫu nhiên & chia nhóm",
    "tool": "race",
    "description": "Gọi tên, đua về đích và chia nhóm học sinh",
    "dependency": "browser",
    "category": "Trò chơi"
  },
  {
    "id": "teaching-quiz",
    "name": "Thi đấu kiến thức",
    "tool": "quiz",
    "description": "Trắc nghiệm thi đua theo đội, tính điểm",
    "dependency": "browser",
    "category": "Trò chơi"
  },
  {
    "id": "teaching-flash",
    "name": "Thẻ ghi nhớ",
    "tool": "flash",
    "description": "Ôn tập kiến thức bằng thẻ hai mặt",
    "dependency": "browser",
    "category": "Trò chơi"
  },
  {
    "id": "teaching-timer",
    "name": "Đồng hồ đếm ngược",
    "tool": "timer",
    "description": "Đồng hồ quản lý thời gian tiết học",
    "dependency": "browser",
    "category": "Trò chơi"
  },
  {
    "id": "teaching-noise",
    "name": "Quản lý độ ồn",
    "tool": "noise",
    "description": "Đo mức tín hiệu microphone tại thiết bị",
    "dependency": "browser",
    "category": "Trò chơi"
  },
  {
    "id": "teaching-mind",
    "name": "Sơ đồ tư duy",
    "tool": "mind",
    "description": "Tạo chủ đề và các nhánh kiến thức",
    "dependency": "browser",
    "category": "Trò chơi"
  },
  {
    "id": "teaching-words",
    "name": "Tìm từ ẩn",
    "tool": "words",
    "description": "Tạo trò chơi bảng chữ tìm từ",
    "dependency": "browser",
    "category": "Trò chơi"
  },
  {
    "id": "teaching-puzzle",
    "name": "Ghép tranh",
    "tool": "puzzle",
    "description": "Xáo trộn và ghép ảnh học liệu",
    "dependency": "browser",
    "category": "Trò chơi"
  }
] as const;
export type TeachingAppId = typeof TEACHING_APPS[number]['id'];
export const TEACHING_APP_IDS = TEACHING_APPS.map(app=>app.id);
export function isTeachingApp(id: unknown): id is TeachingAppId { return TEACHING_APPS.some(app=>app.id===id); }
export function teachingApp(id: TeachingAppId) { return TEACHING_APPS.find(app=>app.id===id)!; }
export function teachingAppUrl(id: TeachingAppId, base: string) { return base+'teaching-studio/index.html?tool='+encodeURIComponent(teachingApp(id).tool)+'&embedded=1'; }
