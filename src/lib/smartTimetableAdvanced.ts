import { classDailyLimit, classPeriodInterval, entryInterval, entryTimeAtoms, normalBreak, sessionForPeriod, teachingGap, travelMinimum } from './timetableEducation.js';
import type { ScheduleEntry, TeachingAssignment, TimetableScenario, TimetableSolution } from './smartTimetable.js';
import { advancedScenarioIssues, assignmentCampus, assignmentClassIds, assignmentStudentCount, assignmentStudentGroupIds, assignmentTeacherIds, classResourceAtoms, timetableMetrics } from './smartTimetableResources.js';

import { week12PlacementProblems, week12SoftPenalty } from './timetableWeek12.js';

interface Unit { assignment: TeachingAssignment; index: number; size: number; fixed?: { day: number; period: number }; locked?: ScheduleEntry[]; parallel?: string }
interface Bundle { units: Unit[]; domain: { day: number; period: number }[]; priority: number }
interface State { entries: ScheduleEntry[]; occupied: Set<string>; teacherDays: Map<string, Set<number>>; periods: Map<string, Set<number>>; locations: Map<string, ScheduleEntry[]>; subjects: Map<string, Set<string>>; anchors: Map<string, string> }

const key = (day: number, period: number) => `${day}:${period}`;
const randomGenerator = (seed: number) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };

/** Bounded constraint search for multi-resource lessons. It never reports a proof of optimality/infeasibility. */
export function optimizeAdvancedTimetable(s: TimetableScenario, lockedEntries: ScheduleEntry[], requestedIterations: number, configurationIssues: string[] = []): TimetableSolution {
  const days = s.daysPerWeek === 7 ? 7 : s.daysPerWeek === 6 ? 6 : 5, morning = s.morningPeriods ?? Math.min(5, s.periodsPerDay);
  const issues = [...configurationIssues, ...advancedScenarioIssues(s)];
  const teachers = new Map(s.teachers.map(x => [x.id, x])), classes = new Map(s.classes.map(x => [x.id, x])), rooms = new Map(s.rooms.map(x => [x.id, x]));
  const assignments = new Map(s.assignments.map(x => [x.id, x]));
  const sameGroups = (s.lessonGroups || []).filter(g => g.kind === 'same-session');
  const parallelGroups = (s.lessonGroups || []).filter(g => g.kind === 'parallel');
  const units: Unit[] = [];
  for (const a of s.assignments) {
    if (!classes.has(a.classId) || !teachers.has(a.teacherId) || !s.subjects.some(x => x.id === a.subjectId) || (a.roomId && !rooms.has(a.roomId))) { issues.push(`Phân công ${a.id} thiếu tài nguyên.`); continue; }
    const size = a.blockSize || 1;
    for (let remaining = a.periodsPerWeek, index = 0; remaining > 0; index++) {
      const unit: Unit = { assignment: a, index, size: Math.min(size, remaining), parallel: parallelGroups.find(g => g.assignmentIds.includes(a.id))?.id };
      const fixed = a.fixedStartSlots?.[index];
      if (fixed) { const match = /^(\d+):(\d+)$/.exec(fixed); if (match) unit.fixed = { day: Number(match[1]), period: Number(match[2]) }; else issues.push(`Ô cố định không hợp lệ: ${fixed}.`); }
      units.push(unit); remaining -= unit.size;
    }
  }
  const lockedGroups = new Map<string, ScheduleEntry[]>();
  for (const e of lockedEntries) {
    if (!assignments.has(e.assignmentId)) { issues.push(`Tiết khóa ${e.id} mất phân công.`); continue; }
    const id = `${e.assignmentId}:${e.blockId || e.id}`;
    lockedGroups.set(id, [...(lockedGroups.get(id) || []), e]);
  }
  for (const members of lockedGroups.values()) {
    const arranged = [...members].sort((a, b) => a.period - b.period);
    const first = arranged[0];
    const source = assignments.get(first.assignmentId)!;
    if (arranged.some(e => e.classId !== source.classId || e.teacherId !== source.teacherId || e.subjectId !== source.subjectId || (e.roomId || '') !== (source.roomId || '') || JSON.stringify(assignmentClassIds(e).sort()) !== JSON.stringify(assignmentClassIds(source).sort()) || JSON.stringify(assignmentTeacherIds(e).sort()) !== JSON.stringify(assignmentTeacherIds(source).sort()) || JSON.stringify(assignmentStudentGroupIds(e).sort()) !== JSON.stringify(assignmentStudentGroupIds(source).sort()) || (e.campusId || '') !== assignmentCampus(s, source))) { issues.push(`Tiết khóa ${first.id} không khớp phân công.`); continue; }
    const unit = units.find(u => u.assignment.id === first.assignmentId && !u.locked && u.size === members.length && (first.meetingIndex === undefined || first.meetingIndex === u.index) && (!u.fixed || u.fixed.day === first.dayIndex && u.fixed.period === first.period));
    if (!unit || arranged.some((e, i) => e.dayIndex !== first.dayIndex || e.period !== first.period + i)) { issues.push(`Block khóa không hợp lệ: ${first.blockId || first.id}.`); continue; }
    unit.locked = arranged; unit.fixed = { day: first.dayIndex, period: first.period };
  }

  const bundleMap = new Map<string, Unit[]>();
  for (const u of units) { const id = u.parallel ? `parallel:${u.parallel}:${u.index}` : `${u.assignment.id}:${u.index}`; bundleMap.set(id, [...(bundleMap.get(id) || []), u]); }

  const makeEntries = (bundle: Pick<Bundle, 'units'>, day: number, period: number): ScheduleEntry[] => bundle.units.flatMap(u => Array.from({ length: u.size }, (_, offset) => ({
    id: u.locked?.[offset]?.id || `adv-${u.assignment.id}-${u.index}-${offset + 1}`,
    assignmentId: u.assignment.id, classId: u.assignment.classId, subjectId: u.assignment.subjectId, teacherId: u.assignment.teacherId,
    roomId: u.assignment.roomId, additionalClassIds: u.assignment.additionalClassIds || [], additionalTeacherIds: u.assignment.additionalTeacherIds || [],
    studentGroupId: u.assignment.studentGroupId, additionalStudentGroupIds: u.assignment.additionalStudentGroupIds || [], campusId: assignmentCampus(s, u.assignment) || undefined,
    dayIndex: day, period: period + offset, blockId: u.locked?.[offset]?.blockId || `adv-${u.assignment.id}-${u.index}`,
    meetingIndex: u.index, parallelEventId: u.parallel ? `${u.parallel}:${u.index}` : undefined,
    locked: Boolean(u.locked) || Boolean(u.assignment.fixedStartSlots?.[u.index]), fixed: Boolean(u.assignment.fixedStartSlots?.[u.index]),
  })));

  const freshState = (): State => ({ entries: [], occupied: new Set(), teacherDays: new Map(), periods: new Map(), locations: new Map(), subjects: new Map(), anchors: new Map() });
  const resources = (e: ScheduleEntry): string[] => [...classResourceAtoms(s, e).map(id => `class:${id}`), ...assignmentTeacherIds(e).map(id => `teacher:${id}`), ...(e.roomId ? [`room:${e.roomId}`] : [])];
  const add = (state: State, entries: ScheduleEntry[]) => {
    for (const e of entries) {
      state.entries.push(e);
      for (const r of resources(e)) {
        for (const atom of entryTimeAtoms(s, e)) state.occupied.add(`${r}:${key(e.dayIndex, atom)}`);
        const locationKey = `${r}:${e.dayIndex}`;
        state.locations.set(locationKey, [...(state.locations.get(locationKey) || []), e]);
      }
      for (const id of assignmentTeacherIds(e)) {
        const teachingDays = state.teacherDays.get(id) || new Set<number>(); teachingDays.add(e.dayIndex); state.teacherDays.set(id, teachingDays);
      }
      for (const id of [...assignmentTeacherIds(e).map(id => `teacher:${id}`), ...assignmentClassIds(e).map(id => `class:${id}`), `assignment:${e.assignmentId}`]) {
        const daily = `${id}:${e.dayIndex}`, values = state.periods.get(daily) || new Set<number>(); values.add(entryInterval(s, e).start); state.periods.set(daily, values);
      }
      for (const atom of entryTimeAtoms(s, e)) {
        const subjectKey = `${e.subjectId}:${key(e.dayIndex, atom)}`, subjectClasses = state.subjects.get(subjectKey) || new Set<string>();
        assignmentClassIds(e).forEach(id => subjectClasses.add(id)); state.subjects.set(subjectKey, subjectClasses);
      }
      for (const g of sameGroups.filter(g => g.assignmentIds.includes(e.assignmentId))) state.anchors.set(`${g.id}:${e.meetingIndex}`, `${e.dayIndex}:${sessionForPeriod(s, e.period)}`);
    }
  };
  const compatible = (state: State, bundle: Bundle, day: number, period: number): boolean => {
    const proposed = makeEntries(bundle, day, period), localBusy = new Set<string>(), localPeriods = new Map<string, Set<number>>(), localSubjects = new Map<string, Set<string>>(), localAnchors = new Map<string, string>();
    for (const u of bundle.units) {
      const a = u.assignment, end = period + u.size - 1;
      if (u.fixed && (day !== u.fixed.day || period !== u.fixed.period)) return false;
      if (end > s.periodsPerDay || sessionForPeriod(s, period) !== sessionForPeriod(s, end) || a.session && a.session !== 'any' && sessionForPeriod(s, period) !== a.session) return false;
      const room = rooms.get(a.roomId || '');
      if (room?.capacity && assignmentStudentCount(s, a) > room.capacity) return false;
      for (const g of sameGroups.filter(g => g.assignmentIds.includes(a.id))) {
        const groupKey = `${g.id}:${u.index}`, value = `${day}:${sessionForPeriod(s, period)}`;
        if ((state.anchors.has(groupKey) && state.anchors.get(groupKey) !== value) || (localAnchors.has(groupKey) && localAnchors.get(groupKey) !== value)) return false;
        localAnchors.set(groupKey, value);
      }
    }
    for (const e of proposed) {
      const a = assignments.get(e.assignmentId)!;
      const slot = key(day, e.period);
      if (a.forbiddenSlots?.includes(slot)) return false;
      if ([...assignmentClassIds(a).map(id => classes.get(id)), ...assignmentTeacherIds(a).map(id => teachers.get(id)), rooms.get(a.roomId || '')].some(x => x?.unavailableSlots?.includes(slot))) return false;
      const atoms = entryTimeAtoms(s, e), time = entryInterval(s, e);
      if (!atoms.length) return false;
      for (const id of assignmentClassIds(a)) {
        const level = classes.get(id)?.level;
        if (!level) return false;
        const other = classPeriodInterval(s, level, e.period);
        if (other.start !== time.start || other.end !== time.end) return false;
      }
      for (const r of resources(e)) {
        for (const atom of atoms) {
          const occupiedKey = `${r}:${key(day, atom)}`;
          if (state.occupied.has(occupiedKey) || localBusy.has(occupiedKey)) return false;
          localBusy.add(occupiedKey);
        }
        if (r.startsWith('room:')) continue;
        for (const previous of state.locations.get(`${r}:${day}`) || []) if (previous.campusId && e.campusId && previous.campusId !== e.campusId && teachingGap(s, previous, e) < travelMinimum(s)) return false;
      }
      for (const id of [...assignmentTeacherIds(a).map(id => `teacher:${id}`), ...assignmentClassIds(a).map(id => `class:${id}`), `assignment:${a.id}`]) {
        const daily = `${id}:${day}`, values = localPeriods.get(daily) || new Set(state.periods.get(daily) || []); values.add(entryInterval(s, e).start); localPeriods.set(daily, values);
        const kind = id.slice(0, id.indexOf(':')), resourceId = id.slice(id.indexOf(':') + 1);
        const teacher = kind === 'teacher' ? teachers.get(resourceId) : undefined;
        const limit = teacher?.maxPeriodsPerDay || (kind === 'class' ? classDailyLimit(s, classes.get(resourceId)) : kind === 'assignment' ? a.maxPerDay || a.blockSize || 1 : undefined);
        if (limit && values.size > limit) return false;
        if (teacher?.maxTeachingDays && new Set([...(state.teacherDays.get(teacher.id) || []), day]).size > teacher.maxTeachingDays) return false;
        if (teacher?.maxConsecutivePeriods && !s.education) {
          let previous = -10, streak = 0;
          for (const p of [...values].sort((a, b) => a - b)) { streak = p === previous + 1 ? streak + 1 : 1; if (streak > teacher.maxConsecutivePeriods) return false; previous = p; }
        }
      }
      const limit = s.subjects.find(x => x.id === e.subjectId)?.maxConcurrentClasses;
      if (limit) for (const atom of atoms) {
        const subjectKey = `${e.subjectId}:${key(day, atom)}`, subjectClasses = localSubjects.get(subjectKey) || new Set(state.subjects.get(subjectKey) || []);
        assignmentClassIds(a).forEach(id => subjectClasses.add(id)); localSubjects.set(subjectKey, subjectClasses);
        if (subjectClasses.size > limit) return false;
      }
    }
    if (s.education) {
      for (const teacher of s.teachers.filter(t => t.maxConsecutivePeriods)) {
        const intervals = [...state.entries, ...proposed].filter(e => e.dayIndex === day && assignmentTeacherIds(e).includes(teacher.id)).map(e => entryInterval(s, e)).sort((a,b) => a.start - b.start);
        let streak = 0, end = -100;
        for (const t of intervals) { streak = t.start - end <= normalBreak(s) ? streak + 1 : 1; if (streak > teacher.maxConsecutivePeriods!) return false; end = t.end; }
      }
      for (const group of parallelGroups) {
        const members = proposed.filter(e => group.assignmentIds.includes(e.assignmentId));
        const signatures = new Set(members.map(e => `${e.period}:${entryInterval(s, e).start}:${entryInterval(s, e).end}`));
        if (signatures.size !== new Set(members.map(e => e.period)).size) return false;
      }
    }
    // Travel also applies between simultaneous bundle members at different campuses.
    for (let i = 0; i < proposed.length; i++) for (let j = i + 1; j < proposed.length; j++) {
      const a = proposed[i], b = proposed[j];
      if (!a.campusId || !b.campusId || a.campusId === b.campusId) continue;
      if (resources(a).some(r => !r.startsWith('room:') && resources(b).includes(r)) && teachingGap(s, a, b) < travelMinimum(s)) return false;
    }
    if (week12PlacementProblems(s, state.entries, proposed).length) return false;
    return true;
  };

  const empty = freshState();
  const bundles: Bundle[] = [...bundleMap.values()].map(members => {
    const bundle: Bundle = { units: members, domain: [], priority: members.some(u => u.fixed) ? 1e5 : members.length * 100 + members.filter(u => sameGroups.some(g => g.assignmentIds.includes(u.assignment.id))).length * 80 };
    for (let day = 0; day < days; day++) for (let p = 1; p <= s.periodsPerDay; p++) if (compatible(empty, bundle, day, p)) bundle.domain.push({ day, period: p });
    return bundle;
  });
  for (const bundle of bundles) if (!bundle.domain.length && bundle.units.some(u => u.fixed)) issues.push(`Tiết cố định/khóa của ${bundle.units.map(u => u.assignment.id).join(', ')} không thể giữ nguyên.`);
  const result = (entries: ScheduleEntry[]): TimetableSolution => {
    const unscheduled = s.assignments.map(a => ({ assignmentId: a.id, remaining: Math.max(0, a.periodsPerWeek - entries.filter(e => e.assignmentId === a.id).length), reason: 'Chưa tìm được vị trí thỏa ràng buộc tài nguyên, nhóm học và cơ sở trong giới hạn tìm kiếm. Có thể tăng khung giờ hoặc xem lại ràng buộc.' })).filter(x => x.remaining);
    const quality = timetableMetrics(s, entries);
    return { entries, teachingWeek: s.education?.activeWeek, generatedAt: new Date().toISOString(), score: unscheduled.reduce((sum, x) => sum + x.remaining, 0) * 100000 + issues.length * 1000000 + quality.teacherGaps * 14 + quality.classGaps * 5 + quality.lateCorePeriods * 18 + quality.dailyImbalance * 3,
      diagnostics: { hardConflicts: [...new Set(issues)], preflight: [...new Set(issues)], unscheduled, teacherGaps: quality.teacherGaps, quality, warnings: ['Bộ tìm kiếm ràng buộc trên thiết bị; kết quả không phải chứng nhận tối ưu toàn cục.', ...(unscheduled.length ? ['Phương án chưa đủ tiết. Chưa đủ điều kiện công bố.'] : [])] } };
  };
  if (issues.length) return result([]);
  const penalty = (state: State, bundle: Bundle, day: number, p: number, random: () => number) => {
    let score = random() * 5;
    for (const u of bundle.units) {
      const a = u.assignment, subject = s.subjects.find(x => x.id === a.subjectId);
      if (subject?.preferMorning && p > morning) score += 28;
      if ((subject?.avoidLastPeriod || a.avoidLastPeriod) && p + u.size - 1 === s.periodsPerDay) score += 22;
      if (a.preferredSlots?.length && !a.preferredSlots.some(slot => slot === key(day, p))) score += 8;
      for (const id of assignmentTeacherIds(a)) {
        const teacher = teachers.get(id);
        if (teacher?.preferredSlots?.length && !Array.from({ length: u.size }, (_, offset) => key(day, p + offset)).some(slot => teacher.preferredSlots!.includes(slot))) score += 5;
        const existing = state.periods.get(`teacher:${id}:${day}`);
        if (existing?.size) score += Math.max(0, Math.min(...[...existing].map(value => Math.abs((s.education ? entryInterval(s, { classId: a.classId, period: p }).start : p) - value) / (s.education ? 50 : 1))) - 1) * 10 - 5;
      }
      score += (state.periods.get(`class:${a.classId}:${day}`)?.size || 0) * 2;
    }
    score += week12SoftPenalty(s, state.entries, makeEntries(bundle, day, p));
    return score;
  };
  let best = result([]);
  const attempts = Math.max(2, Math.min(24, Math.floor(requestedIterations / 5), Math.ceil(1800 / Math.max(1, bundles.length))));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const random = randomGenerator(20261118 + attempt * 7919), state = freshState();
    const ordered = bundles.map(bundle => ({ bundle, jitter: random() * 3 })).sort((a, b) => b.bundle.priority - a.bundle.priority || a.bundle.domain.length - b.bundle.domain.length || a.jitter - b.jitter);
    for (const { bundle } of ordered) {
      const available = bundle.domain.filter(position => compatible(state, bundle, position.day, position.period)).map(position => ({ ...position, penalty: penalty(state, bundle, position.day, position.period, random) })).sort((a, b) => a.penalty - b.penalty);
      if (available[0]) add(state, makeEntries(bundle, available[0].day, available[0].period));
    }
    const candidate = result(state.entries);
    if (candidate.score < best.score) best = candidate;
  }
  // A bounded backtracking pass repairs small tightly constrained schools/groups.
  if (best.diagnostics.unscheduled.length && bundles.length <= 65) {
    let nodes = 0;
    const budget = Math.min(15000, Math.max(2000, requestedIterations * 40));
    const search = (state: State, pending: Bundle[]): State | null => {
      if (!pending.length) return state;
      if (++nodes > budget) return null;
      let choice: Bundle | undefined, positions: { day: number; period: number }[] = [];
      for (const bundle of pending) {
        const feasible = bundle.domain.filter(pos => compatible(state, bundle, pos.day, pos.period));
        if (!feasible.length) return null;
        if (!choice || feasible.length < positions.length) { choice = bundle; positions = feasible; }
      }
      const random = randomGenerator(nodes + 941);
      const ranks = new Map(positions.map(pos => [pos, penalty(state, choice!, pos.day, pos.period, random)]));
      positions.sort((a, b) => ranks.get(a)! - ranks.get(b)!);
      for (const pos of positions) {
        const next = freshState(); add(next, state.entries); add(next, makeEntries(choice!, pos.day, pos.period));
        const found = search(next, pending.filter(x => x !== choice)); if (found) return found;
        if (nodes > budget) break;
      }
      return null;
    };
    const repaired = search(freshState(), bundles); if (repaired) best = result(repaired.entries);
  }
  return best;
}
