import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('returns defaults when only the API key is set', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-test' })).toEqual({
      anthropicApiKey: 'sk-test',
      port: 3001,
      model: 'claude-opus-5',
      maxCodeChars: 60_000,
    });
  });

  it('throws a instructive error when the API key is missing', () => {
    expect(() => loadConfig({})).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({})).toThrow(/\.env\.example/);
  });

  it('throws when the API key is blank or whitespace', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: '   ' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('honours overrides', () => {
    expect(
      loadConfig({
        ANTHROPIC_API_KEY: 'sk-test',
        PORT: '4000',
        CLAUDE_MODEL: 'claude-sonnet-5',
        MAX_CODE_CHARS: '1000',
      }),
    ).toEqual({
      anthropicApiKey: 'sk-test',
      port: 4000,
      model: 'claude-sonnet-5',
      maxCodeChars: 1000,
    });
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'sk-test', PORT: 'http' })).toThrow(/PORT/);
  });

  it('rejects a non-positive MAX_CODE_CHARS', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'sk-test', MAX_CODE_CHARS: '0' })).toThrow(
      /MAX_CODE_CHARS/,
    );
  });

  it('never includes the key in a thrown message', () => {
    try {
      loadConfig({ ANTHROPIC_API_KEY: 'sk-secret-value', PORT: 'nope' });
    } catch (err) {
      expect((err as Error).message).not.toContain('sk-secret-value');
    }
  });
});
