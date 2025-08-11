# AI Portfolio - Bedrock Inline Agent + MCP Integration

## Overview

This project demonstrates the integration of **Amazon Bedrock Inline Agents** with **Model Context Protocol (MCP) servers** to create an AI-powered GitHub portfolio assistant.

## Architecture

```
Frontend (React) → Bedrock Inline Agent → MCP Server → GitHub API
```

- **Frontend**: React/Next.js chat interface
- **Bedrock Inline Agent**: AWS-hosted AI agent with action groups
- **MCP Server**: Standardized GitHub API wrapper
- **GitHub API**: Repository data via Octokit

## Quick Start

### 1. Run the Demo
```bash
node demo.js
```
This shows how the components interact without requiring AWS setup.

### 2. Start MCP Server
```bash
cd mcp-github
npm install
npm run dev
```

### 3. Test MCP Server
```bash
# Check health
curl http://localhost:8081/health

# List repositories
curl -X POST http://localhost:8081/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "list_repositories", "arguments": {"limit": 5}}'
```

## Environment Setup

### MCP Server (.env)
```bash
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_OWNER=your_github_username
PORT=8081
```

### Bedrock Agent Server (.env)
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
BEDROCK_AGENT_ROLE_ARN=arn:aws:iam::account:role/bedrock-agent-role
MCP_SERVER_URL=http://localhost:8081
PORT=3000
```

## Key Files

### Core Implementation
- `mcp-github/src/index.ts` - MCP server with GitHub integration
- `server/src/agent/bedrockInlineAgent.ts` - Bedrock agent implementation (conceptual)
- `server/src/simplePortfolioAgent.ts` - Simplified working example

### Documentation
- `ARCHITECTURE.md` - Detailed architectural design
- `demo.js` - Interactive demonstration

## MCP Tools Available

1. **list_repositories** - Get user repositories with filtering
2. **get_repository** - Get detailed repo info including README
3. **search_repositories** - Search repos by query

## Example Interactions

**User**: "What are my recent repositories?"
**Agent**: Calls `list_repositories` with sort='updated'

**User**: "Tell me about my ai-portfolio project"  
**Agent**: Calls `get_repository` with name='ai-portfolio'

**User**: "Find TypeScript projects"
**Agent**: Calls `search_repositories` with query='TypeScript'

## Benefits

### 🎯 **Separation of Concerns**
- Frontend handles UI/UX
- Bedrock manages AI reasoning
- MCP server specializes in GitHub data
- GitHub API provides raw data

### 🚀 **Scalability** 
- Components scale independently
- MCP server serves multiple agents
- Stateless design enables horizontal scaling

### 🔧 **Flexibility**
- Easy to add new GitHub tools
- Agent auto-discovers capabilities  
- Multiple frontend interfaces possible

### 🛡️ **Maintainability**
- Clear separation of responsibilities
- Standardized MCP protocol
- Type-safe TypeScript throughout

## Deployment

### AWS Production Setup
1. Deploy MCP server to ECS/Fargate
2. Configure Bedrock agent with IAM role
3. Deploy frontend to CloudFront + S3
4. Set up ALB for load balancing

### Development
```bash
# Terminal 1: MCP Server
cd mcp-github && npm run dev

# Terminal 2: Agent Server  
cd server && npm run dev

# Terminal 3: Frontend
cd client && npm run dev
```

## Next Steps

1. **Complete Bedrock Integration**: Implement full AWS SDK integration
2. **Enhanced UI**: Build React chat interface with repository visualizations
3. **Additional Tools**: Add more GitHub API capabilities (issues, PRs, etc.)
4. **Authentication**: Implement OAuth for user-specific repositories
5. **Caching**: Add Redis caching layer for performance
6. **Monitoring**: Implement CloudWatch logging and metrics

## Contributing

This is a demonstration project showing the integration pattern. Feel free to:

- Fork and extend with additional MCP tools
- Improve the Bedrock agent implementation
- Add more sophisticated UI components
- Contribute to the documentation

## License

MIT License - See LICENSE file for details.
