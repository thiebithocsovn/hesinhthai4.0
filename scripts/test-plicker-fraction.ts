import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateText } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlickerDisplayScreen, { PlickerDisplayMath } from '../src/components/PlickerDisplayScreen';
import { PlickerFractionExtension } from '../src/components/PlickerFraction';
import PlickerMobileScanner, { PlickerMobileResultsSheet } from '../src/components/PlickerMobileScanner';
import { PlickerRichContent } from '../src/components/PlickerQuestionContent';
import {
  createPlickerLiveSession,
  normalizePlickerLiveRoom,
  sanitizePlickerQuestionSet,
  type PlickerLiveQuestionSet,
} from '../src/lib/plickerLive';
import {
  inlinePlickerRichHtml,
  plainPlickerRichText,
  sanitizePlickerRichHtml,
} from '../src/lib/plickerQuestionMedia';

let checks = 0;

const makeFraction = (numerator: string, denominator: string, extra = '') =>
  `<span data-plicker-fraction="true" data-numerator="${numerator}" data-denominator="${denominator}"${extra}><span data-fraction-part="numerator">${numerator || '□'}</span><span data-fraction-part="denominator">${denominator || '□'}</span></span>`;

const fraction = makeFraction('3x+1', '2y-4', ' onclick="alert(1)" class="danger"');
const safeFraction = makeFraction('3x+1', '2y-4');
const emptyFraction = makeFraction('', '');
const richQuestion = `<p>Tính giá trị ${fraction} + ${makeFraction('7', '5')}</p>`;
const richAnswer = `<p>${makeFraction('x²+1', 'H₂O')}</p>`;

assert.equal(sanitizePlickerRichHtml(fraction), safeFraction);
assert.equal(sanitizePlickerRichHtml(safeFraction), safeFraction);
assert.equal(sanitizePlickerRichHtml(sanitizePlickerRichHtml(fraction)), safeFraction);
assert.equal(sanitizePlickerRichHtml(emptyFraction), emptyFraction);
assert.equal(sanitizePlickerRichHtml(`<p>${fraction}<script>alert(1)</script></p>`), `<p>${safeFraction}</p>`);
assert.equal(sanitizePlickerRichHtml('<span onclick="evil()">Nội dung an toàn</span>'), 'Nội dung an toàn');
assert.equal(sanitizePlickerRichHtml('<span><strong>Đậm</strong></span>'), '<strong>Đậm</strong>');
assert.equal(sanitizePlickerRichHtml(`<span class="wrapper">${safeFraction}</span>`), safeFraction);
assert.equal(sanitizePlickerRichHtml('<span data-fraction-part="numerator" onclick="evil()">2</span>'), '<span data-fraction-part="numerator">2</span>');
assert.doesNotMatch(sanitizePlickerRichHtml(fraction), /onclick|class=|alert/u);
checks += 10;

const encodedFraction = makeFraction('a &amp; b', 'x &quot;c&quot;');
assert.equal(sanitizePlickerRichHtml(encodedFraction), encodedFraction);
assert.equal(sanitizePlickerRichHtml(sanitizePlickerRichHtml(encodedFraction)), encodedFraction);
assert.equal(plainPlickerRichText(`<p>${safeFraction}</p>`), '\\frac{3x+1}{2y-4}');
assert.equal(plainPlickerRichText(`<p>${emptyFraction}</p>`), '\\frac{□}{□}');
assert.equal(plainPlickerRichText(richQuestion), 'Tính giá trị \\frac{3x+1}{2y-4} + \\frac{7}{5}');
assert.equal(plainPlickerRichText(encodedFraction), '\\frac{a & b}{x "c"}');
assert.equal(inlinePlickerRichHtml(`<p>${safeFraction}</p>`), safeFraction);
assert.equal(inlinePlickerRichHtml(`<p>${safeFraction}</p><p>${emptyFraction}</p>`), `${safeFraction}<br>${emptyFraction}`);
checks += 8;

const textFromFractionNode = generateText({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Giá trị ' },
      { type: 'plickerFraction', attrs: { numerator: '3x+1', denominator: '2y-4' } },
      { type: 'text', text: ' là:' },
    ],
  }],
}, [StarterKit, PlickerFractionExtension]);
assert.equal(textFromFractionNode, 'Giá trị \\frac{3x+1}{2y-4} là:');
assert.equal(generateText({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'plickerFraction', attrs: { numerator: '', denominator: '' } }] }],
}, [StarterKit, PlickerFractionExtension]), '\\frac{□}{□}');
assert.equal(PlickerFractionExtension.name, 'plickerFraction');
checks += 3;

const questionSet: PlickerLiveQuestionSet = {
  id: 'set-fractions',
  title: 'Đại số 8 - Phân số',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
  questions: [{
    id: 1,
    text: 'Tính giá trị \\frac{3x+1}{2y-4} + \\frac{7}{5}',
    richText: richQuestion,
    options: { A: '\\frac{x²+1}{H₂O}', B: '1' },
    optionRichText: { A: richAnswer, B: '<p>1</p>' },
    type: 'multiple_choice',
    gradingType: 'graded',
    correctAnswer: 'A',
  }],
};
const safeSet = sanitizePlickerQuestionSet(questionSet);
assert.equal(safeSet.questions[0].richText, richQuestion.replace(fraction, safeFraction));
assert.equal(safeSet.questions[0].optionRichText?.A, richAnswer);
assert.match(safeSet.questions[0].richText || '', /data-numerator="3x\+1"/u);
assert.match(safeSet.questions[0].richText || '', /data-denominator="2y-4"/u);
assert.doesNotMatch(safeSet.questions[0].richText || '', /onclick|danger/u);
assert.equal(sanitizePlickerQuestionSet(safeSet).questions[0].richText, safeSet.questions[0].richText);
checks += 6;

const students = [{ id: 'student-1', classId: 'class-8', name: 'Nguyễn Văn An', cardId: 1 }];
const session = createPlickerLiveSession({
  sessionId: 'lesson-fractions',
  ownerUid: 'teacher-1',
  classId: 'class-8',
  className: '8A Kim Lư',
  students,
  questionSet,
  controllerDeviceId: 'phone-1',
});
assert.equal(session.questionSet.questions[0].richText, safeSet.questions[0].richText);
assert.equal(session.questionSet.questions[0].optionRichText?.A, richAnswer);
const room = normalizePlickerLiveRoom({
  kind: 'plicker_live_session',
  ownerUid: 'teacher-1',
  authorId: 'teacher-1',
  librarySets: [safeSet],
  rosters: {},
  devices: {},
  activeSession: session,
}, 'teacher-1');
assert.equal(room?.librarySets[0].questions[0].richText, safeSet.questions[0].richText);
assert.equal(room?.activeSession?.questionSet.questions[0].optionRichText?.A, richAnswer);
checks += 4;

const renderedFraction = renderToStaticMarkup(createElement(PlickerRichContent, {
  text: '\\frac{3x+1}{2y-4}',
  html: `<p>${fraction}</p>`,
}));
assert.match(renderedFraction, /data-plicker-fraction="true"/u);
assert.match(renderedFraction, /data-numerator="3x\+1"/u);
assert.match(renderedFraction, /data-fraction-part="numerator">3x\+1<\/span>/u);
assert.match(renderedFraction, /data-fraction-part="denominator">2y-4<\/span>/u);
assert.match(renderedFraction, /border-b-/u);
assert.match(renderedFraction, /inline-flex/u);
assert.doesNotMatch(renderedFraction, /onclick|alert\(1\)/u);
const fallbackFraction = renderToStaticMarkup(createElement(PlickerDisplayMath, { text: '\\frac{3x+1}{2y-4}' }));
assert.match(fallbackFraction, /aria-label="3x\+1 phần 2y-4"/u);
assert.match(fallbackFraction, /border-b-/u);
checks += 9;

const noop = () => {};
const distribution = { A: 1, B: 0, C: 0, D: 0 };
const projected = renderToStaticMarkup(createElement(PlickerDisplayScreen, {
  className: '8A Kim Lư',
  setTitle: questionSet.title,
  question: safeSet.questions[0],
  questionIndex: 0,
  questionCount: 1,
  students,
  responses: [{ studentId: 'student-1', answer: 'A' }],
  distribution,
  phase: 'scanning',
  showCorrect: false,
  showGraph: true,
  scannerConnected: true,
  connected: true,
  scannerUrl: 'https://trungtuyen.github.io/4.0/?app=plicker&role=scanner',
  onToggleCorrect: noop,
  onToggleGraph: noop,
  onClose: noop,
}));
assert.match(projected, /Câu 1\./u);
assert.match(projected, /data-numerator="3x\+1"/u);
assert.match(projected, /data-denominator="2y-4"/u);
assert.match(projected, /data-numerator="7" data-denominator="5"/u);
assert.match(projected, /data-numerator="x²\+1" data-denominator="H₂O"/u);
assert.doesNotMatch(projected, /onclick|alert\(1\)/u);
checks += 6;

const mobileSheet = renderToStaticMarkup(createElement(PlickerMobileResultsSheet, {
  mode: 'graph',
  question: safeSet.questions[0],
  students,
  responses: [{ studentId: 'student-1', answer: 'A' }],
  distribution,
  onClose: noop,
  onClearResponses: noop,
}));
assert.match(mobileSheet, /data-numerator="x²\+1"/u);
assert.match(mobileSheet, /data-denominator="H₂O"/u);
assert.match(mobileSheet, /data-fraction-part="numerator"/u);
checks += 3;

const scanner = renderToStaticMarkup(createElement(PlickerMobileScanner, {
  className: '8A Kim Lư',
  question: safeSet.questions[0],
  questionIndex: 0,
  questionCount: 1,
  students,
  responses: [],
  distribution: { A: 0, B: 0, C: 0, D: 0 },
  scanning: false,
  connected: true,
  displayConnected: true,
  showCorrect: false,
  showGraph: false,
  videoRef: createRef<HTMLVideoElement>(),
  overlayRef: createRef<HTMLCanvasElement>(),
  onStartScan: noop,
  onStopScan: noop,
  onPrevious: noop,
  onNext: noop,
  onClearResponses: noop,
  onToggleCorrect: noop,
  onToggleGraph: noop,
  onExit: noop,
}));
assert.match(scanner, /data-numerator="3x\+1"/u);
assert.match(scanner, /data-denominator="2y-4"/u);
assert.match(scanner, /data-numerator="x²\+1"/u);
checks += 3;

const extensionSource = readFileSync(new URL('../src/components/PlickerFraction.tsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../src/components/PlickerQuestionEditor.tsx', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/components/PlickerQuestionContent.tsx', import.meta.url), 'utf8');
for (const feature of [
  'Node.create',
  'ReactNodeViewRenderer',
  'data-plicker-fraction-editor',
  'aria-label="Tử số"',
  'aria-label="Mẫu số"',
  'border-b-[2px]',
  'updateAttributes({ numerator:',
  'updateAttributes({ denominator:',
  "event.key === 'ArrowDown'",
  "event.key === 'ArrowUp'",
  'setTextSelection(position + node.nodeSize)',
  'renderText({ node })',
]) {
  assert.equal(extensionSource.includes(feature), true, `Missing editable fraction feature: ${feature}`);
  checks += 1;
}
for (const feature of [
  'PlickerFractionExtension',
  'Chèn phân số: tử số trên, mẫu số dưới',
  "type: 'plickerFraction'",
  "formula.title === 'Phân số' ? insertFraction()",
]) {
  assert.equal(editorSource.includes(feature), true, `Missing fraction toolbar feature: ${feature}`);
  checks += 1;
}
assert.match(rendererSource, /data-fraction-part=numerator/u);
assert.match(rendererSource, /data-fraction-part=denominator/u);
checks += 2;

console.info(`Plicker editable stacked fractions, question sync and dual-screen rendering: ${checks} checks passed.`);
