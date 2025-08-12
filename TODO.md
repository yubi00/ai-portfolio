# TO## Current state (as of Aug 2025)
- Frontend: React + Vite + Tailwind + xterm.js terminal with basic input and local command handling
- Backend: Express server with health/info endpoints, ready for AI integration
- Scripts: Root bootstrap, concurrent dev servers, and buildAI Portfolio Terminal Roadmap

This is a concrete, phased plan to evolve the terminal-style portfolio into an AI-driven agent that can talk to multiple MCP servers (e.g., GitHub MCP, LinkedIn MCP) via a Node/Express backend and a React + xterm.js frontend.

## Current state (as of Aug 2025)
- Frontend: React + Vite + Tailwind + xterm.js terminal with basic input and WebSocket connection (streams tokens, writes lines).
- Backend: Express + ws server with a stub “echo + demo routing” handler, streams characters back to the terminal.
- Scripts: Root bootstrap, concurrent dev servers, and build.

## Guiding principles
- Simple HTTP APIs for AI integration
- Keep the protocol minimal and typed. Explicit request/response formats
- Agent first. Treat MCPs as tools behind a routing layer; UI stays terminal-centric
- Secure by default. OAuth for user-owned data (GitHub/LinkedIn); fall back to PAT/dev tokens only in development

---

## Phase 0 — Housekeeping and DX
- [ ] Create .env files: `server/.env` (PORT, LOG_LEVEL, provider/API keys in dev), `client/.env` (VITE_ vars if needed)
- [ ] Add `dotenv` to server and load config early
- [ ] Add stricter TypeScript configs (noImplicitAny, strictNullChecks) and ESLint rules aligned for both packages
- [ ] Prettier config (optional) and simple pre-commit lint (Husky) [low priority]
- [ ] Basic logger (pino/winston) with request context IDs

## Phase 1 — HTTP API protocol v1
Define simple HTTP endpoints for AI integration.

API Endpoints
- [ ] `POST /chat` { message, context? } → { response, status }
- [ ] `POST /tools/github/*` - GitHub tool endpoints
- [ ] `POST /tools/linkedin/*` - LinkedIn tool endpoints
- [ ] `GET /health` - Health check
- [ ] `GET /info` - Service info

Implementation tasks
- [ ] Centralize types in a shared file: `server/src/types.ts`
- [ ] Validate requests (zod or custom validation) and fail fast
- [ ] Add proper error handling and status codes

## Phase 2 — Terminal UX polish
- [ ] Command history (persist in localStorage; arrows to navigate)
- [ ] Basic help: `/help` lists commands and examples
- [ ] Slash commands + prompt mode (e.g., `/gh`, `/li`, `/resume`, `/projects`)
- [ ] Graceful error handling when API calls fail
- [ ] Window resize handling (already FitAddon; add debounce)
- [ ] Copy-friendly output (use xterm selection, ensure theme contrast)
- [ ] Optional: lightweight status bar (API status, response time)

## Phase 3 — Agent routing and tool abstraction
Goal: An agent interface that decides when/which MCP tool to use and streams output back.

- [ ] Define `Agent` interface: `handlePrompt({ text, context }): Promise<AgentResponse>`
- [ ] Implement a simple intent classifier (keywords + heuristics) to route to GitHub/LinkedIn tools; later swap with LLM classification
- [ ] Add a `ToolRegistry` that exposes tool capabilities and usage examples
- [ ] HTTP response handling: Agent returns structured data, client displays it

## Phase 4 — MCP integration (GitHub + LinkedIn)
Assumption: We’ll use the Model Context Protocol Node SDK when practical. If a provider offers an MCP server binary/endpoint, connect via stdio/socket; otherwise implement minimal wrappers.

Common tasks
- [ ] Add MCP client SDK dependency (when selected)
- [ ] Config-driven tool enablement (e.g., enableGitHub, enableLinkedIn)
- [ ] Uniform tool interface: `execute(toolName, args) => stream/result`
- [ ] Backpressure + timeouts per tool call

GitHub MCP
- [ ] Auth: Support PAT in dev, OAuth (PKCE) for prod
- [ ] Tools: `list_repos`, `list_issues(repo)`, `list_prs(repo)`, `readme(repo)`, `recent_contributions(user)`
- [ ] Nice output formatting (tables/indented lines where useful)

LinkedIn MCP
- [ ] Auth: OAuth flow; securely store tokens server-side, short-lived on client
- [ ] Tools: `profile_summary`, `experience`, `education`, `skills`, `recommendations` (as available)
- [ ] Guardrails for rate limits and missing scopes

Protocol wiring
- [ ] `/gh ...` commands map to GitHub tool invocations
- [ ] `/li ...` commands map to LinkedIn tool invocations
- [ ] Agent freeform prompt decides to call one or more tools, then synthesizes an answer

## Phase 5 — LLM/Agent provider integration
Short term: Local/simple LLM client abstraction; Long term: AWS Bedrock Agents or a hosted provider.

- [ ] Create `LLMClient` interface with a `generate()` method
- [ ] Implement one provider first (env-configured)
- [ ] Prompt templates: persona, portfolio context, tool-use instructions
- [ ] Tool-augmented reasoning: call MCP tool, feed result back into the model, return final synthesis
- [ ] Token/usage logging (non-PII)

## Phase 6 — Portfolio-specific commands and narratives
- [ ] `/whoami` – short intro + links
- [ ] `/projects` – curated project list fetched from GitHub + hand-authored summaries
- [ ] `/resume` – generate tailored resume summary using LinkedIn data + custom highlights
- [ ] `/contact` – show links or trigger an email template
- [ ] `/theme` – light/dark or alt color schemes in terminal

## Phase 7 — Auth, security, and settings
- [ ] OAuth flows for GitHub/LinkedIn (server endpoints, CSRF state, PKCE)
- [ ] Token storage: encrypted at rest server-side; HTTP-only same-site cookies client-side
- [ ] Rate limiting per IP/session and per-tool
- [ ] CORS tightened for known origins in prod
- [ ] Secrets management (do not commit .env; use .env.example)

## Phase 8 — Testing and reliability
- [ ] Unit tests: protocol validators, agent router, command parser
- [ ] Integration tests: mock HTTP endpoints, agent-tool roundtrip
- [ ] E2E: basic headless test that sends requests and asserts responses (Playwright)
- [ ] Load test: many concurrent HTTP requests with short prompts
- [ ] Chaos: simulate MCP timeouts/errors and assert graceful degradation

## Phase 9 — Build, deploy, and observability
- [ ] Dockerfiles for client and server; multi-stage builds
- [ ] GitHub Actions: lint, test, build, docker publish
- [ ] Deploy: static hosting for client (e.g., Netlify/Vercel) + Node server (Fly/Render/AWS)
- [ ] Health checks: `/health`, `/version` HTTP endpoints
- [ ] Metrics/logs: basic latency + error rates (stdout or OTLP if available)

## Phase 10 — Docs and polish
- [ ] Update README with architecture diagram and a quickstart including OAuth notes
- [ ] Add `docs/` with protocol reference and command catalog
- [ ] Record a short demo GIF

---

## Acceptance criteria (initial milestone)
- [ ] Terminal connects, supports history, `help`, and slash commands
- [ ] Agent routes simple prompts to GitHub MCP via HTTP to list repos/issues and displays output
- [ ] LinkedIn MCP call returns profile summary via HTTP (with OAuth in dev or mock)
- [ ] Freeform prompt can call at least one tool via HTTP and display the result
- [ ] Basic tests pass in CI, and a demo deployment is accessible

## Edge cases to handle
- [ ] HTTP request timeouts and failures are clearly surfaced
- [ ] Tool timeouts and partial results are clearly surfaced
- [ ] Rate limits/backoffs are visible in status messages
- [ ] Missing auth shows helpful next steps (e.g., "run /login github")
- [ ] Large outputs paginate or summarize to avoid terminal overload
