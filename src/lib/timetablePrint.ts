import type { TimetableScenario, TimetableSolution } from './smartTimetable';
import { auditTimetableSolution } from './smartTimetableAudit';
import { timetableViewRows, type TimetableResourceView } from './timetableView';
export type TimetablePrintMode = TimetableResourceView;
const escapeHtml = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function timetablePrintHtml(s: TimetableScenario, solution: TimetableSolution, mode: TimetablePrintMode, resourceId: string): string {
  const resources = mode === 'class' ? s.classes : mode === 'teacher' ? s.teachers : s.rooms;
  const selected = resourceId === '*' ? resources : resources.filter(x => x.id === resourceId);
  if (!selected.length) throw new Error('Chưa chọn lớp/giáo viên/phòng cần in.');
  const audit = auditTimetableSolution(s, solution), valid = audit.valid && audit.complete;
  const sections = selected.map(resource => {
    const rows = timetableViewRows(s, solution, mode, resource.id);
    return '<section><h1>' + escapeHtml(s.name) + '</h1><h2>THỜI KHÓA BIỂU · ' + escapeHtml(resource.name) + '</h2>' + (!valid ? '<p class="notice">BẢN NHÁP — chưa đủ điều kiện công bố. Kiểm tra độc lập phát hiện ' + audit.errors.length + ' vấn đề.</p>' : '') + '<table><thead><tr>' + rows[0].map(x => '<th>' + escapeHtml(x) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map(row => '<tr>' + row.map((cell, i) => i === 0 ? '<th>' + escapeHtml(cell) + '</th>' : '<td>' + escapeHtml(cell).replace(/\n/g, '<br>') + '</td>').join('') + '</tr>').join('') + '</tbody></table><p class="meta">AITHEROVA Smart Timetable · ' + escapeHtml(new Date().toLocaleString('vi-VN')) + ' · ' + (valid ? 'Đã qua kiểm tra độc lập' : 'Bản nháp') + '</p></section>';
  }).join('');
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thời khóa biểu AITHEROVA</title><style>@page{size:A4 landscape;margin:10mm}body{font:12px Arial,sans-serif;color:#111827;padding:4px}h1{text-align:center;font-size:21px;margin:8px 0}h2{text-align:center;font-size:15px;margin:4px 0 18px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #94a3b8;padding:7px;vertical-align:top;text-align:center}th{background:#eff6ff}td{height:58px;line-height:1.7;font-size:10px}.notice{padding:10px;background:#fff7ed;border:1px solid #fdba74}.meta{color:#64748b;font-size:10px;text-align:right}section{break-after:page;margin-bottom:30px}section:last-child{break-after:auto}@media print{button{display:none}section{margin:0}}</style></head><body>' + sections + '<button onclick="window.print()">In / Lưu PDF</button></body></html>';
}
export function printTimetableView(s: TimetableScenario, solution: TimetableSolution, mode: TimetablePrintMode, resourceId: string): void {
  const html = timetablePrintHtml(s, solution, mode, resourceId), printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên và thử lại.');
  printWindow.opener = null; printWindow.document.open(); printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); printWindow.setTimeout(() => printWindow.print(), 350);
}
