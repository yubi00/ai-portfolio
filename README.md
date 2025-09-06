# AI Portfolio Terminal (Local MCP Server Setup)

A terminal-style portfolio web app with a Reactjs frontend and a Python FastAPI backend, powered by a local MCP (Model Context Protocol) server for AI-driven portfolio queries. This project is **for local development and testing only**. Remote MCP server support will be provided in a separate project.

---

## Project Overview

- **Frontend:** Terminal-inspired UI built with React, Vite, TypeScript, TailwindCSS, and xterm.js.
- **Backend:** Python FastAPI server that bridges the frontend to a local MCP server for AI-powered portfolio and GitHub queries.
- **MCP Server:** Local Python server (using FastMCP and PyGithub) that exposes tools for interacting with GitHub repositories and portfolio data using the Model Context Protocol (MCP).

---

## Demo

![AI Portfolio Terminal Demo](client/public/banner.png)
*Screenshot of the AI Portfolio Terminal interface*

---

## Tech Stack

- **Frontend:**
  - React
  - Vite
  - TypeScript
  - TailwindCSS
  - xterm.js
- **Backend:**
  - Python 3.9+
  - FastAPI
  - Uvicorn
  - OpenAI Python SDK
  - MCP (Model Context Protocol)
  - PyGithub
  - python-dotenv
  - requests

---

## Requirements

- Node.js 16+ and npm
- Python 3.9+
- OpenAI API key
- GitHub personal access token with repo scope

---

## Project Structure

```
ai-portfolio-terminal/
├── client/                   # React frontend
│   ├── public/               # Static assets
│   └── src/                  # React source code
│       ├── App.tsx           # Main terminal UI component
│       ├── main.tsx          # Entry point
│       └── *.css             # Styling
├── mcp-client/               # FastAPI backend
│   └── main.py               # API server, handles routing to MCP
├── mcp-server/               # Local MCP server
│   └── server.py             # GitHub MCP tools implementation
├── .env                      # Environment variables (create this)
└── requirements.txt          # Python dependencies
```

---

## Local Development Quickstart

### Prerequisites
- Node.js (for frontend)
- Python 3.9+ (for backend and MCP server)
- `pip` (Python package manager)

### 1. Install Frontend Dependencies
```bash
cd client
npm install
```

### 2. Install Backend & MCP Server Dependencies
```bash
pip install -r requirements.txt
```

### 3. Set Up Environment Variables
Create a `.env` file in the project root with the following (see `.env.example` if available):
```
OPENAI_API_KEY=your-openai-api-key
GITHUB_TOKEN=your-github-token
```
- `OPENAI_API_KEY` is required for AI responses.
- `GITHUB_TOKEN` is required for GitHub MCP tools.

### 4. Start the MCP Server (Local Only)
```bash
python3 mcp-server/server.py
```
- By default, runs in stdio mode for development. For HTTP mode, set `NODE_ENV=production` and it will listen on port 8000.

### 5. Start the FastAPI Backend
```bash
python3 mcp-client/main.py
```
- Runs the FastAPI server on [http://localhost:9000](http://localhost:9000)

### 6. Start the Frontend
```bash
cd client
npm run dev
```
- Runs the Vite dev server on [http://localhost:5173](http://localhost:5173)

---

## Architecture

```
[Browser]
   |
   v
[React + xterm.js Frontend]  <---(http)--->  [FastAPI Backend (mcp-client/main.py)]  <---(http/jsonrpc)--->  [Local MCP Server (mcp-server/server.py, Model Context Protocol)]
```
- The frontend sends user queries to the FastAPI backend.
- The backend routes queries to the local MCP server, which provides AI-powered responses and GitHub data using the Model Context Protocol.
- All components run locally for development/testing.

---

## Usage

- Open [http://localhost:5173](http://localhost:5173) in your browser.
- Interact with the terminal UI using natural language queries, e.g.:
  - `What are your latest projects?`
  - `Tell me about Lambda-MCP-Server`
  - `Show me the code for awesome-mcp-servers`
  - `What technologies do you use?`
- The backend will route your query to the MCP server and return a summarized, AI-generated response.

---

## Troubleshooting

- **Missing API Keys:** Ensure your `.env` file contains valid `OPENAI_API_KEY` and `GITHUB_TOKEN` values.
- **Port Conflicts:** Default ports are 5173 (frontend), 9000 (backend), and 8000 (MCP server HTTP mode). Change as needed.
- **MCP Server Not Running:** The backend requires the MCP server to be running locally. Start it with `python3 mcp-server/server.py`.
- **Python Version:** Use Python 3.9 or newer for best compatibility.
- **Connection Issues:** Make sure all three services (frontend, backend, MCP server) are running simultaneously.

---

## Roadmap / Next Steps

- [ ] Add support for remote MCP server deployments (will be a separate project/repo)
- [ ] Enhanced portfolio data and project metadata
- [ ] Improved terminal UX (command history, help, etc.)
- [ ] Authentication and user profiles
- [ ] Deployment guides for production

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Credits
- Built by Yubi. Powered by OpenAI, FastAPI, and MCP (Model Context Protocol).

---

*This README describes the local development setup only. For remote/production MCP server deployment, see the future remote MCP project.*# Fresh deployment
