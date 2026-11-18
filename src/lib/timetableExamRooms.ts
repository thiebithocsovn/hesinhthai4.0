export interface ExamCandidate { id: string; name: string; className: string }
export interface ExamRoom { id: string; name: string; capacity: number }
export interface ExamSeat { candidateId: string; roomId: string; seat: number }
export interface TimetableExamPlan { name: string; seed: number; candidates: ExamCandidate[]; rooms: ExamRoom[]; seats: ExamSeat[]; warnings: string[] }

export function parseExamCandidates(raw: string): ExamCandidate[] {
  const rows = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return rows.map((row, i) => {
    const values = row.split(/[|;\t]/).map(x => x.trim());
    if (values.length < 3 || !values[0] || !values[1] || !values[2]) throw new Error(`Dòng ${i + 1}: cần Mã/SBD | Họ tên | Lớp.`);
    return { id: values[0], name: values[1], className: values[2] };
  });
}

/** Deterministic seating by a recorded seed; capacity and exact coverage are verified before returning. */
export function allocateExamRooms(candidates: ExamCandidate[], rooms: ExamRoom[], seed = 2026, name = 'Danh sách phòng thi'): TimetableExamPlan {
  if (!candidates.length || !rooms.length) throw new Error('Cần danh sách thí sinh và ít nhất một phòng.');
  if (new Set(candidates.map(x => x.id)).size !== candidates.length) throw new Error('Mã/SBD thí sinh bị trùng.');
  if (new Set(rooms.map(x => x.id)).size !== rooms.length || rooms.some(x => !Number.isInteger(x.capacity) || x.capacity < 1)) throw new Error('Mỗi phòng cần mã riêng và sức chứa nguyên dương.');
  if (rooms.reduce((sum, x) => sum + x.capacity, 0) < candidates.length) throw new Error('Tổng số chỗ của các phòng nhỏ hơn số thí sinh.');
  const hash = (id: string) => { let h = seed | 0; for (const char of id) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return h >>> 0; };
  const classGroups = new Map<string, ExamCandidate[]>();
  for (const candidate of candidates) { const group = classGroups.get(candidate.className) || []; group.push(candidate); classGroups.set(candidate.className, group); }
  const groups = [...classGroups.values()].map(group => [...group].sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id)));
  const interleaved: ExamCandidate[] = [];
  while (groups.some(x => x.length)) for (const group of groups.sort((a, b) => b.length - a.length)) if (group.length) interleaved.push(group.shift()!);
  const seats: ExamSeat[] = [], used = new Map(rooms.map(r => [r.id, 0]));
  for (const candidate of interleaved) {
    const available = rooms.filter(r => used.get(r.id)! < r.capacity).sort((a, b) => used.get(a.id)! - used.get(b.id)! || a.name.localeCompare(b.name, 'vi'));
    const room = available[0]; const seat = used.get(room.id)! + 1; used.set(room.id, seat); seats.push({ candidateId: candidate.id, roomId: room.id, seat });
  }
  const plan = { name, seed, candidates, rooms, seats, warnings: [] as string[] };
  const errors = verifyExamRoomPlan(plan); if (errors.length) throw new Error(errors.join(' '));
  for (const room of rooms) {
    const inRoom = seats.filter(x => x.roomId === room.id).sort((a, b) => a.seat - b.seat);
    const byId = new Map(candidates.map(x => [x.id, x]));
    const adjacent = inRoom.filter((seat, i) => i > 0 && byId.get(seat.candidateId)?.className === byId.get(inRoom[i - 1].candidateId)?.className).length;
    if (adjacent) plan.warnings.push(`${room.name}: ${adjacent} cặp số thứ tự liền nhau cùng lớp; rà soát trước khi chốt sơ đồ chỗ ngồi.`);
  }
  return plan;
}

export function verifyExamRoomPlan(plan: TimetableExamPlan): string[] {
  const errors: string[] = [], ids = new Set(plan.candidates.map(x => x.id)), seats = new Set<string>(), seen = new Set<string>();
  for (const seat of plan.seats) {
    const room = plan.rooms.find(r => r.id === seat.roomId);
    if (!ids.has(seat.candidateId) || seen.has(seat.candidateId)) errors.push('Thí sinh thiếu trong danh sách hoặc được xếp lặp.');
    if (!room || !Number.isInteger(seat.seat) || seat.seat < 1 || seat.seat > room.capacity) errors.push('Vị trí vượt sức chứa phòng.');
    const key = `${seat.roomId}:${seat.seat}`; if (seats.has(key)) errors.push('Trùng chỗ ngồi.'); seats.add(key); seen.add(seat.candidateId);
  }
  if (seen.size !== ids.size || plan.seats.length !== plan.candidates.length) errors.push('Chưa xếp đúng một chỗ cho mỗi thí sinh.');
  return [...new Set(errors)];
}
