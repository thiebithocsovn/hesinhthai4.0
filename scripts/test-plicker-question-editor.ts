import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlickerDisplayScreen, { PlickerDisplayMath } from '../src/components/PlickerDisplayScreen';
import { PlickerMobileResultsSheet } from '../src/components/PlickerMobileScanner';
import PlickerQuestionMediaGallery, { PlickerRichContent } from '../src/components/PlickerQuestionContent';
import {
  createPlickerSoundEffectDataUrl,
  createPlickerYoutubeEmbedUrl,
  extractPlickerYoutubeId,
  formatPlickerMediaTime,
  inlinePlickerRichHtml,
  isPlickerMediaUrl,
  PLICKER_MAX_MEDIA_PER_QUESTION,
  PLICKER_SOUND_LIBRARY,
  plainPlickerRichText,
  sanitizePlickerQuestionMedia,
  sanitizePlickerRichHtml,
  type PlickerQuestionMedia,
} from '../src/lib/plickerQuestionMedia';
import {
  createPlickerLiveSession,
  normalizePlickerLiveRoom,
  sanitizePlickerQuestionSet,
  type PlickerLiveQuestionSet,
} from '../src/lib/plickerLive';
import { extractPlickerWordDocumentText } from '../src/lib/plickerQuestionImport';

let checks = 0;

assert.equal(sanitizePlickerRichHtml('<p>H<sub class="danger">2</sub>O + x<sup onclick="evil()">2</sup></p>'), '<p>H<sub>2</sub>O + x<sup>2</sup></p>');
assert.equal(sanitizePlickerRichHtml('<strong>Đậm</strong><em>Nghiêng</em><u>Gạch chân</u><s>Gạch ngang</s>'), '<strong>Đậm</strong><em>Nghiêng</em><u>Gạch chân</u><s>Gạch ngang</s>');
assert.equal(sanitizePlickerRichHtml('<p>Xin chào</p><script>alert(1)</script><img src=x onerror=evil()>'), '<p>Xin chào</p>');
assert.equal(sanitizePlickerRichHtml('<svg onload="evil()"><circle/></svg><p>Hợp lệ</p>'), '<p>Hợp lệ</p>');
assert.equal(sanitizePlickerRichHtml(null), '');
assert.equal(inlinePlickerRichHtml('<p>Dòng một</p><p>Dòng hai</p>'), 'Dòng một<br>Dòng hai');
assert.equal(plainPlickerRichText('<p>H<sub>2</sub>O &amp; CO<sub>2</sub></p>'), 'H2O & CO2');
assert.equal(plainPlickerRichText('<p>&#x221A;x</p><p>&#178;</p>'), '√x\n²');
checks += 8;

const youtubeId = 'dQw4w9WgXcQ';
assert.equal(extractPlickerYoutubeId(youtubeId), youtubeId);
assert.equal(extractPlickerYoutubeId(`https://www.youtube.com/watch?v=${youtubeId}&t=15s`), youtubeId);
assert.equal(extractPlickerYoutubeId(`https://youtu.be/${youtubeId}?si=test`), youtubeId);
assert.equal(extractPlickerYoutubeId(`https://youtube.com/shorts/${youtubeId}`), youtubeId);
assert.equal(extractPlickerYoutubeId(`https://m.youtube.com/watch?v=${youtubeId}`), youtubeId);
assert.equal(extractPlickerYoutubeId(`https://www.youtube-nocookie.com/embed/${youtubeId}`), youtubeId);
assert.equal(extractPlickerYoutubeId(`https://attacker.example/watch?v=${youtubeId}`), null);
assert.equal(extractPlickerYoutubeId('javascript:alert(1)'), null);
assert.equal(extractPlickerYoutubeId('not-a-valid-video'), null);
assert.equal(createPlickerYoutubeEmbedUrl(`https://youtu.be/${youtubeId}`), `https://www.youtube-nocookie.com/embed/${youtubeId}`);
assert.equal(createPlickerYoutubeEmbedUrl('https://example.com/video'), null);
checks += 11;

assert.equal(isPlickerMediaUrl('https://example.com/photo.jpg', 'image'), true);
assert.equal(isPlickerMediaUrl('http://localhost/photo.jpg', 'image'), true);
assert.equal(isPlickerMediaUrl('http://example.com/photo.jpg', 'image'), false);
assert.equal(isPlickerMediaUrl('javascript:alert(1)', 'image'), false);
assert.equal(isPlickerMediaUrl('data:image/png;base64,YWJj', 'image'), true);
assert.equal(isPlickerMediaUrl('data:text/html;base64,YWJj', 'image'), false);
assert.equal(isPlickerMediaUrl('data:audio/wav;base64,YWJj', 'audio'), true);
assert.equal(isPlickerMediaUrl('data:video/mp4;base64,YWJj', 'video'), true);
assert.equal(isPlickerMediaUrl('data:image/svg+xml;base64,YWJj', 'image'), false);
assert.equal(formatPlickerMediaTime(0), '0:00');
assert.equal(formatPlickerMediaTime(73.8), '1:13');
assert.equal(formatPlickerMediaTime(Number.NaN), '0:00');
checks += 12;

const attachments: PlickerQuestionMedia[] = [
  { id: 'image-1', kind: 'image', src: 'https://example.com/thi-nghiem.jpg', title: 'Thí nghiệm hóa học' },
  { id: 'youtube-1', kind: 'youtube', src: `https://youtu.be/${youtubeId}`, title: 'Video Hóa học' },
  { id: 'audio-1', kind: 'audio', src: 'data:audio/wav;base64,YWJj', title: 'Đoạn nghe', startSeconds: 2, endSeconds: 8 },
];
const sanitized = sanitizePlickerQuestionMedia(attachments);
assert.equal(sanitized.length, 3);
assert.equal(sanitized[1].src, `https://www.youtube-nocookie.com/embed/${youtubeId}`);
assert.equal(sanitized[2].startSeconds, 2);
assert.equal(sanitized[2].endSeconds, 8);
assert.equal(sanitizePlickerQuestionMedia([...attachments, attachments[0]]).length, 3);
assert.equal(sanitizePlickerQuestionMedia([{ id: '../x', kind: 'image', src: 'https://example.com/x.jpg', title: 'X' }]).length, 0);
assert.equal(sanitizePlickerQuestionMedia([{ id: 'bad', kind: 'image', src: 'javascript:alert(1)', title: 'X' }]).length, 0);
assert.equal(sanitizePlickerQuestionMedia(Array.from({ length: 12 }, (_, index) => ({ ...attachments[0], id: `image-${index}` }))).length, PLICKER_MAX_MEDIA_PER_QUESTION);
checks += 8;

assert.equal(PLICKER_SOUND_LIBRARY.length >= 6, true);
for (const sound of PLICKER_SOUND_LIBRARY) {
  const dataUrl = createPlickerSoundEffectDataUrl(sound.id);
  assert.match(dataUrl, /^data:audio\/wav;base64,/u);
  const binary = atob(dataUrl.split(',')[1]);
  assert.equal(binary.slice(0, 4), 'RIFF');
  assert.equal(binary.slice(8, 12), 'WAVE');
  assert.equal(isPlickerMediaUrl(dataUrl, 'audio'), true);
  checks += 4;
}
assert.throws(() => createPlickerSoundEffectDataUrl('missing'), /không tồn tại/);
checks += 2;

const set: PlickerLiveQuestionSet = {
  id: 'set-chemistry',
  title: 'Hóa học 8',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
  questions: [{
    id: 1,
    text: 'H2O có tên gọi là gì?',
    richText: '<p>H<sub onclick="evil()">2</sub>O có tên gọi là gì?<script>alert(1)</script></p>',
    options: { A: 'Nước', B: 'CO2' },
    optionRichText: { A: '<p><strong>Nước</strong></p>', B: '<p>CO<sub>2</sub></p>' },
    media: attachments,
    type: 'multiple_choice',
    gradingType: 'graded',
    correctAnswer: 'A',
  }],
};
const safeSet = sanitizePlickerQuestionSet(set);
assert.equal(safeSet.questions[0].richText, '<p>H<sub>2</sub>O có tên gọi là gì?</p>');
assert.equal(safeSet.questions[0].optionRichText?.B, '<p>CO<sub>2</sub></p>');
assert.equal(safeSet.questions[0].media?.length, 3);
assert.equal(safeSet.questions[0].media?.[1].src, `https://www.youtube-nocookie.com/embed/${youtubeId}`);
assert.equal(safeSet.questions[0].type, 'multiple_choice');
assert.equal(safeSet.questions[0].gradingType, 'graded');
const session = createPlickerLiveSession({
  sessionId: 'lesson-1',
  ownerUid: 'teacher-1',
  classId: 'class-8',
  className: '8A Kim Lư',
  students: [{ id: 'student-1', classId: 'class-8', name: 'An', cardId: 1 }],
  questionSet: set,
  controllerDeviceId: 'phone-1',
});
assert.equal(session.questionSet.questions[0].richText?.includes('<sub>2</sub>'), true);
assert.equal(session.questionSet.questions[0].media?.length, 3);
const room = normalizePlickerLiveRoom({ kind: 'plicker_live_session', ownerUid: 'teacher-1', authorId: 'teacher-1', librarySets: [safeSet], rosters: {}, devices: {}, activeSession: session }, 'teacher-1');
assert.equal(room?.activeSession?.questionSet.questions[0].media?.[1].kind, 'youtube');
checks += 9;

const richMarkup = renderToStaticMarkup(createElement(PlickerRichContent, { text: 'H2SO4', html: '<p>H<sub>2</sub>SO<sub>4</sub><script>alert(1)</script></p>' }));
assert.match(richMarkup, /H<sub>2<\/sub>SO<sub>4<\/sub>/u);
assert.doesNotMatch(richMarkup, /script|alert/u);
const superscript = renderToStaticMarkup(createElement(PlickerDisplayMath, { text: 'x^2 + H_2O + SO_{4}' }));
assert.match(superscript, /x<sup[^>]*>2<\/sup>/u);
assert.match(superscript, /H<sub[^>]*>2<\/sub>O/u);
assert.match(superscript, /SO<sub[^>]*>4<\/sub>/u);
const gallery = renderToStaticMarkup(createElement(PlickerQuestionMediaGallery, { media: attachments }));
assert.match(gallery, /Thí nghiệm hóa học/u);
assert.match(gallery, /youtube-nocookie\.com\/embed/u);
assert.match(gallery, /<audio/u);
assert.match(gallery, /0:02–0:08/u);
checks += 9;

const noop = () => {};
const projected = renderToStaticMarkup(createElement(PlickerDisplayScreen, {
  className: '8A Kim Lư',
  setTitle: 'Hóa học 8',
  question: safeSet.questions[0],
  questionIndex: 0,
  questionCount: 1,
  students: [{ id: 'student-1', name: 'An', cardId: 1 }],
  responses: [],
  distribution: { A: 0, B: 0, C: 0, D: 0 },
  phase: 'launch',
  showCorrect: false,
  showGraph: false,
  scannerConnected: true,
  connected: true,
  scannerUrl: 'https://trungtuyen.github.io/4.0/?app=plicker&role=scanner',
  onToggleCorrect: noop,
  onToggleGraph: noop,
  onClose: noop,
}));
assert.match(projected, /Câu 1\./u);
assert.match(projected, /H<sub>2<\/sub>O/u);
assert.match(projected, /CO<sub>2<\/sub>/u);
assert.match(projected, /youtube-nocookie/u);
assert.doesNotMatch(projected, /onclick|alert\(1\)/u);
const mobile = renderToStaticMarkup(createElement(PlickerMobileResultsSheet, {
  mode: 'graph',
  question: safeSet.questions[0],
  students: [],
  responses: [],
  distribution: { A: 0, B: 0, C: 0, D: 0 },
  onClose: noop,
  onClearResponses: noop,
}));
assert.match(mobile, /CO<sub>2<\/sub>/u);
checks += 6;

const wordXml = '<w:document xmlns:w="word" xmlns:m="math"><w:body><w:p><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>O</w:t></w:r></w:p><w:p><m:sSub><m:e><m:r><m:t>SO</m:t></m:r></m:e><m:sub><m:r><m:t>4</m:t></m:r></m:sub></m:sSub></w:p></w:body></w:document>';
assert.equal(extractPlickerWordDocumentText(wordXml), 'H_2O\nSO_4');
checks += 1;

const editorSource = readFileSync(new URL('../src/components/PlickerQuestionEditor.tsx', import.meta.url), 'utf8');
const classroomSource = readFileSync(new URL('../src/components/PlickerClassroom.tsx', import.meta.url), 'utf8');
for (const feature of [
  'toggleSuperscript', 'toggleSubscript', 'toggleUnderline', 'Công thức Toán', 'Chèn ký hiệu và biểu tượng',
  'Chèn hình ảnh hoặc GIF', 'Chèn video YouTube', 'Chèn âm thanh hoặc ghi âm', 'Thư viện âm thanh',
  'Cắt đoạn âm thanh', 'MediaRecorder', 'createPlickerSoundEffectDataUrl', 'getStorage',
  'Tìm video trên YouTube', 'Chọn Đúng/Sai', 'Nhân bản câu hỏi',
]) {
  assert.equal(editorSource.includes(feature), true, `Missing editor feature: ${feature}`);
  checks += 1;
}
assert.match(classroomSource, /<PlickerQuestionEditor/u);
assert.match(classroomSource, /<PlickerQuestionMediaGallery/u);
assert.match(classroomSource, /deletedClassIds: deletedClassIdsRef\.current/u);
checks += 3;

console.info(`Plicker rich question editor, chemistry, images, video and audio: ${checks} checks passed.`);
