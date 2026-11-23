import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessExamReadiness, canPublishExam, type ReadinessExam } from '../src/lib/examReadiness.ts';

const base: ReadinessExam = {
  id: 'old-2025-exam', title: 'Đề kiểm tra', teacherId: 'teacher-1', durationMinutes: 45,
  status: 'draft',
  questions: [{ id: 'q1', type: 'multiple_choice', text: '2 + 2 bằng mấy?', options: ['3','4','5'], correctAnswer: 1 }],
};
assert.deepEqual(assessExamReadiness(base), []);
assert.equal(canPublishExam(base), true);
const original = JSON.stringify(base);
assert.equal(assessExamReadiness({ ...base, questions: [] })[0]?.level, 'blocker');
assert.equal(canPublishExam({ ...base, durationMinutes: 0 }), false);
assert.equal(canPublishExam({ ...base, questions: [base.questions[0], base.questions[0]] }), false);
assert.equal(canPublishExam({ ...base, questions: [{ ...base.questions[0], correctAnswer: 99 }] }), false);
assert.equal(canPublishExam({ ...base, questions: [{ ...base.questions[0], options: [''] }] }), false);
assert.equal(canPublishExam({ ...base, title: '  ' }), false);
assert.equal(canPublishExam({ ...base, startTime: 'INVALID' }), false);
assert.equal(canPublishExam({ ...base, questions: [{ id: 'engine', type: 'question_engine', engineQuestion: { payload: { type:'true_false' } } }] }), true);
assert.equal(assessExamReadiness({ ...base, questions: [{ id: 'essay', text: 'Giải thích', type: 'essay' }] })[0]?.level, 'warning');
assert.equal(assessExamReadiness({ ...base, questions: [{ id: 'sa', text: 'Trả lời', type: 'short_answer' }] })[0]?.level, 'warning');
assert.equal(canPublishExam({ ...base, questions: [{ id: 'match', text: 'Ghép nối', type: 'matching', matchingPairs: [{ left:'A', right:'' }] }] }), false);
assert.equal(JSON.stringify(base), original, 'Readiness checks must never rewrite an existing exam.');
const manager = readFileSync(new URL('../src/components/ExamManagerLegacy.tsx', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../src/components/TeacherExamNavigation.tsx', import.meta.url), 'utf8');
for (const name of ['TeacherQuestionBank', 'TeacherExamCalendar', 'TeacherExamAnalytics', 'assessExamReadiness']) {
  assert.ok(manager.includes(name), name + ' must be connected to the teacher workspace.');
}
for (const key of ['overview','exams','calendar','bank','students','monitoring','results','analytics','scanning']) {
  assert.ok(navigation.includes("id: '" + key + "'"), key + ' must have a working navigation destination.');
}
assert.ok(manager.includes('status: \'draft\'') && manager.includes('createSecureExamAccessCode()'));
assert.ok(manager.includes('if (teacherTab === \'results\')'));
assert.ok(manager.includes('if (teacherTab === \'monitoring\')'));
assert.ok(manager.includes('if (teacherTab !== \'exams\')'));
assert.ok(manager.includes('getDocsFromServer('));
assert.ok(manager.includes('sourceExam.questions.find') && manager.includes('copy.id = crypto.randomUUID()'), 'Question reuse must create new question IDs.');
console.info('Teacher exam professional workflow: readiness, old exams and all navigation routes passed.');
