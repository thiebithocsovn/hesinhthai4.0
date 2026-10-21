import sanitizeHtml from 'sanitize-html';

/** Keep question formatting and illustrations in teacher reviews and printed receipts. */
export function examQuestionHtml(value: string): string {
  return sanitizeHtml(value || '', {
    allowedTags: ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'span', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'img', 'hr', 'mark'],
    allowedAttributes: {
      img: ['src', 'alt', 'width', 'height'],
      th: ['rowspan', 'colspan'],
      td: ['rowspan', 'colspan'],
      span: ['data-plicker-fraction', 'data-numerator', 'data-denominator', 'data-fraction-part'],
    },
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    transformTags: {
      img: (tagName, attributes) => {
        const src = (attributes.src || '').trim();
        if (/^data:/i.test(src) && !/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,/i.test(src)) delete attributes.src;
        return { tagName, attribs: attributes };
      },
    },
  });
}
