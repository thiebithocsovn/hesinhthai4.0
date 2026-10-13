import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlickerMobileScanner, {
  calculatePlickerMobilePercentage,
  formatPlickerMobileStudentName,
  PlickerMobileResultsSheet,
  type PlickerMobileQuestion,
  type PlickerMobileResponse,
  type PlickerMobileStudent,
} from '../src/components/PlickerMobileScanner';

let checks = 0;

assert.equal(formatPlickerMobileStudentName('An'), 'An');
assert.equal(formatPlickerMobileStudentName('  Trần   An  '), 'Trần An');
assert.equal(formatPlickerMobileStudentName('Nguyễn Văn Minh Châu'), 'M.Châu');
assert.equal(formatPlickerMobileStudentName('Trần Quốc Khánh'), 'Q.Khánh');
assert.equal(formatPlickerMobileStudentName('Tênđơndàikhôngkhoảngtrắng'), 'Tênđơndàikhôngkhoảngtrắng');
assert.equal(calculatePlickerMobilePercentage(0, 0), 0);
assert.equal(calculatePlickerMobilePercentage(1, 4), 25);
assert.equal(calculatePlickerMobilePercentage(2, 3), 67);
assert.equal(calculatePlickerMobilePercentage(9, 3), 100);
assert.equal(calculatePlickerMobilePercentage(-1, 4), 0);
assert.equal(calculatePlickerMobilePercentage(Number.NaN, 4), 0);
assert.equal(calculatePlickerMobilePercentage(1, Number.POSITIVE_INFINITY), 0);
checks += 12;

const students: PlickerMobileStudent[] = [
  { id: 'student-an', name: 'Nguyễn Văn Minh Châu', cardId: 1 },
  { id: 'student-binh', name: 'Trần Bình', cardId: 2 },
  { id: 'student-chi', name: 'Chi', cardId: 3 },
  { id: 'student-dung', name: 'Dung', cardId: 4 },
];
const question: PlickerMobileQuestion = {
  text: 'Hai đơn thức đồng dạng là những đơn thức nào?',
  options: { A: 'Có cùng hệ số', B: 'Có cùng bậc', C: 'Có cùng phần biến', D: 'Có cùng dấu' },
  correctAnswer: 'C',
};
const responses: PlickerMobileResponse[] = [
  { studentId: 'student-an', answer: 'C' },
  { studentId: 'student-binh', answer: 'A' },
  { studentId: 'student-chi', answer: 'C' },
];
const distribution = { A: 1, B: 0, C: 2, D: 0 };
const noop = () => {};
const scannerProps = {
  className: '8A - Kim Lư',
  question,
  questionIndex: 3,
  questionCount: 5,
  students,
  responses,
  distribution,
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
};

const launchpad = renderToStaticMarkup(createElement(PlickerMobileScanner, scannerProps));
assert.match(launchpad, /Hai đơn thức đồng dạng là những đơn thức nào\?/);
assert.match(launchpad, /8A - Kim Lư/);
assert.match(launchpad, /Bắt đầu quét thẻ học sinh/);
assert.match(launchpad, /Câu hỏi trước/);
assert.match(launchpad, /Câu hỏi tiếp theo/);
assert.match(launchpad, /Phương án C, đáp án đúng/);
assert.match(launchpad, /Có cùng phần biến/);
assert.match(launchpad, /Đã quét 3\/4 học sinh/);
assert.match(launchpad, /Đáp án máy chiếu/);
assert.match(launchpad, /Biểu đồ máy chiếu/);
assert.doesNotMatch(launchpad, /<video/);
checks += 11;

const offline = renderToStaticMarkup(createElement(PlickerMobileScanner, {
  ...scannerProps,
  connected: false,
  scanError: 'Camera chưa được cấp quyền.',
}));
assert.match(offline, /Chưa kết nối mạng/);
assert.match(offline, /Camera chưa được cấp quyền/);
checks += 2;

const camera = renderToStaticMarkup(createElement(PlickerMobileScanner, {
  ...scannerProps,
  scanning: true,
}));
assert.match(camera, /Camera quét thẻ học sinh toàn màn hình/);
assert.match(camera, /<video/);
assert.match(camera, /<canvas/);
assert.match(camera, /object-cover/);
assert.match(camera, /3 trên 4 học sinh đã trả lời/);
assert.match(camera, /Mở biểu đồ câu trả lời/);
assert.match(camera, /Dừng quét thẻ/);
assert.match(camera, /Mở danh sách học sinh/);
assert.doesNotMatch(camera, /Bắt đầu quét thẻ học sinh/);
checks += 9;

const sheetProps = {
  question,
  students,
  responses,
  distribution,
  onClose: noop,
  onClearResponses: noop,
};

const graph = renderToStaticMarkup(createElement(PlickerMobileResultsSheet, {
  ...sheetProps,
  mode: 'graph',
}));
assert.match(graph, /Biểu đồ câu trả lời/);
assert.match(graph, /Có cùng phần biến/);
assert.match(graph, /2 học sinh, 67%/);
assert.match(graph, /1 học sinh, 33%/);
assert.match(graph, /width:67%/);
assert.match(graph, /width:33%/);
assert.match(graph, /Phương án C, đáp án đúng/);
assert.match(graph, /3\/4/);
checks += 8;

const studentSheet = renderToStaticMarkup(createElement(PlickerMobileResultsSheet, {
  ...sheetProps,
  mode: 'students',
}));
assert.match(studentSheet, /Danh sách học sinh đã quét/);
assert.match(studentSheet, /grid-cols-3/);
assert.match(studentSheet, /M\.Châu/);
assert.match(studentSheet, /Trần Bình/);
assert.match(studentSheet, /Đã chọn C/);
assert.match(studentSheet, /Đã chọn A/);
assert.match(studentSheet, /Chưa trả lời/);
assert.match(studentSheet, /XÓA CÂU TRẢ LỜI/);
checks += 8;

const trueFalse = renderToStaticMarkup(createElement(PlickerMobileResultsSheet, {
  ...sheetProps,
  mode: 'graph',
  question: { text: 'Khẳng định đúng hay sai?', options: { A: 'Đúng', B: 'Sai' }, correctAnswer: 'A' },
}));
assert.match(trueFalse, /Phương án A, đáp án đúng/);
assert.match(trueFalse, /Phương án B/);
assert.doesNotMatch(trueFalse, /Phương án C/);
assert.doesNotMatch(trueFalse, /Phương án D/);
checks += 4;

const classroom = readFileSync(new URL('../src/components/PlickerClassroom.tsx', import.meta.url), 'utf8');
const scanner = readFileSync(new URL('../src/components/PlickerMobileScanner.tsx', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/plicker.webmanifest', import.meta.url), 'utf8')) as {
  orientation: string;
  theme_color: string;
};
const worker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
assert.match(classroom, /deviceRole === 'scanner' && view === 'session'/);
assert.match(classroom, /<PlickerMobileScanner/);
assert.match(classroom, /onClearResponses=\{resetCurrentAnswers\}/);
assert.match(classroom, /portraitScanner \? 720 : 1280/);
assert.match(scanner, /env\(safe-area-inset-bottom\)/);
assert.match(scanner, /setSheet\('graph'\)/);
assert.match(scanner, /setSheet\('students'\)/);
assert.equal(manifest.orientation, 'portrait-primary');
assert.equal(manifest.theme_color, '#31936f');
assert.match(worker, /CACHE_PREFIX\}v\d+/);
checks += 10;

console.info(`Plicker-style mobile camera interface: ${checks} checks passed.`);
