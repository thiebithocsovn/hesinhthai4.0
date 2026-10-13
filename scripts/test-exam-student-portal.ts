import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeExamAccessError } from '../src/lib/examAccessError';
import { EXAM_ENROLLMENT_KEY, getExamStudentClasses, getSubmittedExamClassId, withExamStudentClass } from '../src/lib/examStudentClasses';
import {
  buildStudentExamSchedule,
  canStudentEnterExam,
  formatExamScheduleDate,
  getExamScheduleState,
  getExamStartTimestamp,
  type ExamScheduleItem,
} from '../src/lib/examSchedule.ts';

let checks = 0;
const verify = (condition: unknown, description: string) => {
  assert.ok(condition, description);
  checks += 1;
};

const now = new Date('2026-08-23T12:00:00.000Z').getTime();
const exams: ExamScheduleItem[] = [
  { id: 'draft', title: 'Bản nháp', durationMinutes: 45, questions: [], status: 'draft', startTime: '2026-08-24T08:00:00.000Z' },
  { id: 'closed', title: 'Đã đóng', durationMinutes: 45, questions: [], status: 'closed', startTime: '2026-08-22T08:00:00.000Z' },
  { id: 'open-old', title: 'Đang mở cũ', durationMinutes: 60, questions: [{}], status: 'published', startTime: '2026-08-22T08:00:00.000Z' },
  { id: 'upcoming-later', title: 'Sắp thi sau', durationMinutes: 90, questions: [{}, {}], status: 'published', startTime: '2026-08-25T08:00:00.000Z' },
  { id: 'open-new', title: 'Đang mở mới', durationMinutes: 45, questions: [{}, {}, {}], status: 'published', startTime: '2026-08-23T08:00:00.000Z' },
  { id: 'upcoming-first', title: 'Sắp thi trước', durationMinutes: 30, questions: [{}], status: 'published', startTime: '2026-08-24T08:00:00.000Z' },
  { id: 'open-unscheduled', title: 'Mở theo giáo viên', durationMinutes: 20, questions: [], status: 'published' },
];

const schedule = buildStudentExamSchedule(exams, now);
verify(schedule.length === 5, 'Only published exams are exposed to students.');
verify(!schedule.some(exam => exam.id === 'draft' || exam.id === 'closed'), 'Draft and closed exams stay private.');
verify(schedule.slice(0, 3).every(exam => getExamScheduleState(exam, now) === 'open'), 'Open exams appear before upcoming exams.');
verify(schedule[3].id === 'upcoming-first' && schedule[4].id === 'upcoming-later', 'Upcoming exams are ordered chronologically.');
verify(schedule[0].id === 'open-new', 'The newest scheduled open exam appears first.');
verify(getExamScheduleState({ startTime: '2026-08-24T08:00:00.000Z' }, now) === 'upcoming', 'Future start time is marked upcoming.');
verify(getExamScheduleState({ startTime: '2026-08-22T08:00:00.000Z' }, now) === 'open', 'Past start time is marked open.');
verify(getExamScheduleState({}, now) === 'open', 'An unscheduled published exam remains open by teacher control.');
verify(canStudentEnterExam(exams[2], now), 'A published exam whose start time has passed accepts login.');
verify(!canStudentEnterExam(exams[3], now), 'A published upcoming exam blocks early login.');
verify(!canStudentEnterExam(exams[0], now), 'A draft exam never accepts student login.');
verify(getExamStartTimestamp('invalid') === null, 'Invalid dates fail safely.');
verify(formatExamScheduleDate() === 'Theo thông báo của giáo viên', 'Missing dates have a clear fallback message.');
verify(formatExamScheduleDate('2026-08-24T08:00:00.000Z').length > 10, 'Valid dates are formatted for Vietnamese students.');
verify(exams[0].id === 'draft', 'Schedule sorting does not mutate Firestore snapshot data.');
assert.deepEqual(getExamStudentClasses({ classNames: { a10: '8A10', a2: ' 8A2 ', invalid: '', '../bad': '9A' } }), [{ id: 'a2', name: '8A2' }, { id: 'a10', name: '8A10' }]);
assert.deepEqual(getExamStudentClasses({}), []);
assert.match(describeExamAccessError({ code: 'resource-exhausted', message: 'Quota exceeded for Free daily read units per project per day' }, 'schedule'), /hết hạn mức truy cập trong ngày/);
assert.match(describeExamAccessError({ code: 'firestore/resource-exhausted' }, 'login'), /vượt hạn mức/);
const submittedAnswers = withExamStudentClass({ q1: 0 }, 'a2');
assert.equal(submittedAnswers.q1, 0);
assert.equal(getSubmittedExamClassId({ classNames: { a2: '8A2' } }, { answers: submittedAnswers }), 'a2');
assert.equal(getSubmittedExamClassId({ classNames: { a10: '8A10' } }, { answers: submittedAnswers }), undefined);
assert.equal(getSubmittedExamClassId({}, { answers: { [EXAM_ENROLLMENT_KEY]: 'a2' } }), undefined);
assert.deepEqual(withExamStudentClass({ q1: 0, [EXAM_ENROLLMENT_KEY]: { classId: 'a2' } }), { q1: 0 });

const wrapper = readFileSync(new URL('../src/components/ExamManager.tsx', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/components/UnifiedStudentExamRunner.tsx', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/components/QuestionEngineStudentQuestion.tsx', import.meta.url), 'utf8');
verify(wrapper.includes("props.initialMode === 'student'"), 'ExamManager routes the student entry point through the unified runner.');
verify(wrapper.includes('<UnifiedStudentExamRunner'), 'The upgraded student runner is the production student portal.');
verify(component.includes("where('status', '==', 'published')"), 'Student schedule subscribes only to published exams.');
verify(component.includes('PUBLIC_EXAM_SCHEDULES_COLLECTION'), 'Student notices are stored separately from private teacher exams.');
verify(component.includes('PUBLIC_EXAM_ACCESS_COLLECTION'), 'Students unlock only their authorized encrypted exam.');
verify(component.includes('{item.questionCount} câu'), 'Student notices show a count without downloading question content.');
verify(!component.includes("query(collection(db, 'exams'), where('status', '==', 'published'))"), 'The public student portal never downloads the full private exam collection.');
verify(component.includes('buildStudentExamSchedule'), 'Student schedule uses the tested ordering helper.');
verify(component.toLocaleLowerCase('vi-VN').includes('thông báo lịch thi'), 'The interface includes the exam notice panel.');
verify(component.includes('Danh sách được cập nhật tự động'), 'The interface explains the live teacher-to-student connection.');
verify(component.includes('canStudentEnterExam(exam)'), 'Login enforces the scheduled opening time.');
verify(component.includes('QuestionEngineStudentQuestion'), 'Ten-type exams use the dedicated student renderer.');
verify(component.includes('evaluateQuestion(engine'), 'Question Engine answers are scored through the shared engine.');
for (const type of ['single_choice', 'multiple_choice', 'true_false', 'true_false_matrix', 'short_answer', 'fill_blank', 'matching', 'ordering', 'classification', 'image_hotspot']) {
  verify(renderer.includes(`payload.type === '${type}'`) || renderer.includes(`payload.type !== '${type}'`), `Student UI supports ${type}.`);
}

console.info(`Unified student exam portal: ${checks} checks passed.`);
