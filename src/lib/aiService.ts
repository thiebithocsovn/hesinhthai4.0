import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app } from '../firebase';
import { getConfiguredApiServer, postApiJson } from './api';
import {
  buildOfflineSchoolCounselingReply,
  requiresImmediateSchoolSafetySupport,
  SCHOOL_COUNSELING_SYSTEM_PROMPT,
  tryBrowserSchoolCounseling,
  type SchoolCounselingMessage,
} from './schoolCounselor';

export const DEFAULT_GOOGLE_AI_MODEL = 'gemini-3.1-flash-lite';
export const GOOGLE_AI_MODEL = import.meta.env.VITE_GOOGLE_AI_MODEL?.trim() || DEFAULT_GOOGLE_AI_MODEL;

const CLOUD_REQUEST_TIMEOUT_MS = 8_000;
const CLOUD_RETRY_DELAY_MS = 5 * 60_000;

let retryGoogleAiAfter = 0;

export type SchoolCounselingSource =
  | 'google-gemini'
  | 'private-server'
  | 'browser-ai'
  | 'on-device'
  | 'safety-support';

export interface SchoolCounselingResponse {
  text: string;
  source: SchoolCounselingSource;
  model?: string;
}

function getGoogleChatHistory(history: readonly SchoolCounselingMessage[]) {
  const conversation = history
    .filter(message => message.text.trim())
    .slice(-8)
    .map(message => ({
      role: message.role,
      parts: [{ text: message.text.trim().slice(0, 4000) }],
    }));

  while (conversation.length > 0 && conversation[0].role !== 'user') {
    conversation.shift();
  }

  return conversation;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Hết thời gian chờ phản hồi AI.')), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestGoogleGemini(
  message: string,
  history: readonly SchoolCounselingMessage[],
): Promise<string> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: GOOGLE_AI_MODEL,
    systemInstruction: SCHOOL_COUNSELING_SYSTEM_PROMPT,
    generationConfig: { maxOutputTokens: 1024 },
  });

  const chat = model.startChat({ history: getGoogleChatHistory(history) });
  const result = await withTimeout(chat.sendMessage(message.trim().slice(0, 4000)), CLOUD_REQUEST_TIMEOUT_MS);
  return result.response.text().trim();
}

export async function requestSchoolCounseling(
  message: string,
  history: readonly SchoolCounselingMessage[] = [],
): Promise<SchoolCounselingResponse> {
  const cleanMessage = message.trim();
  if (!cleanMessage) {
    return { text: buildOfflineSchoolCounselingReply(''), source: 'on-device' };
  }

  if (requiresImmediateSchoolSafetySupport(cleanMessage)) {
    return {
      text: buildOfflineSchoolCounselingReply(cleanMessage, history),
      source: 'safety-support',
    };
  }

  const configuredServer = getConfiguredApiServer();
  if (configuredServer) {
    try {
      const response = await withTimeout(
        postApiJson<{ text?: string }>('chat', {
          message: cleanMessage,
          history,
          systemInstruction: SCHOOL_COUNSELING_SYSTEM_PROMPT,
        }),
        CLOUD_REQUEST_TIMEOUT_MS,
      );
      const text = response.text?.trim();
      if (text) return { text, source: 'private-server' };
    } catch (error) {
      console.info('Máy chủ riêng chưa phản hồi; tiếp tục bằng Google Gemini hoặc chế độ dự phòng.', error);
    }
  }

  if (Date.now() >= retryGoogleAiAfter) {
    try {
      const text = await requestGoogleGemini(cleanMessage, history);
      if (text) {
        retryGoogleAiAfter = 0;
        return { text, source: 'google-gemini', model: GOOGLE_AI_MODEL };
      }
    } catch (error) {
      retryGoogleAiAfter = Date.now() + CLOUD_RETRY_DELAY_MS;
      console.info('Google Gemini chưa được kích hoạt cho Firebase; dùng chế độ tư vấn dự phòng.', error);
    }
  }

  const browserAnswer = await tryBrowserSchoolCounseling(cleanMessage, history);
  if (browserAnswer) return { text: browserAnswer, source: 'browser-ai' };

  return {
    text: buildOfflineSchoolCounselingReply(cleanMessage, history),
    source: 'on-device',
  };
}
