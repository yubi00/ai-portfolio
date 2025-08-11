# Bedrock Agent Runtime + MCP Integration Guide

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd server
npm install axios  # Add axios for HTTP requests
```

### 2. Environment Configuration

Create or update your `.env` file:

```bash
# MCP Server Configuration
MCP_SERVER_URL=http://localhost:8081

# Bedrock Agent Configuration (Optional - will use local processing if not set)
BEDROCK_AGENT_ID=your_agent_id_here
BEDROCK_AGENT_ALIAS_ID=TSTALIASID
AWS_REGION=us-east-1

# AWS Credentials (if not using IAM roles)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Server Configuration  
PORT=3000
```

### 3. Start the Services

#### Terminal 1: Start MCP Server
```bash
cd mcp-github
npm install
npm run dev
# Should start on http://localhost:8081
```

#### Terminal 2: Start Portfolio Agent
```bash
cd server
npm run dev:agent  # or tsx watch src/simplePortfolioAgent.ts
# Should start on http://localhost:3000
```

### 4. Test the Integration

#### Check Health Status
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "simple-portfolio-agent",
  "connections": {
    "bedrock": false,  // true if Bedrock is configured
    "mcp": true       // true if MCP server is running
  },
  "environment": {
    "bedrockConfigured": false,
    "agentId": "✗ Missing",
    "aliasId": "✗ Missing"
  }
}
```

#### Test Chat (Local Processing)
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my recent repositories?"}'
```

Expected response:
```json
{
  "success": true,
  "response": "Here are your recent repositories:\n\n1. **ai-portfolio** (TypeScript)\n   AI-powered portfolio...",
  "usingBedrock": false,
  "timestamp": "2025-08-12T10:30:00Z"
}
```

## 🤖 Setting Up Bedrock Agent (AWS Console)

### 1. Create a Bedrock Agent

1. Go to AWS Bedrock Console
2. Navigate to "Agents" section
3. Click "Create Agent"
4. Configure:
   - **Name**: `github-portfolio-agent`
   - **Description**: `AI assistant for GitHub portfolio management`
   - **Foundation Model**: `Anthropic Claude 3 Sonnet`

### 2. Agent Instructions

Use this instruction prompt:

```
You are a GitHub Portfolio Assistant that helps users explore and understand their GitHub repositories.

You have access to GitHub data through external tools that provide:
- Repository listings with metadata (stars, forks, languages)
- Detailed repository information including README content
- Repository search capabilities

When users ask about their projects, use the available tools to get current data and provide helpful insights about their coding activity.

Always be conversational and highlight interesting aspects of their repositories.
```

### 3. Create Action Group

1. In your agent, click "Add Action Group"
2. Configure:
   - **Name**: `GitHubMCP`
   - **Description**: `Access GitHub repositories through MCP server`
   - **Action Group Type**: `Define with API schemas`

3. **OpenAPI Schema**:
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "GitHub MCP API",
    "version": "1.0.0"
  },
  "paths": {
    "/tools/call": {
      "post": {
        "summary": "Call MCP tool",
        "description": "Execute a GitHub-related tool through the MCP server",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "tool": {
                    "type": "string",
                    "enum": ["list_repositories", "get_repository", "search_repositories"],
                    "description": "The GitHub tool to execute"
                  },
                  "type": {
                    "type": "string",
                    "enum": ["all", "owner", "member"],
                    "description": "For list_repositories: type of repos to list"
                  },
                  "sort": {
                    "type": "string", 
                    "enum": ["created", "updated", "pushed", "full_name"],
                    "description": "For list_repositories: sort order"
                  },
                  "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "description": "Maximum number of results"
                  },
                  "name": {
                    "type": "string",
                    "description": "For get_repository: repository name"
                  },
                  "query": {
                    "type": "string", 
                    "description": "For search_repositories: search query"
                  }
                },
                "required": ["tool"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successful tool execution",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {"type": "boolean"},
                    "result": {"type": "object"}
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

4. **Lambda Function**: Create a Lambda that forwards requests to your MCP server, or use direct HTTP if possible.

### 4. Prepare and Test Agent

1. Click "Prepare" to validate the agent configuration
2. Test with sample queries in the AWS console
3. Create an alias (e.g., `TSTALIASID`)

### 5. Update Environment Variables

Once your agent is ready:

```bash
# Update .env with your agent details
BEDROCK_AGENT_ID=ABCDEFGHIJ          # From agent details page
BEDROCK_AGENT_ALIAS_ID=TSTALIASID    # Your alias ID
AWS_REGION=us-east-1                 # Region where agent is deployed
```

## 🧪 Testing Bedrock Integration

### 1. Restart Portfolio Agent
```bash
# In server directory
npm run dev:agent
```

### 2. Check Bedrock Status
```bash
curl http://localhost:3000/health
```

Should now show:
```json
{
  "connections": {
    "bedrock": true,   // Now true!
    "mcp": true
  },
  "environment": {
    "bedrockConfigured": true,
    "agentId": "✓ Set",
    "aliasId": "✓ Set"
  }
}
```

### 3. Test Bedrock Chat
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my most popular GitHub projects?"}'
```

Should respond with:
```json
{
  "success": true,
  "response": "Based on your GitHub repositories, here are your most popular projects...",
  "usingBedrock": true,  // Now true!
  "sessionId": "session-xxx"
}
```

## 🔧 Troubleshooting

### Issue: "Bedrock agent invocation failed"
- Check AWS credentials and permissions
- Verify agent ID and alias ID are correct
- Ensure agent is in "Prepared" state

### Issue: "MCP server is not running"
- Make sure MCP server is running on port 8081
- Check GitHub token and owner configuration
- Verify MCP health endpoint: `curl http://localhost:8081/health`

### Issue: "Action group invocation failed"
- Check Lambda function logs (if using Lambda)
- Verify OpenAPI schema matches your MCP server
- Test MCP server directly

## 📊 Architecture Flow

```
User Query 
    ↓
Portfolio Agent 
    ↓ (if Bedrock configured)
Bedrock Agent Runtime
    ↓ (determines need for GitHub data)
Action Group → Lambda/HTTP
    ↓
MCP Server
    ↓
GitHub API
    ↓ (results flow back)
AI-generated Response
```

## 🎯 Next Steps

1. **Get basic setup working** - MCP server + local processing
2. **Create Bedrock agent** - Follow AWS console steps
3. **Test integration** - Verify Bedrock calls MCP server
4. **Build frontend** - React chat interface
5. **Deploy to production** - AWS infrastructure

You now have a working foundation that can scale from simple local processing to full AWS-powered AI conversations! 🚀
