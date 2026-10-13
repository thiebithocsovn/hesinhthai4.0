export const AUTH_REQUEST_TIMEOUT_MS = 30_000;
export const AUTH_PROFILE_TIMEOUT_MS = 15_000;
export const GOOGLE_POPUP_TIMEOUT_MS = 120_000;

export class AuthFlowError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AuthFlowError';
  }
}

export function waitForAuthOperation<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  timeoutCode: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      action();
    };
    const abort = () => finish(() => reject(new AuthFlowError('auth/google-sign-in-cancelled')));
    // Keep handlers attached after cancellation so late failures are consumed.
    Promise.resolve(operation).then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    );
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(() => reject(new AuthFlowError(timeoutCode))), timeoutMs);
  });
}

export function describeAuthError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.',
    'auth/invalid-email': 'Địa chỉ email chưa đúng định dạng.',
    'auth/email-already-in-use': 'Email này đã có tài khoản. Hãy đăng nhập hoặc chọn quên mật khẩu.',
    'auth/weak-password': 'Mật khẩu chưa đủ mạnh. Hãy sử dụng ít nhất 8 ký tự.',
    'auth/operation-not-allowed': 'Phương thức đăng nhập chưa được bật. Vui lòng liên hệ quản trị viên.',
    'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ Google. Cho phép cửa sổ bật lên cho trang này rồi thử lại.',
    'auth/popup-closed-by-user': 'Cửa sổ Google đã đóng trước khi đăng nhập xong. Thầy cô có thể thử lại.',
    'auth/cancelled-popup-request': 'Một cửa sổ Google khác đã được mở. Hãy hoàn tất trong cửa sổ mới nhất.',
    'auth/google-sign-in-cancelled': 'Đã hủy đăng nhập Google. Thầy cô có thể thử lại hoặc đăng nhập bằng email.',
    'auth/google-popup-timeout': 'Cửa sổ Google chưa trả kết quả. Hãy đóng cửa sổ đó, kiểm tra mạng rồi thử lại hoặc đăng nhập bằng email.',
    'auth/request-timeout': 'Chưa kết nối được dịch vụ đăng nhập. Vui lòng kiểm tra mạng và thử lại.',
    'auth/profile-timeout': 'Đã xác thực nhưng chưa tải được hồ sơ giáo viên. Vui lòng kiểm tra mạng và thử lại.',
    'auth/network-request-failed': 'Không thể kết nối dịch vụ đăng nhập. Vui lòng kiểm tra mạng và thử lại.',
    'auth/unauthorized-domain': 'Tên miền website chưa được cấu hình cho đăng nhập Google. Vui lòng liên hệ quản trị viên.',
    'auth/account-exists-with-different-credential': 'Email này đang dùng cách đăng nhập khác. Hãy đăng nhập bằng email và mật khẩu của tài khoản đã có.',
    'auth/too-many-requests': 'Có quá nhiều lần đăng nhập. Vui lòng chờ một lúc rồi thử lại.',
    'permission-denied': 'Tài khoản chưa được cấp quyền truy cập dữ liệu.',
    'unavailable': 'Chưa kết nối được máy chủ hồ sơ giáo viên. Vui lòng kiểm tra mạng và thử lại.',
  };
  return messages[code] || (error instanceof Error ? error.message : 'Không thể xác thực tài khoản.');
}
