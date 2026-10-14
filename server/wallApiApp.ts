import express from 'express';
import { createWallOpenAiRouter, type WallOpenAiConfig, type WallOpenAiDependencies } from './wallOpenAi';

export function createWallApiApp(config: WallOpenAiConfig, dependencies: WallOpenAiDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // Configuration readiness is not proof of a successful AI request or available credit.
    res.json({ status: 'ok', provider: 'openai', configured: Boolean(
      config.apiKey.trim() && (config.teacherUids.size || config.teacherEmails?.size)),
    });
  });
  app.use('/api/wall-ai', createWallOpenAiRouter(config, dependencies));
  app.use((_req, res) => { res.status(404).json({ error: 'Không có đường dẫn này.' }); });
  return app;
}
