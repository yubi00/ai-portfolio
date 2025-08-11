# GitHub MCP Server

This server provides an HTTP bridge to the official GitHub MCP server for integration with AWS Bedrock Agents.

## Setup

1. Copy `.env.example` to `.env` and fill in your GitHub token:
```bash
cp .env.example .env
```

2. Install dependencies:
```bash
npm install
```

3. Start in development mode:
```bash
npm run dev
```

## Environment Variables

- `GITHUB_TOKEN`: Your GitHub personal access token
- `GITHUB_OWNER`: Your GitHub username (e.g., "yubi00")
- `GITHUB_REPO`: (Optional) Specific repository to focus on
- `PORT`: Server port (default: 8081)
- `LOG_LEVEL`: Logging level (info, debug)

## API Endpoints

### Health Check
```
GET /health
```

### List Tools
```
GET /tools
```

### Call Tool
```
POST /tools/{toolName}
Content-Type: application/json

{
  "arg1": "value1",
  "arg2": "value2"
}
```

### Portfolio Specific Endpoints

#### List Repositories
```
GET /repositories
```

#### Get Repository Details
```
GET /repositories/{repoName}
```

## Integration with Bedrock Agent

This server acts as a bridge between AWS Lambda functions (triggered by Bedrock Agent action groups) and the official GitHub MCP server.

The flow is:
1. Bedrock Agent → Lambda Function
2. Lambda Function → This HTTP Server
3. HTTP Server → GitHub MCP Server (via stdio)
4. Response flows back through the chain
