# Yubi Portfolio Terminal (Frontend)

A terminal-style portfolio UI built with React + Vite + TypeScript and rendered with xterm.js (via `@xterm/*`). The frontend talks to a separate backend API for Turnstile-based auth and prompt streaming.

## What Users Experience

- A full-screen terminal UI where the user types commands/prompts.
- Built-in commands:
  - `help`: prints usage and available commands.
  - `about`: toggles the About overlay card.
  - `clear`: clears the terminal and reprints the intro.
  - `info`: prints the current API endpoint and session id.
- AI responses stream in real time (SSE) with minimal UI noise.
- While an AI stream is running, additional submissions are blocked (prevents concurrent streams and accidental spam).

## Frontend Architecture

High-level flow:

```
User -> xterm -> useTerminal hook -> /prompt/stream (SSE)
                               -> parses SSE frames -> writes partial/final into terminal
```

Key modules:

- `client/src/App.tsx`
  - Mounts the terminal container and the About overlay.
- `client/src/hooks/useTerminal.ts`
  - Owns xterm lifecycle (init, fit on resize, input handling).
  - Dispatches built-in commands.
  - For AI prompts, calls the streaming API and writes incremental output.
  - Tracks the `session_id` emitted by SSE so conversations can be continued.
- `client/src/utils/auth.ts`
  - Implements the auth handshake when required:
    - `POST /auth/session` with `{ turnstile_token }` -> returns `grant_token`.
    - `POST /auth/token` with `Authorization: Bearer <grant_token>` -> returns `access_token`.
  - Caches tokens in `localStorage` with expiry timestamps:
    - `ai_portfolio.grant_token`, `ai_portfolio.grant_expires_at`
    - `ai_portfolio.access_token`, `ai_portfolio.access_expires_at`
- `client/src/utils/turnstile.ts`
  - Loads Turnstile script and executes it on demand to obtain a `turnstile_token`.
  - Uses `appearance: interaction-only`, so the widget usually stays hidden and only appears if Cloudflare requires user interaction.
- `client/src/config/env.ts`
  - Central place for reading env vars and computing the API base URL.

## Streaming (SSE) Behavior

The frontend calls:

- `POST /prompt/stream` with JSON `{ prompt, session_id? }`
- Expects `text/event-stream` where each event is a `data: { ...json... }` line.

The client understands these event types:

- `session`: updates the current `session_id`.
- `partial`: appends streamed text.
- `final`: prints final text and spacing.
- `error`: prints a terminal-styled error message.
- `done`: end-of-stream marker.

Important detail:
- If the backend returns `401` for `/prompt/stream`, it can still return an SSE body with `{type:"error" ...}` followed by `{type:"done" ...}`. The client will parse and display that error instead of only showing `HTTP 401`.

## Auth + Turnstile Flow

When `VITE_REQUIRE_AUTH=true`:

1. User submits a prompt.
2. Frontend ensures it has a valid `access_token`:
   - If needed, it runs Turnstile to obtain a `turnstile_token`.
   - Exchanges Turnstile token for a `grant_token` (`/auth/session`).
   - Exchanges `grant_token` for an `access_token` (`/auth/token`).
3. Frontend calls `/prompt` or `/prompt/stream` with:
   - `Authorization: Bearer <access_token>`

Notes:
- Seeing the `turnstile_token` in DevTools Network is expected: it is generated in the browser and must be sent to your backend for verification.
- The backend must verify Turnstile server-side using the Turnstile secret key (never exposed to the frontend).

## Auth & Security Details

This frontend gates access to privileged AI endpoints (`/prompt`, `/prompt/stream`) using a short-lived token chain designed to reduce automated abuse and limit damage from token leakage.

### Turnstile (bot/human gate)

- Where it runs: in the user's browser (Cloudflare Turnstile widget).
- What it produces: a `turnstile_token` (proof from Cloudflare that the browser passed its checks).
- Where it goes next: the frontend sends it to your backend:
  - `POST /auth/session` with JSON `{ "turnstile_token": "<token>" }`.
- Security property: the Turnstile secret key is only on the backend. The frontend never has it.

Why it matters:
- Bots that cannot pass Turnstile cannot mint tokens, so they cannot call `/prompt*` when backend auth is enabled.

### Grant token (medium-lived)

- Issued by: backend after successful Turnstile verification.
- Type: `grant` token.
- TTL: typically ~30 minutes (per backend config).
- Used for: exchanging to an access token:
  - `POST /auth/token` with `Authorization: Bearer <grant_token>`.
- Stored by frontend: cached in `localStorage` with an expiry timestamp to avoid re-running Turnstile for every prompt.

Why it exists:
- Turnstile challenges are relatively expensive and sometimes interactive; a grant token amortizes that cost across multiple prompts.

### Access token (short-lived)

- Issued by: backend, in exchange for a grant token.
- Type: `access` token.
- TTL: typically ~60 seconds (per backend config).
- Used for: calling privileged endpoints:
  - `POST /prompt`
  - `POST /prompt/stream`
  with header `Authorization: Bearer <access_token>`.

Why it exists:
- The blast radius of a leaked access token is limited by its short TTL.
- Backend can strictly validate token type, expiry, and return precise 401 error details.

### Frontend refresh logic (what actually happens)

In `client/src/utils/auth.ts`:

- If a valid cached `access_token` exists, use it.
- Else if a valid cached `grant_token` exists, exchange it for a new access token.
- Else run Turnstile to mint a new grant token, then exchange for an access token.

Cached keys in `localStorage`:
- `ai_portfolio.grant_token`, `ai_portfolio.grant_expires_at`
- `ai_portfolio.access_token`, `ai_portfolio.access_expires_at`

### SSE unauthorized behavior

For `/prompt/stream`, the backend can respond with HTTP `401` while still sending an SSE body containing a normalized error frame followed by `done`. The frontend parses SSE even on non-2xx so the terminal can display the backend's error detail instead of only `HTTP 401`.

### Security notes and limitations

- It is expected that `turnstile_token` is visible in the browser's Network tab. It is generated in the browser and must be sent to the backend for verification.
- The Turnstile secret key must never be exposed to the frontend. Only the site key belongs in Vercel/Vite env vars.
- Tokens are cached in `localStorage`. If your site had an XSS vulnerability, an attacker could steal them. The primary mitigation is preventing XSS.
- This mechanism reduces automated abuse; it does not prevent a real user from sending many prompts. Backend rate limits and concurrency caps are still required.

## Environment Variables (Frontend)

Vite reads `client/.env` in development. Production values are set in Vercel.

Required in production:

- `VITE_API_URL`: base URL of your backend API (no trailing slash). Example: `https://<render-api>`.
- `VITE_TURNSTILE_SITE_KEY`: Cloudflare Turnstile site key.
- `VITE_REQUIRE_AUTH`: `true` in prod once backend auth is enabled.
- `VITE_DISABLE_AUTH`: `false` (kill switch; do not enable in prod).

Optional/dev-only:

- `VITE_DEV_HTTPS`: `true` runs `npm run dev` over HTTPS to reduce Turnstile/PAT console noise. Requires `@vitejs/plugin-basic-ssl`.
- `VITE_TURNSTILE_DEV_BYPASS`: dev-only bypass for Turnstile (not recommended for real testing).

See:
- `client/.env.example`

## Local Development

```powershell
cd client
npm install
npm run dev
```

Default dev URL:
- `http://localhost:5173`

If you want `127.0.0.1:5173` to work as well, Vite is configured to bind to `0.0.0.0` (see `client/vite.config.ts`).

## Build

```powershell
cd client
npm run build
```

Build output:
- `client/dist/`

## Deployment (Vercel)

The repo is set up to deploy the frontend as a static site via `vercel.json`:

- build: `cd client && npm ci && npm run build`
- output: `client/dist`

Set Vercel env vars (Production):
- `VITE_API_URL`
- `VITE_TURNSTILE_SITE_KEY`
- `VITE_REQUIRE_AUTH=true`
- `VITE_DISABLE_AUTH=false`

## Troubleshooting

- Turnstile fails locally:
  - Make sure your Turnstile widget "Allowed hostnames" includes both `localhost` and `127.0.0.1` if you test on both.
  - Disable ad blockers/privacy extensions for the site.
- Console noise about `/cdn-cgi/challenge-platform/*`:
  - This comes from Turnstile / Chrome PAT behavior and is usually cosmetic.
  - In local dev, `client/vite.config.ts` includes middleware to return `204` for `/cdn-cgi/challenge-platform/*` to reduce noise.
- Clear auth cache:
  - In DevTools -> Application -> Local Storage, delete keys starting with `ai_portfolio.` to force a fresh auth flow.

## Limitations (Current)

- Tokens are stored in `localStorage` (not httpOnly cookies). If you ever had an XSS bug, tokens could be stolen.
- No user-visible "auth status" UI (it's intentionally quiet). Debugging relies on DevTools.
- No persistent command history across reloads (up/down arrow history is not implemented).
- No multi-tab coordination (two tabs can both mint tokens/stream; the backend must enforce concurrency limits).
- No offline mode; the UI depends on the backend for AI responses.
- Console noise from Turnstile/PAT can still appear depending on browser/extension behavior.

## Future Enhancements

- Move tokens to secure httpOnly cookies (requires backend changes) to reduce token theft risk.
- Add a lightweight auth indicator in the terminal (e.g., "auth ok", token refresh events) behind a dev flag.
- Implement command history (up/down arrows) and optional persistence in `localStorage`.
- Add a "Stop generating" interrupt for streaming responses (client abort + server cancel if supported).
- Add multi-tab coordination (BroadcastChannel) to share tokens and avoid duplicate token minting.
- Add better retry/backoff UX for rate limits (surface "try again in N seconds" in the terminal).
