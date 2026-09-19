# AI Code Optimizer

Paste code, pick a language, and get back an optimized version plus a structured review: a quality score, issues, performance improvements, potential bugs, and a plain-English explanation of every change. Powered by Claude.

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

Open http://localhost:5173. `npm run dev` starts Express on port 3001 and Vite on 5173; Vite proxies `/api` to the backend.

## Configuration

All configuration lives in `backend/.env`. Only `.env.example` is committed; your key never reaches the frontend bundle or an HTTP response.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Your Anthropic API key |
| `PORT` | no | `3001` | Backend port |
| `CLAUDE_MODEL` | no | `claude-opus-5` | Model override |
| `MAX_CODE_CHARS` | no | `60000` | Maximum accepted input size |

## Cost

Each optimization is one Claude API call and costs roughly **$0.10–$0.25** on a 200–400 line file with the default model. The backend permits at most 10 requests per five minutes.

## Project layout

```
shared/    Zod schema — the contract between backend and frontend
backend/   Express API; the only place the API key is read
frontend/  React + Vite SPA
```

The shared schema constrains Claude’s output, validates the API response, and supplies the frontend’s TypeScript types.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Start backend and frontend together |
| `npm test` | Run every workspace test (no API calls) |
| `npm run typecheck` | Typecheck every workspace |
| `npm run build -w frontend` | Production-build the frontend |

## How it works

1. The frontend posts `{ language, code }` to `/api/optimize`.
2. The backend validates input and makes one structured Claude request based on the shared Zod schema.
3. The browser revalidates and renders the result as a line-level diff plus review panels.

## Troubleshooting

**“The server is not configured correctly.”** The API key in `backend/.env` is missing or invalid.

**“Could not reach the server.”** The backend is not running; use `npm run dev` from the repo root.

**Optimizations feel slow.** 30–90 seconds is expected for larger files.
