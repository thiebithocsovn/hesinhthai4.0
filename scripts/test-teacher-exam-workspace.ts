import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterTeacherExams, summarizeTeacherExams, teacherExamState, type TeacherWorkspaceExam } from '../src/lib/teacherExamWorkspace.ts';

const at = Date.parse('2026-11-23T08:00:00.000Z');
const records: TeacherWorkspaceExam[] = [
  { id: 'legacy-draft', title: 'Kiểm tra Toán 8', status: 'draft', questions: [{}] },
  { id: 'exam-open', title: 'Thi Tiếng Việt', status: 'published', startTime: '2026-11-22T08:00:00Z', versionCodes: ['AB123'] },
  { id: 'exam-upcoming', title: 'Đề kiểm tra Hóa học', status: 'published', startTime: '2026-11-24T08:00:00Z', shuffledVersions: [{ code: 'XY456' }] },
  { id: 'exam-closed', title: 'Lịch sử', status: 'closed', startTime: '2026-11-20T08:00:00Z' },
];
const before = JSON.stringify(records);
assert.equal(teacherExamState(records[0], at), 'draft');
assert.equal(teacherExamState(records[1], at), 'open');
assert.equal(teacherExamState(records[2], at), 'upcoming');
assert.equal(teacherExamState(records[3], at), 'closed');
assert.equal(teacherExamState({ id: 'old', title: 'No schedule', status: 'published' }, at), 'open');
assert.equal(teacherExamState({ id: 'old', title: 'Bad schedule', status: 'published', startTime: 'invalid' }, at), 'open');
assert.deepEqual(summarizeTeacherExams(records, at), { all: 4, draft: 1, upcoming: 1, open: 1, closed: 1 });
assert.deepEqual(filterTeacherExams(records, '', 'draft', at).map(e => e.id), ['legacy-draft']);
assert.deepEqual(filterTeacherExams(records, 'TOAN 8', 'all', at).map(e => e.id), ['legacy-draft']);
assert.deepEqual(filterTeacherExams(records, 'TIENG VIET', 'all', at).map(e => e.id), ['exam-open']);
assert.deepEqual(filterTeacherExams(records, 'hoa hoc', 'upcoming', at).map(e => e.id), ['exam-upcoming']);
assert.deepEqual(filterTeacherExams(records, 'XY456', 'all', at).map(e => e.id), ['exam-upcoming']);
assert.deepEqual(filterTeacherExams(records, 'ab123', 'open', at).map(e => e.id), ['exam-open']);
assert.equal(filterTeacherExams(records, 'ab123', 'closed', at).length, 0);
assert.equal(JSON.stringify(records), before, 'Filtering must never mutate existing documents.');
const manager = readFileSync(new URL('../src/components/ExamManagerLegacy.tsx', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/components/ExamManager.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/TeacherExamOverview.tsx', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../src/components/TeacherExamNavigation.tsx', import.meta.url), 'utf8');
assert.ok(manager.includes("if (teacherTab !== 'exams')"), 'Overview must reuse exams-only Firestore subscription.');
assert.ok(manager.includes("if (teacherTab === 'results')"), 'Results remain fetched only in the results workspace.');
assert.ok(manager.includes("if (teacherTab === 'monitoring')"), 'Sessions remain fetched only in monitoring.');
assert.ok(manager.includes("collection(db, 'exams')") && manager.includes("collection(db, 'students')") && manager.includes("collection(db, 'results')"), 'Legacy Firestore collections stay intact.');
assert.ok(manager.includes("teacherTab === 'exams' && examPage === 'overview'") && manager.includes("teacherTab === 'exams' && examPage === 'list'"), 'Overview and list share the same teacher tab.');
assert.ok(manager.includes('visibleExams.map((exam, index)') && manager.includes('visibleExams.map(exam =>'), 'Both desktop and mobile lists use the same non-destructive filters.');
assert.ok(manager.includes('TeacherExamPrintStation'), 'Teacher print queue remains connected.');
assert.ok(entry.includes('ExamManagerLegacy') && entry.includes('UnifiedStudentExamRunner'), 'Existing teacher and student entry points are kept.');
assert.ok(dashboard.includes('summarizeTeacherExams(exams, now)') && !dashboard.includes('collection(db,'), 'Dashboard relies only on already-fetched exams.');
assert.ok(navigation.includes('aria-current') && navigation.includes('compact'), 'Navigation supports desktop and mobile.');
console.info('Teacher exam workspace: backward compatibility and presentation checks passed.');

const station = readFileSync(new URL('../src/components/TeacherExamPrintStation.tsx', import.meta.url), 'utf8');
assert.ok(station.includes('useState(false)') && station.includes('hidden={!expanded}') && station.includes('aria-expanded={expanded}'), 'Print controls are collapsed by default and keyboard accessible.');
assert.ok(station.includes('station && <button type="button" onClick={stop}'), 'Stop control remains visible when settings are collapsed.');
assert.ok(manager.includes('workspaceCounts = summarizeTeacherExams(exams, Date.now())') && manager.includes('aria-pressed={examStatusFilter===value}'), 'State summary cards use the existing exam filter.');
assert.ok(manager.includes('setExamSearch(\'\');setExamStatusFilter(\'all\');'), 'Reset filters restores all exams.');
assert.ok(manager.includes('handleShuffleExam(exam.id)') && manager.includes('handleExportAnswers(exam.id)') && manager.includes('finalizeClosedExamSessions(exam)') && manager.includes('setExamToDelete(exam.id)'), 'All old actions remain connected.');
console.info('Compact workspace controls, existing actions and print station regression checks passed.');
