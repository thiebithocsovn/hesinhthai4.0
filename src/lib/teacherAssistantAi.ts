import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app } from '../firebase';
import {
  type TeacherDocumentRow,
  type TeacherIntegrationMode,
  type TeacherIntegrationSuggestion,
} from './teacherDocument';

const MODEL = import.meta.env.VITE_GOOGLE_AI_MODEL?.trim() || 'gemini-3.1-flash-lite';

export interface TeacherAssistantRequest {
  mode: TeacherIntegrationMode;
  book: string;
  subject: string;
  grade: string;
  documentType: string;
  rows: readonly TeacherDocumentRow[];
  referenceFramework?: string;
}

export interface TeacherAssistantResult {
  suggestions: TeacherIntegrationSuggestion[];
  source: 'google-gemini' | 'local-analysis';
  model?: string;
}

const MODE_LABELS: Record<TeacherIntegrationMode, string> = {
  'digital-competency': 'tích hợp Năng lực số',
  'ai-competency': 'tích hợp Năng lực AI',
  'digital-ai': 'tích hợp đồng thời Năng lực số và Năng lực AI',
  'inclusive-education': 'điều chỉnh giáo dục học sinh khuyết tật hòa nhập',
  integrated: 'tích hợp tổng hợp phù hợp với bài học',
  'ai-lesson-plan': 'xác định nội dung phù hợp để xây dựng chuyên đề/hoạt động giáo dục AI',
};

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function lessonTitle(row: TeacherDocumentRow): string {
  const useful = row.cells.find(cell => /bài|chủ đề|tiết|hoạt động|ôn tập|kiểm tra/i.test(cell));
  return (useful || row.cells.slice(0, 2).join(' – ') || `Hàng ${row.rowIndex + 1}`).slice(0, 180);
}

function requirementFromRow(row: TeacherDocumentRow, lesson: string): string {
  const candidates = row.cells
    .map(cell => cell.trim())
    .filter(cell => cell.length >= 20 && !lesson.includes(cell));
  return (candidates.sort((a, b) => b.length - a.length)[0] || '').slice(0, 700);
}

function isCodeVerified(code: string, framework: string): boolean {
  const clean = code.trim();
  if (!clean) return true;
  return Boolean(framework.trim()) && framework.toLowerCase().includes(clean.toLowerCase());
}

function normalizeSuggestions(
  raw: unknown,
  rows: readonly TeacherDocumentRow[],
  referenceFramework: string,
): TeacherIntegrationSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const rowMap = new Map(rows.map(row => [row.rowIndex, row]));

  return raw
    .slice(0, 40)
    .map((item, index): TeacherIntegrationSuggestion | null => {
      if (!item || typeof item !== 'object') return null;
      const data = item as Record<string, unknown>;
      const rowIndex = Number(data.rowIndex);
      const row = rowMap.get(rowIndex);
      const content = String(data.content || '').trim();
      if (!row || !content) return null;
      const lesson = String(data.lesson || '').trim().slice(0, 180) || lessonTitle(row);
      const proposedCode = String(data.code || '').trim();
      const confidenceValue = String(data.confidence || '').toLowerCase();
      const confidence: TeacherIntegrationSuggestion['confidence'] =
        confidenceValue === 'high' || confidenceValue === 'low' ? confidenceValue : 'medium';
      const proposedRequirement = String(data.requirement || '').trim().slice(0, 700);

      return {
        id: `ai-${rowIndex}-${index}`,
        rowIndex,
        lesson,
        requirement: proposedRequirement || requirementFromRow(row, lesson),
        code: isCodeVerified(proposedCode, referenceFramework) ? proposedCode : '',
        content: content.slice(0, 1000),
        reason: String(data.reason || '').trim().slice(0, 700),
        confidence,
        approved: confidence !== 'low',
      };
    })
    .filter((item): item is TeacherIntegrationSuggestion => Boolean(item));
}

function buildPrompt(request: TeacherAssistantRequest): string {
  const rows = request.rows
    .slice(0, 140)
    .map(row => ({ rowIndex: row.rowIndex, cells: row.cells.map(cell => cell.slice(0, 1200)) }));
  const framework = (request.referenceFramework || '').trim().slice(0, 18_000);

  return `Bạn là trợ lý chuyên môn giáo dục Việt Nam. Nhiệm vụ: ${MODE_LABELS[request.mode]} vào KHGD/PPCT/giáo án hiện có.

THÔNG TIN:
- Bộ sách: ${request.book || 'Không xác định'}
- Môn: ${request.subject || 'Không xác định'}
- Lớp: ${request.grade || 'Không xác định'}
- Loại tài liệu: ${request.documentType || 'Không xác định'}

NGUYÊN TẮC BẮT BUỘC:
1. Chỉ đề xuất ở những hàng thực sự phù hợp; không tích hợp gượng ép.
2. rowIndex phải giữ nguyên đúng số được cung cấp.
3. Nội dung phải ngắn gọn, có thể chèn trực tiếp vào đúng cột tích hợp của hàng trong bảng Word.
4. KHÔNG tự tạo hoặc đoán mã năng lực. Chỉ điền trường code khi mã đó xuất hiện nguyên văn trong KHUNG THAM CHIẾU bên dưới. Nếu không có căn cứ chắc chắn, để code là chuỗi rỗng.
5. Không thay đổi số tiết, tên bài, yêu cầu cần đạt của tài liệu gốc.
6. Trường requirement chỉ được trích hoặc diễn đạt rất sát YÊU CẦU CẦN ĐẠT/NỘI DUNG đang có trong chính hàng nguồn; tuyệt đối không bịa thêm yêu cầu mới.
7. Trả về JSON thuần, không markdown, không giải thích ngoài JSON.
8. Tối đa 30 đề xuất tốt nhất.

KHUNG THAM CHIẾU ĐƯỢC PHÉP DÙNG MÃ:
${framework || '[Chưa cung cấp — bắt buộc để code = ""]'}

CÁC HÀNG TRONG BẢNG WORD:
${JSON.stringify(rows)}

Trả về mảng JSON theo mẫu:
[
  {
    "rowIndex": 12,
    "lesson": "Bài ...",
    "requirement": "Yêu cầu cần đạt lấy từ hàng nguồn",
    "code": "",
    "content": "Nội dung tích hợp ngắn gọn",
    "reason": "Lý do bài này phù hợp",
    "confidence": "high"
  }
]
confidence chỉ nhận high, medium hoặc low.`;
}

function localFallback(request: TeacherAssistantRequest): TeacherIntegrationSuggestion[] {
  const modeKeywords: Record<TeacherIntegrationMode, RegExp> = {
    'digital-competency': /dữ liệu|biểu đồ|máy tính|internet|phần mềm|bảng tính|trình chiếu|tìm kiếm|thông tin|mô phỏng|video|hình ảnh|công nghệ/i,
    'ai-competency': /trí tuệ nhân tạo|\bai\b|dữ liệu|thuật toán|mô hình|nhận dạng|tự động|dự đoán|đạo đức số/i,
    'digital-ai': /dữ liệu|máy tính|internet|phần mềm|bảng tính|tìm kiếm|trí tuệ nhân tạo|\bai\b|thuật toán|mô hình/i,
    'inclusive-education': /thực hành|hoạt động|luyện tập|vận dụng|trình bày|thảo luận|quan sát|thực hiện/i,
    integrated: /thực hành|dữ liệu|môi trường|an toàn|giao thông|địa phương|bình đẳng|công nghệ|vận dụng|thực tiễn/i,
    'ai-lesson-plan': /dữ liệu|thuật toán|máy tính|công nghệ|internet|thông tin|mô hình|nhận dạng|tự động/i,
  };

  const genericContent: Record<TeacherIntegrationMode, string> = {
    'digital-competency': 'Tổ chức cho học sinh sử dụng công cụ số phù hợp để khai thác, xử lý hoặc trình bày thông tin gắn với nhiệm vụ học tập.',
    'ai-competency': 'Tổ chức hoạt động nhận biết cách AI sử dụng dữ liệu, đánh giá kết quả do AI hỗ trợ và nhấn mạnh việc sử dụng AI có trách nhiệm.',
    'digital-ai': 'Kết hợp công cụ số và hoạt động tìm hiểu AI để học sinh xử lý thông tin, tạo sản phẩm số và đánh giá kết quả một cách có trách nhiệm.',
    'inclusive-education': 'Điều chỉnh nhiệm vụ theo mức độ tiếp cận của học sinh; tăng hỗ trợ trực quan, chia nhỏ yêu cầu và cho phép hình thức thể hiện kết quả phù hợp.',
    integrated: 'Lồng ghép nội dung giáo dục phù hợp thông qua nhiệm vụ thực tiễn, sản phẩm học tập và hoạt động vận dụng của học sinh.',
    'ai-lesson-plan': 'Có thể phát triển thành hoạt động/chuyên đề AI ngắn, tập trung vào dữ liệu, cách AI đưa ra kết quả và trách nhiệm khi sử dụng AI.',
  };

  return request.rows
    .filter(row => modeKeywords[request.mode].test(row.text))
    .slice(0, 15)
    .map((row, index) => {
      const lesson = lessonTitle(row);
      return {
        id: `local-${row.rowIndex}-${index}`,
        rowIndex: row.rowIndex,
        lesson,
        requirement: requirementFromRow(row, lesson),
        code: '',
        content: genericContent[request.mode],
        reason: 'Hàng này có nội dung/hoạt động phù hợp với nhóm tiêu chí đã chọn; cần giáo viên duyệt trước khi chèn.',
        confidence: 'medium' as const,
        approved: true,
      };
    });
}

export async function analyzeTeacherDocument(request: TeacherAssistantRequest): Promise<TeacherAssistantResult> {
  const referenceFramework = request.referenceFramework || '';

  try {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, {
      model: MODEL,
      systemInstruction: 'Ưu tiên tính chính xác chuyên môn, không bịa mã năng lực, yêu cầu cần đạt hoặc căn cứ pháp lý. Luôn trả JSON đúng yêu cầu.',
      generationConfig: { maxOutputTokens: 8192 },
    });
    const result = await model.generateContent(buildPrompt(request));
    const text = stripCodeFence(result.response.text());
    const suggestions = normalizeSuggestions(JSON.parse(text), request.rows, referenceFramework);
    if (suggestions.length > 0) return { suggestions, source: 'google-gemini', model: MODEL };
  } catch (error) {
    console.info('AI giáo viên chưa phản hồi; chuyển sang phân tích cục bộ an toàn.', error);
  }

  return { suggestions: localFallback(request), source: 'local-analysis' };
}
