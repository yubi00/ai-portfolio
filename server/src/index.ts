import express, { Request, Response } from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'

const app = express()
app.use(cors())

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true })
})

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws: WebSocket) => {
  ws.send(JSON.stringify({ type: 'ready' }))

  ws.on('message', async (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type: string; content?: string }
      if (msg.type === 'prompt' && msg.content) {
        const prompt = msg.content

        // Simulated agent routing and streaming token output
        const preface = `You said: ${prompt}\n` 
        for (const ch of preface) {
          ws.send(JSON.stringify({ type: 'token', content: ch }))
          await new Promise((r) => setTimeout(r, 10))
        }

        // In future: route to MCPs (GitHub, LinkedIn) based on intent
        const hint = `\n[demo] Routing to best tool... (stub)\n`
        for (const ch of hint) {
          ws.send(JSON.stringify({ type: 'token', content: ch }))
          await new Promise((r) => setTimeout(r, 8))
        }

        ws.send(JSON.stringify({ type: 'line', content: '' }))
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'line', content: 'Error: ' + (err as Error).message }))
    }
  })
})

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
