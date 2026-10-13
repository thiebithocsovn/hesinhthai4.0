import { receiptQuestionIsCorrect, type ReceiptExam, type ReceiptResult } from './examReceipt';

export interface TeacherPrintState {
  status: 'claimed' | 'dispatching' | 'sent' | 'failed';
  stationId: string;
  claimedAt: string;
  updatedAt: string;
}

export interface TeacherPrintResult extends ReceiptResult {
  examId: string;
  studentId: string;
  teacherId: string;
  teacherPrint?: TeacherPrintState;
}

export function gradeSubmittedExam(exam: ReceiptExam, result: TeacherPrintResult): { score: number; totalQuestions: number } {
  if (result.examId !== exam.id) throw new Error('Bài nộp không thuộc kỳ thi được chọn.');
  const version = result.examVersion || 'Gốc';
  const selected = version === 'Gốc' ? exam.questions : exam.shuffledVersions?.find(item => item.code === version)?.questions;
  if (!selected) throw new Error('Không tìm thấy mã đề của bài nộp. Không gửi phiếu có đáp án khác mã đề.');
  if (!selected.length || selected.length !== result.totalQuestions) throw new Error('Số câu của đề đã thay đổi. Cần kiểm tra bài nộp trước khi in.');
  return { score: selected.filter(question => receiptQuestionIsCorrect(question, result.answers?.[question.id])).length, totalQuestions: selected.length };
}

export function pendingTeacherPrintResults(results: readonly TeacherPrintResult[], teacherId: string, examId: string, since: string, now = Date.now(), baselineIds?: readonly string[]): TeacherPrintResult[] {
  const cutoff = Date.parse(since);
  if (!Number.isFinite(cutoff)) return [];
  const baseline = baselineIds ? new Set(baselineIds) : null;
  return results.filter(result => {
    if (result.teacherId !== teacherId || result.examId !== examId || !Number.isFinite(Date.parse(result.submittedAt)) || (baseline ? baseline.has(result.id) : Date.parse(result.submittedAt) < cutoff)) return false;
    if (!result.teacherPrint) return true;
    // A claim can be recovered before dispatch; dispatching is deliberately never replayed automatically.
    return result.teacherPrint.status === 'claimed' && now - Date.parse(result.teacherPrint.claimedAt) > 60_000;
  }).sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || a.id.localeCompare(b.id));
}

export interface PreparedTeacherReceipt {
  html: string;
  score: number;
  totalQuestions: number;
  studentName: string;
}

export interface TeacherPrintQueueDependencies {
  claim: (result: TeacherPrintResult) => Promise<TeacherPrintResult | null>;
  prepare: (result: TeacherPrintResult) => Promise<PreparedTeacherReceipt>;
  markDispatching: (result: TeacherPrintResult, receipt: PreparedTeacherReceipt) => Promise<boolean>;
  print: (html: string) => Promise<void>;
  markSent: (result: TeacherPrintResult) => Promise<void>;
  markFailed: (result: TeacherPrintResult) => Promise<void>;
  report: (id: string, status: 'working' | 'sent' | 'failed' | 'uncertain', message: string) => void;
}

/** A single sequential worker; Firestore claims arbitrate across teacher tabs and machines. */
export class TeacherExamPrintQueue {
  private pending = new Map<string, TeacherPrintResult>();
  private attempted = new Set<string>();
  private enabled = true;
  private running: Promise<void> | null = null;
  constructor(private dependencies: TeacherPrintQueueDependencies) {}

  add(results: readonly TeacherPrintResult[]): void {
    if (!this.enabled) return;
    for (const result of results) if (!this.attempted.has(result.id)) this.pending.set(result.id, result);
    if (!this.running) {
      this.running = this.drain().finally(() => { this.running = null; if (this.enabled && this.pending.size) this.add([]); });
    }
  }

  stop(): void { this.enabled = false; this.pending.clear(); }
  async idle(): Promise<void> { while (this.running) await this.running; }

  private async drain(): Promise<void> {
    while (this.enabled && this.pending.size) {
      const result = [...this.pending.values()].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || a.id.localeCompare(b.id))[0];
      this.pending.delete(result.id);
      this.attempted.add(result.id);
      let claimed: TeacherPrintResult | null = null;
      let dispatching = false;
      let receipt: PreparedTeacherReceipt | null = null;
      try {
        claimed = await this.dependencies.claim(result);
        if (!claimed) { this.attempted.delete(result.id); continue; }
        this.dependencies.report(result.id, 'working', 'Đang chấm và chuẩn bị phiếu…');
        receipt = await this.dependencies.prepare(claimed);
        if (!await this.dependencies.markDispatching(claimed, receipt)) { this.attempted.delete(result.id); continue; }
        dispatching = true;
        await this.dependencies.print(receipt.html);
        await this.dependencies.markSent(claimed);
        this.dependencies.report(result.id, 'sent', `${receipt.studentName}: đã gửi lệnh in · ${receipt.score}/${receipt.totalQuestions} câu đúng`);
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code).replace(/^firestore\//, '') : '';
        const retryable = !dispatching && ['unavailable', 'deadline-exceeded', 'aborted', 'network-request-failed'].includes(code);
        if (!claimed || retryable) this.attempted.delete(result.id);
        if (claimed && !dispatching && !retryable) await this.dependencies.markFailed(claimed).catch(() => {});
        const detail = error instanceof Error ? error.message : 'Lỗi kết nối hoặc máy in.';
        this.dependencies.report(result.id, dispatching ? 'uncertain' : retryable ? 'working' : 'failed', dispatching ? `${receipt?.studentName || result.studentId}: cần kiểm tra máy in; không tự gửi lại để tránh trùng phiếu. ${detail}` : retryable ? `Chưa gửi lệnh in; sẽ tự thử lại khi kết nối ổn định. ${detail}` : `Chưa gửi lệnh in: ${detail}`);
      }
    }
  }
}
