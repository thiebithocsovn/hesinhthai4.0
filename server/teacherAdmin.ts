import express from 'express';

export interface TeacherAdminIdentity {
  uid: string;
  email?: string;
  emailVerified: boolean;
  anonymous?: boolean;
  admin?: boolean;
  role?: string;
}
export interface TeacherAdminConfig { origins: Set<string>; administratorEmails: Set<string> }
export interface TeacherAdminDependencies {
  verifyAdministrator: (token: string) => Promise<TeacherAdminIdentity>;
  isStoredAdministrator: (uid: string) => Promise<boolean>;
  getTeacher: (uid: string) => Promise<{ id?: string; email?: string } | null>;
  getAccount: (uid: string) => Promise<{ email?: string; customClaims?: Record<string, unknown> }>;
  updatePassword: (uid: string, password: string) => Promise<void>;
  audit?: (event: { action: 'teacher-password-changed'; administratorUid: string; teacherUid: string }) => void;
  now?: () => number;
}

export function createTeacherAdminRouter(config: TeacherAdminConfig, dependencies: TeacherAdminDependencies) {
  const router = express.Router();
  const attempts = new Map<string, { count: number; expires: number }>();
  const now = dependencies.now || Date.now;
  const privilegedEmail = (email?: string) => Boolean(email && config.administratorEmails.has(email.toLowerCase()));
  const privilegedClaims = (claims?: Record<string, unknown>) => claims?.admin === true || claims?.role === 'admin';

  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (!origin || !config.origins.has(origin)) {
      res.status(403).json({ error: 'Nguồn truy cập chưa được cho phép.' }); return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  router.post('/teachers/password', async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
    if (!match) { res.status(401).json({ error: 'Vui lòng đăng nhập tài khoản quản trị.' }); return; }
    let administrator: TeacherAdminIdentity;
    try { administrator = await dependencies.verifyAdministrator(match[1]); }
    catch (failure) {
      const code = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : '';
      if (['teacher-admin/not-configured', 'app/invalid-credential', 'auth/insufficient-permission', 'auth/internal-error'].includes(code)) {
        console.warn('Teacher password authentication backend unavailable.', { code });
        res.status(503).json({ error: 'Máy chủ đặt mật khẩu chưa được cấu hình quyền Firebase. Vui lòng liên hệ quản trị hệ thống.' }); return;
      }
      res.status(401).json({ error: 'Phiên quản trị không còn hợp lệ. Vui lòng đăng nhập lại.' }); return;
    }
    if (!administrator.uid || administrator.anonymous || !administrator.emailVerified) {
      res.status(403).json({ error: 'Chỉ quản trị viên đã xác minh tài khoản được thay mật khẩu giáo viên.' }); return;
    }
    try {
      const permitted = administrator.admin === true || administrator.role === 'admin' ||
        privilegedEmail(administrator.email) || await dependencies.isStoredAdministrator(administrator.uid);
      if (!permitted) { res.status(403).json({ error: 'Tài khoản hiện tại không có quyền thay mật khẩu giáo viên.' }); return; }
    } catch {
      res.status(503).json({ error: 'Máy chủ chưa thể xác minh quyền quản trị trong Firebase.' }); return;
    }
    const timestamp = now();
    for (const [uid, value] of attempts) if (value.expires <= timestamp) attempts.delete(uid);
    const usage = attempts.get(administrator.uid) || { count: 0, expires: timestamp + 10 * 60_000 };
    if (usage.count >= 20) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((usage.expires - timestamp) / 1000)));
      res.status(429).json({ error: 'Đã có quá nhiều yêu cầu thay mật khẩu. Vui lòng thử lại sau ít phút.' }); return;
    }
    usage.count++;
    attempts.set(administrator.uid, usage);
    res.locals.administrator = administrator;
    next();
  }, express.json({ limit: '4kb' }), async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['teacherId', 'email', 'newPassword'].includes(key)) ||
      typeof body.teacherId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.teacherId) ||
      typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254 ||
      typeof body.newPassword !== 'string' || body.newPassword.length < 8 || body.newPassword.length > 128) {
      res.status(400).json({ error: 'Hồ sơ giáo viên không hợp lệ hoặc mật khẩu chưa đủ 8–128 ký tự.' }); return;
    }
    const { teacherId, email, newPassword } = body as { teacherId: string; email: string; newPassword: string };
    const administrator = res.locals.administrator as TeacherAdminIdentity;
    if (teacherId === administrator.uid) {
      res.status(403).json({ error: 'Chức năng này chỉ đặt lại mật khẩu tài khoản giáo viên khác.' }); return;
    }
    try {
      const teacher = await dependencies.getTeacher(teacherId);
      if (!teacher || teacher.id !== teacherId) {
        res.status(404).json({ error: 'Không tìm thấy hồ sơ giáo viên hợp lệ. Vui lòng tải lại danh sách.' }); return;
      }
      const account = await dependencies.getAccount(teacherId);
      const expectedEmail = email.trim().toLowerCase();
      if (!teacher.email || teacher.email.toLowerCase() !== expectedEmail || account.email?.toLowerCase() !== expectedEmail) {
        res.status(409).json({ error: 'Email hồ sơ và tài khoản đăng nhập chưa trùng khớp. Vui lòng kiểm tra lại giáo viên.' }); return;
      }
      if (privilegedClaims(account.customClaims) || privilegedEmail(account.email) ||
        await dependencies.isStoredAdministrator(teacherId)) {
        res.status(403).json({ error: 'Không được dùng chức năng dành cho giáo viên để đổi mật khẩu tài khoản quản trị.' }); return;
      }
      await dependencies.updatePassword(teacherId, newPassword);
      // Audit metadata contains neither the password, request body nor authentication token.
      try { dependencies.audit?.({ action: 'teacher-password-changed', administratorUid: administrator.uid, teacherUid: teacherId }); }
      catch { /* An audit transport failure must not misreport an already completed password update. */ }
      res.json({ updated: true, teacherId });
    } catch (failure) {
      const code = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : '';
      if (code === 'auth/user-not-found') {
        res.status(404).json({ error: 'Tài khoản đăng nhập của giáo viên không còn tồn tại.' }); return;
      }
      if (['auth/invalid-password', 'auth/password-does-not-meet-requirements'].includes(code)) {
        res.status(400).json({ error: 'Mật khẩu mới chưa đáp ứng chính sách bảo mật của hệ thống. Hãy chọn mật khẩu mạnh hơn.' }); return;
      }
      // Never return provider errors: their message may contain credential or request data.
      res.status(503).json({ error: 'Máy chủ chưa đổi được mật khẩu. Cần kiểm tra quyền Firebase Authentication và kết nối cơ sở dữ liệu.' });
    }
  });
  router.use((error: { type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Nội dung yêu cầu không hợp lệ.' });
  });
  return router;
}
