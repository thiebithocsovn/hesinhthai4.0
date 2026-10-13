import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  createPlickerLiveSession,
  normalizePlickerLiveRoom,
  sanitizePlickerQuestionSet,
  type PlickerLiveQuestionSet,
} from '../src/lib/plickerLive';
import {
  buildPlickerStudentScoreRows,
  createPlickerReportWorkbook,
  deletePlickerReport,
  getPlickerReportMaximumScore,
  inferPlickerSchoolYear,
  plickerExcelColumnName,
  resolvePlickerReportStudents,
  type PlickerClassroomReport,
  type PlickerReportSettings,
} from '../src/lib/plickerReports';
import {
  formatPlickerScore,
  normalizePlickerQuestionPoints,
  PLICKER_DEFAULT_QUESTION_POINTS,
  PLICKER_MAX_QUESTION_POINTS,
  sumPlickerScores,
} from '../src/lib/plickerScoring';

let checks = 0;

for (const [input, expected] of [
  [undefined, 1], [null, 1], ['', 1], [0, 0], [0.25, 0.25], [1.5, 1.5], ['2,75', 2.75],
  [3.456, 3.46], [-1, 1], [Number.NaN, 1], [Number.POSITIVE_INFINITY, 1], [150, 100],
] as const) {
  assert.equal(normalizePlickerQuestionPoints(input), expected);
  checks += 1;
}
assert.equal(PLICKER_DEFAULT_QUESTION_POINTS, 1);
assert.equal(PLICKER_MAX_QUESTION_POINTS, 100);
assert.equal(sumPlickerScores([0.1, 0.2, null, undefined, 0.05]), 0.35);
assert.equal(formatPlickerScore(1.25), '1,25');
assert.equal(inferPlickerSchoolYear(new Date(2026, 7, 23)), '2026 - 2027');
assert.equal(inferPlickerSchoolYear(new Date(2027, 4, 20)), '2026 - 2027');
checks += 6;

for (const [column, expected] of [[0, 'A'], [1, 'B'], [25, 'Z'], [26, 'AA'], [27, 'AB'], [51, 'AZ'], [52, 'BA'], [64, 'BM']] as const) {
  assert.equal(plickerExcelColumnName(column), expected);
  checks += 1;
}
assert.throws(() => plickerExcelColumnName(-1), RangeError);
checks += 1;

const students = [
  { id: 'an', classId: '8a', name: 'Nguyễn Văn An', cardId: 1 },
  { id: 'binh', classId: '8a', name: 'Trần Thị Bình', cardId: 2 },
  { id: 'chau', classId: '8a', name: 'Phạm Minh Châu', cardId: 3 },
  { id: 'dung', classId: '8a', name: 'Lê Thị Dung', cardId: 4 },
];
const response = (student: typeof students[number], answer: 'A' | 'B' | 'C' | 'D', timestamp: number) => ({
  studentId: student.id,
  studentName: student.name,
  cardId: student.cardId,
  answer,
  confidence: 0.98,
  timestamp,
  source: 'camera' as const,
});

const report: PlickerClassroomReport = {
  id: 'session-8a',
  classId: '8a',
  className: '8A Kim Lư',
  setTitle: 'Toán 8 – Đơn thức',
  completedAt: '2026-08-23T09:15:00.000Z',
  studentCount: students.length,
  students,
  questions: [
    {
      text: 'Đơn thức nào đúng?',
      correctAnswer: 'B',
      gradingType: 'graded',
      points: 2.5,
      responses: [response(students[0], 'A', 2), response(students[0], 'B', 5), response(students[1], 'A', 3)],
    },
    {
      text: 'Tính 2 + 2',
      correctAnswer: 'C',
      gradingType: 'graded',
      points: 0.75,
      responses: [response(students[0], 'C', 7), response(students[2], 'C', 8)],
    },
    {
      text: 'Em thích hoạt động nào?',
      correctAnswer: null,
      gradingType: 'survey',
      points: 7,
      responses: [response(students[0], 'D', 9), response(students[3], 'A', 9)],
    },
  ],
};

assert.deepEqual(resolvePlickerReportStudents(report).map(student => student.id), ['an', 'binh', 'chau', 'dung']);
assert.deepEqual(resolvePlickerReportStudents({ ...report, students: [] }, students), []);
const legacy = { ...report, students: undefined };
assert.deepEqual(resolvePlickerReportStudents(legacy, students).map(student => student.id), ['an', 'binh', 'chau', 'dung']);
assert.deepEqual(resolvePlickerReportStudents(legacy).map(student => student.id), ['an', 'binh', 'chau', 'dung']);
assert.equal(resolvePlickerReportStudents(legacy, [{ id: 'other', name: 'Lớp khác', classId: '8b' }]).length, 0);
assert.equal(resolvePlickerReportStudents({ ...report, students: [...students, students[0]] }).length, 4);
assert.equal(resolvePlickerReportStudents({ ...report, students: Array.from({ length: 80 }, (_, index) => ({ id: `student-${index}`, name: `Học sinh ${index}`, classId: '8a', cardId: index + 1 })) }).length, 63);
checks += 7;

const rows = buildPlickerStudentScoreRows(report);
assert.equal(rows.length, 4);
assert.deepEqual(rows[0].questionScores, [2.5, 0.75, null]);
assert.equal(rows[0].totalScore, 3.25);
assert.deepEqual(rows[1].questionScores, [0, null, null]);
assert.equal(rows[1].totalScore, 0);
assert.deepEqual(rows[2].questionScores, [null, 0.75, null]);
assert.equal(rows[2].totalScore, 0.75);
assert.deepEqual(rows[3].questionScores, [null, null, null]);
assert.equal(rows[3].totalScore, 0);
assert.equal(getPlickerReportMaximumScore(report), 3.25);
checks += 10;

const reportA = { ...report, id: 'report-a', className: '8A' };
const reportB = { ...report, id: 'report-b', className: '8B' };
const reportC = { ...report, id: 'report-c', className: '8C' };
const reportHistory = [reportA, reportB, reportC];
const deleteSelected = deletePlickerReport(reportHistory, 'report-b', 'report-b');
assert.deepEqual(deleteSelected.reports.map(item => item.id), ['report-a', 'report-c']);
assert.equal(deleteSelected.selectedReportId, 'report-c');
assert.equal(reportHistory.length, 3, 'Deleting a report must not mutate the previous state.');
const deleteFirst = deletePlickerReport(reportHistory, 'report-a', 'report-a');
assert.equal(deleteFirst.selectedReportId, 'report-b');
const deleteLast = deletePlickerReport(reportHistory, 'report-c', 'report-c');
assert.equal(deleteLast.selectedReportId, 'report-b');
const deleteUnselected = deletePlickerReport(reportHistory, 'report-b', 'report-a');
assert.equal(deleteUnselected.selectedReportId, 'report-a');
assert.deepEqual(deleteUnselected.reports.map(item => item.id), ['report-a', 'report-c']);
const deleteOnly = deletePlickerReport([reportA], 'report-a', 'report-a');
assert.deepEqual(deleteOnly.reports, []);
assert.equal(deleteOnly.selectedReportId, null);
const missingReport = deletePlickerReport(reportHistory, 'not-found', 'report-b');
assert.strictEqual(missingReport.reports, reportHistory);
assert.equal(missingReport.selectedReportId, 'report-b');
assert.equal(JSON.parse(JSON.stringify(deleteSelected.reports)).some((item: PlickerClassroomReport) => item.id === 'report-b'), false);
checks += 12;

const settings: PlickerReportSettings = {
  schoolName: 'THCS Kim Lư',
  schoolYear: '2026 - 2027',
  subject: 'Toán',
  teacherName: 'Nguyễn Trung Tuyến',
  examDate: '2026-08-23',
};

const bytes = createPlickerReportWorkbook(report, students, settings);
assert.equal(bytes[0], 0x50);
assert.equal(bytes[1], 0x4b);
assert.equal(bytes.byteLength > 7000, true);
const workbook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellStyles: true });
assert.deepEqual(workbook.SheetNames, ['Bảng điểm']);
const sheet = workbook.Sheets['Bảng điểm'];
assert.equal(sheet.A2?.v, 'TRƯỜNG: THCS Kim Lư');
assert.equal(sheet.A3?.v, 'Ngày kiểm tra: 23/08/2026');
assert.equal(sheet.A5?.v, 'BÀI KIỂM TRA THƯỜNG XUYÊN ONLINE NĂM HỌC 2026 - 2027');
assert.equal(sheet.A6?.v, 'Môn: Toán     Lớp: 8A Kim Lư');
assert.equal(sheet.A8?.v, 'STT');
assert.equal(sheet.B8?.v, 'Họ và tên');
assert.equal(sheet.C8?.v, 'Điểm câu hỏi');
assert.equal(sheet.F8?.v, 'Tổng điểm');
assert.equal(sheet.C9?.v, 1);
assert.equal(sheet.D9?.v, 2);
assert.equal(sheet.E9?.v, 3);
checks += 15;

assert.equal(sheet.A10?.v, 1);
assert.equal(sheet.B10?.v, 'Nguyễn Văn An');
assert.equal(sheet.C10?.v, 2.5);
assert.equal(sheet.D10?.v, 0.75);
assert.equal(sheet.E10?.v, '');
assert.equal(sheet.F10?.v, 3.25);
assert.equal(sheet.F10?.f, 'SUM(C10:E10)');
assert.equal(sheet.B11?.v, 'Trần Thị Bình');
assert.equal(sheet.C11?.v, 0);
assert.equal(sheet.F11?.v, 0);
assert.equal(sheet.B12?.v, 'Phạm Minh Châu');
assert.equal(sheet.C12?.v, '');
assert.equal(sheet.D12?.v, 0.75);
assert.equal(sheet.F12?.v, 0.75);
assert.equal(sheet.B13?.v, 'Lê Thị Dung');
assert.equal(sheet.F13?.v, 0);
assert.equal(sheet.D24?.v, 'Giáo viên bộ môn');
assert.equal(sheet.D28?.v, 'Nguyễn Trung Tuyến');
checks += 18;

const merged = sheet['!merges']?.map(range => XLSX.utils.encode_range(range)) || [];
for (const range of ['A5:F5', 'A6:F6', 'A8:A9', 'B8:B9', 'C8:E8', 'F8:F9', 'D24:F24']) {
  assert.equal(merged.includes(range), true, `Expected merged template range ${range}.`);
  checks += 1;
}
assert.equal(sheet['!cols']?.[1]?.width || 0, 30);
checks += 1;

const manyQuestions: PlickerClassroomReport = {
  ...report,
  questions: Array.from({ length: 30 }, (_, index) => ({
    text: `Câu ${index + 1}`,
    correctAnswer: 'A' as const,
    points: 0.25,
    responses: [response(students[0], 'A', index + 1)],
  })),
};
const wideWorkbook = XLSX.read(createPlickerReportWorkbook(manyQuestions, students, settings), { type: 'array', cellFormula: true });
const wide = wideWorkbook.Sheets['Bảng điểm'];
assert.equal(wide.AG8?.v, 'Tổng điểm');
assert.equal(wide.AF9?.v, 30);
assert.equal(wide.AG10?.v, 7.5);
assert.equal(wide.AG10?.f, 'SUM(C10:AF10)');
checks += 4;

const questionSet: PlickerLiveQuestionSet = {
  id: 'set-score',
  title: 'Toán 8',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
  questions: [
    { id: 1, text: 'Câu 1', options: { A: '1', B: '2' }, correctAnswer: 'A', points: 2.5 },
    { id: 2, text: 'Câu 2', options: { A: '1', B: '2' }, correctAnswer: 'B', points: 0.75 },
    { id: 3, text: 'Câu cũ', options: { A: '1', B: '2' }, correctAnswer: 'A' },
  ],
};
const safe = sanitizePlickerQuestionSet(questionSet);
assert.deepEqual(safe.questions.map(question => normalizePlickerQuestionPoints(question.points)), [2.5, 0.75, 1]);
const liveSession = createPlickerLiveSession({
  sessionId: 'session-score', ownerUid: 'teacher-score', classId: '8a', className: '8A',
  students, questionSet, controllerDeviceId: 'phone-score',
});
assert.deepEqual(liveSession.questionSet.questions.map(question => normalizePlickerQuestionPoints(question.points)), [2.5, 0.75, 1]);
const liveRoom = normalizePlickerLiveRoom({
  kind: 'plicker_live_session', ownerUid: 'teacher-score', authorId: 'teacher-score', librarySets: [questionSet],
  rosters: { '8a': students }, devices: {}, activeSession: liveSession,
}, 'teacher-score');
assert.equal(liveRoom?.librarySets[0].questions[0].points, 2.5);
assert.equal(liveRoom?.activeSession?.questionSet.questions[1].points, 0.75);
checks += 4;

const xmlSafeReport: PlickerClassroomReport = {
  ...report,
  className: '8A <Kim & Lư>',
  students: [{ ...students[0], name: '=SUM(1,2) & <An>' }],
};
const safeWorkbook = XLSX.read(createPlickerReportWorkbook(xmlSafeReport, [], {
  ...settings,
  schoolName: 'THCS <Kim & Lư>',
}), { type: 'array' });
const safeSheet = safeWorkbook.Sheets['Bảng điểm'];
assert.equal(safeSheet.A2?.v, 'TRƯỜNG: THCS <Kim & Lư>');
assert.equal(safeSheet.B10?.v, '=SUM(1,2) & <An>');
assert.equal(safeSheet.B10?.f, undefined);
checks += 3;

const editor = readFileSync(new URL('../src/components/PlickerQuestionEditor.tsx', import.meta.url), 'utf8');
const classroom = readFileSync(new URL('../src/components/PlickerClassroom.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');

for (const feature of ['Điểm của câu hỏi', 'Điểm câu', 'Tổng điểm bộ câu hỏi', 'PLICKER_DEFAULT_QUESTION_POINTS']) {
  assert.equal(editor.includes(feature), true, `Missing question scoring editor feature: ${feature}`);
  checks += 1;
}
for (const feature of [
  'students: classStudents.map', 'points: normalizePlickerQuestionPoints(question.points)',
  'createPlickerReportWorkbook(', 'buildPlickerStudentScoreRows(', 'Xuất bảng điểm Excel',
  'CSV chi tiết', 'Tên trường', 'Môn học', 'Năm học', 'Ngày kiểm tra', 'Giáo viên bộ môn',
  'Điểm câu hỏi', 'Tổng điểm', '.xlsx', 'Xóa báo cáo', 'confirmReportDeletion',
  'deletePlickerReport(reports, deletingReport.id, selectedReportId)', 'plicker-delete-report-title',
  'setDeletingReport(null)',
]) {
  assert.equal(classroom.includes(feature), true, `Missing score report feature: ${feature}`);
  checks += 1;
}
assert.match(dashboard, /schoolName=\{currentUser/u);
assert.match(dashboard, /teacherName=\{currentUser/u);
assert.match(worker, /CACHE_PREFIX\}v\d+/u);
checks += 3;

if (process.env.PLICKER_REPORT_TEST_OUTPUT) writeFileSync(process.env.PLICKER_REPORT_TEST_OUTPUT, bytes);
console.info(`Plicker per-question scoring and styled Excel class score reports: ${checks} checks passed.`);
