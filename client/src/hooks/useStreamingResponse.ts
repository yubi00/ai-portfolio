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
  resolve_context: 'understanding context',
  classify_relevance: 'understanding context',
  check_ambiguity: 'understanding context',
  plan_retrieval: 'understanding context',
  retrieve_projects: 'thinking',
  retrieve_resume: 'thinking',
  retrieve_docs: 'thinking',
  merge_normalize_context: 'thinking',
  generate_answer: 'composing reply',
  resolving_context: 'understanding context',
  summarizing: 'composing reply',
  friendly_chat: 'thinking',
}

const HIDDEN_PROGRESS_NODES = new Set([
  'ingest_user_message',
  'save_memory',
  'generate_suggestions',
])

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
  const eventLine = lines.find(l => l.startsWith('event:'))
  const dataLines = lines.filter(l => l.startsWith('data:'))
  if (dataLines.length === 0) return null
  const jsonStr = dataLines.map(l => l.slice(5).trim()).join('\n')
  if (!jsonStr) return null
  try {
    return { type: eventLine?.slice(6).trim() || 'message', payload: JSON.parse(jsonStr) ?? {} }
  } catch {
    return null
  }
}

const findSseBoundary = (buffer: string): { index: number; length: number } | null => {
  const lf = buffer.indexOf('\n\n')
  const crlf = buffer.indexOf('\r\n\r\n')

  if (lf === -1 && crlf === -1) return null
  if (lf === -1) return { index: crlf, length: 4 }
  if (crlf === -1) return { index: lf, length: 2 }
  return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 }
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

const errorLine = (msg: string) => `\x1b[2m\x1b[38;5;203mError: ${msg}\x1b[0m`
const GENERIC_ERROR = 'I had trouble generating a response. Please try again.'
const PLAYBACK_CHUNK_CHARS = 8
const PLAYBACK_DELAY_MS = 12
const WRAP_RIGHT_MARGIN = 1

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const suggestedPromptLines = (suggestions: unknown): string[] => {
  if (!Array.isArray(suggestions)) return []
  const clean = suggestions.map((s) => String(s).trim()).filter(Boolean)
  if (clean.length === 0) return []
  return [
    '\x1b[2m\x1b[38;5;244mSuggested follow-ups:\x1b[0m',
    ...clean.map((s) => `\x1b[2m\x1b[38;5;244m- ${s}\x1b[0m`),
  ]
}

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const json = await response.json()
    const code = json?.error?.code
    if (code === 'RATE_LIMIT_EXCEEDED') return 'Too many requests. Please wait a moment and try again.'
    if (code === 'STREAM_CONCURRENCY_LIMIT_EXCEEDED') return 'Another response is still running. Please wait a moment.'
    if (code === 'AUTH_REQUIRED' || code === 'INVALID_TOKEN') return 'Authentication failed. Please refresh and try again.'
    if (code === 'ORIGIN_NOT_ALLOWED') return 'This site is not allowed to use the assistant API.'
  } catch {}
  return GENERIC_ERROR
}

const sanitizeThrownError = (error: unknown): string => {
  if (!(error instanceof Error)) return GENERIC_ERROR
  if (
    error.message.startsWith('auth_') ||
    error.message.startsWith('turnstile_') ||
    error.message.includes('turnstile') ||
    error.message.includes('auth')
  ) {
    return 'Authentication failed. Please refresh and try again.'
  }
  return error.message || GENERIC_ERROR
}

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

    if (!res.ok) {
      animation.clear()
      term.writeln(errorLine(await parseApiError(res)))
      return
    }

    if (!res.body) {
      animation.clear()
      term.writeln(errorLine(GENERIC_ERROR))
      return
    }

    await readStream(res, term, animation, callbacks, sessionIdRef)
  } catch (error) {
    animation.clear()
    term.writeln(errorLine(sanitizeThrownError(error)))
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
  let completedAnswer = false
  let hlState = initialCodeHighlightState()
  let visualCol = 0
  let pendingWord = ''

  const writeHighlighted = (text: string) => {
    if (!text) return
    const { output, newState } = applyCodeHighlighting(text, hlState)
    hlState = newState
    term.write(output)
    term.scrollToBottom()
  }

  const writeWrappedWord = (word: string) => {
    if (!word) return

    const wrapWidth = Math.max(20, term.cols - WRAP_RIGHT_MARGIN)

    if (visualCol > 0 && visualCol + word.length > wrapWidth) {
      writeHighlighted('\r\n')
      visualCol = 0
    }

    let remaining = word
    while (remaining.length > 0) {
      const available = wrapWidth - visualCol
      if (available <= 0) {
        writeHighlighted('\r\n')
        visualCol = 0
        continue
      }

      const part = remaining.slice(0, available)
      writeHighlighted(part)
      visualCol += part.length
      remaining = remaining.slice(part.length)

      if (remaining.length > 0) {
        writeHighlighted('\r\n')
        visualCol = 0
      }
    }
  }

  const writeWhitespace = (text: string) => {
    for (const char of text) {
      if (char === '\r') continue
      if (char === '\n') {
        writeHighlighted('\n')
        visualCol = 0
        continue
      }
      if (visualCol < Math.max(20, term.cols - WRAP_RIGHT_MARGIN)) {
        writeHighlighted(char)
        visualCol += 1
      }
    }
  }

  const flushPendingWord = () => {
    if (!pendingWord) return
    writeWrappedWord(pendingWord)
    pendingWord = ''
  }

  const writeAnswerText = async (text: string, flushEnd = false) => {
    for (let i = 0; i < text.length; i += PLAYBACK_CHUNK_CHARS) {
      const part = text.slice(i, i + PLAYBACK_CHUNK_CHARS)
      for (const char of part) {
        if (/\s/.test(char)) {
          flushPendingWord()
          writeWhitespace(char)
        } else {
          pendingWord += char
        }
      }
      await delay(PLAYBACK_DELAY_MS)
    }
    if (flushEnd) flushPendingWord()
  }

  const handleEvent = async (evt: SseEvent) => {
    const { type, payload } = evt

    if ((type === 'session_started' || type === 'session') && payload?.session_id) {
      callbacks.onSessionId(payload.session_id)
      sessionIdRef.current = payload.session_id
    } else if (type === 'progress' && !startedAnswer) {
      const node = String(payload?.node ?? '')
      if (!HIDDEN_PROGRESS_NODES.has(node)) {
        animation.start(STATUS_LABELS[node] ?? STATUS_LABELS[payload?.step] ?? 'thinking')
      }
    } else if (type === 'status' && !startedAnswer) {
      animation.start(STATUS_LABELS[payload?.phase] ?? 'thinking')
    } else if (type === 'classification' && !startedAnswer && payload?.relevant) {
      animation.start('searching portfolio')
    } else if ((type === 'answer_chunk' && typeof payload?.delta === 'string') || (type === 'partial' && typeof payload?.text === 'string')) {
      if (!startedAnswer) {
        animation.clear()
        startedAnswer = true
      }
      const text = type === 'answer_chunk' ? payload.delta : payload.text
      await writeAnswerText(text)
    } else if (type === 'answer_completed' || type === 'final') {
      flushPendingWord()
      if (!startedAnswer) {
        animation.clear()
        const reply: string = payload?.answer ?? payload?.reply ?? ''
        await writeAnswerText(reply, true)
      }
      if (payload?.session_id) {
        callbacks.onSessionId(payload.session_id)
        sessionIdRef.current = payload.session_id
      }
      const suggestions = suggestedPromptLines(payload?.suggested_prompts)
      if (suggestions.length > 0) {
        term.writeln('')
        term.writeln('')
        suggestions.forEach((line) => term.writeln(line))
      }
      term.writeln('')
      term.writeln('')
      completedAnswer = true
    } else if (type === 'error') {
      animation.clear()
      if (startedAnswer) term.writeln('')
      term.writeln(errorLine(GENERIC_ERROR))
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary: { index: number; length: number } | null
    while ((boundary = findSseBoundary(buffer)) !== null) {
      const chunk = buffer.slice(0, boundary.index)
      buffer = buffer.slice(boundary.index + boundary.length)
      if (chunk.trim().length > 0) {
        const evt = parseSseChunk(chunk)
        if (evt) await handleEvent(evt)
      }
    }
  }

  if (!completedAnswer) {
    animation.clear()
    if (!startedAnswer) term.writeln(errorLine(GENERIC_ERROR))
  }
}
