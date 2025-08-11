import express, { Request, Response } from 'express'
import cors from 'cors'
import { config } from './config.js'
import { logger } from './utils/logger.js'

const app = express()
app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'ai-portfolio-server'
  })
})

// Basic info endpoint
app.get('/info', (_req: Request, res: Response) => {
  res.json({
    name: 'AI Portfolio Server',
    description: 'Backend server for GitHub portfolio AI assistant',
    githubMcpServer: 'Ready for AgentCore Runtime integration',
    port: config.port
  })
})

// Start server
const server = app.listen(config.port, () => {
  logger.info('🚀 AI Portfolio Server started successfully')
  logger.info(`📡 Server running on port ${config.port}`)
  logger.info(`🔗 Health check: http://localhost:${config.port}/health`)
  logger.info(`📋 Server info: http://localhost:${config.port}/info`)
  logger.info('')
  logger.info('🎯 Ready for GitHub MCP + AgentCore Runtime integration tomorrow!')
  logger.info('📁 GitHub MCP Server: ../mcp-github/ (FastMCP)')
})

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})
