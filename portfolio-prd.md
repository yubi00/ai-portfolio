# Portfolio Site Revision — PRD

**Project:** yubikhadka.com
**Author:** Yubi Khadka
**Date:** March 2026
**Status:** Draft

---

## 1. Overview

Revise the architecture of the personal portfolio site (yubikhadka.com) to address current pain points and add new capabilities. The site is a terminal-style AI-powered interface (`yubi@agent:~$`) that allows visitors to interact with an LLM-powered assistant to learn about Yubi's background, projects, and skills.

> **Terminology note:** Despite the `yubi@agent:~$` branding, the current architecture is an **LLM with context injection** — not an agent. There is no decision loop, autonomous tool selection, or action chaining. The LLM receives context and generates a response. With RAG added, it becomes an **LLM with retrieval-augmented context** — still not agentic. This distinction matters and is intentional. Future iterations could introduce agentic behaviour (tool selection, multi-step reasoning) but that's out of scope for now.

### Current Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | Vite + React (terminal UI) | Vercel |
| Backend / MCP Client | FastAPI | Render (paid Starter plan) |
| MCP Server | Custom GitHub MCP server (SSE) | Google Cloud Run |
| Database | Neon Postgres (visitor tracking) | Neon |
| Auth | Vercel Edge Middleware | Vercel |

### Core Problems

1. **MCP tools mirror GitHub API signatures, not portfolio intent.** The current MCP server exposes generic GitHub operations (`list_repositories`, `get_repository`, `search_repositories`, `get_repository_contents`). This means the LLM has to figure out which GitHub API calls to chain together to answer a simple question like "what has Yubi built?" — putting too much burden on the LLM, leading to excessive conditional logic and boilerplate in both the MCP server and FastAPI layers. The FastAPI routes also mirror these generic GitHub params, compounding the problem.
2. **No resume/knowledge base integration** — the LLM cannot answer detailed questions about Yubi's experience, skills, or projects beyond what's hardcoded.
3. **No observability** — no structured logging, no centralized log store, no cross-service request tracing. Debugging requires jumping between Render, Cloud Run, and Vercel dashboards with no way to correlate events across services.
4. **Minor UI polish needed** — small visual improvements to the terminal interface (lower priority).

---

## 2. Goals

1. **Redesign MCP tools around portfolio intent, not GitHub API operations.** Replace generic GitHub tools with domain-specific tools (e.g., `get_projects`, `get_skills`, `get_work_history`). The FastAPI backend handles all data aggregation internally — the LLM should never need to reason about which GitHub API calls to make.
2. **Implement RAG for resume/knowledge base** — even though the resume is small, this serves as a hands-on learning project for RAG patterns applicable at FSAI.
3. **Add lightweight observability** — structured JSON logging across FastAPI and MCP server, centralized in Grafana Cloud (Loki), with cross-service request correlation. Zero cost.
4. **Small UI improvements** to the terminal interface (lower priority, scoped separately).

---

## 3. Architecture — Current vs Revised

### Current Flow (the problem)

```
Visitor → React Terminal UI → FastAPI (MCP Client) → MCP Server
                                                        ↓
                                                   Tools mirror GitHub API:
                                                   - list_repositories(type, sort, direction, per_page, page)
                                                   - get_repository(owner, repo)
                                                   - search_repositories(q, sort, order, per_page, page)
                                                   - get_repository_contents(owner, repo, path, ref)
                                                        ↓
                                                   GitHub API (direct)
```

The LLM receives these generic tools and has to figure out: "to answer 'what projects has Yubi built?', I need to call `list_repositories` with `type=owner`, then maybe `get_repository_contents` for each one to get READMEs..." — this is the wrong level of abstraction.

### Revised Flow

```
Visitor → React Terminal UI → FastAPI (MCP Client, generates request_id)
                                 ├── LLM with RAG context
                                 ├── Structured logs ──→ Grafana Cloud (Loki)
                                 ↓
                              MCP Server (receives request_id)
                                 ├── Structured logs ──→ Grafana Cloud (Loki)
                                 ↓
                              Portfolio-intent tools:
                              - get_projects()        → curated project list with descriptions, stack, links
                              - get_project_detail()   → deep dive on a specific project
                              - get_skills()           → technologies and proficiency
                              - get_work_history()     → career background
                              - query_resume()         → RAG-powered resume/background queries
                              - (future: get_blog_posts, get_case_studies, etc.)
                                 ↓
                              FastAPI internal services
                              (aggregates from GitHub API, curated data, vector store, etc.)
```

### Key Architectural Change

**Tools shift from API-operation-level to portfolio-intent-level.** The MCP server stays as the central tool layer — this is important for extensibility, since new tools (blog posts, case studies, contact form, etc.) can be registered in the same place. The change is *what* the tools do: instead of wrapping GitHub API operations, they map to the kinds of questions visitors actually ask. All data aggregation happens behind the tools in FastAPI internal services.

```
BEFORE:  LLM decides → which GitHub API calls to make → MCP Server → GitHub API
AFTER:   LLM decides → which portfolio question to answer → MCP Server → FastAPI services (does all the work)
```

---

## 4. Workstreams

### 4.1 MCP Server Redesign — Portfolio-Intent Tools (Priority: High)

**Objective:** Replace generic GitHub API tools with domain-specific tools that map to visitor questions. Move all data aggregation logic into FastAPI.

**Current tools (to be removed):**

- `list_repositories(type, sort, direction, per_page, page)` — generic GitHub API wrapper
- `get_repository(owner, repo)` — generic GitHub API wrapper
- `search_repositories(q, sort, order, per_page, page)` — generic GitHub API wrapper
- `get_repository_contents(owner, repo, path, ref)` — generic GitHub API wrapper

**New tools (portfolio-intent):**

- `get_projects()` — returns list of projects with description, tech stack (topics), GitHub links, stars, last updated
- `get_project_detail(project_name)` — returns deep dive on a specific project (README content, language breakdown, stats)
- `get_skills()` — infers tech skills by aggregating languages and topics across all GitHub repos
- `get_work_history()` — returns career timeline and role descriptions (RAG / LinkedIn — see 4.2)
- `query_resume(question)` — RAG-powered query against resume and knowledge base (see 4.2)

**Data source decisions (locked in):**

- **No static data files.** All project and skill data comes from GitHub API on demand — stays in sync with the actual profile automatically.
- **Skills are inferred, not curated.** `get_skills()` aggregates repo languages and topic tags across all owned repos. Frequency = number of repos using that language/tech. This avoids manual maintenance.
- **Work history and resume are RAG-only.** `get_work_history()` and `query_resume()` will be powered by resume ingestion + vector store (and optionally LinkedIn web fetch). They are stubs until the RAG pipeline is built (see 4.2). No GitHub API approximation.
- **GitHub API called directly in MCP server for Bite 1 (phased approach).** The end-state goal is MCP → FastAPI → (GitHub API, vector store), but during Bite 1 the MCP server calls GitHub API directly. Once the FastAPI backend is built, the MCP tools will delegate to it — only the internals change, not the tool interfaces.

**FastAPI backend tasks (future — Bite 2+):**

- Build internal service layer that aggregates data from GitHub API and vector store
- Expose endpoints consumed by MCP tools (replaces direct GitHub API calls in MCP server)

**MCP server tasks:**

- ✅ Rewrite tool definitions with portfolio-intent schemas (Bite 1 — done)
- ✅ Add structured JSON logging (Bite 1 — done)
- Delegate to FastAPI internal services once backend is built (Bite 2+)
- Maintain stdio (dev) / streamable-http (prod) transport
- Future tools (blog posts, case studies, etc.) register here

**Outcome:** The LLM picks the right tool based on visitor intent, not based on which GitHub API to call. One tool call = one answer, no chaining required. MCP server remains the extensible tool layer for all future tools.

### 4.2 RAG Integration — Resume & Knowledge Base (Priority: High)

**Objective:** Enable the LLM to answer detailed questions about Yubi's experience, projects, skills, and background using RAG over the resume and a curated knowledge base.

**Approach:** Full RAG pipeline (not just system prompt injection), primarily as a learning exercise for production RAG patterns.

**Tasks:**

- Prepare documents for ingestion:
  - Resume (PDF/markdown)
  - Project descriptions and technical details
  - Skills and technology summaries
  - Work history narratives (FifthDomain, key projects)
- Choose and configure vector store (decision pending — options below)
- Build ingestion pipeline:
  - Chunk documents appropriately
  - Generate embeddings (model TBD — OpenAI `text-embedding-3-small` or similar)
  - Store in vector store
- Build retrieval pipeline:
  - On incoming query, generate embedding
  - Retrieve top-k relevant chunks
  - Inject into LLM context as grounding
- Expose as FastAPI endpoint: `POST /api/rag/query`
- Register as MCP tool so the LLM can use it for resume/background questions

**Vector Store Options (to evaluate):**

| Option | Pros | Cons | Notes |
|--------|------|------|-------|
| **pgvector (Neon Postgres)** | Already have Neon; no new infra; SQL-familiar | Scaling limits at high volume (not relevant here) | Good fit — reuse existing DB |
| **pgvector (Render Postgres)** | Co-located with backend; low latency | New DB to manage; Render free DB has limits | Check Render Postgres free tier + pgvector support |
| **Pinecone** | Purpose-built; great DX; managed | External dependency; free tier limits | Good learning opportunity for dedicated vector DB |
| **ChromaDB** | Lightweight; can run embedded | Less production-grade; self-hosted | Good for prototyping |

**Decision:** Deferred — will evaluate when starting this workstream. Leaning toward pgvector (Neon) for simplicity or Pinecone for the learning experience.

### 4.3 UI Improvements (Priority: Low) ✅ Complete

**Objective:** Small visual polish to the terminal interface.

**Delivered:**

- **Prompt rebranded** — `yubi@agent:~$` → `yubi@yubikhadka $` (natural user@host format, no inaccurate "agent" label)
- **Welcome message** — clean ASCII banner in sky-blue ANSI, short tagline, no emojis
- **Help output** — minimal layout, ANSI section headers, third-person example queries
- **Resume command** — `resume` opens `resume.pdf` in a new tab via `window.open` (no browser popup)
- **Code block syntax highlighting** — streaming-safe; fenced blocks in green, inline code in cyan
- **Dark / light theme toggle** — Sun/Moon icon button top-right; dark = original, light = Solarized Light (cream bg, cyan accent, 3-colour palette mirroring dark); persisted in `localStorage`
- **Mobile-responsive font size** — 13px below 640px viewport, updates on orientation change
- **Tab title** — updated to `yubi.ai`
- **Word wrap fix** — terminal fits after fonts load to ensure correct column count
- **`useTerminal` refactor** — god file split into `useTerminal` (orchestration), `useTerminalInput` (keyboard/input handling), and `useStreamingResponse` (SSE streaming + status animation)
- **Terminal viewport bottom padding** — added `padding-bottom: 24px` to `.xterm-viewport` so the prompt isn't flush against the bottom edge after a response

### 4.4 Observability — Structured Logging & Centralized Log Store (Priority: Medium)

**Objective:** Add structured logging to FastAPI and MCP server with cross-service request correlation, centralized in Grafana Cloud (Loki). Zero additional cost.

**Approach:** Built-in platform observability (Vercel, Render, Cloud Run, Neon dashboards) covers per-layer visibility out of the box. The gap is cross-service correlation — following a single visitor query from FastAPI through the MCP server, vector store, and back. This workstream fills that gap with structured JSON logging and a centralized log store.

> **Cost note:** Grafana Cloud free tier provides 50 GB logs/month with 30-day retention. At this project's traffic volume, usage won't come close to those limits. No additional database is needed — Loki *is* the log storage layer, fully managed by Grafana Cloud.

#### What's Already Available (no work needed)

Each platform in the stack provides built-in observability at no cost:

- **Vercel** — Web Vitals analytics, function logs, Edge Middleware logs, deploy logs (all visible in Vercel dashboard)
- **Render** — Application logs (stdout/stderr), deploy logs, HTTP request metrics, basic health monitoring (visible in Render dashboard; log persistence included on Starter plan)
- **Google Cloud Run** — Cloud Logging (every request, cold start, error, container lifecycle), Cloud Monitoring (request count, latency, error rate) — all automatic and free at this volume
- **Neon** — Query stats, connection counts, storage usage (visible in Neon dashboard)

These remain the first line of visibility. The centralized layer below supplements, not replaces, them.

#### What This Workstream Adds

**1. Request ID correlation across services**

FastAPI middleware generates a `request_id` (e.g., `req_abc123`) at the start of every incoming request. This ID is passed to the MCP server as a header/parameter on every tool call. Both services include the `request_id` in every log line, enabling cross-service correlation — search by one ID and see the full journey of a request.

**2. Structured JSON logging in FastAPI and MCP server**

Replace unstructured print/log statements with structured JSON. Every log line includes a consistent schema:

```json
{
  "timestamp": "2026-03-31T10:15:32.451Z",
  "service": "fastapi",
  "request_id": "req_abc123",
  "visitor_id": "v_456",
  "event": "tool_call_start",
  "tool": "get_projects",
  "endpoint": "/api/chat",
  "duration_ms": null
}
```

```json
{
  "timestamp": "2026-03-31T10:15:32.593Z",
  "service": "mcp-server",
  "request_id": "req_abc123",
  "event": "tool_execution",
  "tool": "get_projects",
  "duration_ms": 142,
  "status": "success"
}
```

**Standard fields** (every log line): `timestamp`, `service`, `request_id`, `event`, `level` (info/warn/error).

**Per-event fields** (as relevant): `visitor_id`, `tool`, `endpoint`, `duration_ms`, `status`, `error_message`.

**RAG-specific fields** (for `query_resume` calls): `query`, `chunks_retrieved`, `retrieval_duration_ms`, `embedding_duration_ms`, `llm_duration_ms`. These will be critical for tuning the RAG pipeline — identifying whether slowness is in embedding, retrieval, or LLM generation.

**What NOT to log:** Full LLM responses, full retrieved chunks, or visitor message content. These are large and unnecessary in a log store. Keep logs lean and structured.

**3. Centralized log store: Grafana Cloud (Loki)**

Both services push structured JSON logs to Grafana Cloud's hosted Loki instance via its HTTP push API (`/loki/api/v1/push`). Grafana provides the query interface (LogQL) and dashboards.

- **FastAPI:** Use a Python logging handler (e.g., `python-logging-loki` or a lightweight custom handler that POSTs to Loki's push endpoint)
- **MCP server:** Same pattern — structured JSON logger with Loki push handler
- **Auth:** Grafana Cloud API key stored as a secret in Render (for FastAPI) and GCP Secret Manager (for MCP server) — consistent with existing secrets management patterns

**4. Basic Grafana dashboards (stretch)**

Once logs are flowing, optionally build 1–2 dashboards:

- **Request overview** — volume over time, error rate, p50/p95 latency
- **RAG performance** — retrieval latency, chunks retrieved per query, embedding vs LLM time breakdown

These are a stretch goal — the primary value is searchable, correlated logs.

#### Tasks

- Set up Grafana Cloud free account, obtain Loki push URL and API key
- Build structured JSON logging utility module in FastAPI (formatter + Loki push handler)
- Add `request_id` middleware to FastAPI (generates ID, attaches to request context, includes in all logs)
- Pass `request_id` to MCP server on every tool call (header or parameter)
- Mirror structured logging setup in MCP server (same schema, same Loki endpoint)
- Store Grafana Cloud API key as secret in Render (`GRAFANA_LOKI_API_KEY`) and GCP Secret Manager
- Verify logs appear in Grafana Cloud, test cross-service correlation by `request_id`
- (Stretch) Build basic Grafana dashboard for request overview

#### Outcome

A single place (Grafana Cloud) to search and correlate logs across FastAPI and MCP server. Debugging "why was this response slow?" or "why did the LLM give a weird answer?" no longer requires jumping between four dashboards. RAG performance is measurable from day one. The observability patterns (structured logging, correlation IDs, centralized log aggregation) are directly applicable to production systems at FSAI.

#### Learning Value

This workstream covers production-relevant observability patterns: structured logging, distributed request correlation, log aggregation with Loki/Grafana, and LogQL querying. These map directly to how production systems are monitored and debugged, making this a valuable learning exercise alongside the RAG work.

---

## 5. Technical Decisions (Pending)

| Decision | Options | Status |
|----------|---------|--------|
| Vector store | pgvector (Neon), pgvector (Render), Pinecone, ChromaDB | Pending |
| Embedding model | OpenAI text-embedding-3-small, Cohere, local model | Pending |
| LLM for responses | Claude (current?), OpenAI, mixed | Confirm current |
| Chunking strategy | Fixed-size, semantic, document-level | Pending |
| Resume format for ingestion | Markdown (preferred for clean chunking) vs PDF | Pending |
| Log shipping to Loki | `python-logging-loki` library vs custom HTTP handler | Pending |

---

## 6. Non-Goals (for now)

- No frontend framework migration (staying on Vite + React)
- No major UI redesign
- No visitor tracking system changes (Neon + Edge Middleware stays as-is)
- No deployment/hosting changes yet — deployment decisions deferred until architecture is solid
- No paid observability tooling — Grafana Cloud free tier only
- No frontend log shipping — observability is backend-only (FastAPI + MCP server); Vercel's built-in analytics covers the frontend

### Hosting Cost Note

FastAPI backend is currently on Render's paid Starter plan. Goal is to move to free tier or keep costs under ~$5 AUD/month. Deployment and hosting optimisation will be discussed once the architecture is finalised. Options to evaluate later: Render free tier, Railway, Fly.io, Google Cloud Run (already used for MCP server), etc.

---

## 7. Success Criteria

1. MCP server contains zero direct external API calls — all routed through FastAPI *(end-state goal; Bite 1 still calls GitHub API directly from MCP server — will migrate to FastAPI delegation in Bite 2+)*
2. LLM can accurately answer questions about Yubi's resume, projects, skills, and work history using RAG
3. RAG pipeline is documented and reusable as a reference implementation
4. Terminal UI has noticeable polish improvements
5. No regression in current functionality (visitor tracking, conversations)
6. All FastAPI and MCP server requests emit structured JSON logs to Grafana Cloud (Loki) with cross-service `request_id` correlation
7. RAG pipeline performance (retrieval time, embedding time, LLM time) is measurable from logs

---

## 8. Implementation Order

1. **MCP Server Redesign** — ✅ Bite 1 complete. Portfolio-intent tools implemented (`get_projects`, `get_project_detail`, `get_skills`, `get_work_history` stub, `query_resume` stub). Structured JSON logging added. GitHub API called directly from MCP server for now.
2. **Observability** — Structured JSON logging is in the MCP server (Bite 1). Cross-service `request_id` correlation and Grafana Cloud Loki integration to be added when FastAPI backend is built.
3. **FastAPI Backend** — Build service layer; expose endpoints the MCP server will delegate to. Move GitHub API calls from MCP → FastAPI. Implement RAG pipeline (`query_resume`, `get_work_history`).
4. **RAG Integration** — Resume ingestion, vector store, retrieval pipeline. Powers `query_resume` and `get_work_history`. Optionally add LinkedIn web fetch.
5. **UI Improvements** — ✅ Complete. See 4.3.

> **Note on ordering:** Observability is listed as step 2 but should be implemented *alongside*, not after. Structured logging is already in the MCP server. Full cross-service correlation will be added when the FastAPI backend is built.

---

## 9. Future Enhancements / Bonus

### MCP Server Security

#### Already Implemented

- **Private Cloud Run deployment** — `--no-allow-unauthenticated` locks down the endpoint; not publicly accessible
- **GCP Secret Manager** — GitHub token injected at runtime via `--set-secrets`, not baked into the image
- **Dedicated runtime service account** — `mcp-runtime` with least-privilege (`secretmanager.secretAccessor` only)
- **Dedicated invoker service account** — `mcp-invoker` with `roles/run.invoker` only, so only the FastAPI backend on Render can call the MCP server
- **Service account key on Render** — `GCP_SA_KEY` stored as a secret env var for backend → MCP auth
- **Build hygiene** — `.gcloudignore` and `.dockerignore` exclude `.env` and sensitive files

#### Still to Explore

- **Tool-level permissions / rate limiting** — currently anyone who can invoke the service can call any tool with any input; consider restricting or rate-limiting per tool
- **Input validation & sanitisation** — preventing prompt injection or malicious tool inputs at the MCP tool level
- **Application-level auth** — is GCP IAM sufficient, or should there be an additional application-level token/header between FastAPI and MCP server?
- **Audit logging** — tracking tool calls, inputs, and response times for debugging and monitoring *(partially addressed by 4.4 Observability — structured logs capture tool calls, inputs, and durations; full audit logging with persistence beyond 30 days is a future consideration)*
- **Abuse protection** — rate limiting at the application level (GCP IAM prevents unauthorised access, but doesn't limit call volume from authorised callers)

This is also a great learning area that maps directly to production MCP deployments at FSAI.

---

### Frontend Token Storage — httpOnly Cookies vs localStorage

#### Current state

The FastAPI backend returns auth tokens (grant token, access token) as JSON in the response body. The frontend stores them in **localStorage**.

#### Why this is architecturally wrong

localStorage is accessible to any JavaScript running on the page. If the frontend ever has an XSS vulnerability — injected script, a compromised npm dependency, a browser extension — an attacker can read the token directly from `localStorage` and use it to make authenticated requests.

**httpOnly cookies** are the correct storage mechanism for auth tokens:
- They are completely inaccessible to JavaScript — `document.cookie` cannot read them
- The browser sends them automatically on same-origin requests
- An XSS attack cannot steal them, even if it can run arbitrary JS

#### What the correct architecture looks like

Instead of returning tokens in JSON:
```
POST /auth/token → { "access_token": "..." }   ← frontend stores in localStorage
```

The backend sets the token as a `Set-Cookie` response header:
```
POST /auth/token → Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict
```

The frontend makes authenticated requests without ever touching the token — the browser attaches it automatically.

#### Why it's not implemented yet

The frontend (Vercel) and backend (Render) are on **different domains** — `yubikhadka.com` and the Render URL. Cross-origin httpOnly cookies require:
1. Backend sets `SameSite=None; Secure` on the cookie
2. Backend CORS config includes `allow_credentials=True` and explicit origin (already done)
3. Frontend fetch calls include `credentials: "include"`
4. Both must be on HTTPS (already the case)

The current `allow_credentials=True` in CORS is already set up for this. The main change is backend switching from JSON response to `Set-Cookie`, and frontend removing localStorage handling.

#### Risk assessment for this portfolio site

| Factor | Assessment |
|--------|-----------|
| Token lifetime | Access token: 60s — very short, limits exposure window |
| Data sensitivity | No user data; worst case = portfolio queries on visitor's behalf |
| XSS surface | Vercel-hosted React app — low risk, no user-generated content rendered |
| Priority | Medium — architecture is wrong, but blast radius is minimal |

#### Recommended implementation path

1. Backend: change `/auth/token` to return `Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=None` instead of JSON body
2. Backend: change `/auth/session` grant token similarly
3. Backend: auth middleware reads token from cookie instead of `Authorization` header (or support both during transition)
4. Frontend: remove localStorage token storage, add `credentials: "include"` to fetch calls
5. Backend: tighten `ALLOWED_ORIGINS` to exact production domain only (no wildcards)

---

### Caching Strategy

The current system makes several expensive calls on every request. Caching at multiple layers would reduce latency and OpenAI spend significantly.

#### MCP Tool Schema Cache (partially implemented)

- **What:** `tools/list` response from the MCP server — the 5 portfolio tool schemas never change at runtime.
- **Current state:** In-process `MCP_TOOLS_CACHE` in `state.py` stores the result after the first call and reuses it for the lifetime of the FastAPI process. Cleared on `/mcp/reinitialize`.
- **Limitation:** Cache is lost on every process restart (Render spins down on inactivity). On cold start, the first request still pays the `tools/list` roundtrip.
- **Future improvement:** Persist the schema cache across restarts (e.g., write to a local file on disk or store in Redis) so cold starts are also cache hits.

#### MCP Tool Result Cache

- **What:** Cache the output of `tools/call` for tools whose data changes infrequently — specifically `get_projects` and `get_work_history`. These hit the GitHub API and/or vector store; the underlying data changes at most a few times a day.
- **Approach:** Keyed by `(tool_name, tool_args_hash)`. TTL of 5–15 minutes for GitHub-backed tools; longer for static tools like `get_work_history`.
- **Where to cache:** In-process dict (simplest, lost on restart), or Redis (persistent, shared across instances if ever scaled).
- **Benefit:** Eliminates GitHub API roundtrips for repeated or common queries (e.g., "what projects has Yubi built?" is likely the most frequent prompt). Also absorbs GitHub rate limit pressure.
- **Not applicable to:** `get_project_detail` (varies by project name) and `query_resume` (varies by free-text question) — these have high cardinality keys and are poor cache candidates unless exact-match queries are common.

#### OpenAI Prompt Caching

- **What:** OpenAI automatically applies a 50% token discount on the prompt prefix when the same prefix is reused across requests. This is called [prompt caching](https://platform.openai.com/docs/guides/prompt-caching) and requires no code changes — it activates automatically when the cached prefix is ≥ 1,024 tokens and was used recently.
- **How to exploit it:** Structure prompts so the static parts (system prompt, tool schemas) appear at the top, and the variable parts (user query, session history) appear at the end. The more stable the prefix, the higher the cache hit rate.
- **Current state:** Not explicitly optimised for. The summarization system prompt and `PORTFOLIO_SYSTEM_PROMPT` (with tool schemas) are large and stable — these are the best candidates.
- **Actionable changes:**
  - In `call_with_tools`: system prompt + tool schemas come first (already the case), user message last — no change needed.
  - In `build_summarize_messages`: system prompt first, session history second, user message + portfolio data last — already structured correctly.
  - Avoid prepending dynamic content (timestamps, request IDs) to system prompts — that would bust the cache prefix every request.
- **Expected savings:** 50% discount on system prompt + tool schema tokens. At `gpt-4o`, tool schemas alone are ~500 tokens per request — savings compound at scale.

#### Summary

| Cache Layer | Status | Benefit |
|-------------|--------|---------|
| MCP tool schemas (`tools/list`) | Implemented (in-process) | Removes 1 MCP roundtrip per request |
| MCP tool results (`tools/call`) | Not implemented | Removes GitHub API calls for common queries |
| OpenAI prompt caching | Implicit (OpenAI-side) | 50% token discount on stable prompt prefixes |
| MCP tool result persistence (across restarts) | Not implemented | Eliminates cold-start penalty for tool schemas |

---

### Parallel Multi-Tool Calls

**Status: Next up — to be implemented in `yubi-ai-portfolio-api`**

**Problem:** The current pipeline calls exactly one tool per request — whichever `gpt-4o` selects via `call_with_tools`. For questions that span multiple data sources (e.g. "what AI experience does Yubi have?"), a single tool produces an incomplete answer. `get_projects` covers GitHub projects but misses workplace AI work that only exists in the resume (`query_resume`). `query_resume` covers the resume but misses live project detail. The LLM has to pick one and the answer is always partial.

**Root cause (confirmed via code review):**

In `app/services/openai_client.py`:
```python
if message.get("tool_calls"):
    tool_call = message["tool_calls"][0]  # only first call used — rest discarded
```

OpenAI already returns all the tool calls the LLM wants to make — we just discard everything after the first.

**Proposed implementation — 3 files:**

**1. `app/services/openai_client.py` → `call_with_tools()`**
- Return all tool calls, not just `[0]`
- Change return type from `{"tool_name": str, "tool_args": dict}` to `{"tool_calls": [{"name": str, "args": dict}, ...]}`

**2. `app/services/prompt_processing.py` → `_process_with_mcp_tools()`**
- Handle the new list return from `call_with_tools`
- Execute all tool calls in parallel using `concurrent.futures.ThreadPoolExecutor` (keeps the sync HTTP transport, no async refactor needed)
- Merge all text results into a single combined context block before passing to the summarizer
- Graceful partial failure: if one tool errors, include the others and note the failure

**3. `app/prompts/templates.py` → summarizer system prompt**
- Update `_SUMMARIZE_SYSTEM` to handle multi-tool context (currently assumes single tool result)
- Format: each tool result labelled by source so the LLM can synthesise clearly

**Execution strategy:**
```python
from concurrent.futures import ThreadPoolExecutor, as_completed

with ThreadPoolExecutor() as executor:
    futures = {
        executor.submit(send_mcp_request, "tools/call", {"name": tc["name"], "arguments": tc["args"]}): tc["name"]
        for tc in tool_calls
    }
    results = {}
    for future in as_completed(futures):
        tool_name = futures[future]
        try:
            results[tool_name] = future.result()
        except Exception as e:
            results[tool_name] = f"[Error: {e}]"
```

**Impact:** Cross-domain questions ("what AI experience does Yubi have?", "tell me about Yubi's skills and projects") get answers synthesised from multiple sources in a single response, with no extra round-trips.

---

### Prompt Caching

**Status: Next up (after parallel tool calls) — to be implemented in `yubi-ai-portfolio-api`**

**How OpenAI prompt caching works:** OpenAI automatically caches prompt prefixes ≥1024 tokens and applies a 50% token discount on cache hits. No code opt-in required — it activates automatically based on prefix stability. The cache key is the exact token sequence of the prefix.

**Current state (confirmed via code review):**

`call_with_tools()` message order:
```python
messages = [system_prompt] + session_history[-4:] + [user_message]
```

The `PORTFOLIO_SYSTEM_PROMPT` is first (good), but session history sits between it and the user message, meaning the cached prefix only covers the system prompt. Tool schemas are included in the system prompt itself, so they are cached if the system prompt is stable.

**Potential cache-busting issue to verify:** Check whether `PORTFOLIO_SYSTEM_PROMPT` is built dynamically (e.g. f-string with timestamps, request IDs, or other per-request values). If so, the prefix changes every request and nothing is cached.

**Recommended changes:**

1. **Verify `templates.py`** — ensure `PORTFOLIO_SYSTEM_PROMPT` is a static string constant, not built at request time. Any dynamic values must go in the user message or a separate system message appended after the static prefix.

2. **Verify `_SUMMARIZE_SYSTEM`** — same check. The summarizer system prompt should be fully static.

3. **Message ordering for summarizer** in `build_summarize_messages()`:
   - Current order: `[summarize_system] + session_history + [user_message + tool_results]`
   - This is already correct for caching — static system prompt first, variable content last.
   - Confirm tool results are appended to the user message (not inserted between system and history), otherwise they break the cached prefix.

4. **Do NOT prepend** request IDs, timestamps, or per-session values to system prompts — this busts the cache on every request.

**Expected savings:** ~50% token cost on `PORTFOLIO_SYSTEM_PROMPT` + tool schema tokens for every request. At `gpt-4o` pricing, tool schemas alone are ~500 tokens — meaningful at scale, and the habit of structured prompt ordering is worth building now.

---

## 10. Notes

- RAG is intentionally implemented even though the resume is small enough for system prompt injection. The goal is hands-on learning with production RAG patterns (chunking, embeddings, vector search, retrieval) that will be directly applicable at FSAI.
- The revised architecture should make it trivial to add new tools in the future (e.g., blog posts, case studies) — just register a new tool in the MCP server and add the corresponding service in FastAPI.
- Observability (4.4) also serves as a learning exercise — structured logging, Loki/Grafana, LogQL, and distributed request correlation are standard production patterns. Grafana Cloud free tier means this learning comes at zero cost.
