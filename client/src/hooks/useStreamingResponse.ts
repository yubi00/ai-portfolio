import { Terminal } from '@xterm/xterm'
import { applyCodeHighlighting, initialCodeHighlightState } from '../utils/terminal'
import { getApiBaseUrl, getAuthEnv } from '../config/env'
import { getAuthorizationHeader } from '../utils/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamingCallbacks {
  onSessionId: (id: string) => void
  onSuggestedPrompts?: (prompts: string[]) => void
}

export type StreamingOutcome = 'completed' | 'error' | 'aborted'

// ---------------------------------------------------------------------------
// Status animation
// ---------------------------------------------------------------------------

const STATUS_COLOR = '\x1b[2m\x1b[38;5;244m'
const STATUS_RESET = '\x1b[0m'
const DOTS = ['   ', '.  ', '.. ', '...']
const INITIAL_STATUS_DELAY_MS = 300

interface ProgressStage {
  label: string
  rank: number
}

const UNDERSTANDING_STAGE: ProgressStage = { label: 'understanding your question', rank: 1 }
const REVIEWING_STAGE: ProgressStage = { label: 'reviewing relevant work', rank: 2 }
const RESPONDING_STAGE: ProgressStage = { label: 'responding', rank: 3 }
const COMPOSING_STAGE: ProgressStage = { label: 'composing a response', rank: 3 }

const STATUS_STAGES: Record<string, ProgressStage> = {
  resolve_context: UNDERSTANDING_STAGE,
  classify_relevance: UNDERSTANDING_STAGE,
  check_ambiguity: UNDERSTANDING_STAGE,
  plan_retrieval: UNDERSTANDING_STAGE,
  retrieve_projects: REVIEWING_STAGE,
  retrieve_resume: REVIEWING_STAGE,
  retrieve_docs: REVIEWING_STAGE,
  merge_normalize_context: REVIEWING_STAGE,
  generate_answer: COMPOSING_STAGE,
  resolving_context: UNDERSTANDING_STAGE,
  summarizing: COMPOSING_STAGE,
  friendly_chat: RESPONDING_STAGE,
  friendly_response: RESPONDING_STAGE,
}

const HIDDEN_PROGRESS_NODES = new Set([
  'ingest_user_message',
  'save_memory',
  'generate_suggestions',
])

const createStatusAnimation = (term: Terminal) => {
  let dotFrame = 0
  let currentStage: ProgressStage | null = null
  let interval: ReturnType<typeof setInterval> | null = null
  let delayedStart: ReturnType<typeof setTimeout> | null = null
  let active = false
  const showNotBefore = Date.now() + INITIAL_STATUS_DELAY_MS

  const render = () => {
    if (!currentStage) return
    term.write(`\r\x1b[2K${STATUS_COLOR}⟳ ${currentStage.label}${DOTS[dotFrame]}${STATUS_RESET}`)
  }

  const activate = () => {
    delayedStart = null
    if (!active) {
      active = true
      term.write('\x1b[?25l') // hide cursor during animation
    }
    render()
    if (!interval) {
      interval = setInterval(() => {
        dotFrame = (dotFrame + 1) % DOTS.length
        render()
      }, 200)
    }
  }

  const advance = (stage: ProgressStage) => {
    if (currentStage && stage.rank <= currentStage.rank) return
    currentStage = stage
    dotFrame = 0

    if (active) {
      render()
      return
    }

    if (delayedStart) clearTimeout(delayedStart)
    const remainingDelay = Math.max(0, showNotBefore - Date.now())
    delayedStart = setTimeout(activate, remainingDelay)
  }

  const clear = () => {
    if (delayedStart) { clearTimeout(delayedStart); delayedStart = null }
    if (interval) { clearInterval(interval); interval = null }
    if (active) {
      term.write('\r\x1b[2K')  // erase status line
      term.write('\x1b[?25h') // restore cursor
      active = false
    }
  }

  return { advance, clear }
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
const MIN_JUSTIFY_COLUMNS = 72

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
}

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError'

const cleanSuggestedPrompts = (suggestions: unknown): string[] => {
  if (!Array.isArray(suggestions)) return []
  return [...new Set(suggestions.map((s) => String(s).trim()).filter(Boolean))].slice(0, 3)
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
  signal?: AbortSignal,
): Promise<StreamingOutcome> => {
  term.writeln('')
  term.scrollToBottom()
  term.focus()

  const animation = createStatusAnimation(term)
  animation.advance(UNDERSTANDING_STAGE)
  const clearOnAbort = () => animation.clear()
  signal?.addEventListener('abort', clearOnAbort, { once: true })

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
    throwIfAborted(signal)

    const res = await fetch(`${apiUrl}/prompt/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    })

    if (!res.ok) {
      animation.clear()
      term.writeln(errorLine(await parseApiError(res)))
      return 'error'
    }

    if (!res.body) {
      animation.clear()
      term.writeln(errorLine(GENERIC_ERROR))
      return 'error'
    }

    return await readStream(res, term, animation, callbacks, sessionIdRef, signal)
  } catch (error) {
    animation.clear()
    if (isAbortError(error)) return 'aborted'
    term.writeln(errorLine(sanitizeThrownError(error)))
    return 'error'
  } finally {
    signal?.removeEventListener('abort', clearOnAbort)
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
  signal?: AbortSignal,
): Promise<StreamingOutcome> => {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let startedAnswer = false
  let completedAnswer = false
  let failedAnswer = false
  let hlState = initialCodeHighlightState()
  let visualCol = 0
  let pendingWord = ''
  let currentLineText = ''
  let lineStartHighlightState = { ...hlState }
  let justifyWrappedLines = true

  // FitAddon already computes xterm's safe column count from the active font
  // and container. A second DOM-based estimate can become stale during font
  // swaps or browser zoom and causes visibly premature wrapping.
  const getWrapWidth = () => Math.max(20, term.cols - WRAP_RIGHT_MARGIN)

  const writeHighlighted = (text: string) => {
    if (!text) return
    const { output, newState } = applyCodeHighlighting(text, hlState)
    hlState = newState
    term.write(output)
  }

  const getJustifiedLine = (text: string, width: number): string | null => {
    const content = text.trimEnd()
    const isStructured = lineStartHighlightState.inCodeBlock ||
      /^\s/.test(content) ||
      /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|\|)/.test(content)
    if (isStructured) justifyWrappedLines = false
    if (!content || width < MIN_JUSTIFY_COLUMNS || content.length >= width || !justifyWrappedLines) return null

    const words = content.split(/\s+/)
    const gapCount = words.length - 1
    if (gapCount < 1) return null

    const wordLength = words.reduce((total, word) => total + word.length, 0)
    const spacesNeeded = width - wordLength
    if (spacesNeeded < gapCount) return null

    const spacesPerGap = Math.floor(spacesNeeded / gapCount)
    let widerGaps = spacesNeeded % gapCount
    return words.reduce((line, word, index) => {
      if (index === words.length - 1) return line + word
      const gapWidth = spacesPerGap + (widerGaps-- > 0 ? 1 : 0)
      return line + word + ' '.repeat(gapWidth)
    }, '')
  }

  const finishAutoWrappedLine = () => {
    const justified = getJustifiedLine(currentLineText, getWrapWidth())
    if (justified) {
      const { output } = applyCodeHighlighting(justified, lineStartHighlightState)
      term.write(`\r\x1b[2K${output}`)
    }
    writeHighlighted('\r\n')
    visualCol = 0
    currentLineText = ''
    lineStartHighlightState = { ...hlState }
  }

  const writeWrappedWord = (word: string) => {
    if (!word) return

    const wrapWidth = getWrapWidth()

    if (visualCol > 0 && visualCol + word.length > wrapWidth) {
      finishAutoWrappedLine()
    }

    let remaining = word
    while (remaining.length > 0) {
      const available = wrapWidth - visualCol
      if (available <= 0) {
        finishAutoWrappedLine()
        continue
      }

      const part = remaining.slice(0, available)
      writeHighlighted(part)
      currentLineText += part
      visualCol += part.length
      remaining = remaining.slice(part.length)

      if (remaining.length > 0) {
        finishAutoWrappedLine()
      }
    }
  }

  const writeWhitespace = (text: string) => {
    for (const char of text) {
      if (char === '\r') continue
      if (char === '\n') {
        writeHighlighted('\n')
        visualCol = 0
        currentLineText = ''
        lineStartHighlightState = { ...hlState }
        justifyWrappedLines = true
        continue
      }
      if (visualCol < getWrapWidth()) {
        writeHighlighted(char)
        currentLineText += char
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
      throwIfAborted(signal)
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
      throwIfAborted(signal)
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
        const stage = STATUS_STAGES[node] ?? STATUS_STAGES[String(payload?.step ?? '')]
        if (stage) animation.advance(stage)
      }
    } else if (type === 'status' && !startedAnswer) {
      const stage = STATUS_STAGES[String(payload?.phase ?? '')]
      if (stage) animation.advance(stage)
    } else if (type === 'classification' && !startedAnswer && payload?.relevant === false) {
      // Legacy APIs may emit a classification event before their route is
      // known. A positive classification does not prove retrieval happened;
      // explicit retrieve_* progress events are the source of truth for the
      // reviewing stage. A negative classification can safely move straight
      // to the conversational response stage.
      animation.advance(RESPONDING_STAGE)
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
      callbacks.onSuggestedPrompts?.(cleanSuggestedPrompts(payload?.suggested_prompts))
      term.writeln('')
      term.writeln('')
      completedAnswer = true
    } else if (type === 'error') {
      animation.clear()
      if (startedAnswer) term.writeln('')
      term.writeln(errorLine(GENERIC_ERROR))
      // An SSE error is a terminal outcome for this response. Without marking
      // it handled, the end-of-stream guard below prints the same error again.
      completedAnswer = true
      failedAnswer = true
    }
  }

  while (true) {
    throwIfAborted(signal)
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
    if (startedAnswer) {
      flushPendingWord()
      term.writeln('')
    }
    term.writeln(errorLine(GENERIC_ERROR))
    return 'error'
  }

  return failedAnswer ? 'error' : 'completed'
}
