import * as XLSX from 'xlsx';
import { auth } from '../firebase';
import { createTeacherStorageKey } from './teacherIsolation';

export interface HeadShakeQuestionResult {
  questionNumber: number;
  question: string;
  selectedDirection: 'Trái' | 'Phải' | 'Hết giờ';
  selectedAnswer: string;
  correctDirection: 'Trái' | 'Phải' | '—';
  correctAnswer: string;
  result: 'Đúng' | 'Sai' | 'Hết giờ';
  pointsAwarded: number;
  pointsAvailable: number;
}

export interface HeadShakeGameReport {
  id: string;
  playerName: string;
  questionSet: string;
  startedAt: string;
  completedAt: string;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  timeoutCount: number;
  score: number;
  maxScore: number;
  percentage: number;
  details: HeadShakeQuestionResult[];
}

interface ActiveHeadShakeSession {
  id: string;
  playerName: string;
  questionSet: string;
  startedAt: string;
  totalQuestions: number;
  details: Map<number, HeadShakeQuestionResult>;
  saved: boolean;
}

const REPORT_STORAGE_NAMESPACE = 'headshake_game_reports_v1';
const REPORT_MODAL_ID = 'smartclass-headshake-report-modal';
const REPORT_BUTTON_ATTR = 'data-headshake-report-button';
const MAX_SAVED_REPORTS = 500;

let initialized = false;
let observer: MutationObserver | null = null;
let scanScheduled = false;
let playerNameDraft = '';
let questionSetDraft = '';
let activeSession: ActiveHeadShakeSession | null = null;

function reportStorageKey(): string {
  return createTeacherStorageKey(REPORT_STORAGE_NAMESPACE, auth.currentUser?.uid);
}

function readReports(): HeadShakeGameReport[] {
  try {
    const stored = localStorage.getItem(reportStorageKey());
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HeadShakeGameReport => Boolean(
      item && typeof item === 'object' && 'id' in item && 'playerName' in item && 'details' in item,
    ));
  } catch {
    return [];
  }
}

function writeReports(reports: HeadShakeGameReport[]): void {
  try {
    localStorage.setItem(reportStorageKey(), JSON.stringify(reports.slice(0, MAX_SAVED_REPORTS)));
  } catch (error) {
    console.info('Không thể lưu lịch sử trò chơi lắc đầu trên trình duyệt.', error);
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function safeFileDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function performanceLabel(percentage: number): string {
  if (percentage >= 80) return 'Tốt';
  if (percentage >= 50) return 'Đạt';
  return 'Cần cố gắng';
}

function isHeadShakeGameVisible(): boolean {
  return Array.from(document.querySelectorAll('h1')).some(element =>
    normalizeText(element.textContent).includes('Nghiêng Đầu Chọn Đáp Án'),
  );
}

function findElementByExactText(selector: string, text: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(element =>
    normalizeText(element.textContent) === text,
  ) || null;
}

function findElementByPattern(selector: string, pattern: RegExp): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(element =>
    pattern.test(normalizeText(element.textContent)),
  ) || null;
}

function captureSetupValues(): void {
  const playerInput = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(input =>
    (input.placeholder || '').includes('Nhập tên của em'),
  );
  if (playerInput?.value.trim()) playerNameDraft = playerInput.value.trim();

  const setSelect = Array.from(document.querySelectorAll<HTMLSelectElement>('select')).find(select =>
    normalizeText(select.parentElement?.textContent).includes('Bộ câu hỏi'),
  );
  if (setSelect) {
    const selectedOption = setSelect.options[setSelect.selectedIndex];
    if (selectedOption) questionSetDraft = normalizeText(selectedOption.textContent);
  }
}

function resetActiveSession(): void {
  captureSetupValues();
  activeSession = {
    id: `headshake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerName: playerNameDraft || 'Học sinh',
    questionSet: questionSetDraft || 'Bộ câu hỏi',
    startedAt: new Date().toISOString(),
    totalQuestions: 0,
    details: new Map(),
    saved: false,
  };
}

function parseCurrentQuestionPosition(): { current: number; total: number } | null {
  const element = findElementByPattern('div,span,p', /^Câu:\s*(\d+)\s*\/\s*(\d+)$/i);
  const match = normalizeText(element?.textContent).match(/^Câu:\s*(\d+)\s*\/\s*(\d+)$/i);
  if (!match) return null;
  return { current: Number(match[1]), total: Number(match[2]) };
}

function findPointsBadge(): HTMLElement | null {
  return findElementByPattern('div,span', /^\d+(?:[.,]\d+)?\s*điểm$/i);
}

function findQuestionText(pointsBadge: HTMLElement | null): string {
  let parent: HTMLElement | null = pointsBadge?.parentElement || null;
  while (parent) {
    const heading = parent.querySelector<HTMLElement>('h2');
    if (heading) return normalizeText(heading.textContent);
    parent = parent.parentElement;
  }
  return '';
}

function readAnswerCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('div')).filter(element =>
    element.classList.contains('w-1/3') &&
    element.classList.contains('h-full') &&
    element.classList.contains('rounded-3xl'),
  ).slice(0, 2);
}

function detectSelectedDirection(answerCards: HTMLElement[]): 'left' | 'right' | null {
  const [leftCard, rightCard] = answerCards;
  const isSelected = (element?: HTMLElement) => Boolean(element && (
    element.className.includes('bg-red-500') || element.className.includes('bg-emerald-500')
  ));
  if (isSelected(leftCard)) return 'left';
  if (isSelected(rightCard)) return 'right';
  return null;
}

function recordVisibleFeedback(): void {
  const correctFeedback = findElementByExactText('span', 'Giỏi lắm!');
  const incorrectFeedback = findElementByExactText('span', 'Sai rồi!');
  if (!correctFeedback && !incorrectFeedback) return;

  const position = parseCurrentQuestionPosition();
  if (!position) return;
  if (!activeSession) resetActiveSession();
  if (!activeSession || activeSession.details.has(position.current)) return;

  activeSession.totalQuestions = position.total;
  const pointsBadge = findPointsBadge();
  const pointsAvailable = Number(normalizeText(pointsBadge?.textContent).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
  const question = findQuestionText(pointsBadge) || `Câu ${position.current}`;
  const answerCards = readAnswerCards();
  const selected = detectSelectedDirection(answerCards);
  const isCorrect = Boolean(correctFeedback);
  const result: HeadShakeQuestionResult['result'] = selected ? (isCorrect ? 'Đúng' : 'Sai') : 'Hết giờ';
  const selectedDirection: HeadShakeQuestionResult['selectedDirection'] = selected === 'left'
    ? 'Trái'
    : selected === 'right'
      ? 'Phải'
      : 'Hết giờ';
  const correctSide = selected
    ? (isCorrect ? selected : selected === 'left' ? 'right' : 'left')
    : null;
  const correctDirection: HeadShakeQuestionResult['correctDirection'] = correctSide === 'left'
    ? 'Trái'
    : correctSide === 'right'
      ? 'Phải'
      : '—';
  const selectedAnswer = selected === 'left'
    ? normalizeText(answerCards[0]?.textContent)
    : selected === 'right'
      ? normalizeText(answerCards[1]?.textContent)
      : 'Không trả lời';
  const correctAnswer = correctSide === 'left'
    ? normalizeText(answerCards[0]?.textContent)
    : correctSide === 'right'
      ? normalizeText(answerCards[1]?.textContent)
      : '—';

  activeSession.details.set(position.current, {
    questionNumber: position.current,
    question,
    selectedDirection,
    selectedAnswer,
    correctDirection,
    correctAnswer,
    result,
    pointsAwarded: isCorrect ? pointsAvailable : 0,
    pointsAvailable,
  });
}

function parseVisibleResultScore(): number | null {
  const resultHeading = Array.from(document.querySelectorAll<HTMLElement>('h2')).find(element => {
    const text = normalizeText(element.textContent);
    return text.startsWith('Chúc mừng ') || text === 'Hoàn thành!';
  });
  if (!resultHeading) return null;
  const card = resultHeading.closest<HTMLElement>('div.max-w-md');
  const numeric = Array.from(card?.querySelectorAll<HTMLElement>('span') || []).find(element => /^\d+(?:[.,]\d+)?$/.test(normalizeText(element.textContent)));
  if (!numeric) return null;
  return Number(normalizeText(numeric.textContent).replace(',', '.'));
}

function saveCompletedSession(): HeadShakeGameReport | null {
  if (!activeSession || activeSession.saved) return null;

  const details = [...activeSession.details.values()].sort((a, b) => a.questionNumber - b.questionNumber);
  const visibleScore = parseVisibleResultScore();
  const calculatedScore = details.reduce((sum, item) => sum + item.pointsAwarded, 0);
  const score = visibleScore ?? calculatedScore;
  const maxScore = details.reduce((sum, item) => sum + item.pointsAvailable, 0);
  const totalQuestions = activeSession.totalQuestions || details.length;
  const correctCount = details.filter(item => item.result === 'Đúng').length;
  const timeoutCount = details.filter(item => item.result === 'Hết giờ').length;
  const incorrectCount = Math.max(0, totalQuestions - correctCount - timeoutCount);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;

  const report: HeadShakeGameReport = {
    id: activeSession.id,
    playerName: activeSession.playerName,
    questionSet: activeSession.questionSet,
    startedAt: activeSession.startedAt,
    completedAt: new Date().toISOString(),
    totalQuestions,
    correctCount,
    incorrectCount,
    timeoutCount,
    score,
    maxScore,
    percentage,
    details,
  };

  const reports = readReports();
  writeReports([report, ...reports.filter(item => item.id !== report.id)]);
  activeSession.saved = true;
  updateReportButtonLabels();
  correctResultSummary(report);
  return report;
}

function correctResultSummary(report: HeadShakeGameReport): void {
  const paragraph = Array.from(document.querySelectorAll<HTMLParagraphElement>('p')).find(element =>
    normalizeText(element.textContent).startsWith('Bạn đã trả lời đúng'),
  );
  if (!paragraph) return;
  paragraph.textContent = `Em trả lời đúng ${report.correctCount}/${report.totalQuestions} câu và đạt ${report.score}/${report.maxScore || report.score} điểm.`;
}

function autoSizeWorksheet(worksheet: XLSX.WorkSheet, widths: number[]): void {
  worksheet['!cols'] = widths.map(width => ({ wch: width }));
  if (worksheet['!ref']) worksheet['!autofilter'] = { ref: worksheet['!ref'] };
}

export function exportHeadShakeReportsToExcel(reports = readReports()): void {
  if (reports.length === 0) {
    window.alert('Chưa có kết quả học sinh để xuất Excel.');
    return;
  }

  const summaryRows = reports.map((report, index) => ({
    'STT': index + 1,
    'Họ và tên học sinh': report.playerName,
    'Bộ câu hỏi': report.questionSet,
    'Thời gian hoàn thành': formatDateTime(report.completedAt),
    'Tổng số câu': report.totalQuestions,
    'Số câu đúng': report.correctCount,
    'Số câu sai': report.incorrectCount,
    'Hết giờ/Không trả lời': report.timeoutCount,
    'Điểm đạt': report.score,
    'Điểm tối đa': report.maxScore,
    'Tỷ lệ (%)': report.percentage,
    'Mức độ': performanceLabel(report.percentage),
  }));

  const detailRows = reports.flatMap(report => report.details.map(detail => ({
    'Họ và tên học sinh': report.playerName,
    'Bộ câu hỏi': report.questionSet,
    'Thời gian hoàn thành': formatDateTime(report.completedAt),
    'Câu số': detail.questionNumber,
    'Câu hỏi': detail.question,
    'Lựa chọn': detail.selectedDirection,
    'Nội dung đã chọn': detail.selectedAnswer,
    'Đáp án đúng': detail.correctDirection,
    'Nội dung đáp án đúng': detail.correctAnswer,
    'Kết quả': detail.result,
    'Điểm đạt': detail.pointsAwarded,
    'Điểm tối đa': detail.pointsAvailable,
  })));

  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  const detailSheet = XLSX.utils.json_to_sheet(detailRows.length ? detailRows : [{
    'Thông báo': 'Chưa có dữ liệu chi tiết từng câu.'
  }]);
  autoSizeWorksheet(summarySheet, [6, 24, 28, 22, 12, 12, 12, 20, 12, 14, 12, 18]);
  autoSizeWorksheet(detailSheet, [24, 28, 22, 8, 45, 12, 32, 14, 32, 12, 12, 14]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Tong hop');
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Chi tiet');
  XLSX.writeFile(workbook, `Bao_cao_Lac_dau_chon_dap_an_${safeFileDate()}.xlsx`);
}

function buildReportRows(reports: HeadShakeGameReport[]): string {
  if (reports.length === 0) {
    return '<tr><td colspan="7" class="px-4 py-10 text-center text-slate-500">Chưa có học sinh nào hoàn thành lượt chơi.</td></tr>';
  }

  return reports.slice(0, 100).map((report, index) => `
    <tr class="border-b border-slate-100 last:border-0">
      <td class="px-4 py-3 text-slate-500">${index + 1}</td>
      <td class="px-4 py-3 font-semibold text-slate-800">${escapeHtml(report.playerName)}</td>
      <td class="px-4 py-3 text-slate-600">${escapeHtml(report.questionSet)}</td>
      <td class="px-4 py-3 text-slate-600">${report.correctCount}/${report.totalQuestions}</td>
      <td class="px-4 py-3 font-bold text-indigo-700">${report.score}/${report.maxScore || report.score}</td>
      <td class="px-4 py-3 text-slate-600">${report.percentage}%</td>
      <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${escapeHtml(formatDateTime(report.completedAt))}</td>
    </tr>
  `).join('');
}

export function showHeadShakeReportModal(): void {
  document.getElementById(REPORT_MODAL_ID)?.remove();
  const reports = readReports();
  const modal = document.createElement('div');
  modal.id = REPORT_MODAL_ID;
  modal.className = 'fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div class="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
        <div>
          <h2 class="text-xl font-bold text-slate-900 md:text-2xl">Báo cáo kết quả — Lắc đầu chọn đáp án</h2>
          <p class="mt-1 text-sm text-slate-500">Đã lưu ${reports.length} lượt chơi trên tài khoản/trình duyệt hiện tại.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-headshake-export class="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Xuất Excel</button>
          <button type="button" data-headshake-clear class="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100">Xóa báo cáo</button>
          <button type="button" data-headshake-close class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Đóng</button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 md:grid-cols-4 md:px-7">
        <div class="rounded-xl bg-white p-3 border border-slate-200"><div class="text-xs text-slate-500">Lượt chơi</div><div class="mt-1 text-2xl font-black text-slate-900">${reports.length}</div></div>
        <div class="rounded-xl bg-white p-3 border border-slate-200"><div class="text-xs text-slate-500">Học sinh</div><div class="mt-1 text-2xl font-black text-slate-900">${new Set(reports.map(item => item.playerName.trim().toLocaleLowerCase('vi-VN'))).size}</div></div>
        <div class="rounded-xl bg-white p-3 border border-slate-200"><div class="text-xs text-slate-500">Điểm TB</div><div class="mt-1 text-2xl font-black text-indigo-700">${reports.length ? Math.round(reports.reduce((sum, item) => sum + item.percentage, 0) / reports.length * 10) / 10 : 0}%</div></div>
        <div class="rounded-xl bg-white p-3 border border-slate-200"><div class="text-xs text-slate-500">Đạt ≥ 50%</div><div class="mt-1 text-2xl font-black text-emerald-700">${reports.filter(item => item.percentage >= 50).length}</div></div>
      </div>
      <div class="flex-1 overflow-auto">
        <table class="w-full min-w-[900px] text-left text-sm">
          <thead class="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr><th class="px-4 py-3">STT</th><th class="px-4 py-3">Học sinh</th><th class="px-4 py-3">Bộ câu hỏi</th><th class="px-4 py-3">Đúng/Tổng</th><th class="px-4 py-3">Điểm</th><th class="px-4 py-3">Tỷ lệ</th><th class="px-4 py-3">Thời gian</th></tr>
          </thead>
          <tbody>${buildReportRows(reports)}</tbody>
        </table>
      </div>
      <div class="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 md:px-7">Excel gồm 2 sheet: <strong>Tổng hợp</strong> và <strong>Chi tiết</strong> từng câu trả lời.</div>
    </div>
  `;

  modal.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target === modal || target.closest('[data-headshake-close]')) {
      modal.remove();
      return;
    }
    if (target.closest('[data-headshake-export]')) {
      exportHeadShakeReportsToExcel(readReports());
      return;
    }
    if (target.closest('[data-headshake-clear]')) {
      if (!window.confirm('Xóa toàn bộ lịch sử kết quả trò chơi lắc đầu trên tài khoản/trình duyệt này?')) return;
      writeReports([]);
      modal.remove();
      updateReportButtonLabels();
      showHeadShakeReportModal();
    }
  });

  document.body.appendChild(modal);
}

function reportButtonLabel(): string {
  return `Báo cáo kết quả (${readReports().length})`;
}

function updateReportButtonLabels(): void {
  document.querySelectorAll<HTMLElement>(`[${REPORT_BUTTON_ATTR}]`).forEach(button => {
    button.textContent = reportButtonLabel();
  });
}

function createReportButton(extraClasses: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute(REPORT_BUTTON_ATTR, '1');
  button.className = extraClasses;
  button.textContent = reportButtonLabel();
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    showHeadShakeReportModal();
  });
  return button;
}

function injectSetupReportButton(): void {
  const editorButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button =>
    normalizeText(button.textContent).startsWith('Biên soạn câu hỏi'),
  );
  const container = editorButton?.parentElement;
  if (!container || container.querySelector(`[${REPORT_BUTTON_ATTR}]`)) return;
  container.appendChild(createReportButton('w-full rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-bold text-indigo-700 transition-colors hover:bg-indigo-100'));
}

function injectResultReportButton(): void {
  const resultHeading = Array.from(document.querySelectorAll<HTMLElement>('h2')).find(element => {
    const text = normalizeText(element.textContent);
    return text.startsWith('Chúc mừng ') || text === 'Hoàn thành!';
  });
  const resultCard = resultHeading?.closest<HTMLElement>('div.max-w-md');
  if (!resultCard || resultCard.querySelector(`[${REPORT_BUTTON_ATTR}]`)) return;
  const navigation = Array.from(resultCard.children).find(element =>
    element instanceof HTMLElement && element.classList.contains('flex') && element.classList.contains('gap-4'),
  );
  const button = createReportButton('mb-4 w-full rounded-2xl bg-indigo-600 px-4 py-3 font-bold text-white transition-colors hover:bg-indigo-700');
  if (navigation) resultCard.insertBefore(button, navigation);
  else resultCard.appendChild(button);
}

function scanHeadShakeGame(): void {
  scanScheduled = false;
  if (!isHeadShakeGameVisible()) return;
  captureSetupValues();
  recordVisibleFeedback();

  const resultVisible = Array.from(document.querySelectorAll<HTMLElement>('h2')).some(element => {
    const text = normalizeText(element.textContent);
    return text.startsWith('Chúc mừng ') || text === 'Hoàn thành!';
  });
  if (resultVisible) saveCompletedSession();

  injectSetupReportButton();
  injectResultReportButton();
}

function scheduleScan(): void {
  if (scanScheduled) return;
  scanScheduled = true;
  window.requestAnimationFrame(scanHeadShakeGame);
}

function handleDocumentInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if ((target.placeholder || '').includes('Nhập tên của em')) playerNameDraft = target.value.trim();
}

function handleDocumentChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (!normalizeText(target.parentElement?.textContent).includes('Bộ câu hỏi')) return;
  const selectedOption = target.options[target.selectedIndex];
  if (selectedOption) questionSetDraft = normalizeText(selectedOption.textContent);
}

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('button');
  if (!button || !isHeadShakeGameVisible()) return;
  const label = normalizeText(button.textContent);
  if (label.includes('Bắt đầu chơi') || label.includes('Chơi lại')) {
    resetActiveSession();
  }
}

export function initializeHeadShakeReporting(): void {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;
  document.addEventListener('input', handleDocumentInput, true);
  document.addEventListener('change', handleDocumentChange, true);
  document.addEventListener('click', handleDocumentClick, true);
  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  scheduleScan();
}

export function disposeHeadShakeReporting(): void {
  if (!initialized) return;
  initialized = false;
  observer?.disconnect();
  observer = null;
  document.removeEventListener('input', handleDocumentInput, true);
  document.removeEventListener('change', handleDocumentChange, true);
  document.removeEventListener('click', handleDocumentClick, true);
}
