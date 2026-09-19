import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app';
import type { AppConfig } from './config';

const config: AppConfig = {
  anthropicApiKey: 'sk-test',
  port: 3001,
  model: 'claude-opus-5',
  maxCodeChars: 60_000,
};

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const response = await request(createApp(config)).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not leak configuration', async () => {
    const response = await request(createApp(config)).get('/api/health');
    expect(JSON.stringify(response.body)).not.toContain('sk-test');
  });
});
