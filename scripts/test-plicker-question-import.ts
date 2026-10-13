import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  extractPlickerWordDocumentText,
  parsePlickerQuestionText,
  PLICKER_IMPORT_QUESTION_LIMIT,
  readPlickerQuestionFile,
} from '../src/lib/plickerQuestionImport';
import {
  mergePlickerDeletedQuestionSets,
  mergePlickerQuestionSets,
  normalizePlickerLiveRoom,
  type PlickerLiveQuestionSet,
} from '../src/lib/plickerLive';

let checks = 0;

const copied = `ĐỀ KIỂM TRA TOÁN 8

Câu 1: Trong các biểu thức sau, biểu thức nào là đơn thức?
A. 3x+5
*B. -7x^2y
C. x^2-y^2
D. 2/x

Câu 2. Hai đơn thức đồng dạng là những đơn thức:
A) Có cùng hệ số  B) Có cùng bậc  C) Có cùng phần biến  D) Có cùng dấu
Đáp án: C

3. 7 × 8 bằng bao nhiêu?
A. 48
B. 54
C. 56 (đúng)
D. 64`;

const parsed = parsePlickerQuestionText(copied);
assert.equal(parsed.questions.length, 3);
assert.equal(parsed.skipped, 0);
assert.equal(parsed.truncated, false);
assert.equal(parsed.questions[0].text, 'Trong các biểu thức sau, biểu thức nào là đơn thức?');
assert.equal(parsed.questions[0].options.B, '-7x^2y');
assert.equal(parsed.questions[0].options.D, '2/x');
assert.equal(parsed.questions[0].correctAnswer, 'B');
assert.equal(parsed.questions[0].gradingType, 'graded');
assert.equal(parsed.questions[1].options.A, 'Có cùng hệ số');
assert.equal(parsed.questions[1].options.C, 'Có cùng phần biến');
assert.equal(parsed.questions[1].correctAnswer, 'C');
assert.equal(parsed.questions[2].correctAnswer, 'C');
assert.equal(parsed.questions[2].options.C, '56');
assert.deepEqual(parsed.questions.map(question => question.id), [1, 2, 3]);
checks += 14;

const variations = parsePlickerQuestionText(`\ufeffCâu hỏi 1: Chọn đáp án đúng\r\n[x] a: Nội dung một\r\nb: Nội dung hai\r\n\r\nQuestion 2) Khảo sát sở thích\r\nA. Bóng đá\r\nB. Cầu lông\r\nC. Bơi lội`);
assert.equal(variations.questions.length, 2);
assert.equal(variations.questions[0].correctAnswer, 'A');
assert.equal(variations.questions[0].type, 'true_false');
assert.equal(variations.questions[0].options.B, 'Nội dung hai');
assert.equal(variations.questions[1].correctAnswer, null);
assert.equal(variations.questions[1].gradingType, 'survey');
assert.equal(variations.questions[1].type, 'multiple_choice');
checks += 7;

const multiline = parsePlickerQuestionText(`Câu 1: Đây là nội dung\ncâu hỏi gồm hai dòng\nA. Đáp án dài\nvà được xuống dòng\nB. Đáp án còn lại\nAnswer: B`);
assert.equal(multiline.questions.length, 1);
assert.equal(multiline.questions[0].text, 'Đây là nội dung câu hỏi gồm hai dòng');
assert.equal(multiline.questions[0].options.A, 'Đáp án dài và được xuống dòng');
assert.equal(multiline.questions[0].correctAnswer, 'B');
checks += 4;

const unnumbered = parsePlickerQuestionText('Thủ đô của Việt Nam là gì?\nA. Hải Phòng\nB*. Hà Nội');
assert.equal(unnumbered.questions.length, 1);
assert.equal(unnumbered.questions[0].text, 'Thủ đô của Việt Nam là gì?');
assert.equal(unnumbered.questions[0].correctAnswer, 'B');
checks += 3;

const incomplete = parsePlickerQuestionText('Câu 1: Câu chưa đủ đáp án\nA. Một lựa chọn\nCâu 2: Câu hợp lệ\nA. Có\nB. Không');
assert.equal(incomplete.questions.length, 1);
assert.equal(incomplete.skipped, 1);
assert.equal(incomplete.questions[0].text, 'Câu hợp lệ');
assert.deepEqual(parsePlickerQuestionText(''), { questions: [], skipped: 0, truncated: false });
checks += 4;

const overLimit = Array.from({ length: PLICKER_IMPORT_QUESTION_LIMIT + 5 }, (_, index) =>
  `Câu ${index + 1}: Nội dung ${index + 1}\nA. Đáp án một\nB. Đáp án hai`,
).join('\n');
const limited = parsePlickerQuestionText(overLimit);
assert.equal(limited.questions.length, PLICKER_IMPORT_QUESTION_LIMIT);
assert.equal(limited.truncated, true);
assert.equal(limited.questions.at(-1)?.text, `Nội dung ${PLICKER_IMPORT_QUESTION_LIMIT}`);
checks += 3;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>
<w:p><w:r><w:t>Câu 1: Giá trị x &amp; y?</w:t></w:r></w:p>
<w:p><w:r><w:t>A. 3x</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>B. 5x</w:t></w:r></w:p>
<w:p><w:r><w:t>Câu 2: Chọn phân số</w:t></w:r></w:p>
<w:p><w:r><w:t>A. </w:t></w:r><m:f><m:num><m:r><m:t>2</m:t></m:r></m:num><m:den><m:r><m:t>x</m:t></m:r></m:den></m:f></w:p>
<w:p><w:r><w:t>B. 4</w:t></w:r></w:p>
<w:p><w:r><w:t>Đáp án: A</w:t></w:r></w:p>
</w:body></w:document>`;

const wordText = extractPlickerWordDocumentText(xml);
assert.match(wordText, /Câu 1: Giá trị x & y\?/);
assert.match(wordText, /A\. 3x\^2/);
assert.match(wordText, /\*B\. 5x/);
assert.match(wordText, /A\. 2\/x/);
const wordQuestions = parsePlickerQuestionText(wordText);
assert.equal(wordQuestions.questions.length, 2);
assert.equal(wordQuestions.questions[0].correctAnswer, 'B');
assert.equal(wordQuestions.questions[0].options.A, '3x^2');
assert.equal(wordQuestions.questions[1].correctAnswer, 'A');
assert.equal(wordQuestions.questions[1].options.A, '2/x');
assert.throws(() => extractPlickerWordDocumentText('<root/>'), /không chứa nội dung/);
checks += 10;

const cfb = XLSX.CFB || (XLSX as unknown as { default?: typeof XLSX }).default?.CFB;
assert.ok(cfb);
const archive = cfb.utils.cfb_new();
cfb.utils.cfb_add(archive, 'word/document.xml', new TextEncoder().encode(xml));
const zipBytes = cfb.write(archive, { fileType: 'zip', type: 'buffer' });
const importedFile = await readPlickerQuestionFile(new File([zipBytes], 'Toan_8-Don_thuc.docx'));
assert.equal(importedFile.title, 'Toan 8 Don thuc');
assert.equal(importedFile.fileName, 'Toan_8-Don_thuc.docx');
assert.match(importedFile.text, /\*B\. 5x/);
assert.equal(parsePlickerQuestionText(importedFile.text).questions.length, 2);

const plainFile = await readPlickerQuestionFile(new File([copied], 'De kiem tra.txt'));
assert.equal(plainFile.title, 'De kiem tra');
assert.equal(parsePlickerQuestionText(plainFile.text).questions.length, 3);
await assert.rejects(readPlickerQuestionFile(new File(['legacy'], 'De cu.doc')), /lưu thành \.docx/);
await assert.rejects(readPlickerQuestionFile(new File(['broken'], 'Hong.docx')), /không hợp lệ/);
await assert.rejects(readPlickerQuestionFile(new File(['data'], 'Sai.pdf')), /Chỉ hỗ trợ/);
checks += 10;

const olderSet: PlickerLiveQuestionSet = {
  id: 'set-old',
  title: 'Bộ sẽ bị xóa',
  questions: [{ id: 1, text: 'Câu hỏi cũ', options: { A: 'Một', B: 'Hai' }, correctAnswer: 'A' }],
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};
const remainingSet = { ...olderSet, id: 'set-keep', title: 'Bộ giữ lại' };
const deletedAt = Date.parse('2026-08-23T00:00:00.000Z');
assert.deepEqual(mergePlickerQuestionSets([olderSet, remainingSet], [olderSet, remainingSet], { 'set-old': deletedAt })
  .map(set => set.id), ['set-keep']);
assert.deepEqual(mergePlickerQuestionSets([], [olderSet], { 'set-old': deletedAt }), []);
assert.deepEqual(mergePlickerQuestionSets([olderSet], [], { 'set-old': deletedAt }), []);
assert.deepEqual(mergePlickerQuestionSets([], [{ ...olderSet, updatedAt: '2026-08-24T00:00:00.000Z' }], { 'set-old': deletedAt })
  .map(set => set.id), ['set-old']);
assert.deepEqual(mergePlickerDeletedQuestionSets({ 'set-old': 10 }, { 'set-old': 20, 'set-next': 15 }),
  { 'set-old': 20, 'set-next': 15 });
assert.deepEqual(mergePlickerDeletedQuestionSets({}, { '../invalid': 50, valid: -1, good: 25 }), { good: 25 });

const room = normalizePlickerLiveRoom({
  kind: 'plicker_live_session',
  ownerUid: 'teacher',
  librarySets: [remainingSet],
  deletedQuestionSetIds: { 'set-old': deletedAt, '../invalid': deletedAt },
  rosters: {},
  devices: {},
  activeSession: null,
}, 'teacher');
assert.deepEqual(room?.deletedQuestionSetIds, { 'set-old': deletedAt });
assert.equal(room?.librarySets[0]?.id, 'set-keep');
checks += 8;

const classroom = readFileSync(new URL('../src/components/PlickerClassroom.tsx', import.meta.url), 'utf8');
assert.match(classroom, /Dán câu hỏi/);
assert.match(classroom, /Nhập Word/);
assert.match(classroom, /Xóa bộ câu hỏi/);
assert.match(classroom, /accept="\.docx,\.doc,\.txt/);
assert.match(classroom, /confirmQuestionSetDeletion/);
assert.match(classroom, /readPlickerQuestionFile/);
assert.match(classroom, /parsePlickerQuestionText/);
assert.match(classroom, /deletedQuestionSetIds/);
assert.match(classroom, /DELETED_SETS_STORAGE_KEY/);
assert.match(classroom, /Bộ này cũng sẽ bị xóa khỏi điện thoại và máy tính/);
assert.match(classroom, /Đã nhận ra/);
checks += 11;

console.info(`Plicker question deletion, paste and Word import: ${checks} checks passed.`);
