const API_SERVER_STORAGE_KEY = 'smartclass_ai_server_v1';

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

export function normalizeApiServer(input: string): string {
  const value = input.trim();
  if (!value) return '';

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiConfigurationError('Địa chỉ máy chủ AI chưa đúng định dạng.');
  }

  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
    throw new ApiConfigurationError('Máy chủ AI cần sử dụng HTTPS, trừ localhost khi phát triển.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ApiConfigurationError('Địa chỉ máy chủ không được chứa tài khoản, tham số hoặc mã truy cập.');
  }

  return parsed.toString().replace(/\/$/, '');
}

export function getConfiguredApiServer(): string {
  if (typeof window === 'undefined') return '';

  try {
    const saved = window.localStorage.getItem(API_SERVER_STORAGE_KEY);
    if (saved) return normalizeApiServer(saved);
  } catch {
    // A blocked browser storage setting should not prevent the app from loading.
  }

  const configured = import.meta.env?.VITE_API_BASE_URL;
  return configured ? normalizeApiServer(configured) : '';
}

export function saveApiServer(input: string): string {
  const normalized = normalizeApiServer(input);
  if (typeof window === 'undefined') return normalized;

  if (normalized) window.localStorage.setItem(API_SERVER_STORAGE_KEY, normalized);
  else window.localStorage.removeItem(API_SERVER_STORAGE_KEY);
  return normalized;
}

export function resolveApiUrl(endpoint: string): string {
  const safeEndpoint = endpoint.replace(/^\/+/, '');
  if (!safeEndpoint || safeEndpoint.includes('..') || safeEndpoint.includes('?')) {
    throw new ApiConfigurationError('Đường dẫn API không hợp lệ.');
  }

  const configured = getConfiguredApiServer();
  if (configured) return `${configured}/api/${safeEndpoint}`;

  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')) {
    throw new ApiConfigurationError(
      'GitHub Pages chỉ chạy giao diện tĩnh. Hãy cấu hình địa chỉ máy chủ AI trong ứng dụng Tư vấn học đường AI.',
    );
  }

  return `/api/${safeEndpoint}`;
}

export async function postApiJson<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(resolveApiUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json() as { error?: string };
      detail = payload.error ? `: ${payload.error}` : '';
    } catch {
      // Keep the transport error readable even when the server returns HTML.
    }
    throw new Error(`Máy chủ AI trả về lỗi ${response.status}${detail}`);
  }

  return await response.json() as T;
}
