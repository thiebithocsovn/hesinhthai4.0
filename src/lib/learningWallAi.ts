import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app, auth } from '../firebase';
import { WALL_ANALYSIS_INSTRUCTION, wallAnalysisPrompt, parseWallAnalysis, wallPracticePrompt, parseWallPractice,
  type WallAiRequest, type WallAssessment } from './learningWallAssessment';
import { wallChatPrompt, parseWallChatReply, type WallChatMessage } from './learningWallChat';
import { requestWallOpenAi, requestWallClaude, type WallOpenAiKind } from './wallOpenAiClient';
import { isWallAiProvider, wallAiProvider, type WallAiProvider } from './wallAiProvider';

const modelName = import.meta.env.VITE_GOOGLE_AI_MODEL?.trim() || 'gemini-3.1-flash-lite';

async function generateGemini(prompt: string, media: WallAiRequest['media'] = []): Promise<string> {
  const teacherUid = auth.currentUser?.uid;
  if (!teacherUid) throw new Error('Hãy đăng nhập tài khoản giáo viên trước khi gọi AI tự động.');
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: modelName, systemInstruction: WALL_ANALYSIS_INSTRUCTION,
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, temperature: 0.3 },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      model.generateContent([{ text: prompt }, ...media.map(file => ({ inlineData: file }))]),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('AI chưa phản hồi sau 60 giây. Hãy thử gửi lại ngay trong phần nhận xét.')), 60_000);
      }),
    ]);
    if (auth.currentUser?.uid !== teacherUid) throw new Error('Phiên giáo viên đã thay đổi; phản hồi AI không được lưu.');
    return result.response.text();
  } catch (error) {
    const code = String((error as { code?: string })?.code || '');
    if (/permission|api-not-enabled|api-key|unauthenticated|fetch-error/i.test(code)) {
      throw new Error('AI chưa kết nối được. Quản trị viên cần bật Firebase AI Logic cho dự án và kiểm tra App Check. Bài làm và nhận xét đang soạn vẫn được giữ tại đây.');
    }
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}

async function generate(provider: WallAiProvider, kind: WallOpenAiKind | 'connection', requestId: string, prompt: string, media: WallAiRequest['media'] = []) {
  if (!isWallAiProvider(provider)) throw new Error('Hãy chọn ChatGPT, Gemini hoặc Claude trước khi gửi.');
  if (provider === 'firebase-gemini') return { text: await generateGemini(prompt, media), model: modelName, source: 'firebase-gemini' as const };
  const request = provider === 'anthropic' ? requestWallClaude : requestWallOpenAi;
  return request({
    server: provider === 'anthropic' ? (import.meta.env?.VITE_WALL_ANTHROPIC_API_URL || import.meta.env?.VITE_WALL_OPENAI_API_URL || '') : (import.meta.env?.VITE_WALL_OPENAI_API_URL || ''),
    pageUrl: window.location.href,
    getUser: () => auth.currentUser,
  }, { kind, requestId, prompt, media });
}

export async function analyzeWallWork(request: WallAiRequest, provider = wallAiProvider) {
  const result = await generate(provider, 'analysis', request.id, wallAnalysisPrompt(request), request.media);
  return { analysis: parseWallAnalysis(result.text, request.id), model: result.model, source: result.source };
}
export async function generateWallPractice(assessment: WallAssessment, requestId: string, provider = wallAiProvider) {
  const result = await generate(provider, 'practice', requestId, wallPracticePrompt(assessment, requestId));
  return parseWallPractice(result.text, requestId, assessment, result.source, result.model);
}

export async function chatAboutWallWork(request: WallAiRequest, message: string, history: WallChatMessage[], provider = wallAiProvider) {
  const result = await generate(provider, 'chat', request.id, wallChatPrompt(request, message, history), request.media);
  return parseWallChatReply(result.text, request.id, result.model);
}

export async function checkWallAiConnection(provider = wallAiProvider): Promise<string> {
  const result = await generate(provider, 'connection', '', 'Đây là kiểm tra kết nối API, không có bài làm hoặc dữ liệu học sinh. Chỉ trả JSON {"status":"ok"}.');
  let status: unknown;
  try { status = JSON.parse(result.text.trim()); } catch { throw new Error('AI đã phản hồi nhưng kết quả kiểm tra kết nối chưa hợp lệ. Hãy thử lại.'); }
  if ((status as { status?: string })?.status !== 'ok') throw new Error('AI đã phản hồi nhưng chưa xác nhận kết nối thành công.');
  return result.model;
}
