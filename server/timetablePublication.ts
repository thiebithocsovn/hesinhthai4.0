import express from 'express';
import { randomBytes } from 'node:crypto';
import { normalizeTimetableScenario, type TimetableSolution } from '../src/lib/smartTimetable.js';
import { makePublicTimetable, type PublicTimetableSnapshot, type TimetablePublicationOptions } from '../src/lib/timetablePublication.js';

export interface PublicationRecord { ownerUid: string; status: 'published' | 'revoked'; snapshot: PublicTimetableSnapshot; updateTime?: string }
export interface PublicationDependencies {
  verifyOwner: (token: string) => Promise<string>;
  read: (id: string) => Promise<PublicationRecord | null>;
  write: (id: string, record: PublicationRecord, ownerToken: string) => Promise<void>;
  ready: () => boolean;
  createId?: (uid: string) => string;
}
export function createTimetablePublicationApp(deps: PublicationDependencies, origins = new Set(['https://thiebithocsovn.github.io'])) {
  const app = express(); app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && !origins.has(origin)) { res.status(403).json({ error: 'Nguồn truy cập chưa được cho phép.' }); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; } next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.all('/api/timetable', async (req, res) => {
    try {
      const rawId = req.query.publicationId;
      const id = typeof rawId === 'string' ? rawId : '';
      if (id && !/^[A-Za-z0-9_-]{32,500}$/.test(id)) { res.status(400).json({ error: 'Mã thời khóa biểu không hợp lệ.' }); return; }
      if (req.method === 'GET' && !id) { res.json({ available: deps.ready(), service: 'timetable-publication' }); return; }
      if (!deps.ready()) { res.status(503).json({ error: 'Dịch vụ công bố lịch chưa được cấu hình. Có thể xuất trang HTML tra cứu.' }); return; }
      if (req.method === 'GET') {
        const record = await deps.read(id);
        if (!record || record.status !== 'published') { res.status(404).json({ error: 'Lịch không tồn tại hoặc đã được thu hồi.' }); return; }
        res.json({ publicationId: id, snapshot: record.snapshot }); return;
      }
      if (!['POST', 'DELETE'].includes(req.method)) { res.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return; }
      const token = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
      if (!token) { res.status(401).json({ error: 'Đăng nhập tài khoản giáo viên để công bố lịch.' }); return; }
      let owner: string;
      try { owner = await deps.verifyOwner(token); } catch { res.status(403).json({ error: 'Tài khoản không có quyền công bố lịch.' }); return; }
      const previous = id ? await deps.read(id) : null;
      if (id && !previous) { res.status(404).json({ error: 'Không tìm thấy bản công bố.' }); return; }
      if (previous && previous.ownerUid !== owner) { res.status(403).json({ error: 'Không có quyền thay đổi lịch này.' }); return; }
      if (req.method === 'DELETE') {
        if (!id || !previous) { res.status(400).json({ error: 'Chưa chọn bản công bố.' }); return; }
        await deps.write(id, { ...previous, status: 'revoked' }, token); res.json({ publicationId: id, status: 'revoked' }); return;
      }
      const body = req.body;
      if (!body?.scenario || !body.solution || !Array.isArray(body.scenario.assignments) || !Array.isArray(body.solution.entries) || body.scenario.assignments.length > 4000 || body.solution.entries.length > 20000 || !Array.isArray(body.scenario.teachers) || body.scenario.teachers.length > 1000) { res.status(422).json({ error: 'Dữ liệu công bố không hợp lệ hoặc vượt quy mô hỗ trợ.' }); return; }
      const scenario = normalizeTimetableScenario(body.scenario);
      const raw = body.options || {};
      const options: TimetablePublicationOptions = { title: String(raw.title || 'Thời khóa biểu'), effectiveFrom: String(raw.effectiveFrom || ''), effectiveTo: String(raw.effectiveTo || ''), notes: String(raw.notes || ''), showTeacherNames: raw.showTeacherNames === true };
      let snapshot: PublicTimetableSnapshot;
      try { snapshot = makePublicTimetable(scenario, body.solution as TimetableSolution, options); } catch (e) { res.status(422).json({ error: e instanceof Error ? e.message : 'Phương án không hợp lệ.' }); return; }
      if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 700000) { res.status(413).json({ error: 'Lịch quá lớn để công bố trong một bản. Hãy xuất HTML hoặc chia theo khối.' }); return; }
      const publicationId = id || deps.createId?.(owner) || randomBytes(24).toString('base64url');
      await deps.write(publicationId, { ownerUid: owner, status: 'published', snapshot, updateTime: previous?.updateTime }, token);
      res.status(id ? 200 : 201).json({ publicationId, status: 'published' });
    } catch { res.status(503).json({ error: 'Chưa thể lưu hoặc tải bản công bố. Dữ liệu làm việc trên thiết bị vẫn được giữ nguyên.' }); }
  });
  return app;
}
