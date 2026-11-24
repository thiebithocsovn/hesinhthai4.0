import { questionGroup, type ProgressQuestion } from './examCandidateWorkspace';
export const LEVELS = ['Nhận biết','Thông hiểu','Vận dụng','Vận dụng cao'] as const;
export type CognitiveLevel = typeof LEVELS[number];
export interface BlueprintQuestion extends ProgressQuestion { points?: number; rubric?: readonly { points: number }[] }
export interface RosterStudent { id: string; name: string; classId?: string; teacherId?: string; examId?: string }
export interface RosterClass { id: string; name: string; teacherId?: string }
export interface RoomSeat { studentId: string; seat: number }
export interface RoomPlan { name: string; seats: RoomSeat[] }
export interface ExamOperationsPlan {
  version: 1;
  selectedClassIds: string[];
  capacity: number;
  rooms: RoomPlan[];
  levels: Record<string, CognitiveLevel>;
  updatedAt: string;
}
export function normalizeLevel(value: unknown): CognitiveLevel | undefined {
  return LEVELS.includes(value as CognitiveLevel) ? value as CognitiveLevel : undefined;
}
export function eligibleRoster(students: readonly RosterStudent[], classes: readonly RosterClass[], teacherId: string, classIds: readonly string[]) {
  const allowed = new Set(classes.filter(c => c.teacherId === teacherId && classIds.includes(c.id)).map(c => c.id));
  const seen = new Set<string>();
  return students.filter(s => {
    if (!s.id || s.teacherId !== teacherId || !s.classId || !allowed.has(s.classId) || s.examId || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  }).sort((a,b) => a.name.localeCompare(b.name,'vi') || a.id.localeCompare(b.id));
}
export function makeRooms(students: readonly RosterStudent[], capacity: number): RoomPlan[] {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw new RangeError('Sức chứa phòng phải từ 1 đến 100.');
  if (students.length > 1000) throw new RangeError('Tối đa 1.000 thí sinh trong một kế hoạch.');
  const seen = new Set<string>();
  const rooms: RoomPlan[] = [];
  for (const student of students) {
    if (!student.id || seen.has(student.id)) throw new Error('Danh sách có mã thí sinh thiếu hoặc trùng.');
    seen.add(student.id);
    if (rooms.length === 0 || rooms[rooms.length - 1].seats.length >= capacity) {
      rooms.push({name:'Phòng ' + String(rooms.length + 1).padStart(2,'0'),seats:[]});
    }
    const room = rooms[rooms.length-1];
    room.seats.push({studentId:student.id,seat:room.seats.length+1});
  }
  return rooms;
}
export function blueprintRows<Q extends ProgressQuestion>(questions: readonly Q[], levels: Record<string, CognitiveLevel>, maxPoints: (q: Q)=>number) {
  const groups = new Map<string, { group: string; counts: number[]; points: number; total: number }>();
  for (const question of questions) {
    const group = questionGroup(question);
    const row = groups.get(group) || {group,counts:[0,0,0,0,0],points:0,total:0};
    const index = LEVELS.indexOf(levels[question.id]);
    row.counts[index < 0 ? 4 : index]++;
    row.total++;
    const points = maxPoints(question);
    row.points += Number.isFinite(points) ? points : 0;
    groups.set(group,row);
  }
  return [...groups.values()];
}
export function safeCsvCell(value: unknown): string {
  const str = String(value ?? '').replace(/^[\s]*[=+@-]/u,"'$&");
  return '"' + str.replace(/"/g,'""') + '"';
}
export function buildOperationsCsv(rows: readonly (readonly unknown[])[]): string {
  return '\ufeff' + rows.map(row=>row.map(safeCsvCell).join(',')).join('\r\n');
}
