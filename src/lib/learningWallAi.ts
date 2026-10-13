import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app, auth } from '../firebase';
import { WALL_ANALYSIS_INSTRUCTION, wallAnalysisPrompt, parseWallAnalysis, wallPracticePrompt, parseWallPractice,
  type WallAiRequest, type WallAssessment } from './learningWallAssessment';

const modelName = import.meta.env.VITE_GOOGLE_AI_MODEL?.trim() || 'gemini-3.1-flash-lite';

async function generate(prompt: string, media: WallAiRequest['media'] = []): Promise<string> {
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
        timer = setTimeout(() => reject(new Error('AI chưa phản hồi sau 60 giây. Thử lại hoặc chọn tài khoản AI đang dùng.')), 60_000);
      }),
    ]);
    if (auth.currentUser?.uid !== teacherUid) throw new Error('Phiên giáo viên đã thay đổi; phản hồi AI không được lưu.');
    return result.response.text();
  } catch (error) {
    const code = String((error as { code?: string })?.code || '');
    if (/permission|api-not-enabled|api-key|unauthenticated|fetch-error/i.test(code)) {
      throw new Error('Gemini tự động chưa sẵn sàng. Kiểm tra Firebase AI Logic và App Check của dự án, hoặc chọn ChatGPT/Claude/Gemini đang dùng để sao chép yêu cầu và nhập kết quả.');
    }
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}

export async function analyzeWallWork(request: WallAiRequest) {
  const result = await generate(wallAnalysisPrompt(request), request.media);
  return { analysis: parseWallAnalysis(result, request.id), model: modelName };
}
export async function generateWallPractice(assessment: WallAssessment, requestId: string) {
  const result = await generate(wallPracticePrompt(assessment, requestId));
  return parseWallPractice(result, requestId, assessment, 'firebase-gemini', modelName);
}
