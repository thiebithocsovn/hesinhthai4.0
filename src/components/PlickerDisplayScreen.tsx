import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3, Check, Eye, EyeOff, Maximize2, Minimize2, MonitorPlay,
  Smartphone, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import type { PlickerAnswer } from '../lib/plickerVision';
import type { PlickerLivePhase } from '../lib/plickerLive';
import type { PlickerQuestionMedia } from '../lib/plickerQuestionMedia';
import PlickerQuestionMediaGallery, { PlickerRichContent } from './PlickerQuestionContent';

const ANSWERS: PlickerAnswer[] = ['A', 'B', 'C', 'D'];
const ANSWER_GRAPH_COLORS: Record<PlickerAnswer, string> = {
  A: 'bg-[#75a8f5]',
  B: 'bg-[#f0bd67]',
  C: 'bg-[#6dc499]',
  D: 'bg-[#bb85e8]',
};

export interface PlickerDisplayStudent {
  id: string;
  name: string;
  cardId?: number;
}

export interface PlickerDisplayResponse {
  studentId: string;
  answer: PlickerAnswer;
}

export interface PlickerDisplayQuestion {
  text: string;
  richText?: string;
  optionRichText?: Partial<Record<PlickerAnswer, string>>;
  media?: PlickerQuestionMedia[];
  options: Partial<Record<PlickerAnswer, string>>;
  correctAnswer: PlickerAnswer | null;
}

interface PlickerDisplayScreenProps {
  className: string;
  setTitle: string;
  question: PlickerDisplayQuestion | null;
  questionIndex: number;
  questionCount: number;
  students: PlickerDisplayStudent[];
  responses: PlickerDisplayResponse[];
  distribution: Record<PlickerAnswer, number>;
  phase: PlickerLivePhase | null;
  showCorrect: boolean;
  showGraph: boolean;
  scannerConnected: boolean;
  connected: boolean;
  scannerUrl: string;
  onToggleCorrect: () => void;
  onToggleGraph: () => void;
  onClose: () => void;
}

export function formatPlickerDisplayQuestion(text: string, questionIndex: number): string {
  const normalized = text.trim();
  if (!normalized || /^(?:câu|question)\s*\d+/iu.test(normalized)) return normalized;
  return `Câu ${questionIndex + 1}. ${normalized}`;
}

export function calculatePlickerDisplayProgress(answered: number, total: number): number {
  if (!Number.isFinite(answered) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(answered * 100 / total)));
}

export function mapPlickerDisplayStudentAnswers(
  students: PlickerDisplayStudent[],
  responses: PlickerDisplayResponse[],
): Map<string, PlickerAnswer> {
  const validStudentIds = new Set(students.map(student => student.id));
  const answers = new Map<string, PlickerAnswer>();
  for (const response of responses) {
    if (validStudentIds.has(response.studentId) && ANSWERS.includes(response.answer)) {
      answers.set(response.studentId, response.answer);
    }
  }
  return answers;
}

export function PlickerDisplayMath({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  const tokens = /\\frac\{([^{}]+)\}\{([^{}]+)\}|(?<![\p{L}\p{N}])(-?\d+)\/([\p{L}]+|\d+)|\^\{([^{}]+)\}|\^(-?\d+)|_\{([^{}]+)\}|_(\d+)/gu;
  let previous = 0;

  for (const match of text.matchAll(tokens)) {
    const position = match.index ?? 0;
    if (position > previous) nodes.push(text.slice(previous, position));

    if (match[1] !== undefined || match[3] !== undefined) {
      const numerator = match[1] ?? match[3];
      const denominator = match[2] ?? match[4];
      nodes.push(
        <span
          key={`${position}-fraction`}
          aria-label={`${numerator} phần ${denominator}`}
          className="mx-[0.08em] inline-flex -translate-y-[0.04em] flex-col items-center align-middle text-[0.74em] leading-[1.05]"
        >
          <span className="w-full border-b-[0.07em] border-current px-[0.15em] text-center">{numerator}</span>
          <span className="px-[0.15em] text-center">{denominator}</span>
        </span>,
      );
    } else if (match[7] !== undefined || match[8] !== undefined) {
      nodes.push(<sub key={`${position}-subscript`} className="relative top-[0.04em] text-[0.62em]">{match[7] ?? match[8]}</sub>);
    } else {
      nodes.push(<sup key={`${position}-exponent`} className="relative -top-[0.05em] text-[0.62em]">{match[5] ?? match[6]}</sup>);
    }
    previous = position + match[0].length;
  }

  if (previous < text.length) nodes.push(text.slice(previous));
  return <>{nodes.length > 0 ? nodes : text}</>;
}

export default function PlickerDisplayScreen({
  className, setTitle, question, questionIndex, questionCount, students, responses,
  distribution, phase, showCorrect, showGraph, scannerConnected, connected, scannerUrl,
  onToggleCorrect, onToggleGraph, onClose,
}: PlickerDisplayScreenProps) {
  const [showStudents, setShowStudents] = useState(() =>
    Boolean(question && phase && phase !== 'finished' && students.length));
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const openedRosterKeysRef = useRef(new Set<string>());
  const answerByStudent = mapPlickerDisplayStudentAnswers(students, responses);
  const answeredCount = answerByStudent.size;
  const progress = calculatePlickerDisplayProgress(answeredCount, students.length);
  const availableAnswers = question
    ? ANSWERS.filter(answer => question.options[answer] !== undefined)
    : [];

  useEffect(() => {
    if (!question || !phase || phase === 'finished' || students.length === 0) return;
    const action = phase === 'scanning' ? 'scan' : 'play';
    const key = `${className}:${setTitle}:${questionIndex}:${action}`;
    if (openedRosterKeysRef.current.has(key)) return;
    openedRosterKeysRef.current.add(key);
    setShowStudents(true);
  }, [className, phase, question, questionIndex, setTitle, students.length]);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (containerRef.current?.requestFullscreen) await containerRef.current.requestFullscreen();
    } catch (error) {
      console.error('Không thể mở chế độ toàn màn hình:', error);
    }
  };

  return (
    <div
      ref={containerRef}
      role="presentation"
      aria-label="MÀN HÌNH LỚP HỌC đang trình chiếu câu hỏi"
      className="fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-[#f5f5f9] text-[#262432]"
    >
      <header className="flex min-h-[54px] shrink-0 items-center justify-between gap-3 border-b border-[#e6e6eb] bg-[#f6f6f9] px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`rounded-sm px-2 py-1 text-[11px] font-bold tracking-[0.08em] text-white ${
            connected && phase && phase !== 'finished' ? 'bg-[#31b887]' : 'bg-[#a4a3ab]'
          }`}>
            {connected && phase && phase !== 'finished' ? 'LIVE' : 'CHỜ'}
          </span>
          <span className="truncate text-base font-bold text-[#252333] md:text-xl">
            {className || 'Màn hình lớp học'}
          </span>
          {phase === 'scanning' && (
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Đang quét
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <span
            title={scannerConnected ? 'Điện thoại đã kết nối' : 'Đang chờ điện thoại'}
            className={`hidden items-center gap-1.5 px-2 text-xs font-medium md:inline-flex ${
              scannerConnected ? 'text-[#39966f]' : 'text-[#9a98a2]'
            }`}
          >
            {scannerConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {scannerConnected ? 'Điện thoại' : 'Chờ điện thoại'}
          </span>
          <button
            type="button"
            onClick={() => setShowStudents(previous => !previous)}
            aria-label={showStudents ? 'Ẩn danh sách học sinh' : 'Hiện danh sách học sinh'}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold md:px-3 ${
              showStudents ? 'bg-[#e9e9ef] text-[#34323d]' : 'text-[#72717d] hover:bg-[#ececf1]'
            }`}
          >
            <Users className="h-4 w-4" /><span className="hidden lg:inline">Danh sách học sinh</span>
          </button>
          <button
            type="button"
            onClick={onToggleGraph}
            aria-label={showGraph ? 'Ẩn biểu đồ' : 'Hiện biểu đồ'}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold md:px-3 ${
              showGraph ? 'bg-blue-50 text-blue-700' : 'text-[#72717d] hover:bg-[#ececf1]'
            }`}
          >
            <BarChart3 className="h-4 w-4" /><span className="hidden xl:inline">{showGraph ? 'Ẩn biểu đồ' : 'Hiện biểu đồ'}</span>
          </button>
          <button
            type="button"
            onClick={onToggleCorrect}
            aria-label={showCorrect ? 'Ẩn câu trả lời đúng' : 'Tiết lộ câu trả lời'}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold md:px-3 ${
              showCorrect ? 'bg-emerald-50 text-emerald-700' : 'text-[#72717d] hover:bg-[#ececf1]'
            }`}
          >
            {showCorrect ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="hidden xl:inline">{showCorrect ? 'Ẩn câu trả lời' : 'Tiết lộ câu trả lời'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng màn hình trình chiếu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[#81808a] hover:bg-[#ececf1]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {!question || !phase || phase === 'finished' ? (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 text-center">
          <div className="rounded-[28px] bg-[#edf7f2] p-7 text-[#42a87f]"><Smartphone className="h-14 w-14" /></div>
          <h1 className="mt-7 text-3xl font-bold tracking-tight text-[#292733] md:text-5xl">Sẵn sàng nhận bài từ điện thoại</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#72717d]">
            Đăng nhập cùng tài khoản trên điện thoại. Khi thầy bấm bắt đầu bài hoặc quét thẻ,
            câu hỏi sẽ tự động xuất hiện toàn màn hình tại đây.
          </p>
          <p className="mt-6 rounded-lg border border-[#e6e6eb] bg-white px-4 py-3 text-sm text-[#595766]">{scannerUrl}</p>
        </div>
      ) : (
        <div className={`relative flex min-h-0 flex-1 overflow-hidden ${showStudents ? 'justify-start' : 'justify-center'}`}>
          <article
            aria-label="Bài đang chơi trên màn hình lớp học"
            className={`relative flex min-h-0 w-full flex-col overflow-hidden border-x border-[#ececf0] bg-[#fdfdfd] ${
              showStudents ? 'xl:w-[58%] xl:max-w-[1120px] xl:shrink-0' : 'max-w-[1480px]'
            }`}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-9 md:px-12 md:pt-12 xl:px-[72px] xl:pt-16">
              <div className="flex min-h-full flex-col">
                <h1 className="max-w-[1250px] text-[clamp(2.1rem,5.1vw,5rem)] font-bold leading-[1.1] tracking-[-0.065em] text-[#262432]">
                  {question.richText ? (
                    <>
                      {!/^(?:câu|question)\s*\d+/iu.test(question.text.trim()) && `Câu ${questionIndex + 1}. `}
                      <PlickerRichContent text={question.text} html={question.richText} />
                    </>
                  ) : <PlickerDisplayMath text={formatPlickerDisplayQuestion(question.text, questionIndex)} />}
                </h1>
                <PlickerQuestionMediaGallery media={question.media} />

                <section aria-label="Bốn đáp án của câu hỏi" className="mt-auto space-y-1.5 pt-10 md:space-y-2 xl:pt-14">
                  {availableAnswers.map(answer => {
                    const count = distribution[answer] || 0;
                    const percentage = calculatePlickerDisplayProgress(count, answeredCount);
                    const correct = showCorrect && question.correctAnswer === answer;

                    return (
                      <div key={answer} className="py-1">
                        <div className={`flex min-h-[54px] min-w-0 items-center gap-3 rounded-md md:min-h-[64px] md:gap-4 ${
                          correct ? 'bg-[#e9f7ef]' : ''
                        }`}>
                          <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border text-2xl font-bold md:h-13 md:w-13 md:text-3xl ${
                            correct ? 'border-[#61b990] bg-[#61b990] text-white' : 'border-[#d9d9df] bg-[#fafafd] text-[#727080]'
                          }`}>
                            {answer}
                          </span>
                          <span className="min-w-0 flex-1 text-[clamp(1.35rem,3vw,2.8rem)] font-semibold leading-[1.18] tracking-[-0.04em] text-[#18171c]">
                            <PlickerRichContent text={question.options[answer] || `Phương án ${answer}`} html={question.optionRichText?.[answer]}>
                              <PlickerDisplayMath text={question.options[answer] || `Phương án ${answer}`} />
                            </PlickerRichContent>
                          </span>
                          {showGraph && (
                            <span className="shrink-0 pr-2 text-lg font-semibold text-[#666574] md:pr-4 md:text-2xl">
                              {count}<span className="ml-2 text-sm text-[#96959e]">{percentage}%</span>
                            </span>
                          )}
                        </div>
                        {showGraph && (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#efeff2]">
                            <div
                              className={`h-full rounded-full transition-[width] duration-300 ${ANSWER_GRAPH_COLORS[answer]}`}
                              style={{ width: `${percentage}%` }}
                              aria-label={`${answer}: ${count} học sinh, ${percentage}%`}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              </div>
            </div>

            <div className="shrink-0 px-6 pb-5 pt-1 md:px-12 xl:px-[88px] xl:pb-7">
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[#efeff1]">
                <div
                  aria-label={`${answeredCount} trên ${students.length} học sinh đã trả lời`}
                  className="h-full rounded-full bg-[#92bafa] transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex h-12 items-center justify-between gap-3 rounded-sm bg-[#aaa9a8] px-4 text-white md:h-14">
                <div className="flex min-w-0 items-center gap-3">
                  <MonitorPlay className="hidden h-5 w-5 shrink-0 md:block" />
                  <span className="truncate text-sm font-semibold md:text-base">{setTitle || 'Bộ câu hỏi'}</span>
                  <span className="hidden text-xs text-white/80 sm:inline">Câu {questionIndex + 1}/{questionCount}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 md:gap-4">
                  <span className="inline-flex items-center gap-1 rounded-sm bg-white/20 px-2 py-1 text-xs font-semibold">
                    <Users className="h-3.5 w-3.5" />{answeredCount}/{students.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowStudents(previous => !previous)}
                    aria-label="Mở danh sách học sinh đã trả lời"
                    className="rounded-sm p-1.5 hover:bg-white/20"
                  >
                    <MonitorPlay className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleFullscreen()}
                    aria-label={fullscreen ? 'Thu nhỏ màn hình trình chiếu' : 'Mở toàn màn hình trình chiếu'}
                    className="rounded-sm p-1.5 hover:bg-white/20"
                  >
                    {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

          </article>

          {showStudents && (
            <aside
              aria-label="Danh sách học sinh theo dõi quét thẻ trực tiếp"
              className="absolute inset-y-0 right-0 z-10 flex w-[min(480px,94vw)] flex-col border-l border-[#e8e8ec] bg-white shadow-[-12px_0_35px_rgba(0,0,0,0.08)] xl:static xl:z-auto xl:min-w-[430px] xl:flex-1 xl:border-l-0 xl:bg-[#f5f5f9] xl:shadow-none"
            >
              <div className="flex items-center justify-between border-b border-[#ececf0] px-5 py-4 xl:px-4 xl:py-3">
                <div>
                  <h2 className="font-semibold text-[#302e3b]">Học sinh đã trả lời</h2>
                  <p aria-live="polite" className="mt-1 text-sm text-[#777580]">
                    {answeredCount}/{students.length} học sinh đã quét
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStudents(false)}
                  aria-label="Đóng danh sách học sinh"
                  className="rounded-md p-2 text-[#777580] hover:bg-[#e9e9ef]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 xl:p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 min-[1800px]:grid-cols-4">
                  {students.map((student, index) => {
                    const answer = answerByStudent.get(student.id);
                    return (
                      <div
                        key={student.id}
                        aria-label={`${student.name}: ${answer ? 'đã quét thẻ' : 'chưa quét thẻ'}`}
                        data-card-id={student.cardId || index + 1}
                        data-scan-status={answer ? 'scanned' : 'waiting'}
                        title={`#${student.cardId || index + 1} · ${student.name}${answer ? ' · Đã quét' : ' · Chưa quét'}`}
                        className={`flex min-h-[48px] min-w-0 items-center gap-1.5 rounded-sm border px-3 py-2 transition-colors duration-200 ${
                          answer
                            ? 'border-[#31a875] bg-[#39b981] text-white shadow-sm'
                            : 'border-[#dcdce2] bg-white text-[#252432]'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-[clamp(0.88rem,1.05vw,1.4rem)] font-semibold tracking-[-0.03em]">
                          {student.name}
                        </span>
                        {answer && (showCorrect || showGraph)
                          ? <span className="shrink-0 rounded-sm bg-white/20 px-1.5 py-0.5 text-sm font-bold">{answer}</span>
                          : answer ? <Check className="h-4 w-4 shrink-0" /> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
