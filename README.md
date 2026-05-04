# yubi.sh

```text
██╗   ██╗██╗   ██╗██████╗ ██╗
╚██╗ ██╔╝██║   ██║██╔══██╗██║
 ╚████╔╝ ██║   ██║██████╔╝██║
  ╚██╔╝  ██║   ██║██╔══██╗██║
   ██║   ╚██████╔╝██████╔╝██║
   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝
```

Terminal-style AI portfolio for [yubi.sh](https://yubi.sh). Visitors can ask about Yubi's projects, experience, skills, and background through a full-screen xterm.js interface, with optional voice conversation support.

This repository is the frontend only. The LangGraph/FastAPI assistant backend lives in the separate `portfolio-assistant-langgraph` project, and the voice WebSocket backend lives in the separate `yubi-portfolio-voice-service` project.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript |
| Terminal | xterm.js |
| Text API | LangGraph FastAPI backend over JSON + SSE |
| Auth | Cloudflare Turnstile, HttpOnly refresh cookie, in-memory access token |
| Voice | Separate WebSocket voice service |
| Hosting | Vercel |

## Features

- Terminal-style portfolio UI with dark/light themes.
- Streaming AI answers from `POST /prompt/stream`.
- Non-streaming fallback through `POST /prompt`.
- Follow-up session support via `session_id`.
- Suggested follow-up prompts rendered after completed answers.
- Production-ready browser auth flow for protected APIs.
- Optional voice chat via `VITE_VOICE_ENABLED`.
- Mobile viewport handling so the prompt remains reachable after long output.

## Commands

| Command | Description |
|---------|-------------|
| `help` | Show available commands and examples |
| `about` | Open profile card |
| `resume` | Open resume PDF |
| `clear` | Clear the terminal |
| anything else | Ask the portfolio assistant |

## Local Development

Install and run the frontend:

```bash
cd client
npm install
npm run dev
```

The app runs at:

```text
http://localhost:5173
```

For local text chat, run `portfolio-assistant-langgraph` separately, usually on:

```text
http://localhost:8000
```

For local voice chat, run `yubi-portfolio-voice-service` separately, usually on:

```text
ws://127.0.0.1:3001/ws
```

## Environment

Copy `client/.env.example` to `client/.env`.

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | LangGraph API base URL. Local default is `http://localhost:8000`. |
| `VITE_REQUIRE_AUTH` | When `true`, prompt and voice calls require an access token. |
| `VITE_DISABLE_AUTH` | Emergency auth kill switch. Keep `false` in production. |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key. |
| `VITE_TURNSTILE_DEV_BYPASS` | Sends a dummy Turnstile token in dev. Requires backend `TURNSTILE_BYPASS=true`. |
| `VITE_VOICE_ENABLED` | Enables the voice UI when `true`. |
| `VITE_VOICE_WS_URL` | Voice WebSocket URL. Defaults locally to `ws://127.0.0.1:3001/ws`. |
| `VITE_DEV_HTTPS` | Runs Vite over HTTPS in development when `true`. |

## Auth Flow

When auth is enabled, the frontend:

1. Calls `POST /auth/token` with `credentials: "include"`.
2. If the refresh cookie is missing, runs Turnstile.
3. Calls `POST /auth/session` with the Turnstile token.
4. Calls `POST /auth/token` again.
5. Sends `Authorization: Bearer <access_token>` to `/prompt`, `/prompt/stream`, and the voice WebSocket.

Access tokens are stored in memory only. Refresh state stays in the backend-managed HttpOnly cookie.

## Build

```bash
cd client
npm run build
```

Output:

```text
client/dist
```

## Deployment

Vercel uses the root `vercel.json`:

```json
{
  "installCommand": "cd client && npm ci",
  "buildCommand": "cd client && npm run build",
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Set production environment variables in Vercel. At minimum:

```text
VITE_API_URL=https://<langgraph-api-host>
VITE_REQUIRE_AUTH=true
VITE_TURNSTILE_SITE_KEY=<site-key>
```

Enable voice only when the voice backend is deployed:

```text
VITE_VOICE_ENABLED=true
VITE_VOICE_WS_URL=wss://<voice-service-host>/ws
```

## Architecture

```text
Browser
  -> React + xterm.js terminal
  -> /prompt/stream SSE or /prompt JSON
  -> portfolio-assistant-langgraph
  -> LangGraph retrieval, memory, auth, and answer generation

Optional voice:
Browser
  -> WebSocket /ws?access_token=...
  -> yubi-portfolio-voice-service
  -> OpenAI voice pipeline
```
