export type PlickerSyncErrorKind =
  | 'network-offline'
  | 'network-error'
  | 'permission-denied'
  | 'failed-precondition'
  | 'service-unavailable'
  | 'unauthenticated'
  | 'timeout'
  | 'retryable'
  | 'unknown';

export interface PlickerSyncErrorInfo {
  kind: PlickerSyncErrorKind;
  code: string;
  retryable: boolean;
  message: string;
}

function readStringField(value: unknown, field: 'code' | 'message'): string {
  if (typeof value !== 'object' || value === null || !(field in value)) return '';
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' ? fieldValue : '';
}

export function getPlickerSyncErrorCode(error: unknown): string {
  const rawCode = readStringField(error, 'code').trim().toLowerCase();
  if (!rawCode) return '';
  return rawCode
    .replace(/^firebase\//u, '')
    .replace(/^firestore\//u, '');
}

function getPlickerSyncErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return readStringField(error, 'message');
}

function hasNetworkSignature(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    'network request failed',
    'failed to fetch',
    'networkerror',
    'network error',
    'err_internet_disconnected',
    'connection reset',
    'connection refused',
    'load failed',
    'browser offline',
  ].some(signature => normalized.includes(signature));
}

export function classifyPlickerSyncError(
  error: unknown,
  online = typeof navigator === 'undefined' ? true : navigator.onLine !== false,
): PlickerSyncErrorInfo {
  const code = getPlickerSyncErrorCode(error);
  const rawMessage = getPlickerSyncErrorMessage(error);

  if (!online) {
    return {
      kind: 'network-offline',
      code: code || 'network-offline',
      retryable: true,
      message: 'Thiết bị đang mất kết nối Internet. Hãy kiểm tra Wi-Fi hoặc dữ liệu di động; Plicker sẽ đồng bộ lại sau khi kết nối được khôi phục.',
    };
  }

  switch (code) {
    case 'permission-denied':
      return {
        kind: 'permission-denied',
        code,
        retryable: false,
        message: 'Firebase từ chối quyền truy cập (permission-denied). Hãy kiểm tra Firestore Security Rules của đúng cơ sở dữ liệu và trạng thái tài khoản giáo viên.',
      };
    case 'failed-precondition':
      return {
        kind: 'failed-precondition',
        code,
        retryable: false,
        message: 'Firestore chưa đáp ứng điều kiện đồng bộ (failed-precondition). Hãy kiểm tra cấu hình cơ sở dữ liệu, chỉ mục hoặc trạng thái phiên Plicker.',
      };
    case 'unavailable':
      return {
        kind: 'service-unavailable',
        code,
        retryable: true,
        message: 'Dịch vụ Firestore tạm thời không khả dụng (unavailable). Thiết bị vẫn báo có Internet; hãy giữ trang mở và thử đồng bộ lại sau ít giây.',
      };
    case 'unauthenticated':
      return {
        kind: 'unauthenticated',
        code,
        retryable: false,
        message: 'Phiên đăng nhập Firebase không còn hợp lệ (unauthenticated). Hãy đăng nhập lại và dùng cùng một tài khoản trên điện thoại và màn hình trình chiếu.',
      };
    case 'deadline-exceeded':
      return {
        kind: 'timeout',
        code,
        retryable: true,
        message: 'Firebase phản hồi quá chậm (deadline-exceeded). Hãy kiểm tra chất lượng đường truyền và thử lại.',
      };
    case 'resource-exhausted':
      return {
        kind: 'retryable',
        code,
        retryable: true,
        message: 'Firestore đã chạm hạn mức hoặc tạm hết năng lực xử lý (resource-exhausted). Plicker đã tự giảm tần suất ghi và tạm ngừng ghi trong 60 giây để tránh quá tải. Nếu lỗi kéo dài, hãy kiểm tra Firestore Usage/Quota của dự án.',
      };
    case 'aborted':
    case 'cancelled':
      return {
        kind: 'retryable',
        code,
        retryable: true,
        message: `Firebase tạm thời chưa hoàn tất yêu cầu (${code}). Hãy thử đồng bộ lại.`,
      };
    default:
      break;
  }

  if (hasNetworkSignature(rawMessage)) {
    return {
      kind: 'network-error',
      code: code || 'network-error',
      retryable: true,
      message: 'Trình duyệt đang có mạng nhưng kết nối tới Firebase bị gián đoạn. Hãy kiểm tra Wi-Fi/4G, DNS, tường lửa hoặc thử tải lại trang.',
    };
  }

  return {
    kind: 'unknown',
    code: code || 'unknown',
    retryable: false,
    message: code
      ? `Không thể đồng bộ Firebase (${code}). Hãy thử lại; nếu lỗi tiếp tục, kiểm tra nhật ký trình duyệt.`
      : 'Không thể đồng bộ Firebase do lỗi chưa xác định. Hãy thử lại; nếu lỗi tiếp tục, kiểm tra nhật ký trình duyệt.',
  };
}

export function describePlickerSyncError(
  error: unknown,
  online = typeof navigator === 'undefined' ? true : navigator.onLine !== false,
): string {
  return classifyPlickerSyncError(error, online).message;
}
