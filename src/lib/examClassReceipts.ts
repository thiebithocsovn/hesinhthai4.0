import {
  buildExamClassReceiptsHtml, getReceiptStudentClassId,
  type ExamReceiptEntry, type ReceiptExam, type ReceiptResult, type ReceiptStudent,
} from './examReceipt';
import { examHasManualQuestions, summarizeExamScore } from './examManualGrading';
import { receiptQuestionIsCorrect } from './examReceipt';
import { gradeSubmittedExam, type TeacherPrintState } from './teacherExamPrinting';
import { canAccessTeacherOwnedRecord, type TeacherAccessScope, type TeacherOwnedRecord } from './teacherIsolation';

export interface ClassReceiptExam extends ReceiptExam, TeacherOwnedRecord {}
export interface ClassReceiptStudent extends ReceiptStudent, TeacherOwnedRecord {}
export interface ClassReceiptClass extends TeacherOwnedRecord { id: string; name: string }
export interface ClassReceiptResult extends ReceiptResult, TeacherOwnedRecord {
  examId: string;
  studentId: string;
  receiptPrintedAt?: string;
  teacherPrint?: TeacherPrintState;
}
export interface ClassReceiptSession extends TeacherOwnedRecord { examId: string; studentId: string; startTime: string }

export function classReceiptClasses(exam: ClassReceiptExam, classes: readonly ClassReceiptClass[], access: TeacherAccessScope): ClassReceiptClass[] {
  if (!canAccessTeacherOwnedRecord(access, exam)) return [];
  const names = new Map<string, ClassReceiptClass>();
  for (const [id, name] of Object.entries(exam.classNames || {})) {
    if (typeof name === 'string' && name.trim()) names.set(id, { id, name, teacherId: exam.teacherId });
  }
  for (const item of classes) {
    if (canAccessTeacherOwnedRecord(access, item) && item.teacherId === exam.teacherId) names.set(item.id, item);
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
}

export function prepareClassExamReceipts(
  exam: ClassReceiptExam, classId: string, results: readonly ClassReceiptResult[],
  students: readonly ClassReceiptStudent[], classes: readonly ClassReceiptClass[],
  sessions: readonly ClassReceiptSession[], access: TeacherAccessScope,
): { html: string; className: string; entries: ExamReceiptEntry[]; pending: number; previouslyPrinted: number } {
  if (!canAccessTeacherOwnedRecord(access, exam)) throw new Error('Tài khoản không có quyền xuất biên bản kỳ thi này.');
  const directory = classReceiptClasses(exam, classes, access);
  const selectedClass = directory.find(item => item.id === classId);
  if (!selectedClass) throw new Error('Hãy chọn một lớp để xuất biên bản.');
  const receiptExam = { ...exam, classNames: Object.fromEntries(directory.map(item => [item.id, item.name])) };
  const roster = new Map(students.filter(student => canAccessTeacherOwnedRecord(access, student) && student.teacherId === exam.teacherId).map(student => [student.id, student]));
  const latest = new Map<string, ClassReceiptResult>();
  for (const result of results) {
    if (result.examId !== exam.id || result.teacherId !== exam.teacherId || !canAccessTeacherOwnedRecord(access, result)) continue;
    const student = roster.get(result.studentId) || { id: result.studentId };
    if (getReceiptStudentClassId(receiptExam, student, result) !== classId) continue;
    const previous = latest.get(result.studentId);
    const time = Date.parse(result.submittedAt) || 0;
    const previousTime = previous ? Date.parse(previous.submittedAt) || 0 : -1;
    if (!previous || time > previousTime || (time === previousTime && result.id.localeCompare(previous.id) > 0)) latest.set(result.studentId, result);
  }
  const sessionStarts = new Map(sessions.filter(session => session.examId === exam.id && session.teacherId === exam.teacherId && canAccessTeacherOwnedRecord(access, session))
    .map(session => [session.studentId, session.startTime]));
  const entries: ExamReceiptEntry[] = [...latest.values()].map(result => {
    const student = roster.get(result.studentId) || { id: result.studentId, name: `Học sinh (mã: ${result.studentId})` };
    try {
      const automatic = gradeSubmittedExam(exam, { ...result, teacherId: typeof result.teacherId === 'string' ? result.teacherId : '' });
      return { student, result: { ...result, ...automatic }, startedAt: sessionStarts.get(result.studentId) };
    } catch (error) {
      throw new Error(`${student.name}: ${error instanceof Error ? error.message : 'Chưa thể tạo biên bản.'}`);
    }
  });
  const firstName = (name: string) => name.trim().split(/\s+/).pop() || '';
  entries.sort((a, b) => firstName(a.student.name).localeCompare(firstName(b.student.name), 'vi') || a.student.name.localeCompare(b.student.name, 'vi') || a.student.id.localeCompare(b.student.id));
  return {
    html: buildExamClassReceiptsHtml(receiptExam, entries, selectedClass.name), className: selectedClass.name, entries,
    pending: examHasManualQuestions(exam) ? entries.filter(entry => !summarizeExamScore(exam, entry.result, receiptQuestionIsCorrect).complete).length : 0,
    previouslyPrinted: [...latest.values()].filter(result => result.receiptPrintedAt || result.teacherPrint?.status === 'sent' || result.teacherPrint?.status === 'dispatching').length,
  };
}
