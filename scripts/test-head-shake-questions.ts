import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  generateOfflineHeadShakeQuestions,
  normalizeGeneratedHeadShakeQuestions,
  tryGenerateHeadShakeQuestionsWithBrowserAi,
} from '../src/lib/headShakeQuestions.ts';

let checks = 0;

function verify(condition: unknown, description: string): void {
  assert.ok(condition, description);
  checks += 1;
}

const subjects: Array<[topic: string, requiredPattern: RegExp]> = [
  ['Toán lớp 1', /\d+\s*\+/],
  ['Phân số lớp 5', /phân số|\d+\/\d+/i],
  ['Tỉ lệ phần trăm lớp 5', /%/],
  ['Số thập phân lớp 5', /,/],
  ['Phương trình bậc nhất lớp 8', /phương trình|\d+x/i],
  ['Đơn thức và đa thức lớp 8', /biểu thức|x/i],
  ['Hình học: diện tích và chu vi lớp 6', /diện tích|chu vi/i],
  ['Bảng cửu chương lớp 3', /×/],
  ['Giáo dục AI lớp 6', /ai|trí tuệ|dữ liệu|prompt|nhận diện|công cụ/i],
  ['Tin học và năng lực số lớp 7', /máy tính|bàn phím|màn hình|dữ liệu|thông tin|mật khẩu|thuật toán|ctrl|internet|tệp|phần mềm|liên kết|chuột|thư mục/i],
  ['Tiếng Anh lớp 4', /book|teacher|student|red|seven|how|thank|monday|water|school|student|beautiful|apple|good/i],
  ['Tiếng Việt lớp 5', /từ|câu|đoạn văn|viết|đọc|kể|sánh/i],
  ['Khoa học tự nhiên lớp 6', /thực vật|cơ quan|nước|trái đất|cây|con người|mặt trăng|âm thanh|lực|vật nào|động vật|máu/i],
  ['Lịch sử Việt Nam lớp 7', /năm|ngày|ai|kinh đô|văn miếu|bạch đằng|hai bà|quang trung|chiến thắng/i],
  ['Địa lý Thái Nguyên', /việt nam|đồng bằng|thái nguyên|đà lạt|hướng|vịnh|sông|đỉnh|quả địa cầu|biển/i],
  ['Giáo dục thể chất lớp 6', /vận động|tập|thể dục|bóng đá|fair-play|nhịp tim|khởi động/i],
  ['Bảo vệ môi trường', /rác|điện|cây|pin|nước|khói|tái|năng lượng|đa dạng|môi trường/i],
  ['An toàn giao thông', /giao thông|xe|đường|đèn|biển|ô tô/i],
  ['Quản lý tài chính và tiết kiệm', /tiền|mua|chi|tiết kiệm|otp|tài chính|lãi|ocop|quỹ|khoản/i],
  ['Chủ đề giáo dục bất kỳ', /chủ đề/i],
];

for (const [topic, requiredPattern] of subjects) {
  const questions = generateOfflineHeadShakeQuestions(topic, 20);
  verify(questions.length === 20, `${topic}: generates the requested number of questions.`);
  verify(questions.every(question => question.text && question.leftAnswer && question.rightAnswer), `${topic}: every question is complete.`);
  verify(questions.every(question => question.leftAnswer !== question.rightAnswer), `${topic}: answer choices are distinct.`);
  verify(questions.every(question => question.correctAnswer === 'left' || question.correctAnswer === 'right'), `${topic}: answer orientation is valid.`);
  verify(questions.every(question => question.points === 10), `${topic}: default score is available.`);
  verify(questions.some(question => requiredPattern.test(question.text)), `${topic}: generated content matches the requested subject.`);
  verify(new Set(questions.map(question => question.text)).size === questions.length, `${topic}: question text is not duplicated.`);
}

verify(generateOfflineHeadShakeQuestions('', 5).length === 0, 'A blank subject does not create questions.');
verify(generateOfflineHeadShakeQuestions('Toán lớp 2', -10).length === 1, 'Question counts cannot fall below one.');
verify(generateOfflineHeadShakeQuestions('Toán lớp 2', 200).length === 20, 'Question counts cannot exceed twenty.');
verify(generateOfflineHeadShakeQuestions('Toán lớp 2', Number.NaN).length === 5, 'Invalid question counts use a safe default.');

const fractions = generateOfflineHeadShakeQuestions('Phân số lớp 5', 20);
for (const question of fractions) {
  const original = question.text.match(/(\d+)\/(\d+)/);
  assert.ok(original);
  const chosen = question.correctAnswer === 'left' ? question.leftAnswer : question.rightAnswer;
  const [numerator, denominator] = chosen.split('/').map(Number);
  verify(Number(original[1]) * denominator === Number(original[2]) * numerator, 'Fraction answers are mathematically equivalent.');
}

const percentages = generateOfflineHeadShakeQuestions('Tỉ lệ phần trăm lớp 5', 20);
for (const question of percentages) {
  const match = question.text.match(/(\d+)% của (\d+)/);
  assert.ok(match);
  const chosen = question.correctAnswer === 'left' ? question.leftAnswer : question.rightAnswer;
  verify(Number(chosen) === Number(match[1]) * Number(match[2]) / 100, 'Percentage answers are mathematically correct.');
}

const normalized = normalizeGeneratedHeadShakeQuestions([
  { text: ' Câu hỏi ', leftAnswer: ' Đúng ', rightAnswer: ' Sai ', correctAnswer: 'left', points: 15 },
  { text: 'Lỗi', leftAnswer: 'Trùng', rightAnswer: 'Trùng', correctAnswer: 'right' },
  { text: 'Lỗi', leftAnswer: 'A', rightAnswer: 'B', correctAnswer: 'middle' },
  { text: 'Điểm mặc định', leftAnswer: 'A', rightAnswer: 'B', correctAnswer: 'right', points: -5 },
  null,
], 20);

verify(normalized.length === 2, 'Invalid model responses are rejected.');
verify(normalized[0].text === 'Câu hỏi' && normalized[0].points === 15, 'Valid model responses are normalized.');
verify(normalized[1].points === 10, 'Invalid model scores fall back to ten points.');
verify(normalizeGeneratedHeadShakeQuestions({}, 5).length === 0, 'Non-array AI responses are rejected.');

const globalAi = globalThis as typeof globalThis & {
  LanguageModel?: {
    availability?: () => Promise<string>;
    create: () => Promise<{ prompt: (input: string) => Promise<string>; destroy?: () => void }>;
  };
};
const originalModel = globalAi.LanguageModel;

try {
  delete globalAi.LanguageModel;
  verify((await tryGenerateHeadShakeQuestionsWithBrowserAi('Toán lớp 5', 2)).length === 0, 'Unsupported browsers immediately use the fallback.');

  globalAi.LanguageModel = {
    availability: async () => 'downloadable',
    create: async () => { throw new Error('The unavailable model must not be initialized.'); },
  };
  verify((await tryGenerateHeadShakeQuestionsWithBrowserAi('Toán lớp 5', 2)).length === 0, 'Undownloaded browser models do not block the classroom.');

  let destroyed = false;
  globalAi.LanguageModel = {
    availability: async () => 'available',
    create: async () => ({
      prompt: async (prompt) => {
        verify(prompt.includes('Toán lớp 5'), 'The browser AI receives the requested subject.');
        return '```json\n[{"text":"1 + 1 = ?","leftAnswer":"2","rightAnswer":"3","correctAnswer":"left","points":10}]\n```';
      },
      destroy: () => { destroyed = true; },
    }),
  };
  const browserQuestions = await tryGenerateHeadShakeQuestionsWithBrowserAi('Toán lớp 5', 2);
  verify(browserQuestions.length === 1 && browserQuestions[0].leftAnswer === '2', 'A ready browser AI can generate validated classroom questions.');
  verify(destroyed, 'Browser AI sessions are released after use.');

  globalAi.LanguageModel = {
    availability: async () => 'available',
    create: async () => ({ prompt: async () => 'invalid JSON' }),
  };
  verify((await tryGenerateHeadShakeQuestionsWithBrowserAi('Toán lớp 5', 2)).length === 0, 'Malformed browser AI output safely falls back.');
} finally {
  if (originalModel) globalAi.LanguageModel = originalModel;
  else delete globalAi.LanguageModel;
}

const component = readFileSync(new URL('../src/components/HeadShakeGame.tsx', import.meta.url), 'utf8');
verify(component.includes('generateOfflineHeadShakeQuestions'), 'The game uses static-hosting-safe local question generation.');
verify(component.includes('tryGenerateHeadShakeQuestionsWithBrowserAi'), 'The game can use the browser AI when available.');
verify(component.includes('getConfiguredApiServer'), 'Configured private AI servers remain supported.');
verify(component.includes('Hoạt động ngay trên GitHub Pages'), 'The interface explains the automatic fallback.');
verify(!component.includes("await postApiJson<any[]>('generate-questions'"), 'The failing unconditional server request has been removed.');

console.info(`Head-shake question generation: ${checks} checks passed.`);
