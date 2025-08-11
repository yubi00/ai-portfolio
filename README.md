# AI Portfolio Terminal

A single-page, terminal-style portfolio web app powered by an AI agent that can connect to multiple MCP servers (e.g., GitHub MCP, LinkedIn MCP), using a React + Vite + Tailwind frontend with xterm.js, and a Node/Express + WebSocket backend prepared to integrate with an agent (AWS Bedrock Agents or other LLM toolchains).

## Tech Stack
- Client: React + Vite + TypeScript, TailwindCSS, xterm.js
- Server: Node.js + TypeScript, Express, ws

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
This starts the Vite dev server on http://localhost:5173 and the API/WebSocket server on http://localhost:8787.

3. Build
```bash
npm run build
```

## Roadmap
- Plug in an Agent abstraction that routes prompts to MCP tools (GitHub, LinkedIn) based on intent
- Replace echo handler with real tool execution and streamed token output
- Add command history, help, and lightweight prompt templates
- Later: auth, profiles, deploy
