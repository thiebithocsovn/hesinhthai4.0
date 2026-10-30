import { normalizeApiServer } from './api';

export const MINIMUM_TEACHER_PASSWORD_LENGTH = 8;
export const MAXIMUM_TEACHER_PASSWORD_LENGTH = 128;

const PRODUCTION_TEACHER_ADMIN_API = 'https://hesinhthai4-0-thietbihocso.vercel.app';

export function validateTeacherPassword(password: string, confirmation: string): string {
  if (password.length < MINIMUM_TEACHER_PASSWORD_LENGTH) return 'Mật khẩu giáo viên phải có ít nhất 8 ký tự.';
  if (password.length > MAXIMUM_TEACHER_PASSWORD_LENGTH) return 'Mật khẩu giáo viên không được quá 128 ký tự.';
  if (password !== confirmation) return 'Mật khẩu xác nhận chưa trùng khớp.';
  return '';
}

export function teacherPasswordEndpoint(server: string, pageUrl: string): string {
  const page = new URL(pageUrl);
  const isLocal = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!server.trim()) {
    if (isLocal(page.hostname)) return page.origin + '/api/admin/teachers/password';
    // Keep the canonical Pages site connected even when a build omits its public API setting.
    if (page.origin === 'https://thiebithocsovn.github.io' &&
        (page.pathname === '/hesinhthai4.0' || page.pathname.startsWith('/hesinhthai4.0/'))) {
      return PRODUCTION_TEACHER_ADMIN_API + '/api/admin/teachers/password';
    }
    throw new Error('Chức năng đặt mật khẩu trực tiếp chưa được kết nối máy chủ. Quản trị viên cần hoàn tất kết nối Firebase; thầy cô vẫn có thể chọn gửi email khôi phục.');
  }
  const target = normalizeApiServer(server);
  if (isLocal(new URL(target).hostname) && !isLocal(page.hostname)) {
    throw new Error('Địa chỉ máy chủ quản lý tài khoản chưa hợp lệ.');
  }
  return target + '/api/admin/teachers/password';
}

interface AdministratorSession { uid: string; getIdToken: (forceRefresh?: boolean) => Promise<string> }
interface PasswordRequestOptions {
  server: string;
  pageUrl: string;
  getUser: () => AdministratorSession | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function changeTeacherPassword(
  options: PasswordRequestOptions,
  input: { teacherId: string; email: string; password: string; confirmation: string },
): Promise<void> {
  const validation = validateTeacherPassword(input.password, input.confirmation);
  if (validation) throw new Error(validation);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.teacherId) || !input.email.trim()) {
    throw new Error('Hồ sơ giáo viên chưa hợp lệ. Vui lòng tải lại danh sách.');
  }
  // The host comes from deployment configuration or the fixed canonical-site service, never browser storage or user input.
  const endpoint = teacherPasswordEndpoint(options.server, options.pageUrl);
  const administrator = options.getUser();
  if (!administrator) throw new Error('Vui lòng đăng nhập lại tài khoản quản trị.');
  const token = await administrator.getIdToken(true);
  const checkSession = () => {
    if (options.getUser()?.uid !== administrator.uid) throw new Error('Phiên quản trị đã thay đổi. Vui lòng đăng nhập lại.');
  };
  checkSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const response = await (options.fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
      body: JSON.stringify({ teacherId: input.teacherId, email: input.email.trim().toLowerCase(), newPassword: input.password }),
    });
    checkSession();
    const result = await response.json().catch(() => null);
    checkSession();
    if (!response.ok) {
      throw new Error(typeof result?.error === 'string' ? result.error :
        'Máy chủ chưa sẵn sàng để đặt mật khẩu. Vui lòng kiểm tra kết nối Firebase hoặc chọn gửi email khôi phục.');
    }
    if (result?.updated !== true || result.teacherId !== input.teacherId) {
      throw new Error('Chưa xác nhận được việc đổi mật khẩu. Vui lòng kiểm tra trước khi thử lại.');
    }
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) {
      throw new Error('Chưa nhận được xác nhận từ máy chủ. Mật khẩu có thể đã được đổi; hãy kiểm tra trước khi thử lại.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
