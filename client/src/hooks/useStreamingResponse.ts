import { Terminal } from '@xterm/xterm'
import { applyCodeHighlighting, initialCodeHighlightState } from '../utils/terminal'
import { getApiBaseUrl, getAuthEnv } from '../config/env'
import { getAuthorizationHeader } from '../utils/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamingCallbacks {
  onSessionId: (id: string) => void
}

// ---------------------------------------------------------------------------
// Status animation
// ---------------------------------------------------------------------------

const STATUS_COLOR = '\x1b[2m\x1b[38;5;244m'
const STATUS_RESET = '\x1b[0m'
const DOTS = ['   ', '.  ', '.. ', '...']

const STATUS_LABELS: Record<string, string> = {
  resolving_context: 'understanding context',
  summarizing: 'composing reply',
  friendly_chat: 'thinking',
}

const createStatusAnimation = (term: Terminal) => {
  let dotFrame = 0
  let currentLabel = 'thinking'
  let interval: ReturnType<typeof setInterval> | null = null
  let active = false

  const start = (label: string) => {
    currentLabel = label
    if (!active) {
      active = true
      term.write('\x1b[?25l') // hide cursor during animation
    }
    if (!interval) {
      interval = setInterval(() => {
        dotFrame = (dotFrame + 1) % DOTS.length
        term.write(`\r\x1b[2K${STATUS_COLOR}⟳ ${currentLabel}${DOTS[dotFrame]}${STATUS_RESET}`)
      }, 200)
    }
  }

  const clear = () => {
    if (interval) { clearInterval(interval); interval = null }
    if (active) {
      term.write('\r\x1b[2K')  // erase status line
      term.write('\x1b[?25h') // restore cursor
      active = false
    }
  }

  return { start, clear }
}

// ---------------------------------------------------------------------------
// SSE event parsing
// ---------------------------------------------------------------------------

interface SseEvent {
  type: string
  payload: Record<string, any>
}

const parseSseChunk = (raw: string): SseEvent | null => {
  const lines = raw.split(/\r?\n/)
  const dataLine = lines.find(l => l.startsWith('data:'))
  if (!dataLine) return null
  const jsonStr = dataLine.slice(5).trim().replace(/^\s*/, '').replace(/^:/, '')
  if (!jsonStr) return null
  try {
    const evt = JSON.parse(jsonStr)
    return { type: evt?.type ?? '', payload: evt?.payload ?? {} }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

const errorLine = (msg: string) => `\x1b[2m\x1b[38;5;203mError: ${msg}\x1b[0m`

// ---------------------------------------------------------------------------
// Main streaming function
// ---------------------------------------------------------------------------

export const runStreamingPrompt = async (
  command: string,
  sessionId: string | null,
  sessionIdRef: React.MutableRefObject<string | null>,
  term: Terminal,
  callbacks: StreamingCallbacks,
): Promise<void> => {
  term.writeln('')
  term.scrollToBottom()
  term.focus()

  const animation = createStatusAnimation(term)
  animation.start('thinking')

  const payload: { prompt: string; session_id?: string } = { prompt: command }
  const currentSessionId = sessionIdRef.current || sessionId
  if (currentSessionId) payload.session_id = currentSessionId

  try {
    const apiUrl = getApiBaseUrl()
    const { requireAuth } = getAuthEnv()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    }
    const authHeader = await getAuthorizationHeader({ enforce: requireAuth })
    if (authHeader) headers.Authorization = authHeader

    const res = await fetch(`${apiUrl}/prompt/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!res.body) {
      animation.clear()
      term.writeln(errorLine(`HTTP ${res.status}`))
      return
    }

    await readStream(res, term, animation, callbacks, sessionIdRef)
  } catch (error) {
    animation.clear()
    const msg = error instanceof Error ? error.message : 'Unknown error'
    term.writeln(errorLine(msg))
  }
}

// ---------------------------------------------------------------------------
// Stream reader — processes SSE events from the response body
// ---------------------------------------------------------------------------

const readStream = async (
  res: Response,
  term: Terminal,
  animation: ReturnType<typeof createStatusAnimation>,
  callbacks: StreamingCallbacks,
  sessionIdRef: React.MutableRefObject<string | null>,
): Promise<void> => {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let startedAnswer = false
  let sawDone = false
  let hlState = initialCodeHighlightState()

  const handleEvent = (evt: SseEvent) => {
    const { type, payload } = evt

    if (type === 'session' && payload?.session_id) {
      callbacks.onSessionId(payload.session_id)
      sessionIdRef.current = payload.session_id
    } else if (type === 'status' && !startedAnswer) {
      animation.start(STATUS_LABELS[payload?.phase] ?? 'thinking')
    } else if (type === 'classification' && !startedAnswer && payload?.relevant) {
      animation.start('searching portfolio')
    } else if (type === 'partial' && typeof payload?.text === 'string') {
      if (!startedAnswer) {
        animation.clear()
        startedAnswer = true
      }
      const { output, newState } = applyCodeHighlighting(payload.text, hlState)
      hlState = newState
      term.write(output)
      term.scrollToBottom()
    } else if (type === 'final') {
      if (!startedAnswer) {
        animation.clear()
        const reply: string = payload?.reply ?? ''
        const { output } = applyCodeHighlighting(reply, hlState)
        term.writeln(output)
      }
      term.writeln('')
      term.writeln('')
    } else if (type === 'error') {
      animation.clear()
      const msg = payload?.message || 'Unknown error'
      const detail = payload?.detail ? ` (${payload.detail})` : ''
      if (startedAnswer) term.writeln('')
      term.writeln(errorLine(`${msg}${detail}`))
    }

    if (type === 'done') sawDone = true
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      if (chunk.trim().length > 0) {
        const evt = parseSseChunk(chunk)
        if (evt) handleEvent(evt)
      }
    }
  }

  if (!res.ok && !sawDone) {
    animation.clear()
    term.writeln(errorLine(`HTTP ${res.status}`))
  }
}
