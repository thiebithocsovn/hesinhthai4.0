// Recover the last server-acknowledged answers of a student when the teacher closes an exam.
// Results are written only by an authorized teacher; drafts remain private in exam_sessions.
import type { ReceiptExam } from './examReceipt';
import { gradeSubmittedExam } from './teacherExamPrinting';

export interface ExamDraftSession {
  id: string;
  examId: string;
  studentId: string;
  teacherId?: string;
  examVersion?: string;
  draftAnswers?: Record<string, unknown>;
  draftCheatEvents?: { rightClicks: number; tabChanges: number; windowResizes: number };
}

export function buildClosedExamResult(exam: ReceiptExam & { teacherId?: string }, session: ExamDraftSession, at: string) {
  if (!exam.teacherId || session.examId !== exam.id || session.teacherId !== exam.teacherId ||
      session.id !== `${session.studentId}_${session.examId}`) {
    throw new Error('Không thể thu bài: thông tin phiên thi không khớp với kỳ thi.');
  }
  const answers = session.draftAnswers && typeof session.draftAnswers === 'object' && !Array.isArray(session.draftAnswers) ? session.draftAnswers : {};
  const examVersion = session.examVersion || 'Gốc';
  const grading = gradeSubmittedExam(exam, {
    id: session.id, examId: exam.id, studentId: session.studentId,
    teacherId: exam.teacherId, score: 0, totalQuestions: exam.questions.length,
    submittedAt: at, answers, examVersion,
  });
  return {
    id: session.id, examId: exam.id, studentId: session.studentId,
    teacherId: exam.teacherId, ...grading, submittedAt: at,
    answers,
    cheatEvents: session.draftCheatEvents || { rightClicks: 0, tabChanges: 0, windowResizes: 0 },
    examVersion, closedByTeacher: true,
  };
}
