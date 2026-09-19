# AI Code Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web app where a developer pastes code, picks a language, and gets back an optimized version plus a structured review (quality score, issues, performance wins, potential bugs, plain-English explanations) from Claude.

**Architecture:** npm workspaces monorepo with three packages. `shared` holds one Zod schema that is simultaneously the API's output constraint, the backend's validator, and the source of the frontend's types. `backend` is an Express server whose only job is to hold the API key, validate input, and make one schema-constrained Claude call. `frontend` is a Vite + React SPA that proxies `/api` to the backend, so the browser only ever talks to one origin and never sees a key.

**Tech Stack:** React 18 + Vite + TypeScript, Tailwind CSS v4, CodeMirror 6 (`@uiw/react-codemirror`), Node.js + Express 5 + TypeScript (run under `tsx`), Zod, `@anthropic-ai/sdk` with structured outputs, Vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-09-19-ai-code-optimizer-design.md`

## Global Constraints

- **Node >= 20.** Declared in root `package.json` `engines`.
- **Model ID is exactly `claude-opus-5`.** Never append a date suffix. It is the default value of the `CLAUDE_MODEL` env var, never hardcoded at a call site.
- **The Anthropic API key is read only in `backend/src/config.ts`.** It must never appear in frontend source, in any response body, in any log line, or in any committed file. `.env` is gitignored; only `.env.example` is committed, with a blank key.
- **Input cap: 60,000 characters** (`MAX_CODE_CHARS`, default in `backend/src/config.ts`). Enforced client-side for UX and server-side as the actual rule.
- **The six languages are exactly:** `php`, `javascript`, `typescript`, `python`, `sql`, `blade`. These string literals are the wire values; display labels are separate.
- **Dark theme only.** No light mode, no theme toggle, no `dark:` variants — use explicit dark colours.
- **Every relative import is extensionless** (`./config`, not `./config.js`). All three packages use `"moduleResolution": "bundler"`, and both `tsx` and Vite resolve extensionless TypeScript. Be consistent.
- **All packages are ESM** (`"type": "module"`).
- **No test makes a real Anthropic API call.** Dependencies are injected, never network-mocked.

## Deviations from the spec (deliberate, noted for the reviewer)

1. **`backend/src/app.ts` is split out from `index.ts`.** The spec listed only `index.ts`. `createApp(config, optimizer)` returns the Express app without calling `listen`, which is what makes supertest route tests possible; `index.ts` is only the bootstrap. Without this split the route tests in Task 5 cannot exist.
2. **No `tailwind.config.js`.** The spec listed one, but Tailwind v4 is configured from CSS via `@theme` and the `@tailwindcss/vite` plugin. A JS config file would be dead weight.
3. **Two extra error cases** beyond the spec's table: a `stop_reason: "refusal"` response maps to 502 "The AI declined to process this code.", and any unrecognised throw maps to 500 "Something went wrong." Both are defensive; neither changes a documented case.
4. **`backend/src/errors.ts` and `backend/src/rateLimit.ts`** are separate modules, not inlined into the route, so that error mapping and rate limiting can be unit tested directly.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Workspaces, `npm run dev`, `npm test`, `npm run typecheck` |
| `shared/src/schema.ts` | The contract: Zod schemas, `Language`, `Severity`, `MAX_CODE_CHARS` |
| `backend/src/config.ts` | Load and validate env; the only reader of the API key |
| `backend/src/prompt.ts` | System prompt (the review rules) and user message construction |
| `backend/src/services/claude.ts` | The only module importing the Anthropic SDK |
| `backend/src/errors.ts` | Throwable → `{ status, message }`; no internals leak |
| `backend/src/rateLimit.ts` | In-memory request budget (cost control) |
| `backend/src/routes/optimize.ts` | Request validation, dispatch, response mapping |
| `backend/src/app.ts` | Express wiring, no `listen` |
| `backend/src/index.ts` | Bootstrap: load config, create app, listen |
| `frontend/src/lib/languages.ts` | Labels and download file extensions (pure, tested) |
| `frontend/src/lib/codemirror.ts` | Language → CodeMirror extension (imports CM, untested) |
| `frontend/src/lib/diff.ts` | Line-level diff → line-number sets (pure, tested) |
| `frontend/src/api/client.ts` | `POST /api/optimize`, response validation, safe error messages |
| `frontend/src/hooks/useOptimize.ts` | Request state machine, elapsed timer, rotating status |
| `frontend/src/components/*.tsx` | Presentational only; no fetching |
| `frontend/src/App.tsx` | Layout and composition |

---

## Task 1: Workspace scaffolding and the shared schema

**Files:**
- Create: `package.json`
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/vitest.config.ts`
- Create: `shared/src/schema.ts`
- Test: `shared/src/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: package `@code-optimizer/shared` exporting `LANGUAGES`, `Language`, `LanguageSchema`, `SEVERITIES`, `Severity`, `SeveritySchema`, `IssueSchema`, `ImprovementSchema`, `BugSchema`, `ChangeSchema`, `OptimizationResultSchema`, `OptimizationResult`, `MAX_CODE_CHARS`. Every later task imports from this package by name.

- [ ] **Step 1: Create the root `package.json`**

```json
{
  "name": "code-optimizer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "backend", "frontend"],
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "concurrently -n backend,frontend -c cyan,magenta \"npm run dev -w backend\" \"npm run dev -w frontend\"",
    "test": "npm test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

- [ ] **Step 2: Create `shared/package.json`**

The `main`/`types`/`exports` fields all point at TypeScript source on purpose. Nothing builds this package — `tsx` loads the `.ts` directly on the backend, and Vite aliases it on the frontend.

```json
{
  "name": "@code-optimizer/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/schema.ts",
  "types": "./src/schema.ts",
  "exports": { ".": "./src/schema.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Create `shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `shared/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: succeeds, and `node_modules/@code-optimizer/shared` exists as a symlink to `shared/`.

- [ ] **Step 6: Write the failing test**

Create `shared/src/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  LANGUAGES,
  LanguageSchema,
  OptimizationResultSchema,
  MAX_CODE_CHARS,
} from './schema';

const valid = {
  optimized_code: 'const x = 1;',
  quality_score: 72,
  no_optimization_needed: false,
  summary: 'Tightened the loop.',
  issues_found: [
    {
      title: 'Unused variable',
      severity: 'low',
      description: '`y` is never read.',
      line_reference: '4',
    },
  ],
  performance_improvements: [
    { title: 'Fewer allocations', description: 'Reuses the array.', impact: 'Moderate' },
  ],
  potential_bugs: [
    { title: 'Null deref', severity: 'high', description: '`a` may be null.' },
  ],
  explanation_of_changes: [
    { change: 'Replaced the for loop with map.', why: 'Shorter and avoids an index bug.' },
  ],
};

describe('OptimizationResultSchema', () => {
  it('accepts a fully populated result', () => {
    expect(OptimizationResultSchema.parse(valid)).toEqual(valid);
  });

  it('accepts empty arrays for every list field', () => {
    const clean = {
      ...valid,
      no_optimization_needed: true,
      issues_found: [],
      performance_improvements: [],
      potential_bugs: [],
      explanation_of_changes: [],
    };
    expect(OptimizationResultSchema.parse(clean)).toEqual(clean);
  });

  it('rejects a missing field', () => {
    const { summary, ...withoutSummary } = valid;
    expect(OptimizationResultSchema.safeParse(withoutSummary).success).toBe(false);
  });

  it('rejects a quality_score above 100', () => {
    expect(OptimizationResultSchema.safeParse({ ...valid, quality_score: 101 }).success).toBe(false);
  });

  it('rejects a quality_score below 0', () => {
    expect(OptimizationResultSchema.safeParse({ ...valid, quality_score: -1 }).success).toBe(false);
  });

  it('rejects a fractional quality_score', () => {
    expect(OptimizationResultSchema.safeParse({ ...valid, quality_score: 72.5 }).success).toBe(false);
  });

  it('rejects an unknown severity', () => {
    const bad = { ...valid, potential_bugs: [{ ...valid.potential_bugs[0], severity: 'critical' }] };
    expect(OptimizationResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe('LanguageSchema', () => {
  it('accepts all six supported languages', () => {
    for (const language of LANGUAGES) {
      expect(LanguageSchema.parse(language)).toBe(language);
    }
  });

  it('rejects an unsupported language', () => {
    expect(LanguageSchema.safeParse('ruby').success).toBe(false);
  });
});

describe('MAX_CODE_CHARS', () => {
  it('is 60000', () => {
    expect(MAX_CODE_CHARS).toBe(60_000);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -w shared`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 8: Write `shared/src/schema.ts`**

```typescript
import { z } from 'zod';

export const LANGUAGES = ['php', 'javascript', 'typescript', 'python', 'sql', 'blade'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LanguageSchema = z.enum(LANGUAGES);

export const SEVERITIES = ['low', 'medium', 'high'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SeveritySchema = z.enum(SEVERITIES);

export const IssueSchema = z.object({
  title: z.string(),
  severity: SeveritySchema,
  description: z.string(),
  line_reference: z.string(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const ImprovementSchema = z.object({
  title: z.string(),
  description: z.string(),
  impact: z.string(),
});
export type Improvement = z.infer<typeof ImprovementSchema>;

export const BugSchema = z.object({
  title: z.string(),
  severity: SeveritySchema,
  description: z.string(),
});
export type Bug = z.infer<typeof BugSchema>;

export const ChangeSchema = z.object({
  change: z.string(),
  why: z.string(),
});
export type Change = z.infer<typeof ChangeSchema>;

export const OptimizationResultSchema = z.object({
  optimized_code: z.string(),
  quality_score: z.number().int().min(0).max(100),
  no_optimization_needed: z.boolean(),
  summary: z.string(),
  issues_found: z.array(IssueSchema),
  performance_improvements: z.array(ImprovementSchema),
  potential_bugs: z.array(BugSchema),
  explanation_of_changes: z.array(ChangeSchema),
});
export type OptimizationResult = z.infer<typeof OptimizationResultSchema>;

export const MAX_CODE_CHARS = 60_000;
```

Field order matters a little: Claude fills the schema top to bottom, so `optimized_code` first means the rewrite is produced before the commentary about it.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -w shared`
Expected: PASS, 10 tests.

- [ ] **Step 10: Commit**

```bash
git add package.json shared package-lock.json
git commit -m "feat(shared): add the optimization result schema"
```

---

## Task 2: Backend config, app shell, and health endpoint

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.example`
- Create: `backend/src/config.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/index.ts`
- Test: `backend/src/config.test.ts`
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 yet.
- Produces: `AppConfig` (`{ anthropicApiKey: string; port: number; model: string; maxCodeChars: number }`), `loadConfig(env?: NodeJS.ProcessEnv): AppConfig`, and `createApp(config: AppConfig): Express`. Task 5 changes `createApp` to take a second argument.

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "@code-optimizer/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.68.0",
    "@code-optimizer/shared": "*",
    "dotenv": "^16.4.7",
    "express": "^5.1.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.2",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^3.0.0"
  }
}
```

If `@anthropic-ai/sdk@^0.68.0` does not exist when you run install, use the latest published version instead — the only requirement is that it exposes `client.messages.parse` and the `@anthropic-ai/sdk/helpers/zod` subpath.

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `backend/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create `backend/.env.example`**

```bash
# Required. Create a key at https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=

# Optional — defaults shown.
PORT=3001
CLAUDE_MODEL=claude-opus-5
MAX_CODE_CHARS=60000
```

- [ ] **Step 5: Install and confirm `.env` is ignored**

Run: `npm install`
Run: `git check-ignore -v backend/.env`
Expected: install succeeds; `git check-ignore` prints a match against the root `.gitignore` rule `.env`. If it prints nothing, stop and add `.env` to `.gitignore` before going further — the whole point is that a real key can never be committed.

- [ ] **Step 6: Write the failing config test**

Create `backend/src/config.test.ts`:

```typescript
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
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -w backend`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 8: Write `backend/src/config.ts`**

`loadConfig` takes the environment as an argument so tests never touch `process.env`. The `dotenv` call resolves `backend/.env` relative to this file, not to the working directory, so it works no matter where `npm run dev` is invoked from.

```typescript
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
```

- [ ] **Step 9: Run the config test to verify it passes**

Run: `npm test -w backend`
Expected: PASS, 7 tests.

- [ ] **Step 10: Write the failing health test**

Create `backend/src/app.test.ts`:

```typescript
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
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npm test -w backend`
Expected: FAIL — cannot resolve `./app`.

- [ ] **Step 12: Write `backend/src/app.ts`**

```typescript
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
```

The `_config` parameter is unused for now; Task 5 uses it for the input cap.

- [ ] **Step 13: Write `backend/src/index.ts`**

```typescript
import { createApp } from './app';
import { loadConfig, type AppConfig } from './config';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(`\n✖ ${(error as Error).message}\n`);
  process.exit(1);
}

const app = createApp(config);
app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (model: ${config.model})`);
});
```

- [ ] **Step 14: Run the tests to verify they pass**

Run: `npm test -w backend`
Expected: PASS, 9 tests.

- [ ] **Step 15: Verify the boot failure is friendly**

Run: `npm start -w backend` with no `backend/.env` present.
Expected: prints `✖ ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key.` and exits with code 1 — no stack trace.

- [ ] **Step 16: Commit**

```bash
git add backend package-lock.json
git commit -m "feat(backend): add config loading, app shell, and health endpoint"
```

---

## Task 3: The prompt

**Files:**
- Create: `backend/src/prompt.ts`
- Test: `backend/src/prompt.test.ts`

**Interfaces:**
- Consumes: `Language` from `@code-optimizer/shared`. This task is also the first proof that cross-workspace TypeScript resolution works under both `tsx` and Vitest.
- Produces: `buildSystemPrompt(language: Language): string` and `buildUserMessage(language: Language, code: string): string`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { LANGUAGES } from '@code-optimizer/shared';
import { buildSystemPrompt, buildUserMessage } from './prompt';

describe('buildSystemPrompt', () => {
  it('states the language in a human-readable form', () => {
    expect(buildSystemPrompt('typescript')).toContain('TypeScript');
    expect(buildSystemPrompt('blade')).toContain('Laravel Blade');
  });

  it('includes the non-negotiable review rules for every language', () => {
    for (const language of LANGUAGES) {
      const prompt = buildSystemPrompt(language);
      expect(prompt).toContain('Preserve the original functionality');
      expect(prompt).toContain('Do not invent missing business logic');
      expect(prompt).toContain('Do not remove security validation');
      expect(prompt).toContain('no_optimization_needed');
    }
  });

  it('adds the Blade directive warning only for Blade', () => {
    expect(buildSystemPrompt('blade')).toContain('@directives');
    expect(buildSystemPrompt('php')).not.toContain('@directives');
    expect(buildSystemPrompt('javascript')).not.toContain('@directives');
  });

  it('tells the model that line references point at the original code', () => {
    expect(buildSystemPrompt('python')).toContain('ORIGINAL');
  });
});

describe('buildUserMessage', () => {
  it('fences the code with the language tag', () => {
    const message = buildUserMessage('sql', 'SELECT 1;');
    expect(message).toContain('```sql\nSELECT 1;\n```');
  });

  it('does not alter the code', () => {
    const code = 'def f():\n    return  1  # spacing preserved\n';
    expect(buildUserMessage('python', code)).toContain(code);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w backend -- prompt`
Expected: FAIL — cannot resolve `./prompt`.

- [ ] **Step 3: Write `backend/src/prompt.ts`**

```typescript
import type { Language } from '@code-optimizer/shared';

const LANGUAGE_LABELS: Record<Language, string> = {
  php: 'PHP',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  sql: 'SQL',
  blade: 'Laravel Blade',
};

const LANGUAGE_NOTES: Partial<Record<Language, string>> = {
  blade:
    'This is a Laravel Blade template. Treat @directives and {{ }} / {!! !!} as Blade syntax: keep them as Blade and never rewrite them into raw PHP or plain HTML. Escaping matters — do not change {{ }} to {!! !!} or the reverse.',
  php:
    'Preserve the existing error-handling style and any framework conventions you can infer from the code rather than imposing a different one.',
  sql:
    'Do not change which rows a query returns, or their order, unless the original ordering is already unspecified. If you touch ordering or row selection in any way, say so explicitly in explanation_of_changes.',
};

const BASE_RULES = `You review and optimize source code. You are careful, conservative, and honest.

Rules, in priority order:

1. Preserve the original functionality exactly. The optimized code must do what the original does, for every input the original handles. If you cannot improve the code without changing its behaviour, do not change it.
2. Do not invent missing business logic. If something looks incomplete, unfinished, or dependent on code you cannot see, report it in issues_found rather than filling it in.
3. Do not remove security validation, authorization checks, input sanitisation, or error handling. If any of these looks redundant, leave it in place and explain your reasoning in explanation_of_changes.
4. Explain every meaningful change in simple English, aimed at a developer who has never seen this code. Say what you changed and why it is better. Prefer a plain word over jargon.
5. If the code is already well written, set no_optimization_needed to true, return the original code unchanged in optimized_code, and say so plainly in summary. That is a valid and useful answer — never invent changes in order to look useful.
6. Score honestly in quality_score. 90+ means you would approve this in review with no comments. 50 means it works but needs attention. Below 30 means it is likely to cause problems in production. A high score has to mean something.
7. Report only what you can actually see in the code provided. Do not speculate about code you were not shown.

Fill every field of the response. Use empty arrays where a category genuinely has no entries; never pad them with filler.
For line_reference, cite lines of the ORIGINAL code the user gave you — a number ("12"), a range ("12-18"), or a short description ("the main loop") where a number would be misleading.`;

export function buildSystemPrompt(language: Language): string {
  return [BASE_RULES, `The code you are given is ${LANGUAGE_LABELS[language]}.`, LANGUAGE_NOTES[language]]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}

export function buildUserMessage(language: Language, code: string): string {
  return `Review and optimize the following ${LANGUAGE_LABELS[language]} code.\n\n\`\`\`${language}\n${code}\n\`\`\``;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w backend -- prompt`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/prompt.ts backend/src/prompt.test.ts
git commit -m "feat(backend): add the code review system prompt"
```

---

## Task 4: The Claude service

**Files:**
- Create: `backend/src/services/claude.ts`
- Test: `backend/src/services/claude.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (Task 2), `buildSystemPrompt` / `buildUserMessage` (Task 3), `OptimizationResultSchema` and `OptimizationResult` (Task 1).
- Produces: `CodeOptimizer` (interface with `optimize(language, code): Promise<OptimizationResult>`), `createCodeOptimizer(config, client?)`, and the error classes `RefusalError` and `UnreadableResponseError`. Tasks 5 and 13 consume these.

The client is an injectable constructor parameter. That is the entire testing strategy for this module — no `vi.mock`, no network interception, no risk of a test spending money.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/claude.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { OptimizationResult } from '@code-optimizer/shared';
import type { AppConfig } from '../config';
import { createCodeOptimizer, RefusalError, UnreadableResponseError } from './claude';

const config: AppConfig = {
  anthropicApiKey: 'sk-test',
  port: 3001,
  model: 'claude-opus-5',
  maxCodeChars: 60_000,
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

function fakeClient(response: unknown) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

describe('createCodeOptimizer', () => {
  it('returns the parsed output on success', async () => {
    const { client } = fakeClient({ stop_reason: 'end_turn', parsed_output: result });
    const optimizer = createCodeOptimizer(config, client);
    await expect(optimizer.optimize('typescript', 'const x=1')).resolves.toEqual(result);
  });

  it('sends the configured model, the system prompt, and the fenced code', async () => {
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: result });
    await createCodeOptimizer(config, client).optimize('python', 'print(1)');

    const request = parse.mock.calls[0]![0];
    expect(request.model).toBe('claude-opus-5');
    expect(request.max_tokens).toBe(32_000);
    expect(request.system).toContain('Preserve the original functionality');
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe('user');
    expect(request.messages[0].content).toContain('```python\nprint(1)\n```');
    expect(request.output_config.effort).toBe('high');
    expect(request.output_config.format).toBeDefined();
  });

  it('uses the model from config rather than a hardcoded one', async () => {
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: result });
    await createCodeOptimizer({ ...config, model: 'claude-sonnet-5' }, client).optimize('sql', 'SELECT 1');
    expect(parse.mock.calls[0]![0].model).toBe('claude-sonnet-5');
  });

  it('throws UnreadableResponseError when parsed_output is null', async () => {
    const { client } = fakeClient({ stop_reason: 'max_tokens', parsed_output: null });
    await expect(createCodeOptimizer(config, client).optimize('php', '<?php echo 1;')).rejects.toBeInstanceOf(
      UnreadableResponseError,
    );
  });

  it('throws RefusalError when the model declines', async () => {
    const { client } = fakeClient({
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: 'declined' },
      parsed_output: null,
    });
    await expect(createCodeOptimizer(config, client).optimize('php', 'x')).rejects.toBeInstanceOf(RefusalError);
  });

  it('does not put the API key into any thrown message', async () => {
    const { client } = fakeClient({ stop_reason: 'max_tokens', parsed_output: null });
    await expect(createCodeOptimizer(config, client).optimize('php', 'x')).rejects.toSatisfy(
      (err: Error) => !err.message.includes('sk-test'),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w backend -- claude`
Expected: FAIL — cannot resolve `./claude`.

- [ ] **Step 3: Write `backend/src/services/claude.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  OptimizationResultSchema,
  type Language,
  type OptimizationResult,
} from '@code-optimizer/shared';
import type { AppConfig } from '../config';
import { buildSystemPrompt, buildUserMessage } from '../prompt';

/** The model produced no schema-valid payload. */
export class UnreadableResponseError extends Error {
  constructor(reason: string) {
    super(`Claude returned no usable result (${reason}).`);
    this.name = 'UnreadableResponseError';
  }
}

/** The model declined to process the request. */
export class RefusalError extends Error {
  constructor(reason: string) {
    super(`Claude declined the request (${reason}).`);
    this.name = 'RefusalError';
  }
}

export interface CodeOptimizer {
  optimize(language: Language, code: string): Promise<OptimizationResult>;
}

export function createCodeOptimizer(
  config: AppConfig,
  client: Anthropic = new Anthropic({ apiKey: config.anthropicApiKey }),
): CodeOptimizer {
  return {
    async optimize(language, code) {
      const response = await client.messages.parse({
        model: config.model,
        max_tokens: 32_000,
        system: buildSystemPrompt(language),
        messages: [{ role: 'user', content: buildUserMessage(language, code) }],
        output_config: {
          format: zodOutputFormat(OptimizationResultSchema),
          effort: 'high',
        },
      });

      if (response.stop_reason === 'refusal') {
        throw new RefusalError(response.stop_details?.category ?? 'no category given');
      }
      if (!response.parsed_output) {
        throw new UnreadableResponseError(`stop_reason: ${response.stop_reason}`);
      }
      return response.parsed_output;
    },
  };
}
```

Notes for the implementer:

- `max_tokens: 32000` is deliberate. The optimized code plus the commentary can be long, and truncation at the cap produces a `null` `parsed_output` rather than partial data.
- Adaptive thinking is on by default on `claude-opus-5`. Do not pass a `thinking` parameter; `budget_tokens` is rejected with a 400 on this model.
- Do not add streaming. The `parse()` helper is what provides the schema guarantee.
- **Contingency:** if the first real API call returns a 400 mentioning an unsupported JSON Schema keyword, the cause is `.min(0).max(100)` on `quality_score`. Fix by relaxing that field to `z.number().int()` in `shared/src/schema.ts` and clamping in this function before returning. Do not disable schema validation.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w backend -- claude`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors. If `output_config.format` is rejected by the SDK's types, check the installed SDK's `messages.parse` signature before changing anything — the shape above is the documented one.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services
git commit -m "feat(backend): add the Claude optimization service"
```

---

## Task 5: Rate limiter, error mapping, and the optimize route

**Files:**
- Create: `backend/src/rateLimit.ts`
- Create: `backend/src/errors.ts`
- Create: `backend/src/routes/optimize.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/rateLimit.test.ts`
- Test: `backend/src/errors.test.ts`
- Test: `backend/src/routes/optimize.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (Task 2), `CodeOptimizer` / `RefusalError` / `UnreadableResponseError` (Task 4), `LanguageSchema` (Task 1).
- Produces: `createRateLimiter(options)`, `mapError(err): { status: number; message: string }`, `createOptimizeRouter(config, optimizer): Router`, and the changed signature `createApp(config: AppConfig, optimizer: CodeOptimizer): Express`.

- [ ] **Step 1: Write the failing rate limiter test**

Create `backend/src/rateLimit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows requests up to the limit', () => {
    const allow = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect([allow(), allow(), allow()]).toEqual([true, true, true]);
  });

  it('refuses once the limit is reached', () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    allow();
    allow();
    expect(allow()).toBe(false);
  });

  it('resets after the window elapses', () => {
    let clock = 0;
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    clock = 1000;
    expect(allow()).toBe(true);
  });

  it('does not reset early', () => {
    let clock = 0;
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });
    allow();
    clock = 999;
    expect(allow()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w backend -- rateLimit`
Expected: FAIL — cannot resolve `./rateLimit`.

- [ ] **Step 3: Write `backend/src/rateLimit.ts`**

A single global budget, not per-IP. This is a locally-run single-user app; the purpose is to stop a runaway frontend loop from spending money, not to defend against anyone.

```typescript
export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

/** Returns a function that reports whether a request may proceed, consuming budget when it may. */
export function createRateLimiter({ limit, windowMs, now = Date.now }: RateLimiterOptions): () => boolean {
  let windowStart = now();
  let used = 0;

  return function allow(): boolean {
    const currentTime = now();
    if (currentTime - windowStart >= windowMs) {
      windowStart = currentTime;
      used = 0;
    }
    if (used >= limit) return false;
    used += 1;
    return true;
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w backend -- rateLimit`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing error-mapping test**

Create `backend/src/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { mapError } from './errors';
import { RefusalError, UnreadableResponseError } from './services/claude';

describe('mapError', () => {
  it('maps an unreadable response to 502', () => {
    expect(mapError(new UnreadableResponseError('stop_reason: max_tokens'))).toEqual({
      status: 502,
      message: 'The AI returned an unreadable response. Please try again.',
    });
  });

  it('maps a refusal to 502', () => {
    expect(mapError(new RefusalError('cyber'))).toEqual({
      status: 502,
      message: 'The AI declined to process this code.',
    });
  });

  it('maps an authentication failure to 500 without hinting at the key', () => {
    const mapped = mapError(new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', undefined));
    expect(mapped).toEqual({ status: 500, message: 'The server is not configured correctly.' });
    expect(mapped.message).not.toContain('x-api-key');
  });

  it('maps an upstream rate limit to 429', () => {
    expect(mapError(new Anthropic.RateLimitError(429, undefined, 'slow down', undefined))).toEqual({
      status: 429,
      message: 'The AI service is busy. Please try again shortly.',
    });
  });

  it('maps a bad request to 400', () => {
    expect(mapError(new Anthropic.BadRequestError(400, undefined, 'bad', undefined))).toEqual({
      status: 400,
      message: 'That request could not be processed.',
    });
  });

  it('maps any other API error to 502', () => {
    expect(mapError(new Anthropic.InternalServerError(500, undefined, 'boom', undefined))).toEqual({
      status: 502,
      message: 'The AI service failed to respond.',
    });
  });

  it('maps an unrecognised throw to 500', () => {
    expect(mapError(new Error('something odd'))).toEqual({
      status: 500,
      message: 'Something went wrong.',
    });
  });

  it('never returns the original message to the client', () => {
    expect(mapError(new Error('connection to 10.0.0.4 refused')).message).not.toContain('10.0.0.4');
  });
});
```

If the installed SDK's error constructors take different arguments, check `node_modules/@anthropic-ai/sdk/error.d.ts` and adjust the construction only — the assertions about `mapError`'s behaviour do not change.

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -w backend -- errors`
Expected: FAIL — cannot resolve `./errors`.

- [ ] **Step 7: Write `backend/src/errors.ts`**

Order matters: every Anthropic error class extends `APIError`, so the specific classes must be checked first.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { RefusalError, UnreadableResponseError } from './services/claude';

export interface MappedError {
  status: number;
  message: string;
}

/**
 * Translates anything thrown while handling a request into a status code and a message
 * that is safe to send to the browser. Internal detail stays in the server log.
 */
export function mapError(error: unknown): MappedError {
  if (error instanceof UnreadableResponseError) {
    return { status: 502, message: 'The AI returned an unreadable response. Please try again.' };
  }
  if (error instanceof RefusalError) {
    return { status: 502, message: 'The AI declined to process this code.' };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 500, message: 'The server is not configured correctly.' };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: 'The AI service is busy. Please try again shortly.' };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { status: 400, message: 'That request could not be processed.' };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, message: 'The AI service failed to respond.' };
  }
  return { status: 500, message: 'Something went wrong.' };
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm test -w backend -- errors`
Expected: PASS, 8 tests.

- [ ] **Step 9: Write the failing route test**

Create `backend/src/routes/optimize.test.ts`:

```typescript
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
        throw new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', undefined);
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
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npm test -w backend -- optimize`
Expected: FAIL — `createApp` takes one argument, not two.

- [ ] **Step 11: Write `backend/src/routes/optimize.ts`**

Validation runs before the rate limit check so a malformed request cannot burn the budget.

```typescript
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
```

- [ ] **Step 12: Modify `backend/src/app.ts` to mount the router**

Replace the whole file:

```typescript
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
```

- [ ] **Step 13: Modify `backend/src/app.test.ts` for the new signature**

Add the stub optimizer and pass it in. Change the two `createApp(config)` calls to `createApp(config, stubOptimizer)` and add near the top, after the `config` constant:

```typescript
import type { CodeOptimizer } from './services/claude';

const stubOptimizer: CodeOptimizer = {
  optimize: async () => {
    throw new Error('not used by health tests');
  },
};
```

- [ ] **Step 14: Modify `backend/src/index.ts` to build the optimizer**

Replace the last three lines:

```typescript
import { createApp } from './app';
import { loadConfig, type AppConfig } from './config';
import { createCodeOptimizer } from './services/claude';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(`\n✖ ${(error as Error).message}\n`);
  process.exit(1);
}

const app = createApp(config, createCodeOptimizer(config));
app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (model: ${config.model})`);
});
```

- [ ] **Step 15: Run the whole backend suite**

Run: `npm test -w backend`
Expected: PASS — 9 from Tasks 2–3, 6 from Task 4, 4 + 8 + 12 from this task.

- [ ] **Step 16: Typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors.

- [ ] **Step 17: Commit**

```bash
git add backend
git commit -m "feat(backend): add the optimize endpoint with validation and error mapping"
```

---

## Task 6: Frontend scaffold and dark shell

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: the running backend on port 3001 (via the dev proxy).
- Produces: a booting Vite app, the `@code-optimizer/shared` Vite alias, and the `/api` proxy that every later frontend task relies on.

There is no test in this task. Its deliverable is a dev server that renders a dark page and proxies `/api`, which is verified by running it.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "@code-optimizer/frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@code-optimizer/shared": "*",
    "@codemirror/lang-javascript": "^6.2.2",
    "@codemirror/lang-php": "^6.0.1",
    "@codemirror/lang-python": "^6.1.6",
    "@codemirror/lang-sql": "^6.8.0",
    "@codemirror/state": "^6.5.0",
    "@codemirror/theme-one-dark": "^6.1.2",
    "@codemirror/view": "^6.35.0",
    "@uiw/react-codemirror": "^4.23.7",
    "diff": "^5.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/diff": "^5.2.3",
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `frontend/vite.config.ts`**

The alias is what makes the shared package work inside Vite without a build step. The generous proxy timeouts matter: an optimization can take 90 seconds, and the default would cut it off.

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@code-optimizer/shared': fileURLToPath(new URL('../shared/src/schema.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 180_000,
        proxyTimeout: 180_000,
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en" class="h-full">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>AI Code Optimizer</title>
  </head>
  <body class="h-full">
    <div id="root" class="h-full"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `frontend/src/index.css`**

Tailwind v4 is configured here rather than in a JS config file. Dark is not a variant — it is the only palette.

```css
@import "tailwindcss";

@theme {
  --color-ink: #0b0f17;
  --color-panel: #111827;
  --color-edge: #1f2937;
  --color-muted: #94a3b8;
  --color-accent: #38bdf8;
}

html,
body,
#root {
  height: 100%;
}

body {
  background-color: var(--color-ink);
  color: #e5e7eb;
  -webkit-font-smoothing: antialiased;
}

/* Diff line tints, applied by the decorations built in Task 10. */
.cm-diff-added {
  background-color: rgb(34 197 94 / 0.14);
}
.cm-diff-removed {
  background-color: rgb(248 113 113 / 0.14);
}
```

- [ ] **Step 6: Create `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create `frontend/src/App.tsx`**

A shell for now. Tasks 7, 8, 11 and 13 fill it in.

```tsx
export default function App() {
  return (
    <div className="min-h-full bg-ink">
      <header className="border-b border-edge bg-panel/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span aria-hidden className="text-xl">⚡</span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">AI Code Optimizer</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-muted">Paste code, pick a language, and optimize.</p>
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Install and run**

Run: `npm install`
Run: `npm run dev -w frontend`
Expected: Vite starts on `http://localhost:5173` and the page renders a dark header. Confirm in the browser, then stop the server.

- [ ] **Step 9: Verify the proxy**

With the backend running (`npm start -w backend`, key present) and Vite running, in a third terminal:

Run: `curl -s http://localhost:5173/api/health`
Expected: `{"status":"ok"}`. This proves the proxy works, which every later task depends on.

- [ ] **Step 10: Commit**

```bash
git add frontend package-lock.json
git commit -m "feat(frontend): scaffold the Vite app with the dark shell and API proxy"
```

---

## Task 7: Language selection and the code editor

**Files:**
- Create: `frontend/src/lib/languages.ts`
- Create: `frontend/src/lib/codemirror.ts`
- Create: `frontend/src/components/LanguageSelect.tsx`
- Create: `frontend/src/components/CodeInput.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/lib/languages.test.ts`

**Interfaces:**
- Consumes: `Language`, `LANGUAGES`, `MAX_CODE_CHARS` from `@code-optimizer/shared`.
- Produces: `LANGUAGE_LABELS`, `FILE_EXTENSIONS`, `downloadFileName(language)` from `lib/languages`; `codeMirrorLanguage(language, code)` from `lib/codemirror`; the `LanguageSelect` and `CodeInput` components. Task 12 uses `downloadFileName`; Task 10 uses `codeMirrorLanguage`.

`languages.ts` and `codemirror.ts` are separate files on purpose: the first is pure and tested in a Node environment, the second imports CodeMirror and is verified by running the app.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/languages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { LANGUAGES } from '@code-optimizer/shared';
import { FILE_EXTENSIONS, LANGUAGE_LABELS, downloadFileName } from './languages';

describe('language metadata', () => {
  it('has a label for every supported language', () => {
    for (const language of LANGUAGES) {
      expect(LANGUAGE_LABELS[language]).toBeTruthy();
    }
  });

  it('has an extension for every supported language', () => {
    for (const language of LANGUAGES) {
      expect(FILE_EXTENSIONS[language]).toBeTruthy();
    }
  });

  it('uses the documented download names', () => {
    expect(downloadFileName('php')).toBe('optimized.php');
    expect(downloadFileName('javascript')).toBe('optimized.js');
    expect(downloadFileName('typescript')).toBe('optimized.ts');
    expect(downloadFileName('python')).toBe('optimized.py');
    expect(downloadFileName('sql')).toBe('optimized.sql');
    expect(downloadFileName('blade')).toBe('optimized.blade.php');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w frontend`
Expected: FAIL — cannot resolve `./languages`.

- [ ] **Step 3: Write `frontend/src/lib/languages.ts`**

```typescript
import type { Language } from '@code-optimizer/shared';

export const LANGUAGE_LABELS: Record<Language, string> = {
  php: 'PHP',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  sql: 'SQL',
  blade: 'Laravel Blade',
};

export const FILE_EXTENSIONS: Record<Language, string> = {
  php: 'php',
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  sql: 'sql',
  blade: 'blade.php',
};

export function downloadFileName(language: Language): string {
  return `optimized.${FILE_EXTENSIONS[language]}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w frontend`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write `frontend/src/lib/codemirror.ts`**

The PHP case is the interesting one: `php({ plain: true })` starts the parser in PHP mode, which is what a pasted snippet without an opening tag needs. Blade is HTML-first, so it always uses the default.

```typescript
import { javascript } from '@codemirror/lang-javascript';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import type { Extension } from '@codemirror/state';
import type { Language } from '@code-optimizer/shared';

export function codeMirrorLanguage(language: Language, code: string): Extension {
  switch (language) {
    case 'javascript':
      return javascript();
    case 'typescript':
      return javascript({ typescript: true });
    case 'python':
      return python();
    case 'sql':
      return sql();
    case 'blade':
      return php();
    case 'php':
      return php({ plain: !code.includes('<?') });
  }
}
```

- [ ] **Step 6: Write `frontend/src/components/LanguageSelect.tsx`**

```tsx
import { LANGUAGES, type Language } from '@code-optimizer/shared';
import { LANGUAGE_LABELS } from '../lib/languages';

interface LanguageSelectProps {
  value: Language;
  onChange: (language: Language) => void;
  disabled?: boolean;
}

export default function LanguageSelect({ value, onChange, disabled }: LanguageSelectProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only sm:not-sr-only">Language</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as Language)}
        className="rounded-md border border-edge bg-panel px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-accent disabled:opacity-50"
      >
        {LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {LANGUAGE_LABELS[language]}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 7: Write `frontend/src/components/CodeInput.tsx`**

The counter turns amber at 90% of the cap and red past it, so hitting the limit is never a surprise.

```tsx
import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { MAX_CODE_CHARS, type Language } from '@code-optimizer/shared';
import { codeMirrorLanguage } from '../lib/codemirror';

interface CodeInputProps {
  value: string;
  language: Language;
  onChange: (code: string) => void;
  disabled?: boolean;
}

export default function CodeInput({ value, language, onChange, disabled }: CodeInputProps) {
  const hasOpenTag = value.includes('<?');
  const extensions = useMemo(
    () => [codeMirrorLanguage(language, hasOpenTag ? '<?php' : '')],
    [language, hasOpenTag],
  );

  const overLimit = value.length > MAX_CODE_CHARS;
  const nearLimit = !overLimit && value.length > MAX_CODE_CHARS * 0.9;

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-panel">
      <CodeMirror
        value={value}
        height="360px"
        theme={oneDark}
        extensions={extensions}
        editable={!disabled}
        onChange={onChange}
        placeholder="Paste your code here…"
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !disabled }}
      />
      <div className="flex items-center justify-between border-t border-edge px-3 py-2 text-xs">
        <span
          className={
            overLimit ? 'text-red-400' : nearLimit ? 'text-amber-400' : 'text-muted'
          }
        >
          {value.length.toLocaleString('en-US')} / {MAX_CODE_CHARS.toLocaleString('en-US')} characters
        </span>
      </div>
    </div>
  );
}
```

The `useMemo` dependency is the `hasOpenTag` boolean rather than `value`, so the editor is not reconfigured on every keystroke.

- [ ] **Step 8: Modify `frontend/src/App.tsx` to wire them up**

Replace the `<main>` block and add the imports and state:

```tsx
import { useState } from 'react';
import type { Language } from '@code-optimizer/shared';
import CodeInput from './components/CodeInput';
import LanguageSelect from './components/LanguageSelect';

export default function App() {
  const [language, setLanguage] = useState<Language>('typescript');
  const [code, setCode] = useState('');

  return (
    <div className="min-h-full bg-ink">
      <header className="border-b border-edge bg-panel/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span aria-hidden className="text-xl">⚡</span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">AI Code Optimizer</h1>
          <div className="ml-auto">
            <LanguageSelect value={language} onChange={setLanguage} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <CodeInput value={code} language={language} onChange={setCode} />
      </main>
    </div>
  );
}
```

- [ ] **Step 9: Verify in the browser**

Run: `npm run dev -w frontend`
Expected: the editor renders dark with line numbers; switching the language re-highlights; pasting PHP with and without `<?php` both highlight sensibly; the character counter updates as you type.

- [ ] **Step 10: Typecheck and commit**

Run: `npm run typecheck -w frontend`

```bash
git add frontend/src
git commit -m "feat(frontend): add the language selector and code editor"
```

---

## Task 8: API client, request state machine, loading and error UI

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/hooks/useOptimize.ts`
- Create: `frontend/src/components/OptimizeButton.tsx`
- Create: `frontend/src/components/ErrorBanner.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `OptimizationResultSchema`, `Language`, `OptimizationResult` from `@code-optimizer/shared`.
- Produces: `optimizeCode(language, code, signal?)` and `ApiError` from `api/client`; `useOptimize()` returning `{ status, result, error, elapsedSeconds, statusMessage, run, reset }`. Tasks 11–13 consume the hook's return value.

- [ ] **Step 1: Write `frontend/src/api/client.ts`**

The response is re-validated with the same schema the backend used. That is not redundant: it catches a proxy or middleware mangling the body, and it means every component downstream can trust its props.

```typescript
import {
  OptimizationResultSchema,
  type Language,
  type OptimizationResult,
} from '@code-optimizer/shared';

/** An error whose message is safe to show the user. */
export class ApiError extends Error {}

export async function optimizeCode(
  language: Language,
  code: string,
  signal?: AbortSignal,
): Promise<OptimizationResult> {
  let response: Response;
  try {
    response = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, code }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Is the backend running?');
  }

  if (!response.ok) {
    let message = 'The server returned an unexpected error.';
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
        message = (body as { error: string }).error;
      }
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new ApiError(message);
  }

  const parsed = OptimizationResultSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError('The server returned a result this app could not read.');
  }
  return parsed.data;
}
```

- [ ] **Step 2: Write `frontend/src/hooks/useOptimize.ts`**

The elapsed counter and rotating copy exist because the wait is 30–90 seconds. A static spinner for that long reads as a hung app.

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language, OptimizationResult } from '@code-optimizer/shared';
import { ApiError, optimizeCode } from '../api/client';

export type OptimizeStatus = 'idle' | 'loading' | 'success' | 'error';

const STATUS_MESSAGES = [
  'Reading your code…',
  'Looking for bugs…',
  'Checking performance…',
  'Writing the optimized version…',
  'Still working — larger files take longer…',
];
const MESSAGE_INTERVAL_SECONDS = 8;
const REQUEST_TIMEOUT_MS = 180_000;

export function useOptimize() {
  const [status, setStatus] = useState<OptimizeStatus>('idle');
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (language: Language, code: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setStatus('loading');
    setError(null);
    setResult(null);
    setElapsedSeconds(0);

    try {
      const optimization = await optimizeCode(language, code, controller.signal);
      setResult(optimization);
      setStatus('success');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        if (abortRef.current !== controller) return; // superseded by a newer request
        setError('That took too long and was cancelled. Try a smaller piece of code.');
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      }
      setStatus('error');
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setResult(null);
    setError(null);
    setElapsedSeconds(0);
  }, []);

  const messageIndex = Math.min(
    Math.floor(elapsedSeconds / MESSAGE_INTERVAL_SECONDS),
    STATUS_MESSAGES.length - 1,
  );

  return {
    status,
    result,
    error,
    elapsedSeconds,
    statusMessage: STATUS_MESSAGES[messageIndex]!,
    run,
    reset,
  };
}
```

- [ ] **Step 3: Write `frontend/src/components/OptimizeButton.tsx`**

```tsx
interface OptimizeButtonProps {
  loading: boolean;
  disabled: boolean;
  elapsedSeconds: number;
  statusMessage: string;
  onClick: () => void;
}

export default function OptimizeButton({
  loading,
  disabled,
  elapsedSeconds,
  statusMessage,
  onClick,
}: OptimizeButtonProps) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? (
          <>
            <span
              aria-hidden
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/30 border-t-ink"
            />
            Optimizing… {elapsedSeconds}s
          </>
        ) : (
          <>⚡ Optimize Code</>
        )}
      </button>
      {loading && (
        <p aria-live="polite" className="text-xs text-muted">
          {statusMessage}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `frontend/src/components/ErrorBanner.tsx`**

```tsx
interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    >
      <span aria-hidden>⚠</span>
      <p className="flex-1">{message}</p>
      <button type="button" onClick={onRetry} className="rounded border border-red-400/50 px-2.5 py-1 text-xs hover:bg-red-500/20">
        Retry
      </button>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="px-1 text-red-300 hover:text-red-100">
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Modify `frontend/src/App.tsx` to use the hook**

Replace the `<main>` contents:

```tsx
import { useState } from 'react';
import { MAX_CODE_CHARS, type Language } from '@code-optimizer/shared';
import CodeInput from './components/CodeInput';
import ErrorBanner from './components/ErrorBanner';
import LanguageSelect from './components/LanguageSelect';
import OptimizeButton from './components/OptimizeButton';
import { useOptimize } from './hooks/useOptimize';

export default function App() {
  const [language, setLanguage] = useState<Language>('typescript');
  const [code, setCode] = useState('');
  const { status, result, error, elapsedSeconds, statusMessage, run, reset } = useOptimize();

  const loading = status === 'loading';
  const emptyCode = code.trim().length === 0;
  const tooLong = code.length > MAX_CODE_CHARS;

  return (
    <div className="min-h-full bg-ink">
      <header className="border-b border-edge bg-panel/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span aria-hidden className="text-xl">⚡</span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">AI Code Optimizer</h1>
          <div className="ml-auto">
            <LanguageSelect value={language} onChange={setLanguage} disabled={loading} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8">
        {error && <ErrorBanner message={error} onRetry={() => run(language, code)} onDismiss={reset} />}

        <CodeInput value={code} language={language} onChange={setCode} disabled={loading} />

        <div className="flex items-start justify-between gap-4">
          <p className="text-xs text-muted">
            {emptyCode
              ? 'Paste some code to get started.'
              : tooLong
                ? `That is over the ${MAX_CODE_CHARS.toLocaleString('en-US')} character limit.`
                : ' '}
          </p>
          <OptimizeButton
            loading={loading}
            disabled={emptyCode || tooLong}
            elapsedSeconds={elapsedSeconds}
            statusMessage={statusMessage}
            onClick={() => run(language, code)}
          />
        </div>

        {result && <pre className="overflow-auto rounded-lg border border-edge bg-panel p-4 text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre>}
      </main>
    </div>
  );
}
```

The raw `<pre>` dump is a temporary placeholder; Tasks 10–11 replace it.

- [ ] **Step 6: Verify end to end against the real API**

This is the first real round-trip. Make sure `backend/.env` has a key, then:

Run: `npm run dev` from the repo root.
In the browser, paste a short function, choose the matching language, press Optimize.
Expected: the button shows the elapsed counter and rotating status, and within roughly 30–90 seconds the JSON dump appears with all eight fields populated.

Also verify the failure paths: stop the backend and press Optimize (expect "Could not reach the server"), then put a deliberately invalid key in `backend/.env`, restart, and try again (expect "The server is not configured correctly.").

If the request fails with a 400 about JSON Schema, apply the contingency noted in Task 4 Step 3.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck -w frontend`

```bash
git add frontend/src
git commit -m "feat(frontend): add the API client, request state machine, and loading UI"
```

---

## Task 9: The diff engine

**Files:**
- Create: `frontend/src/lib/diff.ts`
- Test: `frontend/src/lib/diff.test.ts`

**Interfaces:**
- Consumes: the `diff` package.
- Produces: `DiffMarks` (`{ removedLines: number[]; addedLines: number[] }`) and `computeDiffMarks(original, optimized): DiffMarks`. Line numbers are 1-based; `removedLines` index into the original, `addedLines` into the optimized. Task 10 consumes both.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/diff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeDiffMarks } from './diff';

describe('computeDiffMarks', () => {
  it('marks nothing when the texts are identical', () => {
    const text = 'a\nb\nc';
    expect(computeDiffMarks(text, text)).toEqual({ removedLines: [], addedLines: [] });
  });

  it('marks a changed line on both sides', () => {
    expect(computeDiffMarks('a\nb\nc', 'a\nB\nc')).toEqual({
      removedLines: [2],
      addedLines: [2],
    });
  });

  it('marks a pure insertion on the right only', () => {
    expect(computeDiffMarks('a\nc', 'a\nb\nc')).toEqual({
      removedLines: [],
      addedLines: [2],
    });
  });

  it('marks a pure deletion on the left only', () => {
    expect(computeDiffMarks('a\nb\nc', 'a\nc')).toEqual({
      removedLines: [2],
      addedLines: [],
    });
  });

  it('keeps the two sides independently numbered when lengths differ', () => {
    const marks = computeDiffMarks('a\nb\nc\nd', 'a\nX\nY\nZ\nc\nd');
    expect(marks.removedLines).toEqual([2]);
    expect(marks.addedLines).toEqual([2, 3, 4]);
  });

  it('marks everything when the whole text is replaced', () => {
    expect(computeDiffMarks('a\nb', 'x\ny\nz')).toEqual({
      removedLines: [1, 2],
      addedLines: [1, 2, 3],
    });
  });

  it('handles an empty original', () => {
    expect(computeDiffMarks('', 'a\nb')).toEqual({ removedLines: [], addedLines: [1, 2] });
  });

  it('returns ascending line numbers', () => {
    const marks = computeDiffMarks('a\nb\nc\nd\ne', 'a\nB\nc\nD\ne');
    expect(marks.removedLines).toEqual([...marks.removedLines].sort((x, y) => x - y));
    expect(marks.addedLines).toEqual([...marks.addedLines].sort((x, y) => x - y));
  });
});
```

The "empty original" case expects `removedLines: []` — if jsdiff reports a single empty removed line, adjust the implementation to skip zero-length chunks rather than changing the expectation.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w frontend`
Expected: FAIL — cannot resolve `./diff`.

- [ ] **Step 3: Write `frontend/src/lib/diff.ts`**

Walking the two cursors independently is what keeps the left and right numbering correct when the files differ in length.

```typescript
import { diffLines } from 'diff';

export interface DiffMarks {
  /** 1-based line numbers in the original that were removed or changed. */
  removedLines: number[];
  /** 1-based line numbers in the optimized text that were added or changed. */
  addedLines: number[];
}

export function computeDiffMarks(original: string, optimized: string): DiffMarks {
  const removedLines: number[] = [];
  const addedLines: number[] = [];

  let originalLine = 1;
  let optimizedLine = 1;

  for (const part of diffLines(original, optimized)) {
    const lineCount = part.count ?? 0;
    if (lineCount === 0) continue;

    if (part.added) {
      for (let offset = 0; offset < lineCount; offset += 1) {
        addedLines.push(optimizedLine + offset);
      }
      optimizedLine += lineCount;
    } else if (part.removed) {
      for (let offset = 0; offset < lineCount; offset += 1) {
        removedLines.push(originalLine + offset);
      }
      originalLine += lineCount;
    } else {
      originalLine += lineCount;
      optimizedLine += lineCount;
    }
  }

  return { removedLines, addedLines };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w frontend`
Expected: PASS, 11 tests (3 from Task 7, 8 here).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/diff.ts frontend/src/lib/diff.test.ts
git commit -m "feat(frontend): add line-level diff computation"
```

---

## Task 10: The diff view

**Files:**
- Create: `frontend/src/lib/diffDecorations.ts`
- Create: `frontend/src/components/DiffView.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `computeDiffMarks` (Task 9), `codeMirrorLanguage` (Task 7), the `.cm-diff-added` / `.cm-diff-removed` CSS classes (Task 6).
- Produces: `diffLineDecorations(lines, className): Extension` and the `DiffView` component taking `{ original, optimized, language }`.

- [ ] **Step 1: Write `frontend/src/lib/diffDecorations.ts`**

Both panes are read-only and their documents are set once, so the decoration set can be built in `create` and returned unchanged from `update`. `RangeSetBuilder` requires ascending positions, which `computeDiffMarks` already guarantees.

```typescript
import { RangeSetBuilder, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

/** Tints whole lines. `lines` must be 1-based and ascending. */
export function diffLineDecorations(lines: number[], className: string): Extension {
  const lineDecoration = Decoration.line({ class: className });

  return StateField.define<DecorationSet>({
    create(state) {
      const builder = new RangeSetBuilder<Decoration>();
      for (const lineNumber of lines) {
        if (lineNumber < 1 || lineNumber > state.doc.lines) continue;
        builder.add(state.doc.line(lineNumber).from, state.doc.line(lineNumber).from, lineDecoration);
      }
      return builder.finish();
    },
    update(value) {
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
```

- [ ] **Step 2: Write `frontend/src/components/DiffView.tsx`**

Scroll sync uses a guard flag so the two `scroll` handlers cannot drive each other in a loop. Below `md` the panes become tabs — two 40-column code panes side by side on a phone are unreadable.

```tsx
import { useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import type { Language } from '@code-optimizer/shared';
import { codeMirrorLanguage } from '../lib/codemirror';
import { computeDiffMarks } from '../lib/diff';
import { diffLineDecorations } from '../lib/diffDecorations';

interface DiffViewProps {
  original: string;
  optimized: string;
  language: Language;
}

export default function DiffView({ original, optimized, language }: DiffViewProps) {
  const [mobilePane, setMobilePane] = useState<'original' | 'optimized'>('optimized');
  const leftView = useRef<EditorView | null>(null);
  const rightView = useRef<EditorView | null>(null);
  const syncing = useRef(false);

  const marks = useMemo(() => computeDiffMarks(original, optimized), [original, optimized]);

  const leftExtensions = useMemo(
    () => [
      codeMirrorLanguage(language, original),
      diffLineDecorations(marks.removedLines, 'cm-diff-removed'),
      EditorView.editable.of(false),
    ],
    [language, original, marks.removedLines],
  );

  const rightExtensions = useMemo(
    () => [
      codeMirrorLanguage(language, optimized),
      diffLineDecorations(marks.addedLines, 'cm-diff-added'),
      EditorView.editable.of(false),
    ],
    [language, optimized, marks.addedLines],
  );

  function link(source: EditorView | null, target: EditorView | null) {
    if (!source || !target) return;
    source.scrollDOM.addEventListener('scroll', () => {
      if (syncing.current) return;
      syncing.current = true;
      target.scrollDOM.scrollTop = source.scrollDOM.scrollTop;
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    });
  }

  const pane = (side: 'original' | 'optimized') => {
    const isLeft = side === 'original';
    return (
      <div className={`min-w-0 flex-1 ${isLeft ? 'md:border-r md:border-edge' : ''} ${mobilePane === side ? '' : 'hidden md:block'}`}>
        <div className="hidden border-b border-edge px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted md:block">
          {isLeft ? 'Original' : 'Optimized'}
        </div>
        <CodeMirror
          value={isLeft ? original : optimized}
          height="480px"
          theme={oneDark}
          editable={false}
          extensions={isLeft ? leftExtensions : rightExtensions}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
          onCreateEditor={(view) => {
            if (isLeft) {
              leftView.current = view;
              link(view, rightView.current);
              link(rightView.current, view);
            } else {
              rightView.current = view;
              link(view, leftView.current);
              link(leftView.current, view);
            }
          }}
        />
      </div>
    );
  };

  return (
    <section className="overflow-hidden rounded-lg border border-edge bg-panel">
      <div className="flex border-b border-edge md:hidden" role="tablist">
        {(['original', 'optimized'] as const).map((side) => (
          <button
            key={side}
            type="button"
            role="tab"
            aria-selected={mobilePane === side}
            onClick={() => setMobilePane(side)}
            className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
              mobilePane === side ? 'bg-edge text-slate-100' : 'text-muted'
            }`}
          >
            {side}
          </button>
        ))}
      </div>
      <div className="flex flex-col md:flex-row">
        {pane('original')}
        {pane('optimized')}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render it from `App.tsx`**

Replace the temporary `<pre>` dump with:

```tsx
{result && <DiffView original={code} optimized={result.optimized_code} language={language} />}
```

and add `import DiffView from './components/DiffView';`.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev` from the root, optimize a function with obvious flaws.
Expected: changed lines tint red on the left and green on the right; scrolling either pane moves the other; narrowing the window below 768px switches to tabs.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck -w frontend`

```bash
git add frontend/src
git commit -m "feat(frontend): add the side-by-side diff view"
```

---

## Task 11: Score, issues, bugs, and explanations

**Files:**
- Create: `frontend/src/components/QualityScore.tsx`
- Create: `frontend/src/components/SeverityChip.tsx`
- Create: `frontend/src/components/IssueCard.tsx`
- Create: `frontend/src/components/BugWarning.tsx`
- Create: `frontend/src/components/ChangeList.tsx`
- Create: `frontend/src/components/ResultsPanel.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `OptimizationResult`, `Issue`, `Bug`, `Change`, `Severity` from `@code-optimizer/shared`; `DiffView` (Task 10).
- Produces: `ResultsPanel` taking `{ result, original, language, actions }`, where `actions` is a `ReactNode` slot filled by Task 12.

- [ ] **Step 1: Write `frontend/src/components/SeverityChip.tsx`**

```tsx
import type { Severity } from '@code-optimizer/shared';

const STYLES: Record<Severity, string> = {
  low: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  high: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export default function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STYLES[severity]}`}>
      {severity}
    </span>
  );
}
```

- [ ] **Step 2: Write `frontend/src/components/QualityScore.tsx`**

The band thresholds mirror the ones the prompt gives Claude in Task 3, so the colour and the model's own rubric agree.

```tsx
interface QualityScoreProps {
  score: number;
  summary: string;
  noOptimizationNeeded: boolean;
  issueCount: number;
  improvementCount: number;
  bugCount: number;
}

function band(score: number): string {
  if (score >= 85) return 'text-emerald-400 border-emerald-500/40';
  if (score >= 60) return 'text-amber-400 border-amber-500/40';
  return 'text-red-400 border-red-500/40';
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export default function QualityScore({
  score,
  summary,
  noOptimizationNeeded,
  issueCount,
  improvementCount,
  bugCount,
}: QualityScoreProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border-2 ${band(score)}`}>
        <span className="text-2xl font-bold leading-none">{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted">/ 100</span>
      </div>
      <div className="min-w-0">
        {noOptimizationNeeded && (
          <p className="mb-1 inline-block rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            ✓ No changes needed
          </p>
        )}
        <p className="text-xs text-muted">
          {plural(issueCount, 'issue')} · {plural(improvementCount, 'performance win')} · {plural(bugCount, 'potential bug')}
        </p>
        <p className="mt-1 text-sm text-slate-200">{summary}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `frontend/src/components/IssueCard.tsx`**

```tsx
import type { Issue } from '@code-optimizer/shared';
import SeverityChip from './SeverityChip';

export default function IssueCard({ issue }: { issue: Issue }) {
  return (
    <li className="rounded-lg border border-edge bg-ink/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={issue.severity} />
        <h4 className="text-sm font-semibold text-slate-100">{issue.title}</h4>
        <span className="ml-auto text-xs text-muted">line {issue.line_reference}</span>
      </div>
      <p className="mt-1.5 text-sm text-slate-300">{issue.description}</p>
    </li>
  );
}
```

- [ ] **Step 4: Write `frontend/src/components/BugWarning.tsx`**

Styled more urgently than an issue: a potential bug is the one thing in this report a developer must not scroll past.

```tsx
import type { Bug } from '@code-optimizer/shared';
import SeverityChip from './SeverityChip';

export default function BugWarning({ bug }: { bug: Bug }) {
  return (
    <li className="rounded-lg border border-red-500/30 bg-red-500/[0.07] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden>⚠</span>
        <SeverityChip severity={bug.severity} />
        <h4 className="text-sm font-semibold text-slate-100">{bug.title}</h4>
      </div>
      <p className="mt-1.5 text-sm text-slate-300">{bug.description}</p>
    </li>
  );
}
```

- [ ] **Step 5: Write `frontend/src/components/ChangeList.tsx`**

```tsx
import type { Change } from '@code-optimizer/shared';

export default function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {changes.map((change, index) => (
        <li key={index} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge text-[10px] text-muted">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">{change.change}</p>
            <p className="text-sm text-muted">{change.why}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 6: Write `frontend/src/components/ResultsPanel.tsx`**

Sections with no entries are omitted rather than rendered empty — an empty "Potential bugs" heading reads as an unfinished UI, not as good news.

```tsx
import type { ReactNode } from 'react';
import type { Language, OptimizationResult, Severity } from '@code-optimizer/shared';
import BugWarning from './BugWarning';
import ChangeList from './ChangeList';
import DiffView from './DiffView';
import IssueCard from './IssueCard';
import QualityScore from './QualityScore';

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

interface ResultsPanelProps {
  result: OptimizationResult;
  original: string;
  language: Language;
  actions: ReactNode;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-edge bg-panel p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </section>
  );
}

export default function ResultsPanel({ result, original, language, actions }: ResultsPanelProps) {
  const issues = [...result.issues_found].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const bugs = [...result.potential_bugs].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg border border-edge bg-panel p-4 lg:flex-row lg:items-center lg:justify-between">
        <QualityScore
          score={result.quality_score}
          summary={result.summary}
          noOptimizationNeeded={result.no_optimization_needed}
          issueCount={result.issues_found.length}
          improvementCount={result.performance_improvements.length}
          bugCount={result.potential_bugs.length}
        />
        <div className="shrink-0">{actions}</div>
      </div>

      <DiffView original={original} optimized={result.optimized_code} language={language} />

      {bugs.length > 0 && (
        <Section title="⚠ Potential bugs">
          <ul className="flex flex-col gap-2">
            {bugs.map((bug, index) => (
              <BugWarning key={index} bug={bug} />
            ))}
          </ul>
        </Section>
      )}

      {issues.length > 0 && (
        <Section title="Issues found">
          <ul className="flex flex-col gap-2">
            {issues.map((issue, index) => (
              <IssueCard key={index} issue={issue} />
            ))}
          </ul>
        </Section>
      )}

      {result.performance_improvements.length > 0 && (
        <Section title="Performance improvements">
          <ul className="flex flex-col gap-2">
            {result.performance_improvements.map((improvement, index) => (
              <li key={index} className="rounded-lg border border-edge bg-ink/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-100">{improvement.title}</h4>
                  <span className="ml-auto text-xs text-emerald-300">{improvement.impact}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-300">{improvement.description}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.explanation_of_changes.length > 0 && (
        <Section title="What changed and why">
          <ChangeList changes={result.explanation_of_changes} />
        </Section>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Render it from `App.tsx`**

Replace the `DiffView` line from Task 10 with:

```tsx
{result && <ResultsPanel result={result} original={code} language={language} actions={null} />}
```

Swap the `DiffView` import for `import ResultsPanel from './components/ResultsPanel';`.

- [ ] **Step 8: Verify in the browser**

Run: `npm run dev`, optimize code with a real bug in it.
Expected: score banded by colour, bugs first and sorted high→low, empty sections absent. Then optimize a clean, well-written function and confirm the "✓ No changes needed" badge appears with the diff showing no marked lines.

- [ ] **Step 9: Typecheck and commit**

Run: `npm run typecheck -w frontend`

```bash
git add frontend/src
git commit -m "feat(frontend): add score, issue, bug, and explanation panels"
```

---

## Task 12: Copy and download

**Files:**
- Create: `frontend/src/components/ResultActions.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `downloadFileName` (Task 7), the `actions` slot on `ResultsPanel` (Task 11).
- Produces: `ResultActions` taking `{ code, language }`.

- [ ] **Step 1: Write `frontend/src/components/ResultActions.tsx`**

`navigator.clipboard` is unavailable on insecure non-localhost origins, so the failure is handled rather than swallowed.

```tsx
import { useEffect, useState } from 'react';
import type { Language } from '@code-optimizer/shared';
import { downloadFileName } from '../lib/languages';

interface ResultActionsProps {
  code: string;
  language: Language;
}

export default function ResultActions({ code, language }: ResultActionsProps) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  function download() {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFileName(language);
    link.click();
    URL.revokeObjectURL(url);
  }

  const buttonClass =
    'rounded-md border border-edge bg-ink px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-accent hover:text-accent';

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={copy} className={buttonClass}>
        {copied === 'done' ? '✓ Copied' : copied === 'failed' ? 'Copy failed' : 'Copy'}
      </button>
      <button type="button" onClick={download} className={buttonClass}>
        Download
      </button>
      <span aria-live="polite" className="sr-only">
        {copied === 'done' ? 'Optimized code copied to clipboard' : ''}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Fill the actions slot in `App.tsx`**

```tsx
{result && (
  <ResultsPanel
    result={result}
    original={code}
    language={language}
    actions={<ResultActions code={result.optimized_code} language={language} />}
  />
)}
```

Add `import ResultActions from './components/ResultActions';`.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, optimize something, then press Copy and paste elsewhere; press Download.
Expected: the clipboard holds the optimized code and the button confirms for two seconds; the download lands as `optimized.<ext>` matching the selected language — check `blade` gives `optimized.blade.php`.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck -w frontend`

```bash
git add frontend/src
git commit -m "feat(frontend): add copy and download actions"
```

---

## Task 13: Input collapse, responsive pass, README, and the real run

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `README.md`

**Interfaces:**
- Consumes: everything built so far.
- Produces: the finished application and its setup documentation.

- [ ] **Step 1: Collapse the input zone once results exist**

Replace `frontend/src/App.tsx` entirely. The change from Task 12 is the `resultsShown` branch: after a result arrives the editor collapses to a one-line summary with an Edit button, so the results own the screen.

```tsx
import { useState } from 'react';
import { MAX_CODE_CHARS, type Language } from '@code-optimizer/shared';
import CodeInput from './components/CodeInput';
import ErrorBanner from './components/ErrorBanner';
import LanguageSelect from './components/LanguageSelect';
import OptimizeButton from './components/OptimizeButton';
import ResultActions from './components/ResultActions';
import ResultsPanel from './components/ResultsPanel';
import { LANGUAGE_LABELS } from './lib/languages';
import { useOptimize } from './hooks/useOptimize';

export default function App() {
  const [language, setLanguage] = useState<Language>('typescript');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(true);
  const { status, result, error, elapsedSeconds, statusMessage, run, reset } = useOptimize();

  const loading = status === 'loading';
  const emptyCode = code.trim().length === 0;
  const tooLong = code.length > MAX_CODE_CHARS;
  const collapsed = Boolean(result) && !editing;

  function optimize() {
    setEditing(false);
    void run(language, code);
  }

  function startOver() {
    setEditing(true);
    reset();
  }

  return (
    <div className="min-h-full bg-ink">
      <header className="sticky top-0 z-10 border-b border-edge bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span aria-hidden className="text-xl">⚡</span>
          <h1 className="truncate text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
            AI Code Optimizer
          </h1>
          <div className="ml-auto">
            <LanguageSelect value={language} onChange={setLanguage} disabled={loading} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:py-8">
        {error && <ErrorBanner message={error} onRetry={() => run(language, code)} onDismiss={reset} />}

        {collapsed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-3 text-sm">
            <span className="text-muted">
              {LANGUAGE_LABELS[language]} · {code.length.toLocaleString('en-US')} characters
            </span>
            <button
              type="button"
              onClick={startOver}
              className="ml-auto rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-accent hover:text-accent"
            >
              Edit code
            </button>
          </div>
        ) : (
          <>
            <CodeInput value={code} language={language} onChange={setCode} disabled={loading} />
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-xs text-muted">
                {emptyCode
                  ? 'Paste some code to get started.'
                  : tooLong
                    ? `That is over the ${MAX_CODE_CHARS.toLocaleString('en-US')} character limit.`
                    : ' '}
              </p>
              <OptimizeButton
                loading={loading}
                disabled={emptyCode || tooLong}
                elapsedSeconds={elapsedSeconds}
                statusMessage={statusMessage}
                onClick={optimize}
              />
            </div>
          </>
        )}

        {result && (
          <ResultsPanel
            result={result}
            original={code}
            language={language}
            actions={<ResultActions code={result.optimized_code} language={language} />}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test` from the repo root.
Expected: all three workspaces pass — 10 (shared) + 39 (backend) + 11 (frontend).

- [ ] **Step 3: Typecheck everything**

Run: `npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 4: Write `README.md`**

````markdown
# AI Code Optimizer

Paste code, pick a language, and get back an optimized version plus a structured
review: a quality score, the issues found, performance improvements, potential bugs,
and a plain-English explanation of every change. Powered by Claude.

Supports PHP, JavaScript, TypeScript, Python, SQL, and Laravel Blade.

## Requirements

- Node.js 20 or newer
- An Anthropic API key — create one at https://console.anthropic.com/settings/keys

## Setup

```bash
git clone <this repo>
cd code-optimizer
npm install

cp backend/.env.example backend/.env
# open backend/.env and paste your key into ANTHROPIC_API_KEY

npm run dev
```

Open http://localhost:5173.

`npm run dev` starts two processes: the Express API on port 3001 and the Vite dev
server on 5173. Vite proxies `/api` to the backend, so the browser only ever talks to
one origin.

## Configuration

All configuration lives in `backend/.env`. Only `.env.example` is committed; `.env` is
gitignored and your key never reaches the frontend bundle or an HTTP response.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Your Anthropic API key |
| `PORT` | no | `3001` | Backend port |
| `CLAUDE_MODEL` | no | `claude-opus-5` | Model override |
| `MAX_CODE_CHARS` | no | `60000` | Maximum accepted input size |

## Cost

Each optimization is one Claude API call and costs roughly **$0.10–$0.25** on a
200–400 line file with the default model. The backend rate-limits itself to 10
requests per 5 minutes so a runaway client cannot spend money unattended.

## Project layout

```
shared/    Zod schema — the contract between backend and frontend
backend/   Express API; the only place the API key is read
frontend/  React + Vite SPA
```

The schema in `shared/src/schema.ts` has one definition and three jobs: it constrains
Claude's output at the API level, it validates the response in Express, and the
frontend's TypeScript types are derived from it. Changing a field there changes it
everywhere.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Start the backend and frontend together |
| `npm test` | Run every workspace's tests (no API calls, no cost) |
| `npm run typecheck` | Typecheck every workspace |
| `npm run build -w frontend` | Production build of the frontend |

## How it works

1. The frontend posts `{ language, code }` to `/api/optimize`.
2. The backend validates the input, then makes one call to Claude with
   `output_config.format` set from the shared Zod schema. Structured outputs
   constrain decoding, so the response is valid against the schema by construction —
   there is no JSON parsing or repair step.
3. The result is returned, re-validated in the browser, and rendered as a line-level
   diff plus the review panels.

The system prompt instructs Claude to preserve behaviour, never invent missing
business logic, never strip security or error handling, explain every change in
simple English, and say plainly when no optimization is needed.

## Troubleshooting

**"The server is not configured correctly."** — the API key in `backend/.env` is
missing or invalid. The backend also refuses to start without one and says so.

**"Could not reach the server."** — the backend is not running. Use `npm run dev`
from the repo root rather than starting only the frontend.

**Optimizations feel slow.** — 30 to 90 seconds is expected. The model reasons about
the whole file before writing anything, and the request is deliberately not streamed
so the schema guarantee holds.
````

- [ ] **Step 5: Verify the documented setup from scratch**

Follow the README exactly in a clean clone (or `git stash` any uncommitted work and delete `node_modules`). Any step that does not work as written is a README bug — fix the README, not your memory of it.

- [ ] **Step 6: Run the real application**

Run: `npm run dev`

Walk the whole thing with the user:

1. Paste a deliberately flawed function; confirm the diff, score, bugs, issues, and explanations all render.
2. Paste clean, well-written code; confirm "✓ No changes needed" and an unmarked diff.
3. Try each of the six languages at least briefly; confirm highlighting and the download extension.
4. Press Optimize with an empty editor; confirm the button is disabled.
5. Narrow the window below 768px; confirm the diff tabs work and nothing overflows.
6. Stop the backend and press Optimize; confirm the error banner and Retry.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: collapse input on results, add README, final responsive pass"
```

---

## Self-Review

**Spec coverage.** Every numbered feature and every section of the spec maps to a task:

| Spec requirement | Task |
|---|---|
| Modern dark developer UI | 6, 11, 13 |
| Editor with syntax highlighting and line numbers | 7 |
| Six-language selector | 1 (values), 7 (UI) |
| Optimize Code button | 8 |
| Send language + code to backend | 8 |
| Backend calls Claude for structured JSON | 4 |
| All eight response fields | 1 (schema), 4 (call) |
| Side-by-side original vs optimized | 9, 10 |
| Score, issue cards, bug warnings, explanations | 11 |
| Copy and Download | 12 |
| Loading state | 8 |
| Empty-code validation | 5 (server), 8 (client) |
| API error handling | 5 (mapping), 8 (display) |
| Responsive mobile design | 10 (diff tabs), 13 (pass) |
| Six AI rules | 3 |
| Key only in backend `.env` | 2 (+ verified in 2/5) |
| Clean project structure | 1, 2, 6 |
| README with setup steps | 13 |
| `.env.example` | 2 |
| Run the app locally | 8 (first round-trip), 13 (full walkthrough) |
| Testing plan (schema, route validation, error mapping, diff) | 1, 5, 9 |

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no test described without its code. The two contingencies (the JSON Schema keyword note in Task 4 and the SDK error-constructor note in Task 5) name the exact symptom, the exact cause, and the exact fix.

**Type consistency.** `createApp` is deliberately re-signatured in Task 5, and Task 5 Step 13 updates the Task 2 test that calls it — the only intentional signature change in the plan. `CodeOptimizer.optimize`, `DiffMarks`, `AppConfig`, `MappedError`, and `downloadFileName` keep one name and one shape from the task that defines them through every consumer. Every type referenced in a later task is defined in an earlier one.
