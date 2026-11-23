/**
 * Pure, backwards-compatible audit of teacher-authored exams.
 * It never writes to Firestore, modifies exam data or changes public exam access.
 */
export interface ReadinessQuestion {
  id?: string;
  text?: string;
  type?: string;
  options?: readonly string[];
  correctAnswer?: number;
  correctTextAnswer?: string;
  matchingPairs?: readonly { left?: string; right?: string }[];
  engineQuestion?: unknown;
  rubric?: readonly { text?: string; points?: number }[];
}
export interface ReadinessExam {
  id: string;
  title: string;
  durationMinutes: number;
  questions: readonly ReadinessQuestion[];
  status: 'draft' | 'published' | 'closed';
  teacherId?: string;
  startTime?: string;
}
export interface ExamReadinessIssue {
  level: 'blocker' | 'warning';
  message: string;
  questionNumber?: number;
}
function hasContent(text: unknown): boolean {
  const html = String(text ?? '');
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0 || /<(img|svg|video)\b/i.test(html);
}
export function assessExamReadiness(exam: ReadinessExam): ExamReadinessIssue[] {
  const issues: ExamReadinessIssue[] = [];
  const block = (message: string, questionNumber?: number) =>
    issues.push({ level: 'blocker', message, ...(questionNumber ? { questionNumber } : {}) });
  const warn = (message: string, questionNumber?: number) =>
    issues.push({ level: 'warning', message, ...(questionNumber ? { questionNumber } : {}) });

  if (!exam.title?.trim()) block('Chưa đặt tên kỳ thi.');
  if (!Number.isFinite(exam.durationMinutes) || exam.durationMinutes <= 0) block('Thời lượng thi phải lớn hơn 0 phút.');
  if (!exam.teacherId?.trim()) block('Thiếu chủ sở hữu kỳ thi. Hãy đăng nhập lại.');
  if (!exam.questions?.length) block('Kỳ thi chưa có câu hỏi.');
  if (exam.startTime && !Number.isFinite(Date.parse(exam.startTime))) block('Thời gian mở thi không hợp lệ.');
  const ids = new Set<string>();

  (exam.questions || []).forEach((q, index) => {
    const n = index + 1;
    if (!q.id?.trim()) block('Câu ' + n + ' thiếu mã câu hỏi.', n);
    else if (ids.has(q.id)) block('Câu ' + n + ' bị trùng mã với câu hỏi khác.', n);
    else ids.add(q.id);
    if (!hasContent(q.text) && !q.engineQuestion) block('Câu ' + n + ' chưa có nội dung.', n);

    if (q.type === 'question_engine') {
      if (!q.engineQuestion) block('Câu ' + n + ' thiếu dữ liệu Question Studio.', n);
      return;
    }
    if (q.type === 'essay' || q.type === 'practical') {
      if (!q.rubric?.length || !q.rubric.some(item => Number(item.points) > 0)) {
        warn('Câu ' + n + ' chưa có thang chấm/rubric rõ ràng.', n);
      }
      return;
    }
    if (q.type === 'short_answer') {
      if (!hasContent(q.correctTextAnswer)) warn('Câu ' + n + ' chưa có đáp án trả lời ngắn.', n);
      return;
    }
    if (q.type === 'matching') {
      if (!q.matchingPairs?.length || q.matchingPairs.some(pair => !hasContent(pair.left) || !hasContent(pair.right))) {
        block('Câu ' + n + ' chưa đủ cặp ghép nối và đáp án.', n);
      }
      return;
    }
    if (q.type === undefined || q.type === 'multiple_choice') {
      if (!q.options || q.options.length < 2 || q.options.some(opt => !hasContent(opt))) {
        block('Câu ' + n + ' cần ít nhất 2 phương án không trống.', n);
      } else if (!Number.isInteger(q.correctAnswer) || (q.correctAnswer ?? -1) < 0 ||
        (q.correctAnswer ?? -1) >= q.options.length) {
        block('Câu ' + n + ' chưa có đáp án hợp lệ.', n);
      }
      return;
    }
    warn('Câu ' + n + ' sử dụng kiểu câu hỏi chưa được bộ kiểm tra nhận diện đầy đủ.', n);
  });
  return issues;
}
export function canPublishExam(exam: ReadinessExam): boolean {
  return !assessExamReadiness(exam).some(issue => issue.level === 'blocker');
}
