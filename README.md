# yubi.ai

Terminal-style AI portfolio for [yubikhadka.com](https://yubikhadka.com). Visitors interact with an LLM-powered assistant to explore Yubi's projects, skills, and background through a full-screen terminal interface.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript |
| Terminal | xterm.js (`@xterm/*`) |
| Auth / Bot protection | Cloudflare Turnstile + short-lived token chain |
| Backend (separate repo) | FastAPI + MCP server |
| Hosting | Vercel (frontend) · Render (backend) |

## Commands

| Command | Description |
|---------|-------------|
| `help` | Show available commands |
| `about` | Open profile card |
| `resume` | Open resume in a new tab |
| `clear` | Clear the terminal |
| _anything else_ | AI conversation |

## Local Development

```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

Copy `client/.env.example` to `client/.env` and fill in the values.

## Build

```bash
cd client
npm run build
# output: client/dist/
```

## Environment Variables

Set these in `client/.env` (dev) or Vercel (prod):

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL (no trailing slash) |
| `VITE_VOICE_ENABLED` | Enables the voice UI when set to `true`. Defaults to `false`. |
| `VITE_VOICE_WS_URL` | Voice service WebSocket URL. Optional until the voice service is deployed. |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |
| `VITE_REQUIRE_AUTH` | Enables the current FastAPI auth flow. The frontend lazily mints a short-lived access token only when a protected action needs it. When voice auth is enabled on the backend, the voice UI reuses this flow before opening `/ws`. |
| `VITE_DISABLE_AUTH` | Kill switch — keep `false` in prod |

## Deployment

Vercel is configured via `vercel.json`:
- **Build:** `cd client && npm ci && npm run build`
- **Output:** `client/dist`

Set the env vars above in Vercel → Project Settings → Environment Variables.

Voice rollout is gated on the frontend:
- Leave `VITE_VOICE_ENABLED` unset or `false` until the separate voice service is deployed.
- Once the voice backend is live, set `VITE_VOICE_ENABLED=true` and provide `VITE_VOICE_WS_URL` if the WebSocket endpoint is not proxied from the same host.
- If the voice backend has `REQUIRE_AUTH=true`, keep `VITE_REQUIRE_AUTH=true` so the frontend fetches a FastAPI-issued short-lived access token and connects to `/ws?access_token=<token>`.

## Architecture

```
Browser (xterm.js)
  └── useTerminal hook
        ├── built-in commands (help, about, resume, clear)
        └── AI prompts → POST /prompt/stream (SSE)
                            └── FastAPI backend (separate repo)
                                  └── MCP server → portfolio tools
```

AI responses stream token-by-token via SSE. Code blocks in responses are syntax-highlighted in the terminal.

## Auth Flow

- The frontend does not call auth endpoints on page load by default.
- On the first protected action, it first tries `POST /auth/token` with `credentials: "include"` to silently recover from an existing HttpOnly grant cookie.
- If that first `/auth/token` call fails because there is no valid grant cookie yet, the frontend runs Turnstile, calls `POST /auth/session`, and then retries `POST /auth/token`.
- `/prompt` and `/prompt/stream` still send `Authorization: Bearer <access_token>`.
- The access token is stored in memory only and is lost on page reload.
- The initial cold-start `/auth/token` failure is expected control flow, not a bug.

## UI

- **Dark / light theme** — toggle in the top-right corner (Sun/Moon icon); preference persisted in `localStorage`. Light theme uses Solarized Light palette (cream background, cyan accent).
- **Resume** — `resume.pdf` served from `client/public/`; opened directly in a new tab via the `resume` command.
