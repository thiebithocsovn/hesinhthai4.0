import * as XLSX from 'xlsx';
import { activeTimetableDays, type TimetableScenario, type TimetableSolution } from './smartTimetable';
import { auditTimetableSolution } from './smartTimetableAudit';
import { assignmentClassIds } from './smartTimetableResources';
import { timetableViewRows, type TimetableResourceView } from './timetableView';

export function createTimetableWorkbook(s: TimetableScenario, solution: TimetableSolution): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new(), used = new Set<string>();
  const add = (label: string, sheet: XLSX.WorkSheet) => {
    const base = label.replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Sheet'; let name = base, index = 2;
    while (used.has(name.toLocaleLowerCase('vi'))) { const suffix = ` ${index++}`; name = base.slice(0, 31 - suffix.length) + suffix; }
    used.add(name.toLocaleLowerCase('vi')); XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  const audit = auditTimetableSolution(s, solution);
  add('Tong hop', XLSX.utils.aoa_to_sheet([
    ['TRƯỜNG', s.name], ['Trạng thái', audit.valid && audit.complete ? 'Đã kiểm tra độc lập' : 'BẢN NHÁP - CHƯA ĐỦ ĐIỀU KIỆN CÔNG BỐ'], ['Ngày xuất', new Date().toLocaleString('vi-VN')], ['Ngày học/tuần', activeTimetableDays(s).length], ['Tổng tiết phân công', audit.expectedPeriods], ['Đã xếp', audit.placedPeriods], ['Số lỗi độc lập', audit.errors.length], ...audit.errors.map(error => ['Lỗi', error]), [], ['Lớp', 'Cấp', 'Số tiết có mặt trên lịch'], ...s.classes.map(c => [c.name, c.level, new Set(solution.entries.filter(e => assignmentClassIds(e).includes(c.id)).map(e => `${e.dayIndex}:${e.period}`)).size]),
  ]));
  const append = (kind: TimetableResourceView, prefix: string, items: { id: string; name: string }[]) => items.forEach(item => { const sheet = XLSX.utils.aoa_to_sheet(timetableViewRows(s, solution, kind, item.id)); sheet['!cols'] = [{ wch: 8 }, ...activeTimetableDays(s).map(() => ({ wch: 35 }))]; add(`${prefix} ${item.name}`, sheet); });
  append('class', 'Lop', s.classes); append('teacher', 'GV', s.teachers); append('room', 'Phong', s.rooms);
  const named = (items: { id: string; name: string }[], id?: string) => items.find(x => x.id === id)?.name || '';
  add('Phan cong', XLSX.utils.json_to_sheet(s.assignments.map(a => ({ 'Lớp': named(s.classes, a.classId), 'Lớp ghép': (a.additionalClassIds || []).map(id => named(s.classes, id)).join('; '), 'Môn': named(s.subjects, a.subjectId), 'Giáo viên': named(s.teachers, a.teacherId), 'Đồng giảng': (a.additionalTeacherIds || []).map(id => named(s.teachers, id)).join('; '), 'Nhóm': named(s.studentGroups || [], a.studentGroupId), 'Nhóm ghép': (a.additionalStudentGroupIds || []).map(id => { const g = s.studentGroups?.find(x => x.id === id); return g ? `${named(s.classes, g.classId)}:${g.name}` : ''; }).join('; '), 'Sĩ số': s.classes.find(c => c.id === a.classId)?.studentCount, 'Sĩ số nhóm': s.studentGroups?.find(g => g.id === a.studentGroupId)?.studentCount, 'Sức chứa': s.rooms.find(r => r.id === a.roomId)?.capacity, 'Phòng': named(s.rooms, a.roomId), 'Cơ sở': named(s.campuses || [], a.campusId), 'Tiết/tuần': a.periodsPerWeek, 'Tối đa/ngày': a.maxPerDay, 'Tiết đôi': a.blockSize || 1, 'Buổi': a.session === 'morning' ? 'Sáng' : a.session === 'afternoon' ? 'Chiều' : 'Bất kỳ', 'Tiết cố định': (a.fixedStartSlots || []).join(';'), 'Tiết cấm': (a.forbiddenSlots || []).join(';') }))));
  return workbook;
}
