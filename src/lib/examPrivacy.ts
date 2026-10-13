import { isValidTeacherUid } from './teacherIsolation';

export const PUBLIC_EXAM_SCHEDULES_COLLECTION = 'public_exam_schedules';
export const PUBLIC_EXAM_ACCESS_COLLECTION = 'public_exam_access';

const EXAM_ACCESS_CODE_PATTERN = /^[a-zA-Z0-9_-]{3,128}$/;
const EXAM_KEY_DERIVATION_ITERATIONS = 150_000;
const EXAM_ENCRYPTION_VERSION = 1;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface PrivateExamPayload {
  id: string;
  title: string;
  durationMinutes: number;
  questions: unknown[];
  status: 'draft' | 'published' | 'closed';
  createdAt: string;
  startTime?: string;
  teacherId?: string;
}

export interface PublicExamSchedule {
  id: string;
  teacherId: string;
  title: string;
  durationMinutes: number;
  questionCount: number;
  status: 'published';
  createdAt: string;
  startTime?: string;
}

export interface ProtectedExamAccess {
  teacherId: string;
  examId: string;
  status: 'published';
  version: number;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function normalizeAccessCode(value: string): string {
  const normalized = value.trim();
  if (!EXAM_ACCESS_CODE_PATTERN.test(normalized)) {
    throw new RangeError('Mã kỳ thi không hợp lệ.');
  }
  return normalized;
}

async function createDigest(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

async function deriveExamKey(
  accessCode: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = EXAM_KEY_DERIVATION_ITERATIONS,
): Promise<CryptoKey> {
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 500_000) {
    throw new RangeError('Cấu hình mã hóa kỳ thi không hợp lệ.');
  }
  const source = await globalThis.crypto.subtle.importKey(
    'raw', textEncoder.encode(normalizeAccessCode(accessCode)), 'PBKDF2', false, ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    source,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function createSecureExamAccessCode(length = 12): string {
  if (!Number.isInteger(length) || length < 10 || length > 32) {
    throw new RangeError('Độ dài mã kỳ thi không hợp lệ.');
  }
  const values = globalThis.crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, value => String(value % 10)).join('');
}

export async function createPublicExamScheduleId(teacherId: string, examId: string): Promise<string> {
  if (!isValidTeacherUid(teacherId) || !isValidTeacherUid(examId)) {
    throw new RangeError('Không thể xác định chủ sở hữu lịch thi.');
  }
  return createDigest(`smartclass:schedule:${teacherId}:${examId}`);
}

export async function createExamAccessDocumentId(accessCode: string): Promise<string> {
  return createDigest(`smartclass:exam-access:${normalizeAccessCode(accessCode)}`);
}

export async function createPublicExamSchedule(exam: PrivateExamPayload): Promise<PublicExamSchedule> {
  if (exam.status !== 'published' || !isValidTeacherUid(exam.teacherId)) {
    throw new RangeError('Chỉ kỳ thi đang mở và có chủ sở hữu mới được công bố lịch.');
  }

  return {
    id: await createPublicExamScheduleId(exam.teacherId, exam.id),
    teacherId: exam.teacherId,
    title: exam.title,
    durationMinutes: exam.durationMinutes,
    questionCount: exam.questions.length,
    status: 'published',
    createdAt: exam.createdAt,
    ...(exam.startTime ? { startTime: exam.startTime } : {}),
  };
}

export async function protectExamForAccess(
  exam: PrivateExamPayload,
  accessCode: string,
): Promise<ProtectedExamAccess> {
  if (exam.status !== 'published' || !isValidTeacherUid(exam.teacherId) || !isValidTeacherUid(exam.id)) {
    throw new RangeError('Không thể mã hóa kỳ thi chưa mở hoặc thiếu chủ sở hữu.');
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveExamKey(accessCode, salt);
  const additionalData = textEncoder.encode(`${exam.teacherId}:${exam.id}`);
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    key,
    textEncoder.encode(JSON.stringify(exam)),
  );

  return {
    teacherId: exam.teacherId,
    examId: exam.id,
    status: 'published',
    version: EXAM_ENCRYPTION_VERSION,
    iterations: EXAM_KEY_DERIVATION_ITERATIONS,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    updatedAt: new Date().toISOString(),
  };
}

export async function openProtectedExamAccess<T extends PrivateExamPayload>(
  access: ProtectedExamAccess,
  accessCode: string,
): Promise<T> {
  if (access.version !== EXAM_ENCRYPTION_VERSION || access.status !== 'published' ||
      !isValidTeacherUid(access.teacherId) || !isValidTeacherUid(access.examId)) {
    throw new RangeError('Thông tin truy cập kỳ thi không hợp lệ.');
  }

  const key = await deriveExamKey(accessCode, decodeBase64(access.salt), access.iterations);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decodeBase64(access.iv),
      additionalData: textEncoder.encode(`${access.teacherId}:${access.examId}`),
    },
    key,
    decodeBase64(access.ciphertext),
  );
  const exam = JSON.parse(textDecoder.decode(decrypted)) as T;
  if (exam.id !== access.examId || exam.teacherId !== access.teacherId || exam.status !== 'published') {
    throw new RangeError('Nội dung kỳ thi không thuộc đúng tài khoản giáo viên.');
  }
  return exam;
}
