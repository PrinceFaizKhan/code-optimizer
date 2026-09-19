import express, { type Express } from 'express';
import type { AppConfig } from './config';
import { createOptimizeRouter } from './routes/optimize';
import type { CodeOptimizer } from './services/claude';

export function createApp(config: AppConfig, optimizer: CodeOptimizer): Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', createOptimizeRouter(config, optimizer));

  return app;
}
