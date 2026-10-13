import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ECOSYSTEM_APPLICATIONS, ECOSYSTEM_DEPENDENCY_LABELS } from '../src/ecosystem.ts';
import {
  buildOfflineSchoolCounselingReply,
  detectSchoolCounselingTopic,
  normalizeSchoolCounselingText,
  requiresImmediateSchoolSafetySupport,
  SCHOOL_COUNSELING_SYSTEM_PROMPT,
  tryBrowserSchoolCounseling,
  type SchoolCounselingMessage,
} from '../src/lib/schoolCounselor.ts';

let checks = 0;
const verify = (condition: unknown, description: string) => {
  assert.ok(condition, description);
  checks += 1;
};

const plicker = ECOSYSTEM_APPLICATIONS.find(application => application.id === 'plicker');
const chatbot = ECOSYSTEM_APPLICATIONS.find(application => application.id === 'chatbot');

verify(plicker?.dependency === 'firebase', 'Plicker camera scanning does not require an AI server.');
verify(plicker?.description.includes('ngay trên thiết bị'), 'Plicker explains on-device camera recognition.');
verify(chatbot?.dependency === 'ai-cloud', 'Teacher AI assistant is backed by Google-hosted AI.');
verify(ECOSYSTEM_DEPENDENCY_LABELS['ai-cloud'] === 'AI Google Gemini', 'The homepage identifies the selected AI provider.');
verify(!ECOSYSTEM_APPLICATIONS.some(application => application.dependency === 'ai-server'), 'No application incorrectly claims that a private AI server is required.');
verify(ECOSYSTEM_APPLICATIONS.length === 13, 'All 13 educational applications remain available.');

verify(normalizeSchoolCounselingText('  BẠO   LỰC học ĐƯỜNG  ') === 'bao luc hoc duong', 'Vietnamese accents and whitespace normalize consistently.');

const topicSamples: [string, ReturnType<typeof detectSchoolCounselingTopic>][] = [
  ['Em muốn chết vì bị bạn bắt nạt', 'immediate-danger'],
  ['Bạn em đang tự tử', 'immediate-danger'],
  ['Học sinh đang bị đánh trước cổng trường', 'immediate-danger'],
  ['Có người mang hung khí và đe dọa giết', 'immediate-danger'],
  ['Bạn em uống thuốc độc', 'immediate-danger'],
  ['Học sinh bị xâm hại', 'sexual-abuse'],
  ['Có người đòi ảnh nhạy cảm của em', 'sexual-abuse'],
  ['Bạn cùng lớp bôi nhọ em trên Facebook', 'cyberbullying'],
  ['Một nhóm lớp trên Zalo đăng clip của em', 'cyberbullying'],
  ['Em bị bắt nạt và cô lập', 'bullying'],
  ['Học sinh đánh nhau sau giờ học', 'bullying'],
  ['Em rất áp lực vì kỳ thi và điểm thấp', 'exam-stress'],
  ['Em lo âu, mất ngủ và cảm thấy cô đơn', 'emotional-distress'],
  ['Bố mẹ thường cãi nhau ở nhà', 'family-conflict'],
  ['Em không hiểu bài Toán và bị mất gốc', 'learning-difficulty'],
  ['Em cần lời khuyên về môi trường học tập', 'general'],
];

for (const [message, expected] of topicSamples) {
  verify(detectSchoolCounselingTopic(message) === expected, `${message}: correctly classifies ${expected}.`);
}

verify(requiresImmediateSchoolSafetySupport('Em muốn tự tử'), 'Self-harm risk bypasses cloud AI and receives immediate help.');
verify(requiresImmediateSchoolSafetySupport('Học sinh bị xâm hại'), 'Abuse disclosures bypass cloud AI and receive immediate help.');
verify(!requiresImmediateSchoolSafetySupport('Em lo kỳ thi'), 'Routine exam stress does not trigger an emergency.');

const urgent = buildOfflineSchoolCounselingReply('Em muốn chết');
verify(urgent.includes('111') && urgent.includes('113') && urgent.includes('115'), 'Emergency guidance includes child protection, police, and medical hotlines.');
verify(urgent.includes('không để người gặp nguy hiểm ở một mình'), 'Emergency guidance discourages leaving the child alone.');
verify(urgent.includes('người lớn tin cậy'), 'Emergency guidance escalates to trusted adults.');

const abuse = buildOfflineSchoolCounselingReply('Có người xâm hại và đòi ảnh nhạy cảm');
verify(abuse.includes('không phải lỗi'), 'Abuse guidance does not blame the victim.');
verify(abuse.includes('111') && abuse.includes('113'), 'Abuse guidance lists child-protection and police escalation.');

const cyber = buildOfflineSchoolCounselingReply('Em bị bắt nạt trên mạng Facebook');
verify(cyber.includes('chụp màn hình'), 'Cyberbullying guidance preserves evidence.');
verify(cyber.includes('Chặn hoặc báo cáo'), 'Cyberbullying guidance offers protective platform actions.');

const bullying = buildOfflineSchoolCounselingReply('Em bị các bạn bắt nạt ở trường');
verify(bullying.includes('giáo viên chủ nhiệm'), 'Bullying guidance involves the school.');
verify(bullying.includes('tránh gặp riêng hoặc trả đũa'), 'Bullying guidance discourages retaliation.');

const examStress = buildOfflineSchoolCounselingReply('Em rất áp lực thi cử');
verify(examStress.includes('25–30 phút'), 'Exam-stress guidance suggests manageable study sessions.');
verify(examStress.includes('ngủ đủ'), 'Exam-stress guidance supports rest and wellbeing.');

const distress = buildOfflineSchoolCounselingReply('Em lo âu, căng thẳng và mất ngủ');
verify(distress.includes('4 nhịp'), 'Emotional support suggests a simple grounding exercise.');
verify(distress.includes('chuyên gia'), 'Persistent distress is referred to a qualified professional.');

const family = buildOfflineSchoolCounselingReply('Bố mẹ cãi nhau, em rất buồn');
verify(family.includes('gia đình') || family.includes('người thân'), 'Family conflict receives appropriate context.');

const learning = buildOfflineSchoolCounselingReply('Em không hiểu bài Toán và mất gốc');
verify(learning.includes('kiến thức nền'), 'Learning guidance starts from foundational knowledge.');

const history: SchoolCounselingMessage[] = [
  { role: 'model', text: 'Xin chào.' },
  { role: 'user', text: 'Em bị bạn bắt nạt.' },
  { role: 'model', text: 'Hãy tìm người lớn tin cậy.' },
];
verify(buildOfflineSchoolCounselingReply('Em cần làm gì tiếp?', history).includes('bắt nạt'), 'Follow-up questions preserve relevant counseling context.');
verify(buildOfflineSchoolCounselingReply('').includes('Không cần cung cấp'), 'Empty messages never ask for private student data.');
verify(SCHOOL_COUNSELING_SYSTEM_PROMPT.includes('Không chẩn đoán bệnh'), 'Cloud AI is instructed not to offer medical diagnoses.');
verify(SCHOOL_COUNSELING_SYSTEM_PROMPT.includes('thông tin riêng tư'), 'Cloud AI is instructed to protect student privacy.');

const oldLanguageModel = (globalThis as any).LanguageModel;
try {
  delete (globalThis as any).LanguageModel;
  verify((await tryBrowserSchoolCounseling('Em lo kỳ thi')) === '', 'Unsupported browser AI falls back cleanly.');

  let destroyed = false;
  (globalThis as any).LanguageModel = {
    availability: async () => 'available',
    create: async () => ({
      prompt: async (prompt: string) => {
        verify(prompt.includes('Em lo kỳ thi'), 'The browser model receives the current school scenario.');
        verify(prompt.includes('Không chẩn đoán bệnh'), 'The browser model receives child-safe system instructions.');
        return '  Hãy chia nhỏ nội dung ôn tập và trao đổi với giáo viên.  ';
      },
      destroy: () => { destroyed = true; },
    }),
  };

  const browserAnswer = await tryBrowserSchoolCounseling('Em lo kỳ thi', history);
  verify(browserAnswer === 'Hãy chia nhỏ nội dung ôn tập và trao đổi với giáo viên.', 'Browser AI responses are trimmed and returned.');
  verify(destroyed, 'Browser AI sessions are released after use.');

  (globalThis as any).LanguageModel = {
    availability: async () => 'downloadable',
    create: async () => { throw new Error('The browser model should not be downloaded automatically.'); },
  };
  verify((await tryBrowserSchoolCounseling('Em lo kỳ thi')) === '', 'Unavailable browser models never trigger an expensive download.');

  (globalThis as any).LanguageModel = {
    availability: async () => 'available',
    create: async () => ({ prompt: async () => { throw new Error('Browser AI unavailable'); } }),
  };
  verify((await tryBrowserSchoolCounseling('Em lo kỳ thi')) === '', 'Browser model errors safely activate local counseling.');
} finally {
  if (oldLanguageModel === undefined) delete (globalThis as any).LanguageModel;
  else (globalThis as any).LanguageModel = oldLanguageModel;
}

const service = readFileSync(new URL('../src/lib/aiService.ts', import.meta.url), 'utf8');
const chatbotShell = readFileSync(new URL('../src/components/AIChatbot.tsx', import.meta.url), 'utf8');
const counselingModule = readFileSync(new URL('../src/components/ai/SchoolCounselingAssistant.tsx', import.meta.url), 'utf8');
const teacherModule = readFileSync(new URL('../src/components/ai/TeacherDocumentAssistant.tsx', import.meta.url), 'utf8');
const firebase = readFileSync(new URL('../src/firebase.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/main.yml', import.meta.url), 'utf8');

verify(service.includes("from 'firebase/ai'"), 'Cloud AI uses the official Firebase AI Logic SDK.');
verify(service.includes('new GoogleAIBackend()'), 'Cloud requests are routed to the Google Gemini Developer API backend.');
verify(service.includes("'gemini-3.1-flash-lite'"), 'A stable, cost-efficient Gemini model is selected by default.');
verify(service.includes('maxOutputTokens: 1024'), 'AI output is capped to control latency and cost.');
verify(service.includes('CLOUD_RETRY_DELAY_MS'), 'Unavailable cloud services are not retried on every message.');
verify(service.includes('requiresImmediateSchoolSafetySupport(cleanMessage)'), 'High-risk scenarios are handled before cloud requests.');
verify(service.includes('tryBrowserSchoolCounseling'), 'On-device AI remains an automatic fallback.');
verify(service.includes('buildOfflineSchoolCounselingReply'), 'A deterministic local counselor is always available.');

verify(chatbotShell.includes("lazy(() => import('./ai/TeacherDocumentAssistant'))"), 'Teacher document AI is a lazy-loaded module.');
verify(chatbotShell.includes("lazy(() => import('./ai/SchoolCounselingAssistant'))"), 'School counseling is a separate lazy-loaded module.');
verify(!chatbotShell.includes("../lib/teacherDocument"), 'AI shell does not eagerly load the DOCX engine.');
verify(!chatbotShell.includes("../lib/aiService"), 'AI shell does not eagerly load Firebase AI.');
verify(counselingModule.includes("await import('../../lib/aiService')"), 'Counseling AI service loads only when a message is sent.');
verify(counselingModule.includes('requestSchoolCounseling(userMessage, messages)'), 'The counseling interface uses the resilient AI service.');
verify(counselingModule.includes('COUNSELING_SOURCE_LABELS'), 'Users can see the actual counseling response source.');
verify(counselingModule.includes('Google Gemini · tự động tối ưu'), 'The interface no longer requires manual server configuration.');
verify(teacherModule.includes("await import('../../lib/teacherDocument')"), 'Document Engine loads on demand for DOCX work.');
verify(teacherModule.includes("await import('../../lib/teacherAssistantAi')"), 'Teacher Gemini analysis loads only when analysis starts.');

verify(firebase.includes('ReCaptchaEnterpriseProvider'), 'Firebase AI can be protected with App Check attestation.');
verify(firebase.includes('VITE_FIREBASE_APP_CHECK_SITE_KEY'), 'Only the public App Check site key can be built into the website.');
verify(!service.includes('GEMINI_API_KEY'), 'No Gemini secret is present in the browser AI integration.');
verify(server.includes('"x-goog-api-key": apiKey'), 'The optional private backend sends secrets in a header.');
verify(!server.includes(':generateContent?key='), 'The optional backend does not leak API keys into URLs.');
verify(!server.includes('gemini-1.5-flash'), 'Retired Gemini 1.5 models have been removed.');
verify(workflow.includes('npm run test:ai-services'), 'Deployment validates AI integration before building.');
verify(workflow.includes('VITE_FIREBASE_APP_CHECK_SITE_KEY'), 'GitHub Pages can receive the public App Check site key.');

console.info(`Google Gemini, modular teacher AI and school counseling: ${checks} checks passed.`);
