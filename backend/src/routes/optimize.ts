import { Router } from 'express';
import { LanguageSchema } from '@code-optimizer/shared';
import type { AppConfig } from '../config';
import { mapError } from '../errors';
import { createRateLimiter } from '../rateLimit';
import type { CodeOptimizer } from '../services/claude';

export function createOptimizeRouter(config: AppConfig, optimizer: CodeOptimizer): Router {
  const router = Router();
  const allow = createRateLimiter({ limit: 10, windowMs: 5 * 60_000 });

  router.post('/optimize', async (req, res) => {
    const body = req.body as { language?: unknown; code?: unknown } | undefined;
    const code = body?.code;

    if (typeof code !== 'string' || code.trim().length === 0) {
      res.status(400).json({ error: 'Please paste some code to optimize.' });
      return;
    }
    if (code.length > config.maxCodeChars) {
      res.status(400).json({
        error: `That code is too long. The limit is ${config.maxCodeChars.toLocaleString('en-US')} characters.`,
      });
      return;
    }

    const language = LanguageSchema.safeParse(body?.language);
    if (!language.success) {
      res.status(400).json({ error: 'Unsupported language.' });
      return;
    }

    if (!allow()) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
      return;
    }

    try {
      res.json(await optimizer.optimize(language.data, code));
    } catch (error) {
      const { status, message } = mapError(error);
      console.error('[optimize] request failed:', error);
      res.status(status).json({ error: message });
    }
  });

  return router;
}
