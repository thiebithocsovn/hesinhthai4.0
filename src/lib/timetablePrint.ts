import { activeTimetableDays, type ScheduleEntry, type TimetableScenario, type TimetableSolution } from './smartTimetable';
import { auditTimetableSolution } from './smartTimetableAudit';

export type TimetablePrintMode = 'class' | 'teacher' | 'room';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Print the selected timetable with a browser-native "Save as PDF" option. */
export function printTimetableView(
  scenario: TimetableScenario,
  solution: TimetableSolution,
  mode: TimetablePrintMode,
  resourceId: string,
): void {
  const groups = mode === 'class' ? scenario.classes : mode === 'teacher' ? scenario.teachers : scenario.rooms;
  const resource = groups.find(item => item.id === resourceId);
  if (!resource) throw new Error('Chưa chọn lớp/giáo viên/phòng cần in.');
  const days = activeTimetableDays(scenario);
  const teachers = new Map(scenario.teachers.map(item => [item.id, item.name]));
  const classes = new Map(scenario.classes.map(item => [item.id, item.name]));
  const subjects = new Map(scenario.subjects.map(item => [item.id, item.name]));
  const rooms = new Map(scenario.rooms.map(item => [item.id, item.name]));
  const entries = solution.entries.filter((entry: ScheduleEntry) =>
    mode === 'class' ? entry.classId === resourceId : mode === 'teacher' ? entry.teacherId === resourceId : entry.roomId === resourceId);
  const audit = auditTimetableSolution(scenario, solution);
  const header = mode === 'class' ? 'Lớp' : mode === 'teacher' ? 'Giáo viên' : 'Phòng';
  const lines: string[] = [];
  for (let period = 1; period <= scenario.periodsPerDay; period++) {
    const cells = days.map((_, day) => {
      const entry = entries.find(item => item.dayIndex === day && item.period === period);
      if (!entry) return '<td class="blank"></td>';
      const lines = [
        subjects.get(entry.subjectId) || entry.subjectId,
        mode === 'class' ? (teachers.get(entry.teacherId) || entry.teacherId) : (classes.get(entry.classId) || entry.classId),
        entry.roomId ? (rooms.get(entry.roomId) || entry.roomId) : '',
      ].filter(Boolean);
      return '<td>' + lines.map((value, index) => index === 0 ? '<strong>' + escapeHtml(value) + '</strong>' : '<small>' + escapeHtml(value) + '</small>').join('') + '</td>';
    });
    lines.push('<tr><th>Tiết ' + period + '</th>' + cells.join('') + '</tr>');
  }
  const valid = audit.valid && audit.complete;
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên và thử lại.');
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thời khóa biểu - ' +
    escapeHtml(resource.name) + '</title><style>' +
    '@page{size:A4 landscape;margin:12mm}body{font:14px Arial,sans-serif;color:#111827;padding:4px}' +
    'h1{text-align:center;font-size:22px;margin:8px 0}h2{text-align:center;font-size:16px;margin:4px 0 18px}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #94a3b8;padding:8px;vertical-align:top;text-align:center}' +
    'th{background:#eff6ff}td{height:64px}td strong{display:block;margin-bottom:4px;font-size:12px}small{display:block;font-size:10px;color:#334155}' +
    '.notice{padding:10px 12px;margin:12px 0;background:#fff7ed;border:1px solid #fdba74;font-size:12px}' +
    '.meta{margin-top:16px;color:#475569;font-size:11px;text-align:right}@media print{button{display:none}}' +
    '</style></head><body><h1>' + escapeHtml(scenario.name) + '</h1><h2>THỜI KHÓA BIỂU · ' + escapeHtml(header) + ' ' +
    escapeHtml(resource.name) + '</h2>' +
    (!valid ? '<p class="notice">BẢN NHÁP — còn ' + audit.errors.length + ' vấn đề được bộ kiểm toán độc lập phát hiện. Chưa đủ điều kiện công bố.</p>' : '') +
    '<table><thead><tr><th>Tiết</th>' + days.map(day => '<th>' + escapeHtml(day) + '</th>').join('') + '</tr></thead><tbody>' +
    lines.join('') + '</tbody></table><p class="meta">Tạo từ AITHEROVA Smart Timetable · ' +
    escapeHtml(new Date().toLocaleString('vi-VN')) + ' · ' + (valid ? 'Đã qua kiểm toán độc lập' : 'Bản nháp') +
    '</p><button onclick="window.print()">In / Lưu PDF</button></body></html>');
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 350);
}
