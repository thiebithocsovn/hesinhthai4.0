export type PlickerQuestionMediaKind = 'image' | 'video' | 'audio' | 'youtube';

export interface PlickerQuestionMedia {
  id: string;
  kind: PlickerQuestionMediaKind;
  src: string;
  title: string;
  mimeType?: string;
  startSeconds?: number;
  endSeconds?: number;
  libraryKey?: string;
}

export const PLICKER_MAX_MEDIA_PER_QUESTION = 6;
export const PLICKER_MAX_INLINE_MEDIA_BYTES = 240_000;

const ALLOWED_RICH_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'mark', 'span']);
const MEDIA_KINDS = new Set<PlickerQuestionMediaKind>(['image', 'video', 'audio', 'youtube']);

function normalizeFractionAttribute(value: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/giu, (_match, name: string) => entities[name.toLowerCase()])
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .slice(0, 180)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function readFractionAttribute(rawTag: string, name: 'data-numerator' | 'data-denominator'): string {
  const match = rawTag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu'));
  return normalizeFractionAttribute(match?.[1] ?? match?.[2] ?? '');
}

export function sanitizePlickerRichHtml(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const fractionSpanStack: boolean[] = [];
  return value
    .slice(0, 32_000)
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<([^>]+)>/gu, (_match, rawTag: string) => {
      const match = rawTag.trim().match(/^(\/?)\s*([a-z][a-z0-9]*)\b[^>]*$/iu);
      if (!match) return '';
      const [, closing, originalName] = match;
      const name = originalName.toLowerCase();
      if (!ALLOWED_RICH_TAGS.has(name)) return '';
      if (name === 'span') {
        if (closing) return fractionSpanStack.pop() ? '</span>' : '';
        if (/(?:^|\s)data-plicker-fraction\s*=\s*(?:"true"|'true')/iu.test(rawTag)) {
          fractionSpanStack.push(true);
          const numerator = readFractionAttribute(rawTag, 'data-numerator');
          const denominator = readFractionAttribute(rawTag, 'data-denominator');
          return `<span data-plicker-fraction="true" data-numerator="${numerator}" data-denominator="${denominator}">`;
        }
        const part = rawTag.match(/(?:^|\s)data-fraction-part\s*=\s*(?:"(numerator|denominator)"|'(numerator|denominator)')/iu);
        if (part) {
          fractionSpanStack.push(true);
          return `<span data-fraction-part="${part[1] || part[2]}">`;
        }
        fractionSpanStack.push(false);
        return '';
      }
      return name === 'br' ? '<br>' : `<${closing ? '/' : ''}${name}>`;
    })
    .trim();
}

export function inlinePlickerRichHtml(value: unknown): string {
  return sanitizePlickerRichHtml(value)
    .replace(/<\/p>\s*<p>/giu, '<br>')
    .replace(/<\/?p>/giu, '')
    .replace(/(?:<br>\s*)+$/giu, '');
}

export function plainPlickerRichText(value: unknown): string {
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', divide: '÷', frac12: '½',
  };
  return sanitizePlickerRichHtml(value)
    .replace(/<span data-plicker-fraction="true" data-numerator="([^"]*)" data-denominator="([^"]*)">\s*<span data-fraction-part="numerator">[\s\S]*?<\/span>\s*<span data-fraction-part="denominator">[\s\S]*?<\/span>\s*<\/span>/giu, (_match, numerator: string, denominator: string) => `\\frac{${numerator || '□'}}{${denominator || '□'}}`)
    .replace(/<br\s*\/?>|<\/p>\s*<p>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&#(x[0-9a-f]+|\d+);/giu, (_match, number: string) => {
      const codePoint = number.toLowerCase().startsWith('x')
        ? Number.parseInt(number.slice(1), 16)
        : Number.parseInt(number, 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF
        ? String.fromCodePoint(codePoint)
        : '';
    })
    .replace(/&([a-z]+);/giu, (match, name: string) => entities[name.toLowerCase()] || match)
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function extractPlickerYoutubeId(input: string): string | null {
  const normalized = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/u.test(normalized)) return normalized;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./u, '').replace(/^m\./u, '');
  let candidate = '';
  if (host === 'youtu.be') {
    candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'watch') candidate = parsed.searchParams.get('v') || '';
    else if (['embed', 'shorts', 'live', 'v'].includes(segments[0])) candidate = segments[1] || '';
  }
  return /^[a-zA-Z0-9_-]{11}$/u.test(candidate) ? candidate : null;
}

export function createPlickerYoutubeEmbedUrl(input: string): string | null {
  const id = extractPlickerYoutubeId(input);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

export function isPlickerMediaUrl(value: unknown, kind: Exclude<PlickerQuestionMediaKind, 'youtube'>): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500_000) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('data:')) {
    const expression = kind === 'image'
      ? /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);base64,[a-z\d+/=]+$/iu
      : kind === 'video'
        ? /^data:video\/(?:mp4|webm|ogg);base64,[a-z\d+/=]+$/iu
        : /^data:audio\/(?:mpeg|mp3|wav|wave|x-wav|ogg|webm|mp4|m4a|aac);(?:codecs=[^;,]+;)?base64,[a-z\d+/=]+$/iu;
    return expression.test(trimmed);
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

export function sanitizePlickerQuestionMedia(input: unknown): PlickerQuestionMedia[] {
  if (!Array.isArray(input)) return [];
  const used = new Set<string>();
  const result: PlickerQuestionMedia[] = [];

  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/u.test(raw.id) || used.has(raw.id)) continue;
    if (typeof raw.kind !== 'string' || !MEDIA_KINDS.has(raw.kind as PlickerQuestionMediaKind)) continue;
    const kind = raw.kind as PlickerQuestionMediaKind;
    const source = typeof raw.src === 'string' ? raw.src.trim() : '';
    const src = kind === 'youtube'
      ? createPlickerYoutubeEmbedUrl(source)
      : isPlickerMediaUrl(source, kind) ? source : null;
    if (!src) continue;

    const media: PlickerQuestionMedia = {
      id: raw.id,
      kind,
      src,
      title: typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim().slice(0, 160)
        : ({ image: 'Hình ảnh', video: 'Video', audio: 'Âm thanh', youtube: 'Video YouTube' })[kind],
    };
    if (typeof raw.mimeType === 'string' && /^[a-z]+\/[a-z\d.+-]+$/iu.test(raw.mimeType)) media.mimeType = raw.mimeType;
    if (typeof raw.libraryKey === 'string' && /^[a-z\d_-]+$/iu.test(raw.libraryKey)) media.libraryKey = raw.libraryKey;
    if (typeof raw.startSeconds === 'number' && Number.isFinite(raw.startSeconds) && raw.startSeconds >= 0) {
      media.startSeconds = Math.min(86_400, Math.round(raw.startSeconds * 10) / 10);
    }
    if (typeof raw.endSeconds === 'number' && Number.isFinite(raw.endSeconds) && raw.endSeconds > (media.startSeconds || 0)) {
      media.endSeconds = Math.min(86_400, Math.round(raw.endSeconds * 10) / 10);
    }
    used.add(media.id);
    result.push(media);
    if (result.length >= PLICKER_MAX_MEDIA_PER_QUESTION) break;
  }

  return result;
}

export function formatPlickerMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export const PLICKER_SOUND_LIBRARY = [
  { id: 'correct', title: 'Đáp án đúng', category: 'Trò chơi', duration: 0.65 },
  { id: 'wrong', title: 'Đáp án chưa đúng', category: 'Trò chơi', duration: 0.55 },
  { id: 'applause', title: 'Tiếng vỗ tay', category: 'Lớp học', duration: 1.2 },
  { id: 'bell', title: 'Chuông vào lớp', category: 'Lớp học', duration: 0.9 },
  { id: 'countdown', title: 'Đếm ngược', category: 'Đồng hồ', duration: 1.15 },
  { id: 'magic', title: 'Âm thanh kỳ diệu', category: 'Hiệu ứng', duration: 0.8 },
] as const;

export function createPlickerSoundEffectDataUrl(effectId: string): string {
  const effect = PLICKER_SOUND_LIBRARY.find(item => item.id === effectId);
  if (!effect) throw new RangeError('Hiệu ứng âm thanh không tồn tại.');
  const sampleRate = 12_000;
  const samples = Math.floor(effect.duration * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);

  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const progress = time / effect.duration;
    const envelope = Math.min(1, time * 30) * Math.max(0, 1 - progress);
    let signal = 0;
    if (effect.id === 'correct') signal = Math.sin(time * Math.PI * 2 * (time < 0.22 ? 660 : 990));
    if (effect.id === 'wrong') signal = Math.sin(time * Math.PI * 2 * (time < 0.2 ? 220 : 170)) * 0.8;
    if (effect.id === 'bell') signal = (Math.sin(time * Math.PI * 2 * 880) + Math.sin(time * Math.PI * 2 * 1320) * 0.45) / 1.45;
    if (effect.id === 'magic') signal = Math.sin(time * Math.PI * 2 * (520 + time * 1000));
    if (effect.id === 'countdown') signal = Math.sin(time * Math.PI * 2 * (Math.floor(time * 4) === 4 ? 1050 : 700)) * (time % 0.25 < 0.11 ? 1 : 0);
    if (effect.id === 'applause') signal = Math.sin(index * 12.9898) * Math.sin(time * 35) * Math.max(0, Math.sin(time * Math.PI * 7));
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, signal * envelope * 0.58)) * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
