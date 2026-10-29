import express from 'express';
import { createWallOpenAiRouter, createWallAiQuota, type WallOpenAiConfig, type WallOpenAiDependencies } from './wallOpenAi';

export function createWallApiApp(config: WallOpenAiConfig, dependencies: WallOpenAiDependencies, teacherAdminRouter?: express.Router) {
  const app = express();
  const shared = { ...dependencies, quota: dependencies.quota || createWallAiQuota() };
  app.disable('x-powered-by');
  if (teacherAdminRouter) app.use('/api/admin', teacherAdminRouter);
  app.get('/healthz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // Configuration readiness is not proof of a successful AI request or available credit.
    const teachersConfigured = Boolean(config.teacherUids.size || config.teacherEmails?.size);
    const providers = { openai: Boolean(config.apiKey.trim() && teachersConfigured),
      anthropic: Boolean(config.anthropicApiKey?.trim() && teachersConfigured) };
    res.json({ status: 'ok', provider: 'learning-wall-ai', configured: providers.openai || providers.anthropic, providers });
  });
  app.use('/api/wall-ai', createWallOpenAiRouter({ ...config, provider: 'openai' }, shared));
  app.use('/api/wall-claude', createWallOpenAiRouter({ ...config, provider: 'anthropic',
    apiKey: config.anthropicApiKey || '', model: config.anthropicModel || 'claude-sonnet-5-5' }, shared));
  app.use((_req, res) => { res.status(404).json({ error: 'Không có đường dẫn này.' }); });
  return app;
}
