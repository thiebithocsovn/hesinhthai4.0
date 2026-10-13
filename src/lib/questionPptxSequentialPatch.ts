import PptxGenJSImport from 'pptxgenjs';

// Question Studio currently simulates reveal animations with paired slides
// (question -> answer). PptxGenJS 4.x does not emit native PowerPoint object
// animations, so the most reliable classroom flow is to keep those paired
// slides in physical order and hide the instruction slide from normal advance.
const PptxGenJS = (((PptxGenJSImport as any)?.default ?? PptxGenJSImport) as any);
const prototype = PptxGenJS?.prototype as any;
const PATCH_FLAG = Symbol.for('smartclass.question-studio.sequential-pptx');

function addCoverNavigation(presentation: any, cover: any): void {
  if (!cover || (cover as any).__questionStudioSequentialDecorated) return;
  (cover as any).__questionStudioSequentialDecorated = true;

  const shapeType = presentation.ShapeType?.rect;
  if (!shapeType) return;

  cover.addText('TRÌNH CHIẾU TUẦN TỰ', {
    x: 0.76,
    y: 4.72,
    w: 3.4,
    h: 0.3,
    fontFace: 'Aptos',
    fontSize: 12,
    bold: true,
    color: 'A5B4FC',
    margin: 0,
  });
  cover.addText('Nhấn →, Space hoặc chuột: Câu hỏi → Đáp án → Câu tiếp theo', {
    x: 0.76,
    y: 5.04,
    w: 7.8,
    h: 0.42,
    fontFace: 'Aptos',
    fontSize: 15,
    color: 'E2E8F0',
    margin: 0,
  });

  const startBox = { x: 8.82, y: 4.72, w: 3.72, h: 0.64 };
  cover.addShape(shapeType, {
    ...startBox,
    fill: { color: '4F46E5' },
    line: { color: '818CF8', width: 1.2 },
    hyperlink: { slide: 3, tooltip: 'Bắt đầu từ Câu 1' },
  });
  cover.addText('BẮT ĐẦU CÂU 1  →', {
    ...startBox,
    fontFace: 'Aptos',
    fontSize: 15,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
    valign: 'mid',
    margin: 0.04,
    hyperlink: { slide: 3, tooltip: 'Bắt đầu từ Câu 1' },
  });

  const guideBox = { x: 8.82, y: 5.54, w: 3.72, h: 0.54 };
  cover.addShape(shapeType, {
    ...guideBox,
    fill: { color: '172554', transparency: 100 },
    line: { color: '94A3B8', width: 1.1 },
    hyperlink: { slide: 2, tooltip: 'Xem hướng dẫn trình chiếu' },
  });
  cover.addText('HƯỚNG DẪN TRÌNH CHIẾU', {
    ...guideBox,
    fontFace: 'Aptos',
    fontSize: 11.5,
    bold: true,
    color: 'CBD5E1',
    align: 'center',
    valign: 'mid',
    margin: 0.03,
    hyperlink: { slide: 2, tooltip: 'Xem hướng dẫn trình chiếu' },
  });

  cover.addNotes(
    'Luồng mặc định: Trang bìa → Câu 1 → Đáp án 1 → Câu 2 → Đáp án 2 → … → Kết thúc. '
      + 'Slide hướng dẫn được ẩn khỏi luồng mặc định nhưng vẫn mở được bằng nút HƯỚNG DẪN.',
  );
}

if (prototype && !prototype[PATCH_FLAG]) {
  prototype[PATCH_FLAG] = true;
  const originalWriteFile = prototype.writeFile;

  prototype.writeFile = async function patchedQuestionStudioWriteFile(props?: unknown) {
    try {
      const subject = String((this as any).subject ?? (this as any)._subject ?? '');
      const slides = Array.isArray((this as any).slides)
        ? (this as any).slides
        : (this as any)._slides;

      if (subject === 'Bài giảng trắc nghiệm tương tác 10 dạng' && Array.isArray(slides) && slides.length >= 4) {
        const cover = slides[0];
        const guide = slides[1];

        // PowerPoint skips hidden slides during normal next/Space/mouse advance,
        // so the default flow becomes cover -> Q1 -> A1 -> Q2 -> A2 -> ...
        // while the guide remains reachable through an explicit hyperlink.
        if (guide) guide.hidden = true;
        addCoverNavigation(this, cover);
      }
    } catch (error) {
      console.warn('Không thể tối ưu thứ tự trình chiếu Question Studio:', error);
    }

    return originalWriteFile.call(this, props);
  };
}
