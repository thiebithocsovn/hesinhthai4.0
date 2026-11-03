/**
 * Same-browser recovery for an interrupted student exam.
 *
 * The original exam, student identity, answers and monitoring events remain
 * encrypted in localStorage. The exam code is not stored persistently and must
 * be entered again after the browser/tab has been closed.
 *
 * Browser storage is a convenience, not authorization. Rejoining the same
 * attempt must also be permitted by the existing Firestore session rules.
 */
export const EXAM_RESUME_SESSION_KEY = 'hesinhthai_student_exam_resume_v1';
export const EXAM_RESUME_CODE_SESSION_KEY = 'hesinhthai_student_exam_resume_code_v1';

export interface ExamResumeState<Exam = unknown, Student = unknown> {
  version: 1;
  teacherId: string;
  examId: string;
  studentId: string;
  startedAt: string;
  exam: Exam;
  student: Student;
  examVersion: string;
  answers: Record<string, unknown>;
  cheatEvents: { rightClicks: number; tabChanges: number; windowResizes: number };
}

interface EncryptedResume {
  version: 1;
  savedAt: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function decodeBase64(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export function resumeStorageKey(teacherId: string, examId: string, studentId: string): string {
  if (![teacherId, examId, studentId].every(validId)) throw new RangeError('Invalid exam recovery identity.');
  return `hesinhthai_student_exam_resume_v1:${teacherId}:${examId}:${studentId}`;
}

export function remainingExamSeconds(startedAt: string, durationMinutes: number, now = Date.now()): number {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  return Math.max(0, Math.ceil((start + durationMinutes * 60_000 - now) / 1000));
}

export function matchesExamResume(
  value: unknown, teacherId: string, examId: string, studentId: string,
): value is ExamResumeState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ExamResumeState>;
  const exam = state.exam as { id?: unknown; teacherId?: unknown; durationMinutes?: unknown } | undefined;
  const student = state.student as { id?: unknown; classId?: unknown } | undefined;
  const events = state.cheatEvents;
  return state.version === 1 &&
    validId(teacherId) && validId(examId) && validId(studentId) &&
    state.teacherId === teacherId && state.examId === examId && state.studentId === studentId &&
    exam?.id === examId && exam?.teacherId === teacherId &&
    typeof exam.durationMinutes === 'number' && exam.durationMinutes > 0 && exam.durationMinutes <= 1440 &&
    student?.id === studentId &&
    typeof state.startedAt === 'string' && Number.isFinite(Date.parse(state.startedAt)) &&
    typeof state.examVersion === 'string' &&
    Boolean(state.answers && typeof state.answers === 'object' && !Array.isArray(state.answers)) &&
    Boolean(events && [events.rightClicks, events.tabChanges, events.windowResizes]
      .every(value => Number.isSafeInteger(value) && value >= 0));
}

async function deriveKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 210_000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encryptExamResume(state: ExamResumeState, code: string, savedAt = Date.now()): Promise<string> {
  if (!code || !matchesExamResume(state, state.teacherId, state.examId, state.studentId)) {
    throw new RangeError('Invalid student exam recovery state.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(JSON.stringify(state)),
  );
  return JSON.stringify({ version: 1, savedAt, salt: encodeBase64(salt), iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(data)) } satisfies EncryptedResume);
}

export async function decryptExamResume(raw: string | null, code: string): Promise<ExamResumeState | null> {
  if (!raw || !code) return null;
  try {
    const envelope = JSON.parse(raw) as EncryptedResume;
    if (envelope.version !== 1 || typeof envelope.savedAt !== 'number') return null;
    const key = await deriveKey(code, decodeBase64(envelope.salt));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64(envelope.iv) as BufferSource },
      key, decodeBase64(envelope.ciphertext) as BufferSource,
    );
    const state: unknown = JSON.parse(new TextDecoder().decode(plain));
    if (!state || typeof state !== 'object') return null;
    const candidate = state as Partial<ExamResumeState>;
    return matchesExamResume(candidate, String(candidate.teacherId || ''),
      String(candidate.examId || ''), String(candidate.studentId || '')) ? candidate as ExamResumeState : null;
  } catch {
    // Wrong exam code or a corrupt/older cache cannot grant an extra attempt.
    return null;
  }
}
