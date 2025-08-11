import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load env from multiple locations to work in a monorepo/workspaces setup
dotenv.config() // default: current working directory
try {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  // server/.env (when running from repo root, dist __dirname -> server/dist)
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') })
  // repo root .env (two levels up from dist: server/dist -> server -> repo root)
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') })
  // server/.env relative to current working directory (monorepo root start)
  dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') })
} catch {}

function required(name: string, def?: string): string {
  const v = process.env[name] ?? def
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'fatal'|'error'|'warn'|'info'|'debug'|'trace'|'silent',
  awsRegion: required('AWS_REGION', 'ap-southeast-2'),
  bedrock: {
    agentId: required('BEDROCK_AGENT_ID'),
    agentAliasId: required('BEDROCK_AGENT_ALIAS_ID'),
    sessionStrategy: process.env.BEDROCK_SESSION_STRATEGY ?? 'reuse',
    memoryId: process.env.BEDROCK_MEMORY_ID || 'TST_MEM_ID',
  },
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
  
  // MCP Servers configuration
  mcpServers: {
    github: {
      enabled: process.env.MCP_GITHUB_ENABLED !== 'false',
      port: Number(process.env.MCP_GITHUB_PORT || 8081),
      endpoint: process.env.MCP_GITHUB_ENDPOINT || 'http://localhost:8081',
      // GitHub MCP server credentials
      githubToken: process.env.GITHUB_TOKEN,
      githubOwner: process.env.GITHUB_OWNER || 'yubi00',
      githubRepo: process.env.GITHUB_REPO,
    },
    linkedin: {
      enabled: process.env.MCP_LINKEDIN_ENABLED === 'true',
      port: Number(process.env.MCP_LINKEDIN_PORT || 8082),
      endpoint: process.env.MCP_LINKEDIN_ENDPOINT || 'http://localhost:8082',
    }
  },
  
  // Lambda functions that bridge Bedrock Agent to MCP servers
  lambda: {
    githubActionGroup: {
      functionName: process.env.GITHUB_ACTION_GROUP_LAMBDA_NAME || 'github-mcp-bridge',
      arn: process.env.GITHUB_ACTION_GROUP_LAMBDA_ARN,
    },
    linkedinActionGroup: {
      functionName: process.env.LINKEDIN_ACTION_GROUP_LAMBDA_NAME || 'linkedin-mcp-bridge',
      arn: process.env.LINKEDIN_ACTION_GROUP_LAMBDA_ARN,
    }
  }
}
