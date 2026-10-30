import express from 'express';
import { createFirebaseTeacherAdminRouter } from './teacherAdminFirebase.js';

export function createTeacherPasswordApp(router?: express.Router) {
  const app = express();
  app.disable('x-powered-by');
  const origins = new Set((process.env.ALLOWED_ORIGINS || 'https://thiebithocsovn.github.io')
    .split(',').map(origin => origin.trim()).filter(Boolean));
  app.use('/api/admin', router || createFirebaseTeacherAdminRouter(origins));
  app.use((_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ error: 'Không tìm thấy chức năng được yêu cầu.' });
  });
  return app;
}
