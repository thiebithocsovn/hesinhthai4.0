import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app } from '../firebase';

const MODEL = import.meta.env.VITE_GOOGLE_AI_MODEL?.trim() || 'gemini-3.1-flash-lite';

export type TeacherDraftKind = 'ai-lesson-plan' | 'skkn';

export interface TeacherDraftRequest {
  kind: TeacherDraftKind;
  book: string;
  subject: string;
  grade: string;
  topic: string;
  problem: string;
  intervention: string;
  evidence: string;
  references: string;
  additionalRequirements: string;
}

export interface TeacherDraftSection {
  heading: string;
  content: string;
}

export interface TeacherDraft {
  title: string;
  sections: TeacherDraftSection[];
  source: 'google-gemini' | 'local-outline';
  model?: string;
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function normalizeDraft(raw: unknown, fallbackTitle: string): Omit<TeacherDraft, 'source' | 'model'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const sections = Array.isArray(data.sections)
    ? data.sections
        .slice(0, 20)
        .map(item => {
          if (!item || typeof item !== 'object') return null;
          const section = item as Record<string, unknown>;
          const heading = String(section.heading || '').trim().slice(0, 220);
          const content = String(section.content || '').trim().slice(0, 12_000);
          return heading && content ? { heading, content } : null;
        })
        .filter((item): item is TeacherDraftSection => Boolean(item))
    : [];

  if (sections.length === 0) return null;
  return {
    title: String(data.title || '').trim().slice(0, 300) || fallbackTitle,
    sections,
  };
}

function lessonPlanPrompt(request: TeacherDraftRequest): string {
  return `Bạn là trợ lý chuyên môn giáo dục Việt Nam. Hãy xây dựng một kế hoạch bài dạy/chuyên đề AI có thể dùng làm bản dự thảo cho giáo viên.

THÔNG TIN:
- Bộ sách: ${request.book || 'Không xác định'}
- Môn: ${request.subject || 'Không xác định'}
- Lớp: ${request.grade || 'Không xác định'}
- Chủ đề/bài học: ${request.topic || 'Chưa nêu'}
- Vấn đề/mục tiêu trọng tâm: ${request.problem || 'Chưa nêu'}
- Hoạt động/giải pháp mong muốn: ${request.intervention || 'Chưa nêu'}
- Thiết bị, dữ liệu hoặc minh chứng hiện có: ${request.evidence || 'Chưa nêu'}
- Khung tham chiếu/căn cứ do giáo viên cung cấp: ${request.references || '[Chưa cung cấp]'}
- Yêu cầu thêm: ${request.additionalRequirements || 'Không có'}

NGUYÊN TẮC BẮT BUỘC:
1. Không bịa mã năng lực, văn bản pháp lý, số liệu hoặc nguồn tài liệu.
2. Chỉ dùng mã/căn cứ nếu xuất hiện nguyên văn trong phần khung tham chiếu do giáo viên cung cấp.
3. Thiết kế hoạt động khả thi trong trường phổ thông Việt Nam; nêu rõ vai trò giáo viên và học sinh.
4. Với AI, phải có nội dung an toàn, đạo đức, kiểm chứng kết quả AI và bảo vệ dữ liệu cá nhân.
5. Không tự thay đổi thời lượng nếu giáo viên không yêu cầu; nếu thiếu thông tin, viết theo dạng dự thảo linh hoạt.
6. Trả JSON thuần, không markdown.

CẤU TRÚC MONG MUỐN:
- I. Yêu cầu cần đạt
- II. Thiết bị và học liệu
- III. Tiến trình dạy học (Khởi động; Hình thành kiến thức; Luyện tập; Vận dụng)
- IV. Kiểm tra, đánh giá
- V. Lưu ý an toàn và đạo đức AI
- VI. Điều chỉnh sau bài dạy

JSON:
{
  "title": "Tên kế hoạch/chuyên đề",
  "sections": [
    {"heading": "I. Yêu cầu cần đạt", "content": "..."}
  ]
}`;
}

function skknPrompt(request: TeacherDraftRequest): string {
  return `Bạn là trợ lý biên tập sáng kiến kinh nghiệm (SKKN) trong giáo dục Việt Nam. Hãy tạo bản dự thảo có cấu trúc để giáo viên tiếp tục chỉnh sửa, không được bịa minh chứng.

THÔNG TIN:
- Môn/lĩnh vực: ${request.subject || 'Không xác định'}
- Lớp/đối tượng: ${request.grade || 'Không xác định'}
- Tên/ý tưởng đề tài: ${request.topic || 'Chưa nêu'}
- Thực trạng/vấn đề: ${request.problem || 'Chưa nêu'}
- Giải pháp đã hoặc dự kiến thực hiện: ${request.intervention || 'Chưa nêu'}
- Số liệu/minh chứng trước-sau do giáo viên cung cấp: ${request.evidence || '[Chưa có số liệu]'}
- Tài liệu/căn cứ do giáo viên cung cấp: ${request.references || '[Chưa cung cấp]'}
- Yêu cầu thêm: ${request.additionalRequirements || 'Không có'}

NGUYÊN TẮC BẮT BUỘC:
1. Tuyệt đối không tự tạo số liệu khảo sát, tỉ lệ %, tên trường, tên học sinh hoặc kết quả thực nghiệm.
2. Nếu thiếu số liệu, ghi rõ [CẦN BỔ SUNG SỐ LIỆU/MINH CHỨNG] tại vị trí cần thiết.
3. Không bịa tài liệu tham khảo, văn bản pháp lý hoặc trích dẫn. Chỉ dùng nguồn do giáo viên cung cấp.
4. Phân biệt rõ thực trạng, nguyên nhân, giải pháp, cách tổ chức thực hiện và minh chứng hiệu quả.
5. Văn phong chuyên môn, rõ ràng, tránh phóng đại hiệu quả.
6. Trả JSON thuần, không markdown.

CẤU TRÚC MONG MUỐN:
- I. Mở đầu
- II. Cơ sở lý luận và thực tiễn
- III. Thực trạng trước khi áp dụng
- IV. Các giải pháp/biện pháp
- V. Tổ chức thực hiện
- VI. Kết quả và minh chứng
- VII. Khả năng áp dụng/nhân rộng
- VIII. Kết luận và kiến nghị
- IX. Tài liệu tham khảo (chỉ khi có nguồn giáo viên cung cấp)

JSON:
{
  "title": "Tên SKKN",
  "sections": [
    {"heading": "I. Mở đầu", "content": "..."}
  ]
}`;
}

function buildPrompt(request: TeacherDraftRequest): string {
  return request.kind === 'skkn' ? skknPrompt(request) : lessonPlanPrompt(request);
}

function localOutline(request: TeacherDraftRequest): TeacherDraft {
  if (request.kind === 'skkn') {
    return {
      title: request.topic || `Sáng kiến kinh nghiệm ${request.subject || ''}`.trim(),
      source: 'local-outline',
      sections: [
        { heading: 'I. Mở đầu', content: `Lý do chọn đề tài và mục tiêu nghiên cứu. ${request.problem || '[CẦN BỔ SUNG THỰC TRẠNG/VẤN ĐỀ]'}` },
        { heading: 'II. Cơ sở lý luận và thực tiễn', content: request.references || '[CẦN BỔ SUNG CĂN CỨ/TÀI LIỆU THAM KHẢO ĐÃ XÁC MINH]' },
        { heading: 'III. Thực trạng trước khi áp dụng', content: request.problem || '[CẦN BỔ SUNG THỰC TRẠNG VÀ NGUYÊN NHÂN]' },
        { heading: 'IV. Các giải pháp/biện pháp', content: request.intervention || '[CẦN BỔ SUNG CÁC GIẢI PHÁP ĐÃ/ĐỊNH THỰC HIỆN]' },
        { heading: 'V. Tổ chức thực hiện', content: 'Mô tả đối tượng, thời gian, quy trình, cách theo dõi và tiêu chí đánh giá.' },
        { heading: 'VI. Kết quả và minh chứng', content: request.evidence || '[CẦN BỔ SUNG SỐ LIỆU/MINH CHỨNG TRƯỚC-SAU]' },
        { heading: 'VII. Khả năng áp dụng/nhân rộng', content: 'Nêu điều kiện áp dụng, phạm vi phù hợp và các giới hạn cần lưu ý.' },
        { heading: 'VIII. Kết luận và kiến nghị', content: 'Tóm tắt giá trị của giải pháp và kiến nghị dựa trên minh chứng thực tế.' },
      ],
    };
  }

  return {
    title: request.topic || `Kế hoạch chuyên đề AI - ${request.subject || ''} lớp ${request.grade || ''}`.trim(),
    source: 'local-outline',
    sections: [
      { heading: 'I. Yêu cầu cần đạt', content: request.problem || 'Xác định yêu cầu cần đạt của bài/chuyên đề; chỉ ghi mã năng lực khi có căn cứ chính thức.' },
      { heading: 'II. Thiết bị và học liệu', content: request.evidence || 'Thiết bị hiện có, dữ liệu mẫu, tài khoản/công cụ AI phù hợp và phương án dự phòng không dùng AI.' },
      { heading: 'III. Tiến trình dạy học', content: request.intervention || 'Khởi động → hình thành kiến thức → luyện tập → vận dụng. Mỗi hoạt động nêu nhiệm vụ, sản phẩm và cách kiểm chứng kết quả AI.' },
      { heading: 'IV. Kiểm tra, đánh giá', content: 'Đánh giá sản phẩm học tập, quá trình sử dụng AI, khả năng kiểm chứng và giải thích kết quả.' },
      { heading: 'V. Lưu ý an toàn và đạo đức AI', content: 'Không nhập dữ liệu cá nhân nhạy cảm; kiểm chứng thông tin; ghi nhận vai trò hỗ trợ của AI; giáo viên chịu trách nhiệm chuyên môn cuối cùng.' },
      { heading: 'VI. Điều chỉnh sau bài dạy', content: 'Ghi nhận khó khăn, mức độ đạt yêu cầu và điều chỉnh cho lần triển khai tiếp theo.' },
    ],
  };
}

export async function generateTeacherDraft(request: TeacherDraftRequest): Promise<TeacherDraft> {
  const fallback = localOutline(request);
  try {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, {
      model: MODEL,
      systemInstruction: 'Ưu tiên tính chính xác chuyên môn. Không bịa số liệu, mã năng lực, căn cứ pháp lý hoặc tài liệu tham khảo. Luôn trả JSON hợp lệ.',
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
    });
    const result = await model.generateContent(buildPrompt(request));
    const parsed = normalizeDraft(JSON.parse(stripCodeFence(result.response.text())), fallback.title);
    if (parsed) return { ...parsed, source: 'google-gemini', model: MODEL };
  } catch (error) {
    console.info('AI tạo dự thảo chưa phản hồi; sử dụng khung cục bộ an toàn.', error);
  }
  return fallback;
}
