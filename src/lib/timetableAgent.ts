import {
  TIMETABLE_DAYS,
  activeTimetableDays,
  timetableSlotKey,
  type TimetableScenario,
  type TimetableSolution,
} from './smartTimetable';
import { assignmentClassIds } from './smartTimetableResources';

export interface TimetableAgentProposal {
  status: 'ready' | 'information' | 'unsupported';
  title: string;
  details: string[];
  nextScenario?: TimetableScenario;
  affectedSlots: string[];
  requiresReschedule: boolean;
}

/**
 * Local, deterministic Vietnamese-language command interpreter.
 *
 * It never calls a language model, never writes to a database, and never
 * changes the caller's timetable. Every mutation is proposed for approval.
 * Unsupported or ambiguous requests deliberately do not change data.
 */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findNamed<T extends { id: string; name: string }>(text: string, items: T[]): T | null {
  const matches = items.filter(item => {
    const needle = fold(item.name);
    if (!needle || needle.length < 2) return false;
    return (' ' + text + ' ').includes(' ' + needle + ' ');
  }).sort((a, b) => fold(b.name).length - fold(a.name).length);
  if (!matches.length) return null;
  if (matches.length > 1 && fold(matches[0].name).length === fold(matches[1].name).length) return null;
  return matches[0];
}

function parseDay(text: string, daysPerWeek: number): number | null {
  const match = text.match(/(?:^| )(?:thu|t)\s*(hai|ba|tu|bon|nam|sau|bay|[2-7])(?: |$)/);
  if (!match) return null;
  const value = match[1];
  const index = ({ hai: 0, ba: 1, tu: 2, bon: 2, nam: 3, sau: 4, bay: 5, '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5 } as Record<string, number>)[value];
  return index < daysPerWeek ? index : null;
}

function identifySlots(text: string, scenario: TimetableScenario): { dayIndex: number; slots: string[] } | null {
  const dayIndex = parseDay(text, activeTimetableDays(scenario).length);
  if (dayIndex === null) return null;
  const explicitPeriod = text.match(/(?:tiet|t)\s*(\d{1,2})(?: |$)/);
  const periods = explicitPeriod ? [Number(explicitPeriod[1])] :
    /(?:^| )buoi sang(?: |$)|(?:^| )sang(?: |$)/.test(text)
      ? Array.from({ length: scenario.morningPeriods || 5 }, (_, i) => i + 1)
      : /(?:^| )buoi chieu(?: |$)|(?:^| )chieu(?: |$)/.test(text)
        ? Array.from({ length: scenario.periodsPerDay - (scenario.morningPeriods || 5) }, (_, i) => i + (scenario.morningPeriods || 5) + 1)
        : Array.from({ length: scenario.periodsPerDay }, (_, i) => i + 1);
  if (!periods.length || periods.some(period => !Number.isInteger(period) || period < 1 || period > scenario.periodsPerDay)) return null;
  return { dayIndex, slots: periods.map(period => timetableSlotKey(dayIndex, period)) };
}

function hasWord(text: string, words: string[]): boolean {
  return words.some(word => (' ' + text + ' ').includes(' ' + word + ' '));
}

export function planTimetableAgentCommand(
  command: string,
  scenario: TimetableScenario,
  solution: TimetableSolution | null,
): TimetableAgentProposal {
  const text = fold(command);
  const empty = (title: string, details: string[], status: 'information' | 'unsupported' = 'unsupported'): TimetableAgentProposal =>
    ({ status, title, details, affectedSlots: [], requiresReschedule: false });
  if (!text) return empty('Chưa có yêu cầu', ['Hãy nhập một yêu cầu bằng tiếng Việt.']);
  const namedTeacher = findNamed(text, scenario.teachers), namedSubject = findNamed(text, scenario.subjects);
  const maximum = text.match(/toi da (\d{1,2})/);
  if (maximum && namedTeacher && /ngay/.test(text) && /day/.test(text)) {
    const value = Number(maximum[1]);
    if (value < 1 || value > activeTimetableDays(scenario).length) return empty('Số ngày không hợp lệ', ['Số ngày dạy phải nằm trong tuần học đã cấu hình.']);
    return { status: 'ready', title: `${namedTeacher.name} dạy tối đa ${value} ngày/tuần`, details: ['Ràng buộc cứng. Giữ nguyên các giờ bận hiện có.', 'Chỉ áp dụng sau khi xác nhận; cần xếp lại lịch.'], nextScenario: { ...scenario, teachers: scenario.teachers.map(t => t.id === namedTeacher.id ? { ...t, maxTeachingDays: value } : t) }, affectedSlots: [], requiresReschedule: true };
  }
  if (maximum && namedSubject && /lop/.test(text) && /dong thoi|cung luc/.test(text)) {
    const value = Number(maximum[1]); if (value < 1) return empty('Giới hạn không hợp lệ', ['Số lớp đồng thời phải lớn hơn 0.']);
    return { status: 'ready', title: `${namedSubject.name}: tối đa ${value} lớp đồng thời`, details: ['Tiết ghép được tính theo số lớp tham gia.', 'Chỉ áp dụng sau khi xác nhận; cần xếp lại lịch.'], nextScenario: { ...scenario, subjects: scenario.subjects.map(subject => subject.id === namedSubject.id ? { ...subject, maxConcurrentClasses: value } : subject) }, affectedSlots: [], requiresReschedule: true };
  }

  if (hasWord(text, ['thong ke', 'bao cao', 'kiem tra', 'chan doan', 'vi sao', 'giai thich'])) {
    const missing = solution?.diagnostics.unscheduled.reduce((sum, item) => sum + item.remaining, 0) ?? null;
    const conflicts = solution?.diagnostics.hardConflicts.length ?? null;
    return empty('Phân tích thời khóa biểu hiện tại', [
      'Tổng số phân công: ' + scenario.assignments.length + '. Tổng số tiết yêu cầu: ' + scenario.assignments.reduce((sum, item) => sum + item.periodsPerWeek, 0) + '.',
      solution ? 'Đã xếp: ' + solution.entries.length + ' tiết; chưa xếp: ' + missing + '; xung đột được bộ giải ghi nhận: ' + conflicts + '.' : 'Chưa có thời khóa biểu. Hãy bấm “Xếp tự động” để tạo phương án.',
      ...(solution?.diagnostics.unscheduled.slice(0, 3).map(item => item.assignmentId + ': ' + item.reason) || []),
    ], 'information');
  }

  const unlock = hasWord(text, ['mo khoa', 'bo khoa', 'bo cam', 'cho phep', 'xoa han che', 'xoa gio ban']);
  const lock = hasWord(text, ['nghi', 'ban', 'khong hoc', 'khong day', 'cam', 'khoa', 'tranh']);
  if (!unlock && !lock) return empty('Yêu cầu chưa được hỗ trợ tự động', [
    'Có thể yêu cầu: “Cô Hương nghỉ thứ Ba tiết 2”, “Phòng Tin học bận sáng thứ Tư”, “Lớp 6A không học Toán thứ Sáu tiết 5”, “Mở khóa Cô Hương thứ Ba tiết 2”, hoặc “Thống kê thời khóa biểu”.',
    'AI Agent chỉ đề xuất thay đổi rõ nghĩa; những yêu cầu khác cần người xếp lịch thao tác trực tiếp.',
  ]);
  const times = identifySlots(text, scenario);
  if (!times) return empty('Thiếu ngày hoặc tiết hợp lệ', ['Vui lòng ghi rõ “thứ Hai” đến “thứ Sáu” (hoặc thứ Bảy nếu trường học 6 ngày), kèm “tiết 2”, “sáng”, “chiều” hoặc cả ngày.']);

  const classroom = findNamed(text, scenario.classes);
  const teacher = findNamed(text, scenario.teachers);
  const room = findNamed(text, scenario.rooms);
  const subject = findNamed(text, scenario.subjects);
  const classIntent = hasWord(text, ['lop']);
  const roomIntent = hasWord(text, ['phong']);
  const teacherIntent = hasWord(text, ['giao vien', 'thay', 'co', 'gv']);
  const named = [
    ...(classIntent && classroom ? [{ kind: 'class' as const, id: classroom.id, name: classroom.name }] : []),
    ...(roomIntent && room ? [{ kind: 'room' as const, id: room.id, name: room.name }] : []),
    ...(teacherIntent && teacher ? [{ kind: 'teacher' as const, id: teacher.id, name: teacher.name }] : []),
  ];

  if (named.length !== 1) return empty('Chưa xác định được chính xác đối tượng', [
    'Nêu rõ một giáo viên, lớp hoặc phòng có tên đúng trong danh mục. Ví dụ: “Giáo viên Cô Hương nghỉ thứ Ba tiết 2”.',
    'Một lệnh chỉ thay đổi một đối tượng, nhằm tránh khóa nhầm toàn trường.',
  ]);

  const target = named[0];
  const subjectConstraint = target.kind === 'class' && subject && hasWord(text, ['mon', 'khong hoc', 'cam', 'tranh']);
  if (subjectConstraint && subject) {
    const assignments = scenario.assignments.filter(item => assignmentClassIds(item).includes(target.id) && item.subjectId === subject.id);
    if (!assignments.length) return empty('Không tìm thấy phân công môn học', ['Lớp ' + target.name + ' chưa có phân công môn ' + subject.name + '.']);
    const nextAssignments = scenario.assignments.map(item => {
      if (!assignments.some(match => match.id === item.id)) return item;
      const previous = item.forbiddenSlots || [];
      const forbiddenSlots = unlock ? previous.filter(slot => !times.slots.includes(slot)) : [...new Set([...previous, ...times.slots])];
      return { ...item, forbiddenSlots };
    });
    const changed = nextAssignments.some((item, i) => JSON.stringify(item.forbiddenSlots || []) !== JSON.stringify(scenario.assignments[i].forbiddenSlots || []));
    if (!changed) return empty('Không có thay đổi mới', ['Những ô này đã ở đúng trạng thái yêu cầu.'], 'information');
    return {
      status: 'ready',
      title: (unlock ? 'Gỡ hạn chế môn ' : 'Cấm môn ') + subject.name + ' · lớp ' + target.name,
      details: [
        'Ngày: ' + TIMETABLE_DAYS[times.dayIndex] + '. ' + times.slots.length + ' tiết bị tác động.',
        'Đây là ràng buộc cứng trên phân công, cần xếp lại thời khóa biểu để áp dụng.',
        'Chưa thay đổi dữ liệu. Chỉ áp dụng khi bấm “Xác nhận thay đổi”.',
      ],
      nextScenario: { ...scenario, assignments: nextAssignments },
      affectedSlots: times.slots,
      requiresReschedule: true,
    };
  }

  const collection = target.kind === 'teacher' ? 'teachers' : target.kind === 'class' ? 'classes' : 'rooms';
  const resources = scenario[collection];
  const oldResource = resources.find(item => item.id === target.id);
  const previous = oldResource?.unavailableSlots || [];
  const unavailableSlots = unlock ? previous.filter(slot => !times.slots.includes(slot)) : [...new Set([...previous, ...times.slots])];
  if (JSON.stringify(previous) === JSON.stringify(unavailableSlots)) return empty('Không có thay đổi mới', ['Những ô này đã ở đúng trạng thái yêu cầu.'], 'information');
  const nextScenario: TimetableScenario = {
    ...scenario,
    teachers: collection === 'teachers' ? scenario.teachers.map(item => item.id === target.id ? { ...item, unavailableSlots } : item) : scenario.teachers,
    classes: collection === 'classes' ? scenario.classes.map(item => item.id === target.id ? { ...item, unavailableSlots } : item) : scenario.classes,
    rooms: collection === 'rooms' ? scenario.rooms.map(item => item.id === target.id ? { ...item, unavailableSlots } : item) : scenario.rooms,
  };
  return {
    status: 'ready',
    title: (unlock ? 'Gỡ khóa ' : 'Khóa giờ ') + target.name,
    details: [
      TIMETABLE_DAYS[times.dayIndex] + ': ' + times.slots.length + ' tiết; ' + (unlock ? 'gỡ khóa' : 'không được xếp lịch') + '.',
      'Cần xếp lại sau khi xác nhận để tìm lịch hợp lệ mới. Các tiết đã khóa có thể khiến bài toán vô nghiệm.',
      'Chưa thay đổi dữ liệu. Chỉ áp dụng khi bấm “Xác nhận thay đổi”.',
    ],
    nextScenario,
    affectedSlots: times.slots,
    requiresReschedule: true,
  };
}
