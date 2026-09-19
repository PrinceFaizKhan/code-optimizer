# AI Code Optimizer

Paste code, pick a language, and get back an optimized version plus a structured review: a quality score, issues, performance improvements, potential bugs, and a plain-English explanation of every change. Powered by Claude.

Supports PHP, JavaScript, TypeScript, Python, SQL, and Laravel Blade.

**Repository:** https://github.com/PrinceFaizKhan/code-optimizer

## Requirements

- Node.js 22.12 or newer (Node.js 20.19+ in the 20.x series also works with the installed Vite version)
- An Anthropic API key — create one at https://console.anthropic.com/settings/keys

## Run the app yourself

If setup is already done, open Terminal, go to the project folder, and run:

```bash
cd code-optimizer
npm run dev
```

Replace `code-optimizer` with wherever you keep the project if it is not in the current directory.

Wait for both the Vite URL and `API listening` message, then open **http://127.0.0.1:5173/** in your browser. Use this exact address for the frontend; port 3001 is the backend API.

The single command starts both servers. Keep that Terminal window running while using the app. To stop both servers, press **Ctrl+C** in that Terminal. After stopping them or restarting your Mac, run the same two commands again. You do not need to reinstall packages or recreate your `.env` each time.

## First-time setup

Skip this section if dependencies and `backend/.env` are already configured.

### Getting the code

If you already have the project on this machine, skip to step 1. To set it up fresh, clone it:

```bash
git clone https://github.com/PrinceFaizKhan/code-optimizer.git
cd code-optimizer
```

Then follow the steps below from inside that folder.

`backend/.env` is deliberately **not** in the repository, so a fresh clone has no API key. Step 3 creates it. This is why cloning alone is not enough to run the app.

1. Open Terminal in the project folder and check Node.js and npm:

   ```bash
   cd code-optimizer
   node --version
   npm --version
   ```

2. Install all three workspaces' dependencies from the project root:

   ```bash
   npm install
   ```

3. Create the backend configuration only if it does not already exist. This preserves an existing API key:

   ```bash
   if [ ! -f backend/.env ]; then
     cp backend/.env.example backend/.env
   fi
   ```

   Open `backend/.env` in your editor and fill in `ANTHROPIC_API_KEY` with your own key. Keep `PORT=3001` to match the frontend proxy. Save the file.

4. Start the app with `npm run dev`, then open **http://127.0.0.1:5173/**.

The browser talks to Vite on port 5173, and Vite forwards `/api` requests to Express on port 3001. The explicit IPv4 frontend address avoids differences in how browsers resolve `localhost`.

## Check that both servers are running

While `npm run dev` is running, open a second Terminal and run:

```bash
curl --fail http://127.0.0.1:5173/api/health
```

Expected response: `{"status":"ok"}`. This checks the frontend proxy and backend together without making a Claude request.

## Configuration

All configuration lives in `backend/.env`. Only `.env.example` is committed; your key never reaches the frontend bundle or an HTTP response.

> **Never commit your API key.** `.gitignore` covers `.env*` (with `.env.example` excepted), so every `.env` variant stays out of the repository — including copies like `.env 2` that an editor or Finder can create. Before pushing, a quick `git status` should never show a file containing your key. If one is ever committed, treat the key as leaked: revoke it at https://console.claude.com/settings/keys and issue a new one.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Your Anthropic API key |
| `PORT` | no | `3001` | Backend port |
| `CLAUDE_MODEL` | no | `claude-opus-5` | Model override |
| `MAX_CODE_CHARS` | no | `60000` | Maximum accepted input size |

After changing `backend/.env`, stop the app with Ctrl+C and run `npm run dev` again. If you change `PORT`, also update the backend port in `frontend/vite.config.ts` under `server.proxy['/api'].target`.

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

**The frontend does not open.** Start `npm run dev` from the project root, keep Terminal open, and visit **http://127.0.0.1:5173/**. Check Terminal for a startup error if the page still fails. Opening `frontend/index.html` directly does not run the app.

**“Port 5173 is already in use” or “EADDRINUSE” on port 3001.** Another server may already be running, including one started earlier from this workspace. Try the browser URL and health check first. To restart your existing app, press Ctrl+C in its original Terminal before running `npm run dev` again. To identify the process using either port on macOS:

```bash
lsof -nP -iTCP:5173 -iTCP:3001 -sTCP:LISTEN
```

**“npm: command not found” or an unsupported Node.js version.** Install a Node.js version listed under Requirements, reopen Terminal, and check `node --version` and `npm --version`.

**A dependency is missing (“vite: command not found”, “tsx: command not found”, or “Cannot find module”).** Run `npm install` from the project root, then `npm run dev` again.

**“The server is not configured correctly.”** The API key in `backend/.env` is missing or invalid.

**“Could not reach the server.”** The backend is not running; use `npm run dev` from the repo root.

**Optimizations feel slow.** 30–90 seconds is expected for larger files.
