import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import '../src/lib/questionPptxSequentialPatch.ts';
import { QUESTION_TYPES, createQuestionTemplate } from '../src/lib/questionEngine.ts';
import { exportQuestionBankToPptx } from '../src/lib/questionPptxInteractiveExport.ts';

let checks = 0;
const verify = (condition: unknown, description: string) => {
  assert.ok(condition, description);
  checks += 1;
};

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
const questions = QUESTION_TYPES.map(type => {
  const question = createQuestionTemplate(type);
  question.prompt = `Câu mẫu ${type}`;
  question.explanation = `Giải thích ${type}`;
  if (question.payload.type === 'image_hotspot') question.payload.imageUrl = onePixelPng;
  return question;
});

verify(questions.length === 10, 'The PowerPoint sample includes all ten Question Engine types.');

let generatedFileName = '';
try {
  generatedFileName = await exportQuestionBankToPptx({
    id: 'bank-pptx-test',
    title: 'Bài giảng kiểm thử 10 dạng',
    questions,
  });
  const generatedPath = resolve(generatedFileName);
  verify(generatedFileName.endsWith('.pptx'), 'Export returns a PowerPoint filename.');
  verify(existsSync(generatedPath), 'PptxGenJS writes a real PowerPoint file in the CI runner.');
  verify(statSync(generatedPath).size > 10_000, 'The generated PowerPoint contains a non-trivial slide package.');

  const guideSlideXml = execFileSync('unzip', ['-p', generatedPath, 'ppt/slides/slide2.xml'], { encoding: 'utf8' });
  const coverSlideXml = execFileSync('unzip', ['-p', generatedPath, 'ppt/slides/slide1.xml'], { encoding: 'utf8' });
  const correctFeedbackXml = execFileSync('unzip', ['-p', generatedPath, 'ppt/slides/slide5.xml'], { encoding: 'utf8' });
  const wrongFeedbackXml = execFileSync('unzip', ['-p', generatedPath, 'ppt/slides/slide6.xml'], { encoding: 'utf8' });
  verify(guideSlideXml.includes('show="0"'), 'The instruction slide is hidden from normal slideshow advance.');
  verify(coverSlideXml.includes('BẮT ĐẦU CÂU 1'), 'The cover contains a direct start control for Question 1.');
  verify(coverSlideXml.includes('TRÌNH CHIẾU TUẦN TỰ'), 'The cover explains the sequential classroom flow.');
  verify(correctFeedbackXml.includes('show="0"'), 'Correct-answer feedback slide is hidden from normal sequential advance.');
  verify(wrongFeedbackXml.includes('show="0"'), 'Wrong-answer feedback slide is hidden from normal sequential advance.');
  verify(correctFeedbackXml.includes('ECFDF5') || correctFeedbackXml.includes('059669'), 'Correct-answer feedback contains the green visual state.');
  verify(wrongFeedbackXml.includes('FEF2F2') || wrongFeedbackXml.includes('DC2626'), 'Wrong-answer feedback contains the red visual state.');
} finally {
  if (generatedFileName && existsSync(resolve(generatedFileName))) {
    unlinkSync(resolve(generatedFileName));
  }
}

const exporter = readFileSync(new URL('../src/lib/questionPptxInteractiveExport.ts', import.meta.url), 'utf8');
const sequentialPatch = readFileSync(new URL('../src/lib/questionPptxSequentialPatch.ts', import.meta.url), 'utf8');
const controls = readFileSync(new URL('../src/components/QuestionStudioPptxExport.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/components/QuestionStudioApp.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

for (const type of QUESTION_TYPES) {
  verify(exporter.includes(`case '${type}'`) || exporter.includes(`payload.type !== '${type}'`) || exporter.includes(`payload.type === '${type}'`), `PowerPoint renderer handles ${type}.`);
}
verify(exporter.includes("hyperlink: { slide: targetSlide }"), 'Slides use internal hyperlinks for click interaction.');
verify(exporter.includes("'HIỆN ĐÁP ÁN  →'"), 'Question slides retain a reveal-answer control.');
verify(exporter.includes("'CÂU TIẾP THEO  →'"), 'Answer and correct-feedback slides include next-question navigation.');
verify(exporter.includes("redSoft: 'FEF2F2'"), 'Wrong-answer feedback uses a red visual state.');
verify(exporter.includes("greenSoft: 'ECFDF5'"), 'Correct-answer feedback uses a green visual state.');
verify(exporter.includes("'↺  THỬ LẠI'"), 'Wrong-answer feedback provides a retry control.');
verify(exporter.includes('(slide as any).hidden = true'), 'Feedback branch slides are hidden from normal sequential playback.');
verify(exporter.includes('targetSlide: !reveal && selectedIndex === null ? targets[optionIndex] : undefined'), 'Choice options link to their own feedback branch slides.');
verify(exporter.includes("pptx.layout = 'LAYOUT_WIDE'"), 'PowerPoint export uses 16:9 widescreen layout.');
verify(exporter.includes("lang: 'vi-VN'"), 'PowerPoint theme declares Vietnamese language metadata.');
verify(exporter.includes('pptx.writeFile({ fileName, compression: true })'), 'Export downloads a compressed PPTX in the browser.');
verify(sequentialPatch.includes('guide.hidden = true'), 'Sequential playback hides the guide from normal advance.');
verify(sequentialPatch.includes("hyperlink: { slide: 3"), 'The cover starts directly at Question 1.');
verify(app.includes("import '../lib/questionPptxSequentialPatch';"), 'The sequential PowerPoint patch is enabled when Question Studio is loaded.');
verify(!main.includes("import './lib/questionPptxSequentialPatch';"), 'The PowerPoint patch is not eagerly loaded by the ecosystem homepage.');
verify(controls.includes("from '../lib/questionPptxInteractiveExport'"), 'Question Studio uses the interactive green-red PowerPoint exporter.');
verify(controls.includes('Xuất PowerPoint'), 'Question Studio exposes a visible PowerPoint export action.');
verify(controls.includes('Đúng xanh • Sai đỏ'), 'The UI explains green/red answer feedback.');
verify(controls.includes('Xóa bộ câu hỏi đang chọn'), 'Question Studio exposes a delete control for the selected question bank.');
verify(controls.includes('window.confirm('), 'Deleting a question bank requires explicit confirmation.');
verify(controls.includes('localStorage.setItem(storageKey(ownerUid), JSON.stringify(remaining))'), 'Deleting a bank persists the remaining owner-scoped banks.');
verify(controls.includes('window.location.reload()'), 'The Question Studio interface refreshes immediately after a bank is deleted.');
verify(app.includes('<QuestionStudioPptxExport />'), 'PowerPoint export is mounted directly inside the ten-type Question Studio page.');
verify(packageJson.dependencies.pptxgenjs === '^4.0.1', 'The browser build pins the supported PptxGenJS release.');
verify(packageJson.scripts['test:question-pptx'].includes('test-question-pptx-export.ts'), 'The PowerPoint regression test is available to CI.');

console.info(`Question Studio PowerPoint interactive green-red feedback: ${checks} checks passed.`);
