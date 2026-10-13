import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTION_TYPES, createQuestionTemplate } from '../src/lib/questionEngine.ts';
import { createExamFromQuestionBank, isQuestionEngineExamQuestion, toExamQuestion } from '../src/lib/questionExamBridge.ts';

let checks = 0;
const verify = (condition: unknown, description: string) => {
  assert.ok(condition, description);
  checks += 1;
};

const questions = QUESTION_TYPES.map(type => {
  const question = createQuestionTemplate(type);
  question.prompt = `Câu hỏi ${type}`;
  if (question.payload.type === 'image_hotspot') question.payload.imageUrl = 'https://example.edu/image.png';
  return question;
});

const bank = {
  id: 'bank-demo',
  title: 'Bài kiểm tra 10 dạng',
  questions,
};

const exam = createExamFromQuestionBank(bank, {
  teacherId: 'teacher-one',
  durationMinutes: 30,
  status: 'published',
  examId: '123456789012',
});

verify(exam.questions.length === 10, 'All ten Question Studio types are transferred into the exam.');
verify(exam.teacherId === 'teacher-one', 'The exam is owned by the authenticated teacher.');
verify(exam.sourceQuestionBankId === bank.id, 'The exam remembers which question bank it came from.');
verify(exam.questionSchemaVersion === 2, 'Question Engine exams carry an explicit schema version.');
verify(exam.status === 'published', 'The bridge can produce an immediately assigned exam.');
verify(exam.durationMinutes === 30, 'Teacher-selected duration is preserved.');
verify(exam.id === '123456789012', 'A pre-generated secure exam code can be reused for publication.');

for (const [index, question] of questions.entries()) {
  const bridged = exam.questions[index];
  verify(isQuestionEngineExamQuestion(bridged), `${question.payload.type} remains marked as a Question Engine question.`);
  verify(bridged.engineQuestion.payload.type === question.payload.type, `${question.payload.type} keeps its exact payload type.`);
  verify(bridged.text === question.prompt, `${question.payload.type} keeps the student-visible prompt.`);
}

const single = toExamQuestion(questions[0]);
verify(single.options.length === 4, 'Single-choice questions remain readable in the legacy teacher editor.');
verify(single.correctAnswer === 0, 'The first correct single-choice option is mirrored for legacy compatibility.');
assert.throws(() => createExamFromQuestionBank(bank, { teacherId: '../teacher' }), RangeError);
checks += 1;
assert.throws(() => createExamFromQuestionBank({ ...bank, questions: [] }, { teacherId: 'teacher-one' }), RangeError);
checks += 1;

const actions = readFileSync(new URL('../src/components/QuestionStudioExamActions.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/components/QuestionStudioApp.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../src/components/UnifiedStudentExamRunner.tsx', import.meta.url), 'utf8');
const wrapper = readFileSync(new URL('../src/components/ExamManager.tsx', import.meta.url), 'utf8');
verify(actions.includes('Tạo bài kiểm tra'), 'Question Studio exposes a create-exam action.');
verify(actions.includes('Giao bài'), 'Question Studio exposes an immediate assignment action.');
verify(actions.includes("setDoc(doc(db, 'exams', exam.id), exam)"), 'Question Studio creates a real exam document in the existing exam collection.');
verify(actions.includes('protectExamForAccess(exam, exam.id)'), 'Immediate assignment encrypts the student exam payload.');
verify(actions.includes('createPublicExamSchedule(exam)'), 'Immediate assignment publishes only safe schedule metadata.');
verify(app.includes('<QuestionStudioExamActions'), 'The exam actions are mounted inside the ten-type application.');
verify(app.includes('<ExamManager'), 'Question Studio can open the existing teacher exam manager after creating a draft.');
verify(wrapper.includes('ExamManagerLegacy'), 'Existing teacher exam management is preserved behind the compatibility wrapper.');
verify(wrapper.includes('UnifiedStudentExamRunner'), 'Students are routed through the upgraded ten-type runner.');
verify(runner.includes('isQuestionEngineExamQuestion'), 'The student runner distinguishes ten-type questions from legacy questions.');
verify(runner.includes('evaluateQuestion(engine'), 'Ten-type student submissions use the shared scoring engine.');

console.info(`Question Studio to exam bridge: ${checks} checks passed.`);
