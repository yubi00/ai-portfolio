import express, { Request, Response } from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { config } from './config'
import { logger } from './utils/logger'
import { BedrockAgent } from './agent/bedrockAgent'
import type { ClientToServer, ServerToClient } from './protocol'

const app = express()
app.use(cors())

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true })
})

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
let heartbeat: NodeJS.Timeout | null = null
const agent = new BedrockAgent()

wss.on('connection', (ws: WebSocket) => {
  // Heartbeat for dead-connection detection
  ;(ws as any).isAlive = true
  ws.on('pong', () => { (ws as any).isAlive = true })
  // One Bedrock session per WS connection
  let wsSessionId = Date.now().toString()
  const readyMsg: ServerToClient = { type: 'ready', protocol: '1.0' }
  ws.send(JSON.stringify(readyMsg))

  ws.on('message', async (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientToServer
      if (msg.type === 'prompt' && msg.content) {
        // Handle slash commands locally
        if (msg.content.trim().toLowerCase() === '/reset') {
          wsSessionId = Date.now().toString()
          const st: ServerToClient = { type: 'status', level: 'info', message: 'session reset' }
          ws.send(JSON.stringify(st))
          return
        }
        const inputId = msg.id ?? Date.now().toString()
        const recv: ServerToClient = { type: 'status', message: `received prompt ${inputId}` , level: 'info' }
        ws.send(JSON.stringify(recv))
        for await (const event of agent.handle({ id: inputId, text: msg.content, sessionId: wsSessionId })) {
          const out: ServerToClient =
            event.type === 'token' ? { type: 'token', id: event.id, content: event.content } :
            event.type === 'line' ? { type: 'line', id: event.id, content: event.content } :
            event.type === 'status' ? { type: 'status', message: event.message, level: event.level } :
            event.type === 'tool_result' ? { type: 'tool_result', id: event.id, tool: event.tool, data: event.data } :
            { type: 'error', id: event.id, message: event.message, code: event.code }
          ws.send(JSON.stringify(out))
        }
      }
    } catch (err) {
  const e = err as Error
  const out: ServerToClient = { type: 'error', message: 'Error: ' + e.message }
  ws.send(JSON.stringify(out))
  logger.error({ err: e }, 'ws message handling failed')
    }
  })
})

// Start heartbeat sweeper
heartbeat = setInterval(() => {
  wss.clients.forEach((ws: WebSocket) => {
    if (!(ws as any).isAlive) {
      try { ws.terminate() } catch {}
      return
    }
    ;(ws as any).isAlive = false
    try { ws.ping() } catch {}
  })
}, 30000).unref()

wss.on('close', () => {
  if (heartbeat) {
    try { clearInterval(heartbeat as unknown as NodeJS.Timeout) } catch {}
    heartbeat = null
  }
})

const PORT = config.port

// Helpful error handler to avoid unhandled 'error' crashes (e.g., EADDRINUSE)
function onListenError(err: unknown) {
  const e = err as NodeJS.ErrnoException
  if (e && e.code === 'EADDRINUSE') {
    logger.error(
      { port: PORT },
      `Port ${PORT} is already in use. If a previous dev server didn't exit cleanly, close it or free the port, then retry. You can also set PORT to another value.`
    )
    process.exitCode = 1
    return
  }
  logger.error({ err: e }, 'server listen error')
  process.exitCode = 1
}

server.on('error', onListenError)
wss.on('error', onListenError)

server.listen(PORT, () => {
  logger.info(`Server listening on http://localhost:${PORT}`)
})

// Graceful shutdown to release the port on Ctrl+C
let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutting down...')
  try {
    wss.clients.forEach((client) => {
      try {
        // Inform clients with a normal closure code and reason
        client.close(1001, 'server shutting down')
        // Force terminate if they don't close promptly
        setTimeout(() => { try { client.terminate() } catch {} }, 500).unref()
      } catch {}
    })
    wss.close(() => logger.info('websocket server closed'))
  } catch {}
  try {
    if (server.listening) {
      server.close((err?: Error) => {
        if (err) logger.error({ err }, 'http server close error')
        logger.info('http server closed')
        process.exit(0)
      })
    } else {
      logger.info('http server was not listening')
    }
  } catch (e) {
    logger.error({ err: e }, 'error during shutdown')
    process.exit(1)
  }
  // Fallback: force exit if not closed within 2s
  setTimeout(() => process.exit(0), 2000).unref()
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
// Windows console break (Ctrl+Break) or some terminals
process.once('SIGBREAK' as any, () => shutdown('SIGBREAK'))
// Some watchers may send SIGHUP on restart (may be unsupported on Windows but safe to register)
try { process.once('SIGHUP' as any, () => shutdown('SIGHUP')) } catch {}
// Fallback when the event loop is draining
process.once('beforeExit', () => shutdown('beforeExit'))
