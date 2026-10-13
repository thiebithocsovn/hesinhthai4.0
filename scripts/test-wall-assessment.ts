import assert from 'node:assert/strict';
import { createWallAiRequest, wallAnalysisPrompt, parseWallAnalysis, newWallAssessment, approvedWallAssessment,
  wallPracticePrompt, parseWallPractice, assignWallPractice, recordWallPracticeAttempt, wallProgressRows,
  wallProgressCsv, studentWallFeedback, studentWallWorksheet, wallWorkRevision, wallAssessmentVersion,
  prepareWallAssessmentSave, type WallAssessment } from '../src/lib/learningWallAssessment.ts';
import { sharedWallPost, type WallPost } from '../src/lib/learningWall.ts';

const post: WallPost = { id: 'work-one', authorId: 'teacher-one', teacherId: 'teacher-one', boardId: '8a', categoryId: '8a',
  studentName: 'Nguyễn An', title: 'Sơ đồ an toàn số', text: 'Lừa đảo -> chia sẻ mật khẩu để nhận thưởng',
  score: 9, comments: [{ id: 'old', text: 'PRIVATE-TEACHER-COMMENT' }],
  imageSrc: 'data:image/png;base64,YQ==', attachments: [{ id: 'doc', kind: 'file', name: 'work.docx', url: 'data:application/octet-stream;base64,YQ==' }] };
const context = { subject: 'Tin học', grade: '8', task: 'Phân biệt các nguy cơ truy cập website không phù hợp.',
  criteria: 'Không cung cấp mật khẩu, OTP cho người lạ.', transcript: '' };
const request = await createWallAiRequest(post, context);
assert.equal(request.media.length, 1);
assert.equal(request.media[0].mimeType, 'image/png');
assert.equal(request.unreadAttachments, 1, 'Unsupported office documents are declared unread, never pretended to have been analyzed.');
const prompt = wallAnalysisPrompt(request);
for (const privateValue of ['Nguyễn An', 'teacher-one', 'PRIVATE-TEACHER-COMMENT', 'YQ==']) assert.ok(!prompt.includes(privateValue));
assert.ok(prompt.includes('giả thuyết'));
assert.equal(await wallWorkRevision(post), await wallWorkRevision({ ...post, score: 2, comments: [], likedBy: ['u'] }));
assert.notEqual(await wallWorkRevision(post), await wallWorkRevision({ ...post, text: 'Bài sửa lại' }));
assert.notEqual(await wallWorkRevision(post), await wallWorkRevision({ ...post, imageSrc: '' }));
assert.notEqual(await wallWorkRevision(post), await wallWorkRevision({ ...post, studentName: 'Bình' }));
await assert.rejects(createWallAiRequest(post, { ...context, task: '' }));
await assert.rejects(createWallAiRequest({ ...post, title: '', text: '', imageSrc: '', attachments: [] }, context));
const textRequest = await createWallAiRequest({ ...post, imageSrc: '', attachments: [{ id: 'txt', kind: 'file', name: 'work.txt',
  url: 'data:application/octet-stream;base64,' + Buffer.from('nội dung trong tệp').toString('base64') }] }, context);
assert.ok(textRequest.workText.includes('nội dung trong tệp'));
const pdfRequest = await createWallAiRequest({ ...post, imageSrc: '', attachments: [{ id: 'pdf', kind: 'file', name: 'work.pdf',
  url: 'data:application/octet-stream;base64,YQ==' }] }, context);
assert.equal(pdfRequest.media[0].mimeType, 'application/pdf');

const aiData = { requestId: request.id, summary: 'Cần phân biệt hành vi an toàn.', strengths: ['Có nhận diện lừa đảo.'], limitations: ['Chưa đọc nội dung Word.'],
  errors: [{ id: 'AI-UNTRUSTED-ID', skill: 'Bảo vệ thông tin đăng nhập', title: 'Chia sẻ mật khẩu', evidence: 'Cụm “chia sẻ mật khẩu để nhận thưởng”.',
    hypothesis: 'Có thể em nhầm giữa xác thực và cung cấp bí mật.', confidence: 'medium', verificationQuestion: 'Em có gửi OTP cho người hứa tặng quà không?', remediation: 'Phân biệt việc đăng nhập và lừa lấy OTP.',
    decision: 'confirmed', teacherCause: 'MALICIOUS-APPROVAL' }], feedback: 'Em đã nhận biết lừa đảo; hãy chỉnh nhánh xử lý thông tin đăng nhập.',
  review: { status: 'approved', score: 10 }, score: 10, teacherUid: 'attacker' };
const analysis = parseWallAnalysis('```json\n' + JSON.stringify(aiData) + '\n```', request.id);
assert.equal(analysis.errors[0].decision, 'pending');
assert.equal(analysis.errors[0].teacherCause, '');
assert.equal(analysis.errors[0].id, 'e1');
assert.ok(!JSON.stringify(analysis).includes('MALICIOUS-APPROVAL'));
assert.ok(!('score' in analysis));
assert.throws(() => parseWallAnalysis(JSON.stringify(aiData), 'wrong-post'));
for (const patch of [{ errors: 'wrong' }, { errors: Array(7).fill(aiData.errors[0]) }, { errors: [{ ...aiData.errors[0], evidence: '' }] },
  { feedback: 'a'.repeat(2001) }, { errors: [{ ...aiData.errors[0], confidence: 'certain' }] }, { summary: '<script>' + 'a'.repeat(2000) }]) {
  assert.throws(() => parseWallAnalysis(JSON.stringify({ ...aiData, ...patch }), request.id));
}
assert.throws(() => parseWallAnalysis('{not json}', request.id));
assert.throws(() => parseWallAnalysis('a'.repeat(150001), request.id));
let assessment = newWallAssessment(request, analysis, 'chatgpt', 'Personal account');
assert.equal(assessment.review.status, 'draft');
assert.equal(assessment.review.score, null);
assert.equal(wallProgressRows([{ ...post, aiAssessment: assessment }]).length, 0);
assert.throws(() => approvedWallAssessment(assessment, 'teacher-one', 'Giáo viên', '8'));
assert.throws(() => wallPracticePrompt(assessment, 'practice-one'));
assessment = { ...assessment, studentCode: '8A-01', analysis: { ...analysis, errors: analysis.errors.map(error => ({ ...error,
  decision: 'confirmed', teacherCause: 'Nhầm giữa đăng nhập và cung cấp bí mật.', verificationEvidence: 'Em trả lời rằng OTP cũng được gửi cho người hứa tặng quà.' })) } };
assert.throws(() => approvedWallAssessment({ ...assessment, analysis: { ...assessment.analysis,
  errors: [{ ...assessment.analysis.errors[0], verificationEvidence: '' }] } }, 'teacher-one', 'Giáo viên', '8'));
for (const score of ['-1', '11', 'NaN', 'Infinity']) assert.throws(() => approvedWallAssessment(assessment, 'teacher-one', 'Giáo viên', score));
assert.throws(() => approvedWallAssessment(assessment, '', 'Giáo viên', '8'));
assessment = approvedWallAssessment(assessment, 'teacher-one', 'Giáo viên', '0');
assert.equal(assessment.review.score, 0, 'Zero is a valid teacher grade.');
assert.ok(studentWallFeedback(post, assessment).includes('Điểm: 0/10'));
assert.ok(!studentWallFeedback(post, assessment).includes(assessment.analysis.errors[0].hypothesis));

const practiceData = { requestId: 'practice-one', instructions: 'Giải thích từng lựa chọn.', exercises: [
  { errorId: 'e1', difficulty: 'foundation', question: 'Bạn A hứa tặng quà để xin OTP. Em làm gì?', hint: 'Nghĩ về chức năng OTP.', expectedAnswer: 'PRIVATE-ANSWER: Không cung cấp OTP.', successCriteria: 'Từ chối gửi OTP và giải thích vì sao.' },
  { errorId: 'e1', difficulty: 'application', question: 'Website yêu cầu mật khẩu email để nhận quà. Em xử lý thế nào?', hint: 'Kiểm tra nguồn.', expectedAnswer: 'PRIVATE-ANSWER: Dừng thao tác, báo người lớn.', successCriteria: 'Không gửi mật khẩu; nêu cách báo cáo.' },
] };
assert.ok(wallPracticePrompt(assessment, 'practice-one').includes(assessment.analysis.errors[0].teacherCause));
assert.throws(() => parseWallPractice(JSON.stringify(practiceData), 'wrong', assessment, 'chatgpt', 'Personal account'));
assert.throws(() => parseWallPractice(JSON.stringify({ ...practiceData, exercises: [{ ...practiceData.exercises[0], errorId: 'e2' }] }), 'practice-one', assessment, 'chatgpt', 'Personal account'));
assert.throws(() => parseWallPractice(JSON.stringify({ ...practiceData, exercises: [] }), 'practice-one', assessment, 'chatgpt', 'Personal account'));
assessment.practice = parseWallPractice(JSON.stringify(practiceData), 'practice-one', assessment, 'chatgpt', 'Personal account');
assert.equal(assessment.practice.status, 'draft');
assert.throws(() => studentWallWorksheet(post, assessment));
assert.throws(() => recordWallPracticeAttempt(assessment, 'x1', 'answer', 'evidence', 'resolved', 'teacher-one'));
assessment = assignWallPractice(assessment);
const worksheet = studentWallWorksheet(post, assessment);
assert.ok(worksheet.includes(practiceData.exercises[0].question));
for (const secret of ['PRIVATE-ANSWER', 'expectedAnswer', 'hypothesis', assessment.analysis.errors[0].verificationEvidence]) assert.ok(!worksheet.includes(secret));
assert.throws(() => recordWallPracticeAttempt(assessment, 'missing', 'answer', 'evidence', 'resolved', 'teacher-one'));
assert.throws(() => recordWallPracticeAttempt(assessment, 'x1', 'answer', '', 'resolved', 'teacher-one'));
assessment = recordWallPracticeAttempt(assessment, 'x1', 'Em sẽ không cung cấp OTP.', 'Em giải thích đúng tính riêng tư của OTP.', 'resolved', 'teacher-one');
let rows = wallProgressRows([{ ...post, aiAssessment: assessment }]);
assert.equal(rows[0].verdict, 'improving', 'One resolved exercise cannot resolve a skill with another unassessed exercise.');
assessment = recordWallPracticeAttempt(assessment, 'x2', 'Dừng lại và báo thầy cô.', 'Đủ hai bước theo tiêu chí.', 'resolved', 'teacher-one');
rows = wallProgressRows([{ ...post, aiAssessment: assessment }]);
assert.equal(rows[0].verdict, 'resolved'); assert.equal(rows[0].attempts, 2);
const regressed = recordWallPracticeAttempt(assessment, 'x1', 'Em lại chia sẻ OTP.', 'Còn đưa OTP cho người lạ.', 'remains', 'teacher-one');
regressed.practice!.attempts.forEach(attempt => { attempt.createdAt = 123; });
assert.equal(wallProgressRows([{ ...post, aiAssessment: regressed }])[0].verdict, 'remains', 'Later appended evidence wins even when timestamps tie.');
assert.ok(wallProgressCsv([{ ...post, aiAssessment: assessment }]).includes('Đã khắc phục'));
const oppositeOrder = Object.fromEntries(Object.entries(assessment).reverse()) as unknown as WallAssessment;
assert.equal(wallAssessmentVersion(assessment), wallAssessmentVersion(oppositeOrder), 'Firestore map ordering must not cause false write conflicts.');

const sameName = { ...post, id: 'different-person', aiAssessment: { ...assessment, studentCode: '' } };
assert.equal(wallProgressRows([{ ...post, aiAssessment: { ...assessment, studentCode: '' } }, sameName]).length, 2, 'Self-declared duplicate names never merge.');
assert.equal(wallProgressRows([{ ...post, aiAssessment: assessment }, { ...post, id: 'other', boardId: 'other-board', aiAssessment: assessment }]).length, 2);
assert.equal(wallProgressRows([{ ...post, aiAssessment: assessment }, { ...post, id: 'other', authorId: 'teacher-two', aiAssessment: assessment }]).length, 2);
const later = { ...assessment, id: 'later-analysis', practice: null, review: { ...assessment.review, reviewedAt: Date.now() + 1000 } };
rows = wallProgressRows([{ ...post, aiAssessment: later, aiAssessmentHistory: [assessment] }]);
assert.equal(rows[0].verdict, 'unassessed', 'A new confirmed error reopens tracking instead of carrying over a prior resolved claim.');
assert.equal(rows[0].attempts, 2, 'Historical attempts survive new analyses.');
const safePublic = sharedWallPost({ ...post, aiAssessment: assessment, aiAssessmentHistory: [assessment] });
for (const field of ['aiAssessment', 'aiAssessmentHistory', 'score', 'comments']) assert.ok(!(field in safePublic));
assert.ok(!JSON.stringify(safePublic).includes('PRIVATE-ANSWER'));
const draft = newWallAssessment(request, analysis, 'chatgpt', 'Personal account');
const draftSave = prepareWallAssessmentSave(post, draft, null, 'teacher-one', 'Giáo viên');
assert.equal('score' in draftSave.patch, false); assert.equal('comments' in draftSave.patch, false);
assert.throws(() => prepareWallAssessmentSave(post, assessment, null, 'teacher-one', 'Giáo viên'), /duyệt lại/);
assert.throws(() => prepareWallAssessmentSave({ ...post, aiAssessment: draft }, draft, null, 'teacher-one', 'Giáo viên'), /cửa sổ khác/);
const ungraded = { ...assessment, review: { ...assessment.review, score: null } };
const approvedSave = prepareWallAssessmentSave(post, ungraded, null, 'teacher-one', 'Giáo viên', true);
assert.equal(approvedSave.patch.score, 9, 'Blank teacher score preserves the existing grade in both records.');
assert.equal(approvedSave.next.review.score, 9);
assert.equal(approvedSave.patch.comments?.length, 2);
const repeated = prepareWallAssessmentSave({ ...post, ...approvedSave.patch }, approvedSave.next, approvedSave.next, 'teacher-one', 'Giáo viên', true);
assert.equal(repeated.patch.comments?.length, 2, 'Repeated approval updates a single comment instead of duplicating it.');
const newVersion = prepareWallAssessmentSave({ ...post, ...approvedSave.patch }, { ...draft, id: 'new-version' }, approvedSave.next, 'teacher-one', 'Giáo viên');
assert.equal(newVersion.patch.aiAssessmentHistory.length, 1);
assert.equal(newVersion.patch.aiAssessmentHistory[0].review.score, 9);
assert.throws(() => prepareWallAssessmentSave({ ...post, aiAssessment: assessment }, { ...assessment, practice: null }, assessment, 'teacher-one', 'Giáo viên'), /lịch sử/);
console.info('Wall AI passed: actual media, privacy, stale work, malformed/cross-post imports, teacher verification and grading, personalized practice, student redaction, progress evidence, identity isolation and history.');
