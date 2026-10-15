import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { analyzePracticalFile, autoCheckOptionsFor, describeAutoCheck, evaluateAutoCheck, type AutoCheck } from '../src/lib/practicalFileCheck';

const dataUrl = async (zip: JSZip) => `data:application/octet-stream;base64,${await zip.generateAsync({ type: 'base64' })}`;
const run = (text: string, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;

// Word: a centred bold title split across runs, a coloured word, a picture and a table.
const word = new JSZip();
word.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run('LỚP ', '<w:b/>')}${run('EM', '<w:b w:val="1"/><w:sz w:val="32"/>')}</w:p>
  <w:p>${run('Lớp em có 30 bạn, cô giáo rất ')}${run('hiền', '<w:color w:val="FF0000"/><w:i/>')}${run(' &amp; vui.', '<w:b w:val="0"/>')}</w:p>
  <w:p><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p>${run('Ô 1')}</w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`);
const wordFacts = await analyzePracticalFile({ name: 'Lop4A2_NguyenMinhAn.docx', type: 'application/msword', dataUrl: await dataUrl(word) });
const check = (kind: AutoCheck['kind'], value?: string, facts = wordFacts, name = 'Lop4A2_NguyenMinhAn.docx') => evaluateAutoCheck({ kind, value }, facts, name).status;
assert.equal(wordFacts.kind, 'word');
assert.equal(check('word-text', 'LỚP EM'), 'pass', 'Text split across runs is found.');
assert.equal(check('word-text', 'lop em'), 'near', 'Text typed without diacritics is flagged as nearly right.');
assert.equal(check('word-text', 'Trường em'), 'fail');
assert.equal(check('word-bold', 'LỚP EM'), 'pass', 'Bold across several runs.');
assert.equal(check('word-bold', 'vui'), 'fail', 'w:val="0" switches bold off.');
assert.equal(check('word-bold'), 'pass');
assert.equal(check('word-center', 'lớp em'), 'pass');
assert.equal(check('word-center', '30 bạn'), 'fail');
assert.equal(check('word-italic'), 'pass');
assert.equal(check('word-underline'), 'fail');
assert.equal(check('word-color'), 'pass');
assert.equal(check('word-image', '1'), 'pass');
assert.equal(check('word-image', '2'), 'fail');
assert.equal(check('word-table'), 'pass');
assert.equal(check('file-name', 'Lop4A2'), 'pass');
assert.equal(check('file-name', 'Bai1'), 'fail');
assert.equal(check('ppt-slides', '1'), 'unknown', 'A PowerPoint check on a Word file is not guessed.');
assert.ok(wordFacts.text.includes('& vui'), 'XML entities are decoded.');

// PowerPoint: 3 slides, one picture, a transition and an entrance animation.
const ppt = new JSZip();
ppt.file('ppt/presentation.xml', '<p:presentation/>');
ppt.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><a:t>Gia đình em</a:t></p:cSld><p:transition spd="med"><p:fade/></p:transition></p:sld>');
ppt.file('ppt/slides/slide2.xml', '<p:sld><p:cSld><p:pic><a:blip/></p:pic></p:cSld><p:timing><p:tnLst><p:par><p:animEffect transition="in"/></p:par></p:tnLst></p:timing></p:sld>');
ppt.file('ppt/slides/slide3.xml', '<p:sld><p:cSld><a:t>Cảm ơn</a:t></p:cSld></p:sld>');
const pptFacts = await analyzePracticalFile({ name: 'GiaDinh.pptx', type: 'application/vnd.ms-powerpoint', dataUrl: await dataUrl(ppt) });
assert.equal(pptFacts.kind, 'powerpoint');
assert.equal(check('ppt-slides', '3', pptFacts), 'pass');
assert.equal(check('ppt-slides', '4', pptFacts), 'fail');
assert.equal(check('ppt-text', 'gia đình em', pptFacts), 'pass');
assert.equal(check('ppt-image', '1', pptFacts), 'pass');
assert.equal(check('ppt-transition', undefined, pptFacts), 'pass');
assert.equal(check('ppt-animation', undefined, pptFacts), 'pass');

// Scratch: a cat that says hello forever when the green flag is clicked.
const sb3 = new JSZip();
sb3.file('project.json', JSON.stringify({ targets: [
  { isStage: true, blocks: {} },
  { isStage: false, blocks: {
    a: { opcode: 'event_whenflagclicked', inputs: {} },
    b: { opcode: 'control_forever', inputs: {} },
    c: { opcode: 'looks_sayforsecs', inputs: { MESSAGE: [1, [10, 'Xin chào']] } },
    d: { opcode: 'motion_movesteps', inputs: {} },
    v: [12, 'var', 'id'],
  } },
] }));
const sbFacts = await analyzePracticalFile({ name: 'Meo.sb3', type: 'application/x.scratch.sb3', dataUrl: await dataUrl(sb3) });
assert.equal(sbFacts.kind, 'scratch');
assert.equal(sbFacts.spriteCount, 1);
for (const kind of ['sb-flag', 'sb-loop', 'sb-say', 'sb-motion'] as const) assert.equal(check(kind, undefined, sbFacts), 'pass', kind);
for (const kind of ['sb-sound', 'sb-if', 'sb-key'] as const) assert.equal(check(kind, undefined, sbFacts), 'fail', kind);
assert.equal(check('sb-sprites', '2', sbFacts), 'fail');

// Files the machine cannot read never produce a confident answer.
const broken = await analyzePracticalFile({ name: 'BaiCu.doc', type: 'application/msword', dataUrl: 'data:application/octet-stream;base64,AAAA' });
assert.equal(broken.kind, 'other');
assert.match(broken.error || '', /\.doc/);
assert.equal(check('word-bold', undefined, broken, 'BaiCu.doc'), 'unknown');
const image = await analyzePracticalFile({ name: 'Paint.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' });
assert.equal(check('word-image', '1', image, 'Paint.jpg'), 'unknown');

assert.ok(autoCheckOptionsFor('word').every(option => option.group === 'word' || option.group === 'any'));
assert.ok(autoCheckOptionsFor('scratch').some(option => option.kind === 'sb-loop'));
assert.ok(autoCheckOptionsFor('any').length > autoCheckOptionsFor('word').length);
assert.equal(autoCheckOptionsFor('image').map(option => option.kind).join(), 'file-name');
assert.equal(describeAutoCheck({ kind: 'word-image', value: '2' }), 'Có chèn hình (ít nhất 2)');
assert.equal(describeAutoCheck({ kind: 'word-text', value: 'LỚP EM' }), 'Có đoạn chữ "LỚP EM"');
console.log('Practical file checks passed.');
