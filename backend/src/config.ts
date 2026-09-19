import { config as loadEnvFile } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnvFile({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

export interface AppConfig {
  anthropicApiKey: string;
  port: number;
  model: string;
  maxCodeChars: number;
}

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, but got "${raw}".`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key.',
    );
  }

  return {
    anthropicApiKey,
    port: positiveInteger('PORT', env.PORT, 3001),
    model: env.CLAUDE_MODEL?.trim() || 'claude-opus-5',
    maxCodeChars: positiveInteger('MAX_CODE_CHARS', env.MAX_CODE_CHARS, 60_000),
  };
}
