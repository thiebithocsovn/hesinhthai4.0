import React from 'react';
import { Film, Music2, Scissors, Trash2, Youtube } from 'lucide-react';
import {
  formatPlickerMediaTime,
  inlinePlickerRichHtml,
  sanitizePlickerQuestionMedia,
  type PlickerQuestionMedia,
} from '../lib/plickerQuestionMedia';

export function PlickerRichContent({
  text,
  html,
  className = '',
  children,
}: {
  text?: string;
  html?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const safeHtml = inlinePlickerRichHtml(html);
  if (!safeHtml) return <>{children ?? text ?? ''}</>;
  return (
    <span
      className={`[&_mark]:rounded-sm [&_mark]:bg-amber-100 [&_sub]:text-[0.7em] [&_sup]:text-[0.7em] [&_[data-plicker-fraction]]:mx-[0.14em] [&_[data-plicker-fraction]]:inline-flex [&_[data-plicker-fraction]]:min-w-[1.7em] [&_[data-plicker-fraction]]:flex-col [&_[data-plicker-fraction]]:items-stretch [&_[data-plicker-fraction]]:align-middle [&_[data-plicker-fraction]]:text-[0.76em] [&_[data-plicker-fraction]]:leading-[1.15] [&_[data-fraction-part=numerator]]:border-b-[0.08em] [&_[data-fraction-part=numerator]]:border-current [&_[data-fraction-part=numerator]]:px-[0.22em] [&_[data-fraction-part=numerator]]:pb-[0.08em] [&_[data-fraction-part=numerator]]:text-center [&_[data-fraction-part=denominator]]:px-[0.22em] [&_[data-fraction-part=denominator]]:pt-[0.08em] [&_[data-fraction-part=denominator]]:text-center ${className}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

export default function PlickerQuestionMediaGallery({
  media,
  compact = false,
  onRemove,
  onClip,
}: {
  media?: PlickerQuestionMedia[];
  compact?: boolean;
  onRemove?: (id: string) => void;
  onClip?: (item: PlickerQuestionMedia) => void;
}) {
  const attachments = sanitizePlickerQuestionMedia(media);
  if (attachments.length === 0) return null;

  return (
    <section
      aria-label="Tệp đa phương tiện của câu hỏi"
      className={`grid min-w-0 gap-3 ${compact ? 'mt-4 grid-cols-1' : 'mt-5 grid-cols-1 lg:grid-cols-2'}`}
    >
      {attachments.map(item => (
        <article
          key={item.id}
          className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${
            item.kind === 'audio' ? 'p-3' : ''
          }`}
        >
          {item.kind === 'image' && (
            <img
              src={item.src}
              alt={item.title}
              loading="lazy"
              className={`w-full bg-white object-contain ${compact ? 'max-h-44' : 'max-h-[32vh] min-h-32'}`}
            />
          )}
          {item.kind === 'video' && (
            <video
              src={item.src}
              controls
              playsInline
              preload="metadata"
              aria-label={item.title}
              className={`w-full bg-black object-contain ${compact ? 'max-h-44' : 'max-h-[32vh]'}`}
            />
          )}
          {item.kind === 'youtube' && (
            <iframe
              src={item.src}
              title={item.title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className={`aspect-video w-full bg-black ${compact ? 'max-h-48' : 'max-h-[36vh]'}`}
            />
          )}
          {item.kind === 'audio' && (
            <div className="space-y-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
                <Music2 className="h-4 w-4 shrink-0 text-indigo-500" />
                <span className="truncate">{item.title}</span>
                {item.startSeconds !== undefined && (
                  <span className="ml-auto shrink-0 text-xs text-slate-500">
                    {formatPlickerMediaTime(item.startSeconds)}
                    {item.endSeconds !== undefined ? `–${formatPlickerMediaTime(item.endSeconds)}` : ''}
                  </span>
                )}
              </div>
              <audio
                src={item.src}
                controls
                preload="metadata"
                aria-label={item.title}
                className="h-9 w-full"
                onLoadedMetadata={event => {
                  if (item.startSeconds !== undefined) event.currentTarget.currentTime = item.startSeconds;
                }}
                onPlay={event => {
                  if (item.startSeconds !== undefined && event.currentTarget.currentTime < item.startSeconds) {
                    event.currentTarget.currentTime = item.startSeconds;
                  }
                }}
                onTimeUpdate={event => {
                  if (item.endSeconds !== undefined && event.currentTarget.currentTime >= item.endSeconds) {
                    event.currentTarget.pause();
                    event.currentTarget.currentTime = item.startSeconds || 0;
                  }
                }}
              />
            </div>
          )}

          {item.kind !== 'audio' && (
            <div className="flex min-w-0 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              {item.kind === 'youtube' ? <Youtube className="h-4 w-4 text-red-500" /> : item.kind === 'video' ? <Film className="h-4 w-4 text-indigo-500" /> : null}
              <span className="truncate">{item.title}</span>
            </div>
          )}

          {(onRemove || (onClip && item.kind === 'audio')) && (
            <div className="absolute right-2 top-2 flex gap-1 rounded-lg bg-white/95 p-1 shadow-sm">
              {onClip && item.kind === 'audio' && (
                <button
                  type="button"
                  onClick={() => onClip(item)}
                  title="Cắt đoạn âm thanh"
                  aria-label={`Cắt đoạn ${item.title}`}
                  className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                >
                  <Scissors className="h-4 w-4" />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  title="Xóa tệp đính kèm"
                  aria-label={`Xóa ${item.title}`}
                  className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
