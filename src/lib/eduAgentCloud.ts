import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app, auth } from '../firebase';
import { AGENT_PROFILES, AGENT_ROLES, agentAppName, type AgentContext, type AgentRole } from './eduAgentCore';

const MODEL = import.meta.env.VITE_GOOGLE_AI_MODEL?.trim() || 'gemini-3.1-flash-lite';
let nextRequestAt = 0;
let inFlight = false;
export async function requestEduAgentDraft(request: string, context: AgentContext, role: AgentRole, uid: string): Promise<{text: string; model: string}> {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('Phiên tài khoản đã thay đổi. Hãy đăng nhập lại.');
  const clean = request.trim();
  if (!clean || clean.length > 1800) throw new Error('Yêu cầu phải có từ 1 đến 1.800 ký tự.');
  if (inFlight || Date.now() < nextRequestAt) throw new Error('Đang xử lý hoặc giới hạn tần suất. Hãy thử lại sau ít giây.');
  inFlight = true;
  nextRequestAt = Date.now() + 4000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, {
      model: MODEL,
      systemInstruction: [
        'Bạn là trợ lý giáo dục Edu AI. Viết tiếng Việt rõ ràng, chính xác, phù hợp độ tuổi.',
        'Vai trò: ' + AGENT_ROLES[role].description,
        'Ngữ cảnh công cụ: ' + agentAppName(context),
        'Quy trình công cụ: ' + AGENT_PROFILES[context].steps.join(' '),
        'Chỉ lập kế hoạch, hướng dẫn và dự thảo nội dung. Không có quyền truy cập tệp, camera, cơ sở dữ liệu, điểm số, tài khoản hay thực thi tác vụ.',
        'Không tuyên bố đã thay đổi dữ liệu hay đã kiểm tra dữ liệu thực. Không tự bịa số liệu, minh chứng, văn bản pháp luật, kết quả học tập. Nêu rõ dữ liệu còn thiếu.',
        'Không yêu cầu thông tin định danh học sinh, mật khẩu hoặc hồ sơ nhạy cảm. Với nội dung tư vấn tâm lý hoặc an toàn học đường, hướng dẫn tìm người có trách nhiệm/chuyên gia phù hợp.',
        'Đề xuất phải được người dùng kiểm tra; không hỗ trợ gian lận kỳ thi, xâm phạm quyền riêng tư hoặc bỏ qua phân quyền. Trả lời bằng văn bản ngắn, có các bước thực hiện.',
      ].join('\n'),
      generationConfig: { maxOutputTokens: 2048, temperature: 0.25 },
    });
    const operation = model.generateContent(clean).finally(() => { inFlight = false; });
    const result = await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Hết thời gian chờ Gemini. Kế hoạch cục bộ vẫn có sẵn.')), 22000); })]);
    if (auth.currentUser?.uid !== uid) throw new Error('Phiên tài khoản đã thay đổi.');
    const text = result.response.text().trim();
    if (!text) throw new Error('Gemini không trả nội dung.');
    return { text: text.slice(0, 12000), model: MODEL };
  } catch (error) {
    // Do not expose provider internals or log the user's request.
    if (timer === undefined) inFlight = false;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
