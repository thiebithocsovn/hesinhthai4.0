import { activeTimetableDays, analyzeTimetableScenario, parseTimetableSlot, TIMETABLE_DAYS, timetableSlotKey, type TeachingAssignment, type TimetableScenario } from './smartTimetable.js';
import { classResourceAtoms, assignmentTeacherIds } from './smartTimetableResources.js';
import { classPeriodInterval, scenarioForTeachingWeek, sessionForPeriod } from './timetableEducation.js';

export interface TimetableConstraintAlert {
  code: string;
  message: string;
  remedy: string;
  pageId: string;
}

type Occupied = { assignmentId: string; start: number; end: number; description: string };
const readable = (items: { id: string; name: string }[], id: string) => items.find(item => item.id === id)?.name || id;

/**
 * Deterministic, read-only preflight. Fixed lessons are checked BEFORE solving,
 * including groups, co-teachers and real clock overlap across education levels.
 * A successful preflight is not proof that a complete timetable is feasible.
 */
export function collectTimetableConstraintAlerts(input: TimetableScenario): TimetableConstraintAlert[] {
  const scenario = scenarioForTeachingWeek(input);
  const alerts: TimetableConstraintAlert[] = [];
  const seen = new Set<string>();
  const add = (code: string, message: string, remedy: string, pageId = 'curriculum') => {
    const key = code + ':' + message;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push({ code, message, remedy, pageId });
  };
  for (const message of analyzeTimetableScenario(input)) {
    const isCapacity = /cần \d+ tiết|quá tải|vượt tải|ô khả dụng|số tiết\/ngày/i.test(message);
    add('PREFLIGHT', message, isCapacity
      ? 'Điều chỉnh số tiết, giảm giờ bận hoặc tăng số ngày/tiết khả dụng.'
      : 'Kiểm tra lại phân công, phòng, tiết cố định và các quy tắc đã khai báo.', 'analysis');
  }

  const days = activeTimetableDays(scenario).length;
  const occupied = new Map<string, Occupied[]>();
  const checkOccupied = (kind: string, id: string, name: string, day: number, start: number, end: number, a: TeachingAssignment, description: string) => {
    const key = kind + ':' + id + ':' + day;
    const previous = occupied.get(key) || [];
    for (const other of previous) if (start < other.end && other.start < end) {
      add('FIXED_COLLISION', 'Trùng ' + name + ' tại ' + TIMETABLE_DAYS[day] + ': ' + other.description + ' và ' + description + '.',
        'Chuyển ít nhất một tiết cố định sang thời gian khác hoặc điều chỉnh phân công đồng giảng.');
    }
    previous.push({ assignmentId: a.id, start, end, description });
    occupied.set(key, previous);
  };

  for (const a of scenario.assignments) {
    const block = a.blockSize || 1;
    const classroom = scenario.classes.find(item => item.id === a.classId);
    const subject = readable(scenario.subjects, a.subjectId);
    const description = (classroom?.name || a.classId) + ' / ' + subject;
    for (const [index, fixed] of (a.fixedStartSlots || []).entries()) {
      const slot = parseTimetableSlot(fixed);
      const size = Math.min(block, a.periodsPerWeek - index * block);
      if (size <= 0) continue; // Excess fixed starts are reported by the base preflight.
      if (!slot || slot.dayIndex < 0 || slot.dayIndex >= days || slot.period < 1 || slot.period + size - 1 > scenario.periodsPerDay) {
        add('FIXED_OUT_OF_RANGE', description + ': ô cố định ' + fixed + ' nằm ngoài ngày/tiết có thể xếp.',
          'Chọn lại ngày, tiết bắt đầu; bảo đảm toàn bộ block nằm trong một ngày.');
        continue;
      }
      const firstSession = sessionForPeriod(scenario, slot.period);
      if (a.session && a.session !== 'any' && firstSession !== a.session) {
        add('FIXED_WRONG_SESSION', description + ': ô cố định ' + fixed + ' không thuộc buổi đã chọn.',
          'Đổi buổi học hoặc đặt lại tiết cố định vào đúng buổi.');
      }
      if (sessionForPeriod(scenario, slot.period + size - 1) !== firstSession) {
        add('FIXED_CROSSES_SESSION', description + ': block ' + size + ' tiết tại ' + fixed + ' cắt qua hai buổi học.',
          'Dời tiết bắt đầu để toàn bộ block nằm trong cùng một buổi.');
      }
      for (let offset = 0; offset < size; offset++) {
        const period = slot.period + offset;
        const at = timetableSlotKey(slot.dayIndex, period);
        if ((a.forbiddenSlots || []).includes(at)) add('FIXED_FORBIDDEN', description + ': tiết cố định ' + at + ' cũng nằm trong danh sách tiết cấm.',
          'Bỏ tiết cấm này hoặc thay đổi tiết cố định.');
        for (const teacherId of assignmentTeacherIds(a)) {
          const teacher = scenario.teachers.find(item => item.id === teacherId);
          if (teacher?.unavailableSlots?.includes(at)) add('TEACHER_UNAVAILABLE', description + ': ' + teacher.name + ' bận tại ' + TIMETABLE_DAYS[slot.dayIndex] + ' tiết ' + period + '.',
            'Chọn tiết khác hoặc sửa giờ bận của giáo viên.', 'teacher-session');
        }
        const relevantClasses = [a.classId, ...(a.additionalClassIds || [])];
        for (const classId of relevantClasses) {
          const item = scenario.classes.find(value => value.id === classId);
          if (item?.unavailableSlots?.includes(at)) add('CLASS_UNAVAILABLE', description + ': lớp ' + item.name + ' nghỉ tại ' + TIMETABLE_DAYS[slot.dayIndex] + ' tiết ' + period + '.',
            'Chọn tiết khác hoặc sửa giờ nghỉ của lớp.', 'breaks');
        }
        const room = scenario.rooms.find(item => item.id === a.roomId);
        if (room?.unavailableSlots?.includes(at)) add('ROOM_UNAVAILABLE', description + ': phòng ' + room.name + ' không khả dụng tại ' + TIMETABLE_DAYS[slot.dayIndex] + ' tiết ' + period + '.',
          'Đổi phòng hoặc sửa lịch không khả dụng của phòng.', 'room-availability');

        // A real-clock interval avoids falsely flagging teachers who teach
        // different education levels in non-overlapping periods with the same index.
        const interval = classPeriodInterval(scenario, classroom?.level || 'THCS', period);
        if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.end <= interval.start) continue;
        for (const id of assignmentTeacherIds(a)) checkOccupied('teacher', id, 'giáo viên ' + readable(scenario.teachers, id), slot.dayIndex, interval.start, interval.end, a, description);
        for (const atom of classResourceAtoms(scenario, a)) checkOccupied('class', atom, 'lớp/nhóm ' + atom, slot.dayIndex, interval.start, interval.end, a, description);
        if (a.roomId) checkOccupied('room', a.roomId, 'phòng ' + readable(scenario.rooms, a.roomId), slot.dayIndex, interval.start, interval.end, a, description);
      }
    }
  }
  return alerts;
}
