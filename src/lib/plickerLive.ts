import type { PlickerAnswer } from './plickerVision';
import { normalizePlickerQuestionPoints } from './plickerScoring';
import {
  sanitizePlickerQuestionMedia,
  sanitizePlickerRichHtml,
  type PlickerQuestionMedia,
} from './plickerQuestionMedia';

export type PlickerDeviceRole = 'scanner' | 'display';
export type PlickerLivePhase = 'launch' | 'scanning' | 'results' | 'finished';

export interface PlickerLiveStudent {
  id: string;
  classId: string;
  name: string;
  cardId?: number;
}

export interface PlickerLiveQuestion {
  id: number;
  text: string;
  richText?: string;
  optionRichText?: Partial<Record<PlickerAnswer, string>>;
  media?: PlickerQuestionMedia[];
  type?: 'multiple_choice' | 'true_false';
  gradingType?: 'graded' | 'survey';
  points?: number;
  options: Partial<Record<PlickerAnswer, string>>;
  correctAnswer: PlickerAnswer | null;
}

export interface PlickerLiveQuestionSet {
  id: string;
  title: string;
  questions: PlickerLiveQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface PlickerLiveResponse {
  studentId: string;
  studentName: string;
  cardId: number;
  answer: PlickerAnswer;
  confidence: number;
  timestamp: number;
  source: 'camera' | 'manual';
}

export interface PlickerLiveSession {
  sessionId: string;
  ownerUid: string;
  classId: string;
  className: string;
  students: PlickerLiveStudent[];
  questionSet: PlickerLiveQuestionSet;
  questionIndex: number;
  phase: PlickerLivePhase;
  showCorrect: boolean;
  showGraph: boolean;
  answersByQuestion: Record<string, Record<string, PlickerLiveResponse>>;
  controllerDeviceId: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlickerLiveDevice {
  deviceId: string;
  updatedAt: number;
}

export interface PlickerLiveRoom {
  kind: 'plicker_live_session';
  ownerUid: string;
  authorId: string;
  librarySets: PlickerLiveQuestionSet[];
  deletedQuestionSetIds?: Record<string, number>;
  deletedClassIds?: Record<string, number>;
  rosters: Record<string, PlickerLiveStudent[]>;
  devices: Partial<Record<PlickerDeviceRole, PlickerLiveDevice>>;
  activeSession: PlickerLiveSession | null;
  updatedAt: number;
}

const ROOM_PREFIX = 'plicker-live-';
const ANSWERS = new Set<PlickerAnswer>(['A', 'B', 'C', 'D']);
const MAX_CARD_ID = 63;

export const PLICKER_DEVICE_HEARTBEAT_MS = 120_000;
export const PLICKER_DEVICE_STALE_MS = 300_000;

export function isPlickerDeviceOnline(
  device: PlickerLiveDevice | null | undefined,
  now = Date.now(),
  staleMs = PLICKER_DEVICE_STALE_MS,
): boolean {
  return Boolean(
    device?.deviceId &&
    Number.isFinite(device.updatedAt) &&
    device.updatedAt > 0 &&
    Number.isFinite(staleMs) &&
    staleMs > 0 &&
    now - device.updatedAt <= staleMs,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAnswer(value: unknown): value is PlickerAnswer {
  return typeof value === 'string' && ANSWERS.has(value as PlickerAnswer);
}

export function createPlickerLiveRoomId(ownerUid: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(ownerUid)) {
    throw new RangeError('Mã tài khoản không hợp lệ để đồng bộ lớp học.');
  }
  return `${ROOM_PREFIX}${ownerUid}`;
}

export function isPlickerSystemCategory(documentId: string, data?: unknown): boolean {
  return documentId.startsWith(ROOM_PREFIX) ||
    (isRecord(data) && data.kind === 'plicker_live_session');
}

export function readPlickerDeviceRole(search: string, userAgent = ''): PlickerDeviceRole {
  const role = new URLSearchParams(search).get('role');
  if (role === 'display' || role === 'scanner') return role;
  return /android|iphone|ipad|ipod|mobile/i.test(userAgent) ? 'scanner' : 'display';
}

export function createPlickerDevicePath(baseUrl: string, role: PlickerDeviceRole): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalized}?${new URLSearchParams({ app: 'plicker', role }).toString()}`;
}

export function isPlickerLiveSessionRunning(
  session: Pick<PlickerLiveSession, 'phase'> | null | undefined,
): boolean {
  return Boolean(session && (
    session.phase === 'launch' ||
    session.phase === 'scanning' ||
    session.phase === 'results'
  ));
}

export function getPlickerDisplayActivationKey(
  role: PlickerDeviceRole,
  session: PlickerLiveSession | null,
  localDeviceId: string,
): string | null {
  if (role !== 'display' || !session || session.phase === 'finished') return null;
  if (!session.controllerDeviceId || session.controllerDeviceId === localDeviceId) return null;

  const action = session.phase === 'scanning' ? 'scan' : 'play';
  return `${session.sessionId}:${session.questionIndex}:${action}`;
}

export function createPlickerQuestionKey(setId: string, questionId: number): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(setId) || !Number.isInteger(questionId) || questionId < 0) {
    throw new RangeError('Mã bộ câu hỏi không hợp lệ để đồng bộ.');
  }
  return `${setId}:${questionId}`;
}

export function sanitizePlickerStudents(students: PlickerLiveStudent[]): PlickerLiveStudent[] {
  const seenIds = new Set<string>();
  const seenCards = new Set<number>();
  return students
    .filter(student => {
      if (!student?.id || !student.classId || !student.name?.trim() || seenIds.has(student.id)) return false;
      if (!Number.isInteger(student.cardId) || Number(student.cardId) < 1 || Number(student.cardId) > MAX_CARD_ID) return false;
      if (seenCards.has(Number(student.cardId))) return false;
      seenIds.add(student.id);
      seenCards.add(Number(student.cardId));
      return true;
    })
    .slice(0, MAX_CARD_ID)
    .map(student => ({ id: student.id, classId: student.classId, name: student.name.trim(), cardId: student.cardId }));
}

export function sanitizePlickerQuestionSet(set: PlickerLiveQuestionSet): PlickerLiveQuestionSet {
  return {
    id: set.id,
    title: set.title,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
    questions: set.questions.map(question => {
      const richText = sanitizePlickerRichHtml(question.richText);
      const optionRichText = Object.fromEntries(
        Object.entries(question.optionRichText || {})
          .filter(([answer, value]) => isAnswer(answer) && typeof value === 'string')
          .map(([answer, value]) => [answer, sanitizePlickerRichHtml(value)])
          .filter(([, value]) => Boolean(value)),
      ) as Partial<Record<PlickerAnswer, string>>;
      const media = sanitizePlickerQuestionMedia(question.media);
      return {
        id: question.id,
        text: question.text,
        ...(richText ? { richText } : {}),
        ...(Object.keys(optionRichText).length ? { optionRichText } : {}),
        ...(media.length ? { media } : {}),
        ...(question.type === 'multiple_choice' || question.type === 'true_false' ? { type: question.type } : {}),
        ...(question.gradingType === 'graded' || question.gradingType === 'survey' ? { gradingType: question.gradingType } : {}),
        ...(question.points !== undefined ? { points: normalizePlickerQuestionPoints(question.points) } : {}),
        options: Object.fromEntries(
          Object.entries(question.options).filter(([answer, text]) => isAnswer(answer) && typeof text === 'string'),
        ) as Partial<Record<PlickerAnswer, string>>,
        correctAnswer: isAnswer(question.correctAnswer) ? question.correctAnswer : null,
      };
    }),
  };
}

function mergePlickerDeletionMarkers(
  local: Record<string, number> = {},
  remote: Record<string, number> = {},
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const [id, deletedAt] of [...Object.entries(local), ...Object.entries(remote)]) {
    if (!/^[a-zA-Z0-9_-]+$/u.test(id) || !Number.isFinite(deletedAt) || deletedAt <= 0) continue;
    merged[id] = Math.max(merged[id] || 0, deletedAt);
  }
  return JSON.stringify(merged) === JSON.stringify(local) ? local : merged;
}

export function mergePlickerDeletedQuestionSets(
  local: Record<string, number> = {},
  remote: Record<string, number> = {},
): Record<string, number> {
  return mergePlickerDeletionMarkers(local, remote);
}

export function mergePlickerDeletedClasses(
  local: Record<string, number> = {},
  remote: Record<string, number> = {},
): Record<string, number> {
  return mergePlickerDeletionMarkers(local, remote);
}

export function mergePlickerQuestionSets<T extends PlickerLiveQuestionSet>(
  local: T[],
  remote: T[],
  deletedQuestionSetIds: Record<string, number> = {},
): T[] {
  const combined = new Map<string, T>();
  for (const set of [...local, ...remote]) {
    if (!set?.id || !Array.isArray(set.questions)) continue;
    const deletedAt = deletedQuestionSetIds[set.id];
    if (deletedAt && deletedAt >= (Date.parse(set.updatedAt) || 0)) continue;
    const current = combined.get(set.id);
    if (!current || Date.parse(set.updatedAt) >= Date.parse(current.updatedAt)) {
      combined.set(set.id, set);
    }
  }

  const result = Array.from(combined.values()).sort((left, right) =>
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return JSON.stringify(result) === JSON.stringify(local) ? local : result;
}

export function mergePlickerCloudRosters<T extends PlickerLiveStudent>(
  local: T[],
  remote: Record<string, T[]>,
  allowedClassIds?: Iterable<string>,
): T[] {
  const allowedClasses = allowedClassIds === undefined ? null : new Set(allowedClassIds);
  const allowedRosters = Object.entries(remote)
    .filter(([classId]) => !allowedClasses || allowedClasses.has(classId));
  const managedClasses = new Set(allowedRosters.map(([classId]) => classId));
  const result = [
    ...local.filter(student => !managedClasses.has(student.classId)),
    ...allowedRosters.flatMap(([classId, students]) =>
      students.filter(student => student.classId === classId)),
  ];
  return JSON.stringify(result) === JSON.stringify(local) ? local : result;
}

export function getPlickerOrphanedRosterChanges<T extends PlickerLiveStudent>(
  rosters: Record<string, T[]>,
  existingClassIds: Iterable<string>,
): Record<string, T[]> {
  const validClasses = new Set(existingClassIds);
  return Object.fromEntries(
    Object.entries(rosters)
      .filter(([classId, students]) => !validClasses.has(classId) && students.length > 0)
      .map(([classId]) => [classId, [] as T[]]),
  );
}

export function createPlickerLiveSession(input: {
  sessionId: string;
  ownerUid: string;
  classId: string;
  className: string;
  students: PlickerLiveStudent[];
  questionSet: PlickerLiveQuestionSet;
  controllerDeviceId: string;
  now?: number;
}): PlickerLiveSession {
  const now = input.now ?? Date.now();
  const students = sanitizePlickerStudents(input.students);
  if (!students.length) throw new RangeError('Lớp học cần có học sinh và mã thẻ hợp lệ.');
  if (!input.questionSet.questions.length) throw new RangeError('Bộ câu hỏi không được để trống.');
  return {
    sessionId: input.sessionId,
    ownerUid: input.ownerUid,
    classId: input.classId,
    className: input.className,
    students,
    questionSet: sanitizePlickerQuestionSet(input.questionSet),
    questionIndex: 0,
    phase: 'launch',
    showCorrect: false,
    showGraph: false,
    answersByQuestion: {},
    controllerDeviceId: input.controllerDeviceId,
    createdAt: now,
    updatedAt: now,
  };
}

export function recordPlickerLiveResponse(
  session: PlickerLiveSession,
  response: PlickerLiveResponse,
): PlickerLiveSession {
  const question = session.questionSet.questions[session.questionIndex];
  const student = session.students.find(item => item.id === response.studentId && item.cardId === response.cardId);
  if (!question || !student || !isAnswer(response.answer) || question.options[response.answer] === undefined) {
    return session;
  }
  const key = createPlickerQuestionKey(session.questionSet.id, question.id);
  const previous = session.answersByQuestion[key]?.[response.studentId];
  if (previous && previous.timestamp > response.timestamp) return session;
  return {
    ...session,
    answersByQuestion: {
      ...session.answersByQuestion,
      [key]: { ...session.answersByQuestion[key], [response.studentId]: response },
    },
    updatedAt: Math.max(session.updatedAt, response.timestamp),
  };
}

export function movePlickerLiveQuestion(
  session: PlickerLiveSession,
  requestedIndex: number,
  now = Date.now(),
): PlickerLiveSession {
  const questionIndex = Math.max(0, Math.min(session.questionSet.questions.length - 1, requestedIndex));
  return {
    ...session,
    questionIndex,
    phase: 'launch',
    showCorrect: false,
    showGraph: false,
    updatedAt: now,
  };
}

export function getPlickerLiveResponses(session: PlickerLiveSession): PlickerLiveResponse[] {
  const question = session.questionSet.questions[session.questionIndex];
  if (!question) return [];
  const key = createPlickerQuestionKey(session.questionSet.id, question.id);
  return Object.values(session.answersByQuestion[key] || {})
    .sort((left, right) => left.cardId - right.cardId);
}

export function summarizePlickerLiveAnswers(responses: PlickerLiveResponse[]): Record<PlickerAnswer, number> {
  const result: Record<PlickerAnswer, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const response of responses) {
    if (isAnswer(response.answer)) result[response.answer] += 1;
  }
  return result;
}

export function normalizePlickerLiveRoom(value: unknown, ownerUid: string): PlickerLiveRoom | null {
  if (!isRecord(value) || value.kind !== 'plicker_live_session' || value.ownerUid !== ownerUid) return null;
  const deletedClassIds = isRecord(value.deletedClassIds)
    ? mergePlickerDeletedClasses({}, value.deletedClassIds as Record<string, number>)
    : {};
  const rawRosters = isRecord(value.rosters) ? value.rosters : {};
  const rosters: Record<string, PlickerLiveStudent[]> = {};
  for (const [classId, roster] of Object.entries(rawRosters)) {
    if (!Array.isArray(roster) || deletedClassIds[classId]) continue;
    rosters[classId] = sanitizePlickerStudents(roster as PlickerLiveStudent[])
      .filter(student => student.classId === classId);
  }

  const session = isRecord(value.activeSession) && value.activeSession.ownerUid === ownerUid &&
      typeof value.activeSession.classId === 'string' && !deletedClassIds[value.activeSession.classId]
    ? value.activeSession as unknown as PlickerLiveSession
    : null;
  return {
    kind: 'plicker_live_session',
    ownerUid,
    authorId: ownerUid,
    librarySets: Array.isArray(value.librarySets)
      ? value.librarySets.filter(set => isRecord(set) && typeof set.id === 'string' && Array.isArray(set.questions)) as PlickerLiveQuestionSet[]
      : [],
    deletedQuestionSetIds: isRecord(value.deletedQuestionSetIds)
      ? mergePlickerDeletedQuestionSets({}, value.deletedQuestionSetIds as Record<string, number>)
      : {},
    deletedClassIds,
    rosters,
    devices: isRecord(value.devices) ? value.devices as PlickerLiveRoom['devices'] : {},
    activeSession: session,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  };
}
