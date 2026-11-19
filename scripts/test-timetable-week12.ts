import assert from 'node:assert/strict';
import { createEducationConfiguration, scenarioForTeachingWeek } from '../src/lib/timetableEducation';
import { planTimetableAgentCommand } from '../src/lib/timetableAgent';
import { enableWeek12Rules, week12PlacementProblems, week12SoftPenalty } from '../src/lib/timetableWeek12';
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
const existingWorkspace: TimetableScenario = { ...scenario, week12TeacherRemaps: { 'biên': 'hồng' } };
assert.equal(scenarioForTeachingWeek(existingWorkspace).assignments.find(a => a.id === 'a-bien')?.teacherId, 'hồng', 'Old saved week-12 remaps remain readable.');
const week11 = { ...existingWorkspace, education: { ...existingWorkspace.education!, activeWeek: 11 } };
assert.equal(scenarioForTeachingWeek(week11).assignments.find(a => a.id === 'a-bien')?.teacherId, 'biên');
const enabled = enableWeek12Rules(existingWorkspace, original);
assert.deepEqual(enabled.errors, []);
assert.equal(JSON.stringify(scenario), old, 'Week-12 rules must not mutate original scenario.');
assert.equal(enabled.next?.week12RulesEnabled, true);
assert.equal(enabled.next?.week12MondayAfternoonSnapshot?.[0]?.period, 6);
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
assert.equal(planTimetableAgentCommand('Thay cô Biên bằng cô Hồng tuần 12', scenario, null).status, 'unsupported', 'Hardcoded one-school teacher switch must not run in commercial mode.');
assert.equal(planTimetableAgentCommand('Áp dụng 10 ràng buộc tuần 12', enabled.next!, null).status, 'ready');
console.log('Week 12: legacy saved remap, frozen Monday afternoon, hard constraints and soft preferences verified.');
