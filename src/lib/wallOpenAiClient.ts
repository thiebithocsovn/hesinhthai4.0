import { normalizeApiServer } from './api';

export type WallOpenAiKind = 'chat' | 'analysis' | 'practice';
interface TeacherSession { uid: string; getIdToken: () => Promise<string> }
interface Options {
  server: string;
  pageUrl: string;
  getUser: () => TeacherSession | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
type ProxyProvider = 'openai' | 'anthropic';
const providerLabel = (provider: ProxyProvider) => provider === 'openai' ? 'OpenAI' : 'Claude';
export function wallOpenAiEndpoint(server: string, pageUrl: string, provider: ProxyProvider = 'openai'): string {
  const page = new URL(pageUrl);
  const local = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!server.trim()) {
    if (local(page.hostname)) return page.origin + (provider === 'openai' ? '/api/wall-ai' : '/api/wall-claude');
    throw new Error(`Kết nối ${providerLabel(provider)} chưa được thiết lập cho tường học tập này. Quản trị viên cần hoàn tất kết nối; nội dung đang soạn vẫn được giữ.`);
  }
  const normalized = normalizeApiServer(server);
  const target = new URL(normalized);
  if ((local(target.hostname) && !local(page.hostname)) || ['api.openai.com', 'chatgpt.com', 'platform.openai.com', 'api.anthropic.com', 'claude.ai', 'platform.claude.com'].includes(target.hostname)) {
    throw new Error(`Cần địa chỉ máy chủ riêng của tường học tập để kết nối ${providerLabel(provider)}.`);
  }
  return normalized + (provider === 'openai' ? '/api/wall-ai' : '/api/wall-claude');
}

type WallProxyInput = {
  kind: WallOpenAiKind | 'connection'; requestId: string; prompt: string;
  media: { mimeType: string; data: string }[];
};
async function requestWallProxy<T extends ProxyProvider>(provider: T, options: Options, input: WallProxyInput): Promise<{ text: string; model: string; source: T }> {
  // Only deployment configuration chooses the host. Never use a saved browser URL with an ID token.
  const endpoint = wallOpenAiEndpoint(options.server, options.pageUrl, provider);
  const teacher = options.getUser();
  if (!teacher) throw new Error('Hãy đăng nhập tài khoản giáo viên trước khi gọi AI.');
  const token = await teacher.getIdToken();
  if (options.getUser()?.uid !== teacher.uid) throw new Error('Phiên giáo viên đã thay đổi; yêu cầu AI không được gửi.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  try {
    const response = await (options.fetchImpl || fetch)(endpoint + (input.kind === 'connection' ? '/connection' : '/generate'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      credentials: 'omit', redirect: 'error', signal: controller.signal,
      body: JSON.stringify(input.kind === 'connection' ? {} : input),
    });
    if (options.getUser()?.uid !== teacher.uid) throw new Error('Phiên giáo viên đã thay đổi; phản hồi AI không được lưu.');
    const data = await response.json().catch(() => null);
    if (options.getUser()?.uid !== teacher.uid) throw new Error('Phiên giáo viên đã thay đổi; phản hồi AI không được lưu.');
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Chưa nhận được phản hồi từ máy chủ ${providerLabel(provider)}.`);
    if (data?.source !== provider || typeof data.text !== 'string' || data.text.length > 150_000 ||
      typeof data.model !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(data.model)) {
      throw new Error(`Máy chủ ${providerLabel(provider)} trả về dữ liệu không hợp lệ.`);
    }
    return { text: data.text, model: data.model, source: provider };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AI chưa phản hồi sau 60 giây. Hãy thử gửi lại trong phần nhận xét.');
    throw error;
  } finally { clearTimeout(timer); }
}
export const requestWallOpenAi = (options: Options, input: WallProxyInput) => requestWallProxy('openai', options, input);
export const requestWallClaude = (options: Options, input: WallProxyInput) => requestWallProxy('anthropic', options, input);
