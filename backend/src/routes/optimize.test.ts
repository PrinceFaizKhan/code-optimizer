import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import type { OptimizationResult } from '@code-optimizer/shared';
import { createApp } from '../app';
import type { AppConfig } from '../config';
import type { CodeOptimizer } from '../services/claude';
import { UnreadableResponseError } from '../services/claude';

const config: AppConfig = {
  anthropicApiKey: 'sk-test',
  port: 3001,
  model: 'claude-opus-5',
  maxCodeChars: 100,
};

const result: OptimizationResult = {
  optimized_code: 'const x = 1;',
  quality_score: 80,
  no_optimization_needed: false,
  summary: 'Tightened it up.',
  issues_found: [],
  performance_improvements: [],
  potential_bugs: [],
  explanation_of_changes: [],
};

function appWith(optimize: CodeOptimizer['optimize']) {
  return createApp(config, { optimize });
}

describe('POST /api/optimize', () => {
  it('returns the optimization result', async () => {
    const response = await request(appWith(async () => result))
      .post('/api/optimize')
      .send({ language: 'typescript', code: 'const x=1' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
  });

  it('passes the language and code through to the optimizer', async () => {
    const optimize = vi.fn().mockResolvedValue(result);
    await request(appWith(optimize)).post('/api/optimize').send({ language: 'sql', code: 'SELECT 1' });
    expect(optimize).toHaveBeenCalledWith('sql', 'SELECT 1');
  });

  it('rejects missing code', async () => {
    const response = await request(appWith(async () => result))
      .post('/api/optimize')
      .send({ language: 'php' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Please paste some code to optimize.');
  });

  it('rejects whitespace-only code', async () => {
    const response = await request(appWith(async () => result))
      .post('/api/optimize')
      .send({ language: 'php', code: '   \n\t ' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Please paste some code to optimize.');
  });

  it('rejects code over the configured limit', async () => {
    const response = await request(appWith(async () => result))
      .post('/api/optimize')
      .send({ language: 'php', code: 'x'.repeat(101) });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('too long');
    expect(response.body.error).toContain('100');
  });

  it('accepts code exactly at the limit', async () => {
    const response = await request(appWith(async () => result))
      .post('/api/optimize')
      .send({ language: 'php', code: 'x'.repeat(100) });
    expect(response.status).toBe(200);
  });

  it('rejects an unsupported language', async () => {
    const response = await request(appWith(async () => result))
      .post('/api/optimize')
      .send({ language: 'ruby', code: 'puts 1' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Unsupported language.');
  });

  it('does not call the optimizer when validation fails', async () => {
    const optimize = vi.fn();
    await request(appWith(optimize)).post('/api/optimize').send({ language: 'ruby', code: 'puts 1' });
    expect(optimize).not.toHaveBeenCalled();
  });

  it('maps an upstream failure to a safe message', async () => {
    const response = await request(
      appWith(async () => {
        throw new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', undefined as unknown as Headers);
      }),
    )
      .post('/api/optimize')
      .send({ language: 'php', code: '<?php echo 1;' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'The server is not configured correctly.' });
  });

  it('maps an unreadable response to 502', async () => {
    const response = await request(
      appWith(async () => {
        throw new UnreadableResponseError('stop_reason: max_tokens');
      }),
    )
      .post('/api/optimize')
      .send({ language: 'php', code: '<?php echo 1;' });

    expect(response.status).toBe(502);
    expect(response.body.error).toContain('unreadable');
  });

  it('rate limits after 10 successful requests', async () => {
    const app = appWith(async () => result);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const ok = await request(app).post('/api/optimize').send({ language: 'php', code: 'x' });
      expect(ok.status).toBe(200);
    }
    const blocked = await request(app).post('/api/optimize').send({ language: 'php', code: 'x' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Too many requests. Please wait a moment.');
  });

  it('does not spend rate limit budget on invalid requests', async () => {
    const app = appWith(async () => result);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app).post('/api/optimize').send({ language: 'php', code: '' });
    }
    const response = await request(app).post('/api/optimize').send({ language: 'php', code: 'x' });
    expect(response.status).toBe(200);
  });
});
