import assert from 'node:assert/strict';
import {
  QUESTION_TYPES,
  createQuestionTemplate,
  evaluateQuestion,
  validateQuestion,
  type QuestionDefinition,
  type QuestionResponse,
} from '../src/lib/questionEngine';

let checks = 0;

function verify(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function correctResponse(question: QuestionDefinition): QuestionResponse {
  const payload = question.payload;
  switch (payload.type) {
    case 'single_choice':
      return payload.options.find(option => option.correct)?.id || '';
    case 'multiple_choice':
      return payload.options.filter(option => option.correct).map(option => option.id);
    case 'true_false':
      return payload.correct;
    case 'true_false_matrix':
      return payload.statements.map(statement => statement.correct);
    case 'short_answer':
      return `  ${payload.acceptedAnswers[0].toLocaleUpperCase('vi-VN')}  `;
    case 'fill_blank':
      return [...payload.answers];
    case 'matching':
      return Object.fromEntries(payload.pairs.map(pair => [pair.id, pair.right]));
    case 'ordering':
      return payload.items.map(item => item.id);
    case 'classification':
      return Object.fromEntries(payload.items.map(item => [item.id, item.groupId]));
    case 'image_hotspot':
      return { x: payload.hotspots[0].x, y: payload.hotspots[0].y };
  }
}

assert.equal(QUESTION_TYPES.length, 10, 'Question Engine must expose ten basic question types.');
checks += 1;

for (const type of QUESTION_TYPES) {
  const question = createQuestionTemplate(type);
  question.prompt = `Kiểm thử ${type}`;
  question.points = 2;
  if (question.payload.type === 'image_hotspot') {
    question.payload.imageUrl = 'https://example.edu/question-image.png';
  }

  assert.deepEqual(validateQuestion(question), [], `${type} template should be valid after required content is supplied.`);
  checks += 1;

  const evaluation = evaluateQuestion(question, correctResponse(question));
  verify(evaluation.correct, `${type} must recognize its canonical correct response.`);
  assert.equal(evaluation.score, 2, `${type} must award the full configured score.`);
  assert.equal(evaluation.maxScore, 2, `${type} must preserve the configured maximum score.`);
  checks += 2;
}

const matrix = createQuestionTemplate('true_false_matrix');
matrix.prompt = 'Partial scoring matrix';
matrix.points = 4;
const statements = matrix.payload.type === 'true_false_matrix' ? matrix.payload.statements : [];
const partial = evaluateQuestion(matrix, statements.map((statement, index) => index === 0 ? !statement.correct : statement.correct));
assert.equal(partial.correct, false, 'A matrix with one wrong statement is not fully correct.');
assert.equal(partial.score, 3, 'True/false matrix uses proportional partial scoring.');
checks += 2;

const hotspot = createQuestionTemplate('image_hotspot');
hotspot.prompt = 'Hotspot boundary';
hotspot.points = 1;
if (hotspot.payload.type === 'image_hotspot') hotspot.payload.imageUrl = 'https://example.edu/image.png';
const outside = evaluateQuestion(hotspot, { x: 90, y: 90 });
assert.equal(outside.correct, false, 'Image hotspot must reject a point outside the configured radius.');
assert.equal(outside.score, 0, 'An incorrect hotspot receives zero points.');
checks += 2;

console.info(`Question Engine 10-type scoring: ${checks} checks passed.`);
