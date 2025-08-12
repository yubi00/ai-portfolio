# AI Portfolio Terminal

A simple terminal-style portfolio web app with a React frontend and Express backend, ready for AI integration through HTTP APIs and MCP servers (e.g., GitHub MCP, LinkedIn MCP).

## Tech Stack
- Client: React + Vite + TypeScript, TailwindCSS, xterm.js
- Server: Node.js + TypeScript, Express

## Dev Quickstart

1. Install dependencies
```bash
# In project root
npm run bootstrap
```

2. Start dev servers
```bash
npm run dev
```
This starts the Vite dev server on http://localhost:5173 and the Express API server on http://localhost:3001.

3. Build
```bash
npm run build
```

## Roadmap
- Add HTTP API endpoints for AI agent integration
- Connect to MCP servers (GitHub, LinkedIn) for portfolio data
- Add command history, help, and lightweight prompt templates
- Later: auth, profiles, deploy

See TODO.md for a detailed, phased plan with actionable tasks.

## Simple Architecture

The current setup is intentionally simple:
- **Frontend**: React terminal interface with basic command handling
- **Backend**: Express server with health/info endpoints
- **Future**: HTTP APIs for AI integration, MCP server connections
