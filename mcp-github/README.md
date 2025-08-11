# GitHub MCP Server (FastMCP)

A powerful GitHub MCP server built with FastMCP TypeScript, providing seamless GitHub API integration for AI assistants and AgentCore Runtime.

## 🚀 Features

- **Complete GitHub Integration**: List repositories, get details, search, and browse contents
- **AgentCore Runtime Ready**: Stateless HTTP streaming for AWS deployment
- **Type Safety**: Full TypeScript support with Zod validation
- **Multiple Transports**: stdio for development, HTTP streaming for production
- **Built-in CLI**: FastMCP dev tools for testing and debugging
- **Error Handling**: Comprehensive error handling with user-friendly messages

## 📦 Installation

```bash
npm install
```

## 🔧 Configuration

1. Copy the environment example:
```bash
cp .env.example .env
```

2. Set your GitHub token in `.env`:
```bash
GITHUB_TOKEN=your_github_token_here
```

Get a token from: https://github.com/settings/personal-access-tokens/new

## 🎯 Usage

### Development Mode (stdio)
Perfect for testing with MCP Inspector or Claude Desktop:

```bash
npm run dev
```

### FastMCP Development Tools
Use the built-in FastMCP CLI for enhanced development:

```bash
# Interactive terminal testing
npm run dev:fastmcp

# Web UI inspection
npm run inspect
```

### Production Mode (HTTP)
For AgentCore Runtime or other HTTP-based deployments:

```bash
npm run build
npm run start:agentcore
```

Server runs on `http://localhost:8000/mcp`

## 🛠️ Available Tools

### `list_repositories`
List GitHub repositories for the authenticated user.

**Parameters:**
- `type` (optional): 'all', 'owner', 'public', 'private', 'member' (default: 'all')
- `sort` (optional): 'created', 'updated', 'pushed', 'full_name' (default: 'updated')
- `direction` (optional): 'asc', 'desc' (default: 'desc')
- `per_page` (optional): 1-100 (default: 30)
- `page` (optional): Page number (default: 1)

### `get_repository`
Get detailed information about a specific repository.

**Parameters:**
- `owner` (required): Repository owner username
- `repo` (required): Repository name

### `search_repositories`
Search for repositories on GitHub with advanced query support.

**Parameters:**
- `q` (required): Search query (supports GitHub search qualifiers)
- `sort` (optional): 'stars', 'forks', 'help-wanted-issues', 'updated'
- `order` (optional): 'asc', 'desc' (default: 'desc')
- `per_page` (optional): 1-100 (default: 30)
- `page` (optional): Page number (default: 1)

**Example queries:**
- `"react language:javascript stars:>1000"`
- `"machine learning topic:ai"`
- `"user:microsoft language:typescript"`

### `get_repository_contents`
Get the contents of a repository directory or file.

**Parameters:**
- `owner` (required): Repository owner username
- `repo` (required): Repository name
- `path` (optional): Path to file or directory (empty for root)
- `ref` (optional): Branch, tag, or commit SHA

## 🔌 AgentCore Runtime Deployment

The server automatically switches to stateless HTTP mode when deployed to AgentCore Runtime:

1. **Build the server:**
```bash
npm run build
```

2. **Deploy to AgentCore Runtime** (requires AWS CLI and appropriate permissions):
```bash
# The server will automatically detect AgentCore environment
# and run in stateless mode on port 8000 at /mcp endpoint
```

3. **Environment Variables for AgentCore:**
```bash
GITHUB_TOKEN=your_token
AGENTCORE=true
NODE_ENV=production
```

## 🧪 Testing

### With MCP Inspector
```bash
npm run inspect
```
Opens a web interface at http://localhost:3000 to test your server.

### With FastMCP CLI
```bash
npm run dev:fastmcp
```
Interactive terminal interface for testing tools.

### With Claude Desktop
Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["path/to/ai-portfolio/mcp-github/dist/github-server.js"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

## 📁 Project Structure

```
mcp-github/
├── src/
│   └── github-server.ts     # Main FastMCP server
├── dist/                    # Compiled JavaScript
├── package.json            # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── .env.example           # Environment template
└── README.md             # This file
```

## 🔒 Security

- Store GitHub tokens securely in environment variables
- Use personal access tokens with minimal required scopes
- Never commit tokens to version control
- For production, use proper secret management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `npm run dev:fastmcp`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [FastMCP](https://github.com/punkpeye/fastmcp) by punkpeye
- Uses [Octokit](https://github.com/octokit/octokit.js) for GitHub API integration
- Powered by [Model Context Protocol](https://modelcontextprotocol.io/)
