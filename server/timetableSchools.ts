import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { normalizeTimetableScenario, type TimetableScenario, type TimetableSolution } from '../src/lib/smartTimetable.js';
import { auditTimetableSolution } from '../src/lib/smartTimetableAudit.js';
import { makePublicTimetable, publicTimetableHtml, type TimetablePublicationOptions, type PublicTimetableSnapshot } from '../src/lib/timetablePublication.js';

export type SchoolRole = 'owner' | 'admin' | 'scheduler' | 'reviewer' | 'viewer';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type SchoolPermission = 'view' | 'edit' | 'invite' | 'submit' | 'review' | 'publish' | 'audit';
export interface TimetableSchoolIdentity { uid: string; email: string; emailVerified: boolean }
export interface TimetableSchool { id: string; name: string; ownerUid: string; plan: 'pilot'; seatLimit: number; createdAt: string }
export interface TimetableSchoolMembership { uid: string; email: string; role: SchoolRole; joinedAt: string }
export interface TimetableSchoolWorkspace { revision: number; scenario: TimetableScenario; solution: TimetableSolution | null; updatedAt: string; updatedBy: string }
export interface TimetableSchoolReview { id: string; sourceRevision: number; scenario: TimetableScenario; solution: TimetableSolution; options: TimetablePublicationOptions; status: ReviewStatus; submittedBy: string; submittedAt: string; decidedBy?: string; decidedAt?: string; reason?: string }
export interface TimetableSchoolPublicRecord { id: string; schoolId: string; snapshot: PublicTimetableSnapshot; status: 'published' | 'revoked'; approvedReviewId: string; createdAt: string }
export interface TimetableSchoolInvite { codeHash: string; email: string; role: Exclude<SchoolRole, 'owner'>; createdAt: string; expiresAt: string; createdBy: string; usedBy?: string }
export interface TimetableSchoolAudit { actor: string; action: string; at: string; detail?: string }

const permissions: Record<SchoolRole, SchoolPermission[]> = {
  owner: ['view', 'edit', 'invite', 'submit', 'review', 'publish', 'audit'],
  admin: ['view', 'edit', 'invite', 'submit', 'review', 'publish', 'audit'],
  scheduler: ['view', 'edit', 'submit'],
  reviewer: ['view', 'review', 'audit'],
  viewer: ['view'],
};
export function canSchoolRole(role: SchoolRole, action: SchoolPermission): boolean { return permissions[role]?.includes(action) || false; }
export function verifyReviewSeparation(review: TimetableSchoolReview, actorUid: string): string | null {
  if (review.status !== 'pending') return 'Phiếu duyệt đã được xử lý.';
  if (review.submittedBy === actorUid) return 'Người gửi không được tự duyệt phiếu của mình.';
  return null;
}
export function parseInvitationCode(code: string): { schoolId: string; hash: string } {
  const value = /^([A-Za-z0-9_-]{13,40})\.([A-Za-z0-9_-]{20,60})$/.exec(code);
  if (!value) throw new SchoolError(422, 'Mã mời không hợp lệ.');
  return { schoolId: value[1], hash: createHash('sha256').update(code).digest('hex') };
}
export class SchoolError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export interface TimetableSchoolsStore {
  list(uid: string): Promise<TimetableSchool[]>;
  create(school: TimetableSchool, actor: TimetableSchoolIdentity): Promise<void>;
  school(id: string): Promise<TimetableSchool | null>;
  member(id: string, uid: string): Promise<TimetableSchoolMembership | null>;
  members(id: string): Promise<TimetableSchoolMembership[]>;
  invite(id: string, invite: TimetableSchoolInvite): Promise<void>;
  updateMember(id: string, targetUid: string, role: Exclude<SchoolRole, 'owner'> | null, actorUid: string): Promise<void>;
  join(id: string, hash: string, actor: TimetableSchoolIdentity): Promise<TimetableSchoolMembership>;
  readWorkspace(id: string): Promise<TimetableSchoolWorkspace | null>;
  saveWorkspace(id: string, data: Omit<TimetableSchoolWorkspace, 'revision'>, expectedRevision: number): Promise<number>;
  createReview(id: string, review: TimetableSchoolReview): Promise<void>;
  reviews(id: string): Promise<Omit<TimetableSchoolReview, 'scenario' | 'solution'>[]>;
  review(id: string, reviewId: string): Promise<TimetableSchoolReview | null>;
  decide(id: string, reviewId: string, status: 'approved' | 'rejected', actor: string, reason: string): Promise<void>;
  createPublication(id: string, publication: TimetableSchoolPublicRecord, actorUid: string): Promise<void>;
  publication(id: string, publicId: string): Promise<TimetableSchoolPublicRecord | null>;
  publications(id: string): Promise<Omit<TimetableSchoolPublicRecord, 'snapshot'>[]>;
  revoke(id: string, publicId: string, actor: string): Promise<void>;
  activity(id: string): Promise<TimetableSchoolAudit[]>;
  audit(id: string, event: TimetableSchoolAudit): Promise<void>;
}
export interface TimetableSchoolsDeps {
  ready(): boolean;
  verify(token: string): Promise<TimetableSchoolIdentity>;
  store: TimetableSchoolsStore;
  solver?: (scenario: TimetableScenario, locked: unknown[], timeLimitSeconds: number) => Promise<unknown>;
}
const validId = (id: string) => /^[A-Za-z0-9_-]{13,40}$/.test(id);
const requestId = (value: unknown, label = 'Mã trường'): string => {
  if (typeof value !== 'string' || !validId(value)) throw new SchoolError(422, label + ' không hợp lệ.');
  return value;
};
const requiredString = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new SchoolError(422, label + ' không hợp lệ.');
  return value.trim();
};
const validatePlan = (school: TimetableSchool, scenario: TimetableScenario, solution: TimetableSolution | null) => {
  if (scenario.assignments.length > 1000 || scenario.teachers.length > 400 || scenario.classes.length > 200 || (solution?.entries.length || 0) > 8000) throw new SchoolError(413, 'Dữ liệu vượt hạn mức gói thí điểm. Liên hệ quản trị để mở rộng.');
  if (Buffer.byteLength(JSON.stringify({ scenario, solution }), 'utf8') > 750000) throw new SchoolError(413, 'Dữ liệu vượt giới hạn an toàn của một bản ghi. Hãy tách lịch theo trường hoặc học kỳ.');
  if (school.plan !== 'pilot') throw new SchoolError(403, 'Gói sử dụng chưa được cấu hình.');
};
export function createTimetableSchoolsApp(deps: TimetableSchoolsDeps, origins = new Set(['https://thiebithocsovn.github.io', 'https://hesinhthai4-0.vercel.app', 'https://hesinhthai4-0-thietbihocso.vercel.app'])) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && !origins.has(origin)) { res.status(403).json({ error: 'Nguồn truy cập không được cho phép.' }); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.all('/api/timetable/schools', async (req, res) => {
    try {
      const action = String(req.method === 'GET' ? req.query.action || '' : req.body?.action || '');
      if (req.method === 'GET' && action === 'health') { res.json({ available: deps.ready(), service: 'timetable-schools', solverConfigured: Boolean(deps.solver), billingConfigured: false }); return; }
      if (!deps.ready()) throw new SchoolError(503, 'Dịch vụ trường học chưa cấu hình thông tin xác thực máy chủ.');
      if (req.method === 'GET' && action === 'public') {
        const code = requiredString(req.query.code, 'Liên kết công khai', 120);
        const match = /^([A-Za-z0-9_-]{13,40})\.([A-Za-z0-9_-]{20,60})$/.exec(code);
        if (!match) throw new SchoolError(404, 'Liên kết công khai không hợp lệ.');
        const record = await deps.store.publication(match[1], match[2]);
        if (!record || record.status !== 'published') throw new SchoolError(404, 'Bản lịch không tồn tại hoặc đã bị thu hồi.');
        // The HTML contains a redacted, audit-validated snapshot only. No school workspace or credentials.
        res.type('html').setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
        res.send(publicTimetableHtml(record.snapshot)); return;
      }
      if (!['GET', 'POST'].includes(req.method)) throw new SchoolError(405, 'Phương thức không được hỗ trợ.');
      const bearer = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
      if (!bearer) throw new SchoolError(401, 'Vui lòng đăng nhập tài khoản giáo viên.');
      let actor: TimetableSchoolIdentity;
      try { actor = await deps.verify(bearer); } catch { throw new SchoolError(403, 'Tài khoản chưa được xác minh hoặc không được phép truy cập.'); }
      if (!actor.uid || !actor.emailVerified || !actor.email) throw new SchoolError(403, 'Cần xác minh email để sử dụng dữ liệu của trường.');
      const body = req.method === 'GET' ? req.query : req.body || {};
      if (action === 'list' && req.method === 'GET') { res.json({ schools: await deps.store.list(actor.uid) }); return; }
      if (action === 'create' && req.method === 'POST') {
        const name = requiredString(body.name, 'Tên trường', 160);
        if ((await deps.store.list(actor.uid)).filter(s => s.ownerUid === actor.uid).length >= 3) throw new SchoolError(409, 'Mỗi tài khoản được tạo tối đa 3 trường trong giai đoạn thí điểm.');
        const school: TimetableSchool = { id: 's' + randomBytes(12).toString('base64url'), name, ownerUid: actor.uid, plan: 'pilot', seatLimit: 10, createdAt: new Date().toISOString() };
        await deps.store.create(school, actor); res.status(201).json({ school }); return;
      }
      if (action === 'join' && req.method === 'POST') {
        const parsed = parseInvitationCode(requiredString(body.code, 'Mã mời', 120));
        const membership = await deps.store.join(parsed.schoolId, parsed.hash, actor);
        res.json({ school: await deps.store.school(parsed.schoolId), membership }); return;
      }
      const schoolId = requestId(body.schoolId);
      const school = await deps.store.school(schoolId);
      if (!school) throw new SchoolError(404, 'Không tìm thấy trường.');
      const membership = await deps.store.member(schoolId, actor.uid);
      const requireRole = (permission: SchoolPermission) => {
        if (!membership || !canSchoolRole(membership.role, permission)) throw new SchoolError(403, 'Bạn không có quyền thực hiện thao tác này trong trường.');
      };
      if (action === 'detail' && req.method === 'GET') {
        requireRole('view'); res.json({ school, membership, members: canSchoolRole(membership!.role, 'invite') ? await deps.store.members(schoolId) : undefined }); return;
      }
      if (action === 'workspace' && req.method === 'GET') { requireRole('view'); res.json({ workspace: await deps.store.readWorkspace(schoolId) }); return; }
      if (action === 'activity' && req.method === 'GET') { requireRole('audit'); res.json({ activity: await deps.store.activity(schoolId) }); return; }
      if (action === 'invite' && req.method === 'POST') {
        requireRole('invite');
        const email = requiredString(body.email, 'Email được mời', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SchoolError(422, 'Email không hợp lệ.');
        const role = body.role as Exclude<SchoolRole, 'owner'>;
        if (!['admin', 'scheduler', 'reviewer', 'viewer'].includes(role)) throw new SchoolError(422, 'Vai trò không hợp lệ.');
        const members = await deps.store.members(schoolId);
        if (members.length >= school.seatLimit) throw new SchoolError(409, 'Trường đã đạt giới hạn ' + school.seatLimit + ' tài khoản trong gói thí điểm.');
        if (members.some(x => x.email.toLowerCase() === email)) throw new SchoolError(409, 'Email đã có trong trường.');
        const code = schoolId + '.' + randomBytes(24).toString('base64url');
        const invite: TimetableSchoolInvite = { codeHash: createHash('sha256').update(code).digest('hex'), email, role, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), createdBy: actor.uid };
        await deps.store.invite(schoolId, invite);
        await deps.store.audit(schoolId, { actor: actor.uid, action: 'invite-created', at: invite.createdAt, detail: role });
        // This token is shown ONCE to the school admin. No email is sent until a provider is configured.
        res.status(201).json({ code, expiresAt: invite.expiresAt, role }); return;
      }
      if (action === 'changeRole' && req.method === 'POST') {
        if (membership?.role !== 'owner') throw new SchoolError(403, 'Chỉ chủ trường được thay đổi quyền hoặc xóa thành viên.');
        const targetUid = requiredString(body.targetUid, 'Tài khoản thành viên', 128);
        if (!/^[A-Za-z0-9_-]+$/.test(targetUid)) throw new SchoolError(422, 'Tài khoản thành viên không hợp lệ.');
        if (targetUid === actor.uid) throw new SchoolError(409, 'Không thể tự thay đổi quyền chủ trường.');
        const existing = await deps.store.member(schoolId, targetUid);
        if (!existing || existing.role === 'owner') throw new SchoolError(404, 'Không thể thay đổi chủ trường hoặc thành viên không tồn tại.');
        const nextRole = body.role === null ? null : body.role as Exclude<SchoolRole, 'owner'>;
        if (nextRole !== null && !['admin', 'scheduler', 'reviewer', 'viewer'].includes(nextRole)) throw new SchoolError(422, 'Vai trò không hợp lệ.');
        await deps.store.updateMember(schoolId, targetUid, nextRole, actor.uid);
        res.json({ status: nextRole === null ? 'removed' : 'updated' }); return;
      }
      if (action === 'save' && req.method === 'POST') {
        requireRole('edit');
        if (!body.scenario || !Array.isArray(body.scenario.assignments) || !Array.isArray(body.scenario.teachers)) throw new SchoolError(422, 'Kịch bản không hợp lệ.');
        const safeScenario = { ...body.scenario };
        delete safeScenario.publicationSnapshots;
        delete safeScenario.examRoomPlan;
        const scenario = normalizeTimetableScenario(safeScenario);
        const solution: TimetableSolution | null = body.solution || null;
        validatePlan(school, scenario, solution);
        if (solution && (!Array.isArray(solution.entries) || !solution.diagnostics)) throw new SchoolError(422, 'Phương án xếp lịch không hợp lệ.');
        const expectedRevision = Number(body.expectedRevision);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new SchoolError(422, 'Phiên bản dữ liệu không hợp lệ.');
        const data = { scenario, solution, updatedAt: new Date().toISOString(), updatedBy: actor.uid };
        const revision = await deps.store.saveWorkspace(schoolId, data, expectedRevision);
        res.json({ revision }); return;
      }
      if (action === 'submit' && req.method === 'POST') {
        requireRole('submit');
        const current = await deps.store.readWorkspace(schoolId);
        if (!current?.solution) throw new SchoolError(422, 'Chưa có thời khóa biểu hợp lệ để gửi duyệt.');
        const audit = auditTimetableSolution(current.scenario, current.solution);
        if (!audit.valid || !audit.complete) throw new SchoolError(422, 'Phải xếp đủ tiết và không có lỗi cứng trước khi gửi duyệt: ' + audit.errors.slice(0, 2).join(' '));
        const raw = body.options || {};
        const options: TimetablePublicationOptions = { title: String(raw.title || 'Thời khóa biểu'), notes: String(raw.notes || ''), effectiveFrom: String(raw.effectiveFrom || ''), effectiveTo: String(raw.effectiveTo || ''), showTeacherNames: raw.showTeacherNames === true };
        makePublicTimetable(current.scenario, current.solution, options);
        const review: TimetableSchoolReview = { id: 'r' + randomBytes(12).toString('base64url'), sourceRevision: current.revision, scenario: current.scenario, solution: current.solution, options, status: 'pending', submittedAt: new Date().toISOString(), submittedBy: actor.uid };
        await deps.store.createReview(schoolId, review);
        res.status(201).json({ reviewId: review.id, status: 'pending' }); return;
      }
      if (action === 'reviews' && req.method === 'GET') { requireRole('view'); res.json({ reviews: await deps.store.reviews(schoolId) }); return; }
      if (action === 'decide' && req.method === 'POST') {
        requireRole('review');
        const reviewId = requestId(body.reviewId, 'Mã phiếu');
        const review = await deps.store.review(schoolId, reviewId);
        if (!review) throw new SchoolError(404, 'Phiếu duyệt không tồn tại.');
        const separation = verifyReviewSeparation(review, actor.uid);
        if (separation) throw new SchoolError(409, separation);
        const status: 'approved' | 'rejected' = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : (() => { throw new SchoolError(422, 'Quyết định không hợp lệ.'); })();
        if (status === 'approved') {
          const audit = auditTimetableSolution(review.scenario, review.solution);
          if (!audit.valid || !audit.complete) throw new SchoolError(422, 'Phiếu duyệt không qua kiểm tra độc lập.');
        }
        const reason = status === 'rejected' ? requiredString(body.reason, 'Lý do từ chối', 500) : '';
        await deps.store.decide(schoolId, reviewId, status, actor.uid, reason);
        res.json({ reviewId, status }); return;
      }
      if (action === 'publish' && req.method === 'POST') {
        requireRole('publish');
        const reviewId = requestId(body.reviewId, 'Mã phiếu');
        const review = await deps.store.review(schoolId, reviewId);
        if (!review || review.status !== 'approved') throw new SchoolError(409, 'Chỉ công bố phiếu đã được người khác phê duyệt.');
        const snapshot = makePublicTimetable(review.scenario, review.solution, review.options);
        if (Buffer.byteLength(JSON.stringify(snapshot)) > 700000) throw new SchoolError(413, 'Bản công bố vượt giới hạn kích thước.');
        const publicId = randomBytes(24).toString('base64url');
        await deps.store.createPublication(schoolId, { id: publicId, schoolId, snapshot, status: 'published', approvedReviewId: reviewId, createdAt: new Date().toISOString() }, actor.uid);
        res.status(201).json({ code: schoolId + '.' + publicId, status: 'published' }); return;
      }
      if (action === 'publications' && req.method === 'GET') {
        requireRole('publish'); res.json({ publications: await deps.store.publications(schoolId) }); return;
      }
      if (action === 'revoke' && req.method === 'POST') {
        requireRole('publish');
        const publicId = requiredString(body.publicId, 'Mã công bố', 120);
        if (!/^[A-Za-z0-9_-]{20,60}$/.test(publicId)) throw new SchoolError(422, 'Mã công bố không hợp lệ.');
        await deps.store.revoke(schoolId, publicId, actor.uid);
        res.json({ status: 'revoked' }); return;
      }
      if (action === 'solve' && req.method === 'POST') {
        requireRole('edit');
        if (!deps.solver) throw new SchoolError(503, 'Bộ giải CP-SAT chưa được triển khai trên máy chủ.');
        const current = await deps.store.readWorkspace(schoolId);
        if (!current) throw new SchoolError(422, 'Trường chưa lưu thời khóa biểu dùng chung.');
        const timeLimit = Math.min(25, Math.max(1, Number(body.timeLimitSeconds) || 10));
        const result = await deps.solver(current.scenario, [], timeLimit);
        // Provisional result only; never silently save, approve or publish solver output.
        if (result && typeof result === 'object') {
          const response = result as { status?: string; solution?: TimetableSolution };
          if (response.solution) {
            const audit = auditTimetableSolution(current.scenario, response.solution);
            if (!audit.valid || !audit.complete) throw new SchoolError(422, 'Nghiệm CP-SAT bị bộ kiểm tra độc lập loại bỏ.');
          }
        }
        res.json({ result, sourceRevision: current.revision, committed: false }); return;
      }
      throw new SchoolError(404, 'Chức năng không tồn tại.');
    } catch (error) {
      const status = error instanceof SchoolError ? error.statusCode : 503;
      res.status(status).json({ error: error instanceof SchoolError ? error.message : 'Không thể thực hiện thao tác. Dữ liệu trên thiết bị vẫn được giữ nguyên.' });
    }
  });
  return app;
}
