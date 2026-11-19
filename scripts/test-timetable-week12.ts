import assert from 'node:assert/strict';
import { createEducationConfiguration, scenarioForTeachingWeek } from '../src/lib/timetableEducation';
import { planTimetableAgentCommand } from '../src/lib/timetableAgent';
import { enableWeek12Rules, replaceTeacherInWeek12, week12PlacementProblems, week12SoftPenalty } from '../src/lib/timetableWeek12';
import type { ScheduleEntry, TimetableScenario } from '../src/lib/smartTimetable';

const scenario: TimetableScenario = {
  name: 'Trường test - tuần 12', daysPerWeek: 5, periodsPerDay: 10, morningPeriods: 5, afternoonPeriods: 5,
  education: { ...createEducationConfiguration('lower-secondary'), activeWeek: 12 },
  teachers: ['Biên', 'Hồng', 'Huế', 'Cát', 'Hương', 'Tuyết'].map(name => ({
    id: name.toLowerCase(), name: 'Cô ' + name, level: 'THCS' as const,
  })),
  classes: [{ id: '6a', name: '6A', level: 'THCS' }],
  subjects: [{ id: 'toan', name: 'Toán' }, { id: 'van', name: 'Ngữ văn' }, { id: 'gdtc', name: 'GDTC' }],
  rooms: [],
  assignments: [
    { id: 'a-bien', classId: '6a', subjectId: 'van', teacherId: 'biên', periodsPerWeek: 1 },
    { id: 'a-huong', classId: '6a', subjectId: 'toan', teacherId: 'hương', periodsPerWeek: 2, maxPerDay: 2 },
  ],
};
const old = JSON.stringify(scenario);
const entry = (teacherId: string, period: number, dayIndex = 0, subjectId = 'van', assignmentId = 'x'): ScheduleEntry => ({
  id: assignmentId + '-' + teacherId + '-' + dayIndex + '-' + period,
  assignmentId, classId: '6a', subjectId, teacherId, dayIndex, period,
});
const original = { teachingWeek: 12, entries: [entry('biên', 6, 0, 'van', 'a-bien')] };
const replacement = replaceTeacherInWeek12(scenario, 'Biên', 'Hồng', original);
assert.deepEqual(replacement.errors, []);
assert.equal(replacement.count, 1);
assert.equal(replacement.next?.week12TeacherRemaps?.['biên'], 'hồng');
assert.equal(replacement.next?.week12MondayAfternoonSnapshot?.[0]?.period, 6);
assert.equal(JSON.stringify(scenario), old, 'Preview must not edit original scenario.');

assert.equal(scenarioForTeachingWeek(replacement.next!).assignments.find(a => a.id === 'a-bien')?.teacherId, 'hồng');
const week11 = { ...replacement.next!, education: { ...replacement.next!.education!, activeWeek: 11 } };
assert.equal(scenarioForTeachingWeek(week11).assignments.find(a => a.id === 'a-bien')?.teacherId, 'biên');
const enabled = enableWeek12Rules(replacement.next!, null);
assert.deepEqual(enabled.errors, []);
assert.equal(enabled.next?.week12RulesEnabled, true);
assert.deepEqual(scenarioForTeachingWeek(enabled.next!).assignments.find(a => a.id === 'a-bien')?.fixedStartSlots, ['0:6']);
const s = enabled.next!;
const invalid = (entries: ScheduleEntry[]) => week12PlacementProblems(s, [], entries);

assert.ok(invalid([entry('huế', 6, 1)]).some(x => x.includes('chiều thứ Ba')));
assert.ok(invalid([entry('hương', 2, 2, 'toan')]).some(x => x.includes('Hương')));
assert.ok(invalid([entry('tuyết', 2)]).some(x => x.includes('Tuyết')));
assert.ok(invalid([entry('hồng', 4, 0, 'gdtc')]).some(x => x.includes('GDTC')));
assert.ok(invalid([entry('huế', 1), entry('cát', 1)]).some(x => x.includes('Huế')));
assert.ok(invalid([entry('huế', 2), entry('cát', 3)]).some(x => x.includes('liên tục')));
assert.deepEqual(invalid([entry('hương', 2, 0, 'toan'), entry('hương', 3, 0, 'toan')]), []);
assert.ok(invalid([entry('hương', 5, 0, 'toan'), entry('hương', 6, 0, 'toan')]).some(x => x.includes('tiết 5')));
assert.ok(invalid([entry('hồng', 7, 0, 'van', 'a-bien')]).some(x => x.includes('cố định')));
assert.equal(invalid([entry('hồng', 6, 0, 'van', 'a-bien')]).length, 0);
assert.ok(week12SoftPenalty(s, [], [1, 2, 3, 4].map(p => entry('huế', p))) > 0);
assert.equal(planTimetableAgentCommand('Thay cô Biên bằng cô Hồng tuần 12', scenario, null).status, 'ready');
assert.equal(planTimetableAgentCommand('Áp dụng 10 ràng buộc tuần 12', replacement.next!, null).status, 'ready');
console.log('Week 12: teacher swap, frozen Monday afternoon, hard constraints and soft preferences verified.');
