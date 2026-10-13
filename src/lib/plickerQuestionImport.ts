import type { PlickerAnswer } from './plickerVision';

export const PLICKER_IMPORT_QUESTION_LIMIT = 200;
const MAX_WORD_FILE_BYTES = 12 * 1024 * 1024;
const MAX_WORD_XML_BYTES = 18 * 1024 * 1024;
const ANSWERS: PlickerAnswer[] = ['A', 'B', 'C', 'D'];

export interface ImportedPlickerQuestion {
  id: number;
  text: string;
  type: 'multiple_choice' | 'true_false';
  gradingType: 'graded' | 'survey';
  options: Partial<Record<PlickerAnswer, string>>;
  correctAnswer: PlickerAnswer | null;
}

export interface PlickerQuestionImportResult {
  questions: ImportedPlickerQuestion[];
  skipped: number;
  truncated: boolean;
}

export interface PlickerQuestionFileResult {
  title: string;
  text: string;
  fileName: string;
}

interface DraftQuestion {
  text: string;
  options: Partial<Record<PlickerAnswer, string>>;
  correctAnswer: PlickerAnswer | null;
  currentAnswer: PlickerAnswer | null;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu, entity => {
    const named: Record<string, string> = {
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    };
    if (named[entity]) return named[entity];
    const hexadecimal = /^&#x([\da-f]+);$/iu.exec(entity);
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal[1], 16));
    const decimal = /^&#(\d+);$/u.exec(entity);
    return decimal ? String.fromCodePoint(Number.parseInt(decimal[1], 10)) : entity;
  });
}

function xmlFragmentText(fragment: string): string {
  return Array.from(fragment.matchAll(/<(?:w|m):t\b[^>]*>([\s\S]*?)<\/(?:w|m):t>/giu))
    .map(match => decodeXmlEntities(match[1]))
    .join('');
}

function normalizeWordMath(fragment: string): string {
  let result = fragment.replace(/<m:f\b[^>]*>([\s\S]*?)<\/m:f>/giu, (_, content: string) => {
    const numerator = /<m:num\b[^>]*>([\s\S]*?)<\/m:num>/iu.exec(content);
    const denominator = /<m:den\b[^>]*>([\s\S]*?)<\/m:den>/iu.exec(content);
    if (!numerator || !denominator) return content;
    return `<w:t>${xmlFragmentText(numerator[1])}/${xmlFragmentText(denominator[1])}</w:t>`;
  });

  result = result.replace(/<m:sSup\b[^>]*>([\s\S]*?)<\/m:sSup>/giu, (_, content: string) => {
    const base = /<m:e\b[^>]*>([\s\S]*?)<\/m:e>/iu.exec(content);
    const exponent = /<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>/iu.exec(content);
    if (!base || !exponent) return content;
    const value = xmlFragmentText(exponent[1]);
    return `<w:t>${xmlFragmentText(base[1])}^${value.length > 1 ? `{${value}}` : value}</w:t>`;
  });

  result = result.replace(/<m:sSub\b[^>]*>([\s\S]*?)<\/m:sSub>/giu, (_, content: string) => {
    const base = /<m:e\b[^>]*>([\s\S]*?)<\/m:e>/iu.exec(content);
    const subscript = /<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>/iu.exec(content);
    if (!base || !subscript) return content;
    const value = xmlFragmentText(subscript[1]);
    return `<w:t>${xmlFragmentText(base[1])}_${value.length > 1 ? `{${value}}` : value}</w:t>`;
  });

  return result.replace(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/giu, (run: string, content: string) => {
    const alignment = /<w:vertAlign\b[^>]*\b(?:w:)?val=["'](superscript|subscript)["']/iu.exec(content);
    if (!alignment) return run;
    const value = xmlFragmentText(content);
    return `<w:t>${alignment[1].toLowerCase() === 'subscript' ? '_' : '^'}${value.length > 1 ? `{${value}}` : value}</w:t>`;
  });
}

export function extractPlickerWordDocumentText(xml: string): string {
  if (!xml.includes('<w:document') && !xml.includes('<w:body')) {
    throw new Error('Tệp Word không chứa nội dung văn bản hợp lệ.');
  }

  const paragraphs = Array.from(xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/giu));
  const lines = paragraphs.map(match => {
    const paragraph = normalizeWordMath(match[1]);
    const fragments: string[] = [];
    const tokens = /<(?:w|m):t\b[^>]*>([\s\S]*?)<\/(?:w|m):t>|<w:tab\b[^>]*\/?\s*>|<w:(?:br|cr)\b[^>]*\/?\s*>/giu;

    for (const token of paragraph.matchAll(tokens)) {
      if (token[1] !== undefined) fragments.push(decodeXmlEntities(token[1]));
      else if (/^<w:tab/iu.test(token[0])) fragments.push('\t');
      else fragments.push('\n');
    }

    let line = fragments.join('').trim();
    const answerOption = /^\s*[A-Da-d]\s*[.):]\s*/u.test(line);
    const markedInWord = /<w:(?:u|highlight)\b(?![^>]*\b(?:w:)?val=["'](?:none|clear)["'])[^>]*\/?\s*>/iu.test(paragraph);
    if (answerOption && markedInWord && !/^\*/u.test(line)) line = `*${line}`;
    return line;
  });

  return lines.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

function splitInlineOptions(line: string): string[] {
  const markers = Array.from(line.matchAll(/(?:^|\s)(?:\*|✓|✔|✅|\[x\])?\s*[A-Da-d]\s*[.):]\s+/giu));
  if (markers.length < 2) return [line];

  const first = markers[0].index ?? 0;
  const prefix = line.slice(0, first).trim();
  const result: string[] = prefix ? [prefix] : [];

  for (let index = 0; index < markers.length; index += 1) {
    const start = markers[index].index ?? 0;
    const end = index + 1 < markers.length ? markers[index + 1].index ?? line.length : line.length;
    result.push(line.slice(start, end).trim());
  }
  return result;
}

function detectCorrectAnswer(line: string): PlickerAnswer | null {
  const match = /^(?:đáp\s*án(?:\s*đúng)?|lời\s*giải|answer|correct(?:\s*answer)?)\s*(?::|=|-|là)?\s*([A-Da-d])(?:\b|[.)\s])/iu.exec(line);
  return match ? match[1].toUpperCase() as PlickerAnswer : null;
}

function questionHeading(line: string): string | null {
  const named = /^(?:câu\s*hỏi|câu|question|q)\s*\d{1,4}\s*[.):\-]?\s*(.*)$/iu.exec(line);
  if (named) return named[1].trim();
  const numbered = /^\d{1,4}\s*[.)]\s+(.+)$/u.exec(line);
  return numbered ? numbered[1].trim() : null;
}

export function parsePlickerQuestionText(text: string): PlickerQuestionImportResult {
  const normalized = text.replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n').replace(/\u00a0/gu, ' ');
  const lines = normalized.split('\n').flatMap(splitInlineOptions);
  const questions: ImportedPlickerQuestion[] = [];
  let current: DraftQuestion | null = null;
  let pendingStem: string[] = [];
  let skipped = 0;
  let truncated = false;

  const commit = () => {
    if (!current) return;
    const textValue = current.text.trim();
    const filledAnswers = ANSWERS.filter(answer => current?.options[answer]?.trim());
    if (!textValue || filledAnswers.length < 2) {
      skipped += 1;
      current = null;
      return;
    }
    if (questions.length >= PLICKER_IMPORT_QUESTION_LIMIT) {
      truncated = true;
      current = null;
      return;
    }

    const correct = current.correctAnswer && filledAnswers.includes(current.correctAnswer)
      ? current.correctAnswer
      : null;
    questions.push({
      id: questions.length + 1,
      text: textValue,
      type: filledAnswers.length === 2 ? 'true_false' : 'multiple_choice',
      gradingType: correct ? 'graded' : 'survey',
      options: Object.fromEntries(ANSWERS.map(answer => [answer, current?.options[answer]?.trim() || ''])) as Record<PlickerAnswer, string>,
      correctAnswer: correct,
    });
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = questionHeading(line);
    if (heading !== null) {
      commit();
      pendingStem = [];
      current = { text: heading, options: {}, correctAnswer: null, currentAnswer: null };
      continue;
    }

    const correct = detectCorrectAnswer(line);
    if (correct && current) {
      current.correctAnswer = correct;
      current.currentAnswer = null;
      continue;
    }

    const option = /^(\*|✓|✔|✅|\[x\])?\s*([A-Da-d])\s*(\*)?\s*[.):]\s*(.*)$/iu.exec(line);
    if (option) {
      if (!current && pendingStem.length > 0) {
        current = { text: pendingStem.join(' ').trim(), options: {}, correctAnswer: null, currentAnswer: null };
        pendingStem = [];
      }
      if (!current) continue;
      const answer = option[2].toUpperCase() as PlickerAnswer;
      let value = option[4].trim();
      const suffixCorrect = /(?:\s+\((?:đúng|correct)\)|\s*[✓✔✅*])$/iu.test(value);
      if (suffixCorrect) value = value.replace(/(?:\s+\((?:đúng|correct)\)|\s*[✓✔✅*])$/iu, '').trim();

      if (answer === 'A' && current.options.A !== undefined && Object.keys(current.options).length >= 2) {
        commit();
        current = { text: pendingStem.join(' ').trim(), options: {}, correctAnswer: null, currentAnswer: null };
        pendingStem = [];
      }

      current.options[answer] = value;
      current.currentAnswer = answer;
      if (option[1] || option[3] || suffixCorrect) current.correctAnswer = answer;
      continue;
    }

    if (!current) {
      pendingStem.push(line);
      continue;
    }

    if (current.currentAnswer) {
      current.options[current.currentAnswer] = `${current.options[current.currentAnswer] || ''} ${line}`.trim();
    } else {
      current.text = `${current.text} ${line}`.trim();
    }
  }

  commit();
  return { questions, skipped, truncated };
}

export async function readPlickerQuestionFile(file: File): Promise<PlickerQuestionFileResult> {
  if (file.size > MAX_WORD_FILE_BYTES) {
    throw new Error('Tệp quá lớn. Vui lòng chọn tệp Word nhỏ hơn 12 MB.');
  }

  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  const title = fileName.replace(/\.[^.]+$/u, '').replace(/[_-]+/gu, ' ').trim() || 'Bộ câu hỏi nhập từ Word';

  if (lowerName.endsWith('.txt')) {
    return { title, text: (await file.text()).trim(), fileName };
  }

  if (lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
    throw new Error('Tệp .doc là định dạng Word cũ. Hãy mở bằng Microsoft Word, chọn Save As và lưu thành .docx trước khi nhập.');
  }

  if (!lowerName.endsWith('.docx')) {
    throw new Error('Chỉ hỗ trợ tệp Word .docx hoặc văn bản .txt.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('Tệp Word không hợp lệ hoặc đã bị hỏng.');
  }

  try {
    const workbookModule = await import('xlsx');
    const CFB = workbookModule.CFB || workbookModule.default?.CFB;
    if (!CFB) throw new Error('Trình duyệt chưa sẵn sàng đọc tệp Word.');
    const archive = CFB.read(bytes, { type: 'array' });
    const document = CFB.find(archive, '/word/document.xml');
    if (!document?.content) throw new Error('Không tìm thấy nội dung document.xml trong tệp Word.');

    const content = document.content instanceof Uint8Array
      ? document.content
      : Uint8Array.from(document.content);
    if (content.byteLength > MAX_WORD_XML_BYTES) {
      throw new Error('Nội dung Word quá lớn để nhập an toàn. Hãy chia tài liệu thành các tệp nhỏ hơn.');
    }

    const xml = new TextDecoder('utf-8').decode(content);
    const text = extractPlickerWordDocumentText(xml);
    if (!text) throw new Error('Không tìm thấy văn bản câu hỏi trong tệp Word.');
    return { title, text, fileName };
  } catch (error) {
    throw error instanceof Error ? error : new Error('Không thể đọc tệp Word.');
  }
}
