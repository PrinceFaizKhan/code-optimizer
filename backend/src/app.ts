import express, { type Express } from 'express';
import type { AppConfig } from './config';

export function createApp(_config: AppConfig): Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
