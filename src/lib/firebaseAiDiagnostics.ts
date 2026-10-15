// Public, actionable diagnostics. Never log API keys, App Check tokens, or student work.
export const FIREBASE_AI_APP_CHECK_SETUP_MESSAGE =
  'Gemini chưa sẵn sàng vì website thiếu cấu hình Firebase App Check (reCAPTCHA Enterprise). ' +
  'Quản trị viên cần đăng ký Web app trong Firebase Console → App Check, tạo khóa Web reCAPTCHA Enterprise ' +
  'cho thiebithocsovn.github.io, rồi lưu khóa công khai vào GitHub Actions variable ' +
  'VITE_FIREBASE_APP_CHECK_SITE_KEY và phát hành lại. Nội dung đang soạn vẫn được giữ.';

export function describeFirebaseAiFailure(error: unknown): Error {
  const source = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown; status?: unknown } : {};
  const code = typeof source.code === 'string' ? source.code : '';
  const message = typeof source.message === 'string' ? source.message : '';
  const status = typeof source.status === 'number' ? source.status : 0;
  const detail = `${code} ${message}`.toLowerCase();

  if (/app.?check|attestation|recaptcha|invalid.*token|missing.*token|token.*invalid/.test(detail)) {
    return new Error('Firebase App Check chưa xác minh được website. Kiểm tra khóa reCAPTCHA Enterprise, ' +
      'tên miền thiebithocsovn.github.io và trạng thái App Check của Firebase AI Logic. ' +
      'Không tắt bảo vệ App Check; nội dung đang soạn vẫn được giữ.');
  }
  if (/api.?not.?enabled|service_disabled|api.*not.*used|api.*disabled|firebase ai logic.*not.*enabled/.test(detail)) {
    return new Error('Firebase AI Logic API chưa được bật hoặc chưa hoàn tất thiết lập cho dự án. ' +
      'Mở Firebase Console → AI Logic → Get started, chọn Gemini Developer API và hoàn tất kích hoạt. ' +
      'Nội dung đang soạn vẫn được giữ.');
  }
  if (status === 429 || /resource_exhausted|rate.limit|quota|too many requests|429/.test(detail)) {
    return new Error('Gemini đã chạm giới hạn yêu cầu hoặc hạn mức dự án. ' +
      'Kiểm tra quota Firebase AI Logic và thử lại sau. Nội dung đang soạn vẫn được giữ.');
  }
  if (status === 404 || /model.*not.found|not.found.*model|unsupported.model/.test(detail)) {
    return new Error('Model Gemini được cấu hình không khả dụng. ' +
      'Kiểm tra biến VITE_GOOGLE_AI_MODEL và chọn model được Firebase AI Logic hỗ trợ. ' +
      'Nội dung đang soạn vẫn được giữ.');
  }
  if (status === 400 && /api.key|apikey/.test(detail) || /api.key.not.valid|invalid.api.key/.test(detail)) {
    return new Error('Khóa API công khai của Firebase không hợp lệ hoặc bị giới hạn sai dịch vụ. ' +
      'Kiểm tra Web app trong Project settings và giới hạn API key trên Google Cloud. ' +
      'Nội dung đang soạn vẫn được giữ.');
  }
  if (status === 401 || status === 403 || /permission.denied|unauthenticated|403/.test(detail)) {
    return new Error('Firebase AI Logic từ chối quyền truy cập (401/403). ' +
      'Kiểm tra dự án đã bật AI Logic, App Check có token hợp lệ và quyền API key. ' +
      'Nội dung đang soạn vẫn được giữ.');
  }
  if (/fetch.error|network|failed to fetch|unavailable|timeout/.test(detail)) {
    return new Error('Không kết nối được Firebase AI Logic. Kiểm tra mạng và cấu hình API, ' +
      'sau đó thử lại. Nội dung đang soạn vẫn được giữ.');
  }
  return new Error('Gemini chưa xử lý được yêu cầu. Kiểm tra Firebase AI Logic, App Check và model đã chọn. ' +
    'Nội dung đang soạn vẫn được giữ.');
}
