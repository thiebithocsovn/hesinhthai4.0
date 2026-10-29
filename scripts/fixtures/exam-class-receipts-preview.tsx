import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExamClassReceiptsDialog from '../../src/components/ExamClassReceiptsDialog';
import type { ClassReceiptExam, ClassReceiptResult } from '../../src/lib/examClassReceipts';
import '../../src/index.css';

// Disposable, browser-local QA data. This fixture never connects to Firebase.
const exam: ClassReceiptExam = {
  id: 'qa-exam', teacherId: 'qa-teacher', title: 'KIỂM TRA GIỮA HỌC KỲ I – TIN HỌC 8 – DỮ LIỆU KIỂM THỬ', durationMinutes: 45,
  receiptSettings: { schoolName: 'TRƯỜNG KIỂM THỬ GIAO DIỆN', subject: 'Tin học', invigilatorName: 'Giáo viên kiểm thử', includeWrittenQuestions: true },
  classNames: { 'qa-8a4': '8A4', 'qa-8b1': '8B1 (chưa có bài nộp)' },
  questions: [
    { id: 'q1', text: 'Thiết bị nào là thiết bị nhập?', options: ['Bàn phím', 'Màn hình', 'Loa', 'Máy in'], correctAnswer: 0, points: 2 },
    { id: 'q2', text: 'Đơn vị nào dùng để đo dung lượng?', options: ['Mét', 'Giây', 'Byte', 'Vôn'], correctAnswer: 2, points: 2 },
    { id: 'q3', text: 'Nêu cách giữ an toàn thông tin cá nhân trên mạng.', options: [], correctAnswer: -1, type: 'essay', rubric: [{ id: 'r1', text: 'Không chia sẻ mật khẩu', points: 3 }, { id: 'r2', text: 'Kiểm tra đường liên kết', points: 3 }] },
  ],
};
const classes = Object.entries(exam.classNames!).map(([id, name]) => ({ id, name, teacherId: 'qa-teacher' }));
const students = [
  { id: 'qa-student-1', teacherId: 'qa-teacher', name: 'Học sinh kiểm thử An', classId: 'qa-8a4' },
  { id: 'qa-student-2', teacherId: 'qa-teacher', name: 'Học sinh kiểm thử Bình', classId: 'qa-8a4' },
];
const results: ClassReceiptResult[] = students.map((student, index) => ({
  id: `qa-result-${index}`, teacherId: 'qa-teacher', studentId: student.id, examId: exam.id,
  submittedAt: '2026-10-29T01:00:00.000Z', score: 2, totalQuestions: 3,
  answers: { q1: 0, q2: 2, q3: 'Em không chia sẻ mật khẩu và kiểm tra đường liên kết trước khi bấm vào.' },
  ...(index === 0 ? { manualGrades: { q3: { points: 6, checks: ['r1', 'r2'], comment: 'Trình bày đầy đủ.', gradedAt: '2026-10-29T01:05:00.000Z' } } } : {}),
}));
const sessions = students.map(student => ({ examId: exam.id, teacherId: 'qa-teacher', studentId: student.id, startTime: '2026-10-29T00:15:00.000Z' }));

function Preview() {
  const [open, setOpen] = useState(true);
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-800"><h1 className="text-xl font-bold">Kiểm tra giao diện biên bản thi cả lớp</h1><p className="my-3">Dữ liệu kiểm thử, không phải kết quả thực tế.</p><button onClick={() => setOpen(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-white">Mở lại biên bản</button>{open ? <ExamClassReceiptsDialog exam={exam} classes={classes} students={students} results={results} sessions={sessions} access={{ role: 'teacher', ownerUid: 'qa-teacher' }} initialClassId="all" dataReady sessionsLoading={false} sessionsError="" onClose={() => setOpen(false)} /> : <p role="status" className="mt-3">Đã đóng biên bản.</p>}</main>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
