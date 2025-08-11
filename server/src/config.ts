import dotenv from 'dotenv'

dotenv.config()

function required(name: string, def?: string): string {
  const v = process.env[name] ?? def
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'fatal'|'error'|'warn'|'info'|'debug'|'trace'|'silent',
  awsRegion: required('AWS_REGION', 'ap-southeast-2'),
  bedrock: {
    agentId: required('BEDROCK_AGENT_ID'),
    agentAliasId: required('BEDROCK_AGENT_ALIAS_ID'),
    sessionStrategy: process.env.BEDROCK_SESSION_STRATEGY ?? 'reuse',
  },
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
}
