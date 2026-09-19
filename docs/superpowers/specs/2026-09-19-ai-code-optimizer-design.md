# AI Code Optimizer — Design

**Date:** 2026-09-19
**Status:** Approved, ready for implementation planning

## Purpose

A local web application that takes a block of source code, sends it to Claude for
analysis, and returns an optimized version alongside a structured, machine-readable
review: a quality score, the issues found, performance improvements, potential bugs,
and a plain-English explanation of every change.

The user pastes code, picks a language, and presses one button. Everything else the
app does is in service of making the result readable and trustworthy.

## Constraints

- The Anthropic API key lives in `backend/.env` and is read only by the backend. It
  never appears in frontend source, in a bundle, or in an HTTP response.
- Claude's response must conform to a fixed schema. Malformed JSON is not a failure
  mode the application is permitted to have.
- The app must be usable on a phone.
- Optimization must preserve behaviour. The tool is useless — worse than useless — if
  it silently changes what the code does.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS (dark only) |
| Editor | CodeMirror 6 via `@uiw/react-codemirror` |
| Backend | Node.js + Express + TypeScript |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`), model `claude-opus-5` |
| Validation | Zod (shared between backend and frontend) |
| Tests | Vitest |

### Decisions and their reasons

**CodeMirror 6 over Monaco.** Monaco ships ~2 MB plus web workers and is clumsy on
small screens, which conflicts with the mobile requirement. CodeMirror is ~200 KB,
has first-class modes for PHP, JavaScript, TypeScript, Python and SQL, and themes
dark in one import.

**Laravel Blade uses the PHP/HTML mode.** No editor has a dedicated Blade grammar.
Blade is PHP plus HTML plus `@directives`, so the PHP mode highlights it acceptably.
The distinction that matters is in the prompt, not the editor: Claude is told the
language is Blade and instructed not to rewrite directives into raw PHP.

**Structured Outputs over prompt-only JSON.** `client.messages.parse()` with
`zodOutputFormat` constrains decoding to the schema at the API level. The alternative —
instructing Claude to "return valid JSON only" and parsing the result — makes code
fences, trailing prose, and objects truncated at `max_tokens` into application
problems, and requires a hand-written repair-and-retry layer. Forced tool use with
`strict: true` is equally safe but adds unwrapping and is on a deprecation path for
newer models.

**Non-streaming.** The `parse()` helper is what provides the schema guarantee;
streaming would require hand-rolled incremental JSON parsing and give it up. The cost
is a 30–90 second wait on a large file, which is addressed in the UI rather than by
weakening the contract.

**`claude-opus-5`.** Finding real bugs in unfamiliar code is reasoning-heavy work.
Adaptive thinking is on by default on this model. Budget roughly $0.10–$0.25 per
optimization on a 200–400 line file.

## Architecture

```
code-optimizer/
├─ package.json                  # npm workspaces; `npm run dev` starts both
├─ README.md
├─ .gitignore
├─ shared/
│  ├─ package.json
│  └─ src/schema.ts              # Zod schema + Language enum — the contract
├─ backend/
│  ├─ package.json
│  ├─ .env                       # gitignored
│  ├─ .env.example
│  └─ src/
│     ├─ index.ts                # express app + listen
│     ├─ config.ts               # env parsing, fails at boot if invalid
│     ├─ prompt.ts               # system prompt
│     ├─ routes/optimize.ts      # validation → service → response mapping
│     └─ services/claude.ts      # the only module that touches the SDK
└─ frontend/
   ├─ package.json
   ├─ vite.config.ts             # proxies /api → http://localhost:3001
   ├─ tailwind.config.js
   └─ src/
      ├─ main.tsx
      ├─ App.tsx
      ├─ api/client.ts
      ├─ hooks/useOptimize.ts
      └─ components/
         ├─ CodeInput.tsx
         ├─ LanguageSelect.tsx
         ├─ DiffView.tsx
         ├─ QualityScore.tsx
         ├─ IssueCard.tsx
         ├─ BugWarning.tsx
         ├─ ChangeList.tsx
         └─ ResultActions.tsx
```

### Data flow

1. `CodeInput` and `LanguageSelect` hold the user's code and language choice in `App`.
2. Pressing Optimize calls `useOptimize`, which manages an
   `idle | loading | error | success` state machine.
3. `api/client.ts` issues `POST /api/optimize` with `{ language, code }`.
4. Vite's dev proxy forwards `/api` to Express on port 3001.
5. `routes/optimize.ts` validates the request and calls `services/claude.ts`.
6. `services/claude.ts` makes one schema-constrained call to Claude.
7. The validated result returns to the browser and the results view renders.

### Process model

Two processes in development: Vite on 5173, Express on 3001. The root `npm run dev`
starts both with `concurrently`. Because Vite proxies `/api`, the browser only ever
talks to one origin, so there is no CORS configuration and no way for a frontend build
to reference the backend's address or its key.

The `shared` workspace is consumed as TypeScript source (`"main"` and `"types"` both
point at `src/schema.ts`). Vite resolves this natively; the backend runs under `tsx`,
which also resolves it natively. The backend runs under `tsx` in production as well —
this is a locally-run application, and adding a bundler step would buy nothing.

## The contract

`shared/src/schema.ts` defines one Zod schema that does three jobs: it constrains
Claude's decoding, it validates the response inside Express, and the frontend's
TypeScript types are derived from it with `z.infer`. There is no second definition of
this shape anywhere in the codebase.

```ts
export const LANGUAGES = [
  'php', 'javascript', 'typescript', 'python', 'sql', 'blade',
] as const;

export const SEVERITIES = ['low', 'medium', 'high'] as const;

OptimizationResult {
  optimized_code:           string
  quality_score:            int, 0–100
  no_optimization_needed:   boolean
  summary:                  string
  issues_found:             Issue[]
  performance_improvements: Improvement[]
  potential_bugs:           Bug[]
  explanation_of_changes:   Change[]
}

Issue        { title: string, severity: Severity, description: string, line_reference: string }
Improvement  { title: string, description: string, impact: string }
Bug          { title: string, severity: Severity, description: string }
Change       { change: string, why: string }
```

Two fields extend the original feature list:

- **`no_optimization_needed`** makes the rule "if no optimization is needed, clearly
  say so" something the UI can act on. Without it, that rule can only be satisfied by
  prose the frontend cannot detect, and clean code would render as an empty-looking
  results panel.
- **`severity`** on issues and bugs is what allows the cards to sort and colour
  themselves instead of presenting an undifferentiated list.

Every field is required, and arrays may be empty. Optional fields behave less
reliably under schema-constrained decoding, so absence is expressed as an empty array
rather than a missing key.

`line_reference` is a free-form string (for example `"12"`, `"12–18"`, or
`"the loop body"`) because Claude cannot reliably produce exact line numbers for code
it has rewritten, and a string that is sometimes approximate is more useful than an
integer that is sometimes wrong.

## Backend

### `POST /api/optimize`

Request:

```json
{ "language": "typescript", "code": "function f(a) { ... }" }
```

Success — `200`, an `OptimizationResult` exactly as specified above.

Error — the status codes in the table below, with body `{ "error": "<safe message>" }`.

### Claude call

Made in `services/claude.ts`, the only module that imports the SDK:

- `model: "claude-opus-5"`
- `max_tokens: 32000`
- `output_config: { format: zodOutputFormat(OptimizationResultSchema), effort: "high" }`
- `system`: the prompt below
- One user message containing the language and the code.

Adaptive thinking is on by default on `claude-opus-5` and is not configured explicitly.

### System prompt

The prompt encodes the review rules:

- Preserve the original functionality exactly. The optimized code must do what the
  original does.
- Do not invent missing business logic. If something looks incomplete, report it as an
  issue rather than filling it in.
- Do not remove security validation, authorization checks, or error handling. If any
  of these appear redundant, say so in the explanation and leave them in place.
- Explain every meaningful change in simple English, aimed at a developer who has not
  seen this code before.
- If the code is already well written, set `no_optimization_needed` to true, return the
  original code unchanged as `optimized_code`, and say so in `summary`.
- Score honestly. A high score should mean something.

Plus a language note injected per request. For Blade: treat `@directives` and `{{ }}`
as Blade syntax and never rewrite them into raw PHP.

### Error mapping

Internal details are logged server-side in full and never sent to the browser.

| Condition | Status | Client sees |
|---|---|---|
| Empty or whitespace-only `code` | 400 | "Please paste some code to optimize." |
| `code` over 60,000 characters | 400 | "That code is too long. The limit is 60,000 characters." |
| Unknown `language` | 400 | "Unsupported language." |
| Rate limit exceeded (local limiter) | 429 | "Too many requests. Please wait a moment." |
| `Anthropic.AuthenticationError` | 500 | "The server is not configured correctly." |
| `Anthropic.RateLimitError` | 429 | "The AI service is busy. Please try again shortly." |
| `Anthropic.BadRequestError` | 400 | "That request could not be processed." |
| Any other `Anthropic.APIError` | 502 | "The AI service failed to respond." |
| `parsed_output === null` | 502 | "The AI returned an unreadable response. Please try again." |

Error classes are checked most-specific-first using the SDK's typed exceptions, never
by string-matching messages. A `null` `parsed_output` is handled as a 502, not an
unhandled throw.

### Rate limiting

An in-memory limiter allows 10 requests per 5 minutes. The purpose is not security —
this app is not exposed — but cost: a re-render loop in the frontend pointed at a
$5/MTok model is a realistic way to spend money by accident.

### Configuration

`config.ts` reads and validates the environment at startup and exits with a clear
message if it is invalid, so a missing key fails at boot rather than on the first
request.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Anthropic API credential |
| `PORT` | no | `3001` | Backend port |
| `CLAUDE_MODEL` | no | `claude-opus-5` | Model override |
| `MAX_CODE_CHARS` | no | `60000` | Input size cap |

`.env.example` lists all four with the key blank.

### `GET /api/health`

Returns `{ status: "ok" }`. Used to confirm the backend is up without spending money.

## Frontend

Dark theme only. A single column, two stacked zones: input on top, results below. Once
results arrive the input zone collapses to a summary bar so the results get the screen.

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ AI Code Optimizer            [ TypeScript ▾ ]        │
├──────────────────────────────────────────────────────────┤
│   1 │ function process(a){                               │
│   2 │   var x = [];                    ← CodeMirror 6    │
│   3 │   for(i=0;i<a.length;i++)          dark, line #s   │
│                                                          │
│   1,204 chars              [ ⚡ Optimize Code ]          │
├──────────────────────────────────────────────────────────┤
│   ┌────────┐   3 issues · 2 perf wins · 1 potential bug  │
│   │   72   │   Reduced allocations and added a null      │
│   │ / 100  │   guard; behaviour is unchanged.            │
│   └────────┘                    [ Copy ]  [ Download ]   │
├──────────────────────────────────────────────────────────┤
│  ORIGINAL                │  OPTIMIZED                    │
│  1  function process(a){ │  1  function process(a) {     │
│  2 -  var x = [];        │  2 +  if (!a?.length) return  │   ← synced
│  3 -  for(i=0;i<a.len... │  3 +  return a.map(n => n*2); │     scroll
├──────────────────────────────────────────────────────────┤
│  ⚠ POTENTIAL BUGS                                        │
│  ┌──────────────────────────────────────────────────┐    │
│  │ HIGH · Unguarded array access                    │    │
│  │ `a` is dereferenced before any null check...     │    │
│  └──────────────────────────────────────────────────┘    │
│  ISSUES FOUND · PERFORMANCE · WHAT CHANGED & WHY         │
└──────────────────────────────────────────────────────────┘
```

### Components

Each component takes typed props derived from the shared schema and owns no fetching
logic; all network state lives in `useOptimize`.

| Component | Responsibility |
|---|---|
| `CodeInput` | CodeMirror 6 editor, dark theme, line numbers, language-appropriate highlighting, character counter |
| `LanguageSelect` | The six languages; drives both editor highlighting and the request |
| `DiffView` | Two synced read-only CodeMirror panes with line-level diff decorations |
| `QualityScore` | The 0–100 score, colour-banded, with the summary line |
| `IssueCard` | One issue: severity chip, title, description, line reference |
| `BugWarning` | One potential bug, styled more urgently than an issue |
| `ChangeList` | `explanation_of_changes` as change/why pairs |
| `ResultActions` | Copy to clipboard and download, with confirmation feedback |

### Diff view

A line-level diff between `optimized_code` and the original, computed client-side and
rendered as CodeMirror decorations: removed lines tinted red in the left pane, added
lines tinted green in the right, gutter markers on both, and synchronized scrolling.

Below the `md` breakpoint the two panes become a tabbed Original/Optimized pair. Two
40-column code panes side by side on a phone are unreadable.

### Loading state

The 30–90 second wait is treated as a first-class state, not a spinner. The button
enters a disabled loading state, an elapsed-seconds counter runs, and the status copy
rotates: "Reading your code…" → "Checking for bugs…" → "Writing the optimized
version…". A silent 60-second spinner reads as a hung application.

### Validation

Empty or whitespace-only input disables the button and shows inline helper text. A
live character counter turns amber as it approaches 60,000. Both checks are repeated
server-side; the client versions are user experience, the server versions are the
actual rule.

### Errors

A dismissible banner showing the server's safe message, with a Retry that reuses the
current input.

### Download

`optimized.<ext>` with the extension chosen from the selected language: `.php`,
`.js`, `.ts`, `.py`, `.sql`, `.blade.php`.

## Testing

Vitest, covering the parts that can break silently. No test makes a real API call.

- **Schema** — valid payloads parse; missing fields, out-of-range `quality_score`,
  and invalid `severity` values are rejected.
- **Route validation** — empty code, whitespace-only code, oversized code, and
  unknown language each produce the right status and message.
- **Error mapping** — each Anthropic error class, and a `null` `parsed_output`, map
  to the documented status and safe message, with the Anthropic client mocked.
- **Diff** — identical input produces no marked lines; known edits produce the
  expected added and removed sets.

The UI is verified by running the application.

## Local run

1. `npm install` at the root, which installs all three workspaces.
2. Copy `backend/.env.example` to `backend/.env` and add the Anthropic API key.
3. `npm run dev` starts Vite on 5173 and Express on 3001.
4. Open `http://localhost:5173`, paste code, choose a language, optimize.

The README documents these steps, the environment variables, the project layout, and
the per-request cost.

## Out of scope

No authentication, no database, no history or saved results, no user accounts, no
multi-file or repository upload, no light theme, and no model picker in the UI (the
`CLAUDE_MODEL` environment variable covers that need). Each of these is easy to add
later and none is required for the application to be good at its one job.
