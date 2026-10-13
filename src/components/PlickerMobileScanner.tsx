import React, { useEffect, useState, type RefObject } from 'react';
import {
  BarChart3, ChevronLeft, ChevronRight, Eye, EyeOff, LayoutGrid, ScanLine,
  Square, Wifi, WifiOff, X,
} from 'lucide-react';
import type { PlickerAnswer } from '../lib/plickerVision';
import type { PlickerQuestionMedia } from '../lib/plickerQuestionMedia';
import PlickerQuestionMediaGallery, { PlickerRichContent } from './PlickerQuestionContent';
import { PlickerDisplayMath } from './PlickerDisplayScreen';

const ANSWERS: PlickerAnswer[] = ['A', 'B', 'C', 'D'];

export interface PlickerMobileStudent {
  id: string;
  name: string;
  cardId?: number;
}

export interface PlickerMobileQuestion {
  text: string;
  richText?: string;
  optionRichText?: Partial<Record<PlickerAnswer, string>>;
  media?: PlickerQuestionMedia[];
  options: Partial<Record<PlickerAnswer, string>>;
  correctAnswer: PlickerAnswer | null;
}

export interface PlickerMobileResponse {
  studentId: string;
  answer: PlickerAnswer;
}

export type PlickerMobileSheetMode = 'graph' | 'students';

export interface PlickerMobileResultsSheetProps {
  mode: PlickerMobileSheetMode;
  question: PlickerMobileQuestion;
  students: PlickerMobileStudent[];
  responses: PlickerMobileResponse[];
  distribution: Record<PlickerAnswer, number>;
  onClose: () => void;
  onClearResponses: () => void;
}

interface PlickerMobileScannerProps {
  className: string;
  question: PlickerMobileQuestion;
  questionIndex: number;
  questionCount: number;
  students: PlickerMobileStudent[];
  responses: PlickerMobileResponse[];
  distribution: Record<PlickerAnswer, number>;
  scanning: boolean;
  scanError?: string;
  connected: boolean;
  displayConnected: boolean;
  showCorrect: boolean;
  showGraph: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  onStartScan: () => void;
  onStopScan: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onClearResponses: () => void;
  onToggleCorrect: () => void;
  onToggleGraph: () => void;
  onExit: () => void;
}

export function formatPlickerMobileStudentName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 13) return normalized;

  const parts = normalized.split(' ');
  if (parts.length < 2) return normalized;

  const lastName = parts.at(-1) || normalized;
  const previousName = parts.at(-2) || '';
  const shortName = `${previousName.charAt(0)}.${lastName}`;
  return shortName.length <= 13 ? shortName : lastName;
}

export function calculatePlickerMobilePercentage(count: number, total: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(count * 100 / total)));
}

function AnswerBadge({ answer, correct, compact = false }: {
  answer: PlickerAnswer;
  correct: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] border font-semibold ${
        compact ? 'h-8 w-8 text-lg' : 'h-9 w-9 text-xl'
      } ${correct ? 'border-[#62ba92] bg-[#62ba92] text-white' : 'border-[#d2d2d4] text-[#d0d0d2]'}`}
      aria-label={`Phương án ${answer}${correct ? ', đáp án đúng' : ''}`}
    >
      {answer}
    </span>
  );
}

function ColorfulResultsIcon({ mode }: { mode: PlickerMobileSheetMode }) {
  if (mode === 'graph') {
    return (
      <span aria-hidden="true" className="inline-flex h-6 items-end gap-[2px]">
        <span className="h-2 w-[5px] rounded-t-sm bg-emerald-400" />
        <span className="h-3 w-[5px] rounded-t-sm bg-teal-400" />
        <span className="h-4 w-[5px] rounded-t-sm bg-fuchsia-400" />
        <span className="h-5 w-[5px] rounded-t-sm bg-purple-400" />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="grid h-5 w-5 grid-cols-4 gap-[2px]">
      {Array.from({ length: 16 }, (_, index) => (
        <span
          key={index}
          className={`rounded-[1px] ${['bg-sky-400', 'bg-emerald-400', 'bg-pink-400', 'bg-violet-400'][index % 4]}`}
        />
      ))}
    </span>
  );
}

export function PlickerMobileResultsSheet({
  mode, question, students, responses, distribution, onClose, onClearResponses,
}: PlickerMobileResultsSheetProps) {
  const answerByStudent = new Map(responses.map(response => [response.studentId, response.answer]));
  const availableAnswers = ANSWERS.filter(answer => question.options[answer] !== undefined);

  return (
    <section
      aria-label={mode === 'graph' ? 'Biểu đồ câu trả lời' : 'Danh sách học sinh đã quét'}
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[26px] bg-[#fdfdfd] text-[#242229] shadow-[0_-12px_45px_rgba(0,0,0,0.15)] ${
        mode === 'students' ? 'max-h-[76dvh] min-h-[57dvh]' : 'max-h-[55dvh] min-h-[36dvh]'
      }`}
      style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng bảng kết quả"
        className="flex min-h-[66px] w-full items-center gap-3 border-b border-[#ececef] px-6 text-left"
      >
        <ColorfulResultsIcon mode={mode} />
        <span className="text-xl font-semibold tracking-tight">
          {mode === 'graph' ? 'Biểu đồ' : 'Học sinh'}
        </span>
        <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
          {responses.length}/{students.length}
        </span>
      </button>

      {mode === 'graph' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {availableAnswers.map(answer => {
            const count = distribution[answer] || 0;
            const percentage = calculatePlickerMobilePercentage(count, responses.length);

            return (
              <div key={answer} className="py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <AnswerBadge answer={answer} correct={question.correctAnswer === answer} compact />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#242229]">
                    <PlickerRichContent text={question.options[answer] || `Phương án ${answer}`} html={question.optionRichText?.[answer]}>
                      <PlickerDisplayMath text={question.options[answer] || `Phương án ${answer}`} />
                    </PlickerRichContent>
                  </span>
                  <span className="min-w-6 text-right text-lg font-semibold text-[#242229]">{count}</span>
                </div>
                <div className="mt-1.5 h-[5px] overflow-hidden bg-[#ededee]">
                  <div
                    className={`h-full transition-[width] duration-300 ${
                      question.correctAnswer === answer ? 'bg-[#62ba92]' : 'bg-[#797690]'
                    }`}
                    style={{ width: `${percentage}%` }}
                    aria-label={`${count} học sinh, ${percentage}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-5">
            <div className="grid grid-cols-3 gap-x-2 gap-y-3">
              {students.map(student => {
                const answer = answerByStudent.get(student.id);
                const correct = Boolean(answer && question.correctAnswer && answer === question.correctAnswer);

                return (
                  <div
                    key={student.id}
                    title={`${student.name}${answer ? ` · ${answer}` : ' · Chưa trả lời'}`}
                    className={`flex min-w-0 items-center gap-1.5 text-[12px] font-semibold sm:text-sm ${
                      answer ? 'text-[#34323a]' : 'text-[#a9a7b1]'
                    }`}
                  >
                    <span
                      aria-label={answer ? `Đã chọn ${answer}` : 'Chưa trả lời'}
                      className={`h-[9px] w-[9px] shrink-0 rounded-full ${
                        !answer ? 'bg-[#c8c7cd]' : correct ? 'bg-[#62ba92]' : 'bg-[#4389e5]'
                      }`}
                    />
                    <span className="truncate">{formatPlickerMobileStudentName(student.name)}</span>
                  </div>
                );
              })}
            </div>
            {students.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-500">Lớp học chưa có học sinh.</p>
            )}
          </div>

          <div className="shrink-0 px-8 pb-2 pt-3">
            <button
              type="button"
              onClick={onClearResponses}
              disabled={responses.length === 0}
              className="h-11 w-full rounded-lg border border-[#dc7896] text-xs font-medium tracking-[0.08em] text-[#cf6586] disabled:opacity-45"
            >
              XÓA CÂU TRẢ LỜI
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function PlickerMobileScanner({
  className, question, questionIndex, questionCount, students, responses, distribution,
  scanning, scanError, connected, displayConnected, showCorrect, showGraph,
  videoRef, overlayRef, onStartScan, onStopScan, onPrevious, onNext, onClearResponses,
  onToggleCorrect, onToggleGraph, onExit,
}: PlickerMobileScannerProps) {
  const [sheet, setSheet] = useState<PlickerMobileSheetMode | null>(null);
  const availableAnswers = ANSWERS.filter(answer => question.options[answer] !== undefined);

  useEffect(() => {
    setSheet(null);
  }, [questionIndex, scanning]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = themeMeta?.content;
    if (themeMeta) themeMeta.content = scanning ? '#07070a' : '#31936f';
    return () => {
      if (themeMeta && previousTheme) themeMeta.content = previousTheme;
    };
  }, [scanning]);

  if (scanning) {
    return (
      <main
        aria-label="Camera quét thẻ học sinh toàn màn hình"
        className="fixed inset-0 z-40 h-[100dvh] overflow-hidden bg-black text-white"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />

        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-black/45 to-transparent"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-start justify-between gap-3 px-4 pt-3">
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-black/35 px-2.5 py-1.5">
              {connected ? <Wifi className="h-4 w-4 text-emerald-300" /> : <WifiOff className="h-4 w-4 text-amber-300" />}
              <span className="max-w-32 truncate text-xs font-semibold">{className}</span>
            </div>
            <div
              aria-label={`${responses.length} trên ${students.length} học sinh đã trả lời`}
              className="grid grid-cols-2 overflow-hidden rounded-md bg-black/60 text-center"
            >
              <span className="min-w-10 px-2 py-1 text-base font-semibold">{responses.length}</span>
              <span className="min-w-10 border-l border-white/15 px-2 py-1 text-base font-semibold">{students.length}</span>
            </div>
          </div>
        </div>

        {!sheet && (
          <div
            className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-7 pb-8 pt-16"
            style={{ paddingBottom: 'max(32px, calc(env(safe-area-inset-bottom) + 18px))' }}
          >
            <div className="mx-auto flex max-w-[340px] items-center justify-between">
              <button
                type="button"
                onClick={() => setSheet('graph')}
                aria-label="Mở biểu đồ câu trả lời"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#222028]/85 text-white"
              >
                <BarChart3 className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={onStopScan}
                aria-label="Dừng quét thẻ"
                className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#ed7293] text-white shadow-lg"
              >
                <Square className="h-7 w-7 fill-white" />
              </button>
              <button
                type="button"
                onClick={() => setSheet('students')}
                aria-label="Mở danh sách học sinh"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#222028]/85 text-white"
              >
                <LayoutGrid className="h-6 w-6" />
              </button>
            </div>
          </div>
        )}

        {sheet && (
          <PlickerMobileResultsSheet
            mode={sheet}
            question={question}
            students={students}
            responses={responses}
            distribution={distribution}
            onClose={() => setSheet(null)}
            onClearResponses={onClearResponses}
          />
        )}
      </main>
    );
  }

  return (
    <main
      aria-label="Câu hỏi buổi học và nút quét thẻ"
      className="fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-[#fcfcfc] text-[#302e36]"
    >
      <div className="shrink-0 bg-[#31936f]" style={{ height: 'max(10px, env(safe-area-inset-top))' }} />

      <header className="flex min-h-[60px] shrink-0 items-center gap-2 border-b border-[#eeeeef] px-3">
        <button
          type="button"
          onClick={onExit}
          aria-label="Thoát buổi học trên điện thoại"
          className="flex h-10 w-10 shrink-0 items-center justify-center text-[#777681]"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <span
            title={displayConnected ? 'Máy tính đang kết nối' : 'Chưa thấy màn hình máy tính'}
            className="inline-flex h-8 max-w-[140px] items-center gap-1 truncate rounded-sm bg-[#46b68b] px-2 text-xs font-semibold text-white"
          >
            {connected ? <Wifi className="h-3.5 w-3.5 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{className}</span>
          </span>
          <span className="px-1 text-base font-semibold text-[#2979dd]">
            {questionIndex + 1}<span className="ml-1 text-[#76a2df]">{questionCount}</span>
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-7">
        <h1 className="text-[clamp(1.65rem,7vw,2.35rem)] font-bold leading-[1.17] tracking-[-0.045em] text-[#302e36]">
          <PlickerRichContent text={question.text} html={question.richText}><PlickerDisplayMath text={question.text} /></PlickerRichContent>
        </h1>
        <PlickerQuestionMediaGallery media={question.media} compact />
        {scanError && (
          <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {scanError}
          </p>
        )}
        {!connected && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Chưa kết nối mạng; màn hình máy tính sẽ cập nhật khi có Internet.
          </p>
        )}
        {responses.length > 0 && (
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#edf8f3] px-3 py-1.5 text-xs font-semibold text-[#308363]">
            <ScanLine className="h-3.5 w-3.5" /> Đã quét {responses.length}/{students.length} học sinh
          </p>
        )}
      </div>

      <section aria-label="Các phương án trả lời" className="shrink-0 border-y border-[#e9e9ed] bg-[#f6f6f8] px-5 py-2">
        {availableAnswers.map(answer => (
          <div key={answer} className="flex min-h-[49px] min-w-0 items-center gap-3 py-1">
            <AnswerBadge answer={answer} correct={question.correctAnswer === answer} />
            <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-[#393740]">
              <PlickerRichContent text={question.options[answer] || `Phương án ${answer}`} html={question.optionRichText?.[answer]}>
                <PlickerDisplayMath text={question.options[answer] || `Phương án ${answer}`} />
              </PlickerRichContent>
            </span>
          </div>
        ))}
      </section>

      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-[#ededee] bg-white px-3 py-1.5">
        <button
          type="button"
          onClick={onToggleCorrect}
          aria-label={showCorrect ? 'Ẩn đáp án trên màn hình máy tính' : 'Hiện đáp án trên màn hình máy tính'}
          className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ${
            showCorrect ? 'bg-emerald-50 text-emerald-700' : 'text-[#777681]'
          }`}
        >
          {showCorrect ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Đáp án máy chiếu
        </button>
        <button
          type="button"
          onClick={onToggleGraph}
          aria-label={showGraph ? 'Ẩn biểu đồ trên màn hình máy tính' : 'Hiện biểu đồ trên màn hình máy tính'}
          className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ${
            showGraph ? 'bg-blue-50 text-blue-700' : 'text-[#777681]'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" /> Biểu đồ máy chiếu
        </button>
      </div>

      <footer
        className="flex min-h-[86px] shrink-0 items-center justify-center gap-12 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          type="button"
          onClick={onPrevious}
          disabled={questionIndex === 0}
          aria-label="Câu hỏi trước"
          className="flex h-11 w-11 items-center justify-center text-[#797688] disabled:text-[#dcdce0]"
        >
          <ChevronLeft className="h-9 w-9" strokeWidth={3} />
        </button>

        <button
          type="button"
          onClick={onStartScan}
          disabled={students.length === 0}
          aria-label="Bắt đầu quét thẻ học sinh"
          className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-[7px] border-[#287be5] text-[#287be5] disabled:border-slate-300 disabled:text-slate-300"
        >
          <span className="sr-only">Quét thẻ</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={questionIndex >= questionCount - 1}
          aria-label="Câu hỏi tiếp theo"
          className="flex h-11 w-11 items-center justify-center text-[#797688] disabled:text-[#dcdce0]"
        >
          <ChevronRight className="h-9 w-9" strokeWidth={3} />
        </button>
      </footer>
    </main>
  );
}
