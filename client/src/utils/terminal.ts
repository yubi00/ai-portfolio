import { Terminal } from '@xterm/xterm'
import { getApiBaseUrl } from '../config/env'

// Prompt style: keep it readable but low-noise. Change PROMPT_USER_COLOR to taste.
// Good options: 245 (muted gray), 110 (soft blue), 108 (muted green), 137 (muted amber).
const PROMPT_USER = 'yubi@portfolio'
const PROMPT_USER_COLOR = 248
// Make the prompt easy to spot: bold user + sky-blue "$" (matches cursor color).
// Use 39m/22m to reset color/bold without resetting other terminal attributes.
const PROMPT = `\x1b[1m\x1b[38;5;${PROMPT_USER_COLOR}m${PROMPT_USER}\x1b[39m \x1b[38;2;147;197;253m$\x1b[0m `
const ERROR_STYLE = '\x1b[2m\x1b[38;5;203m'
const RESET = '\x1b[0m'

export const writePrompt = (term: Terminal) => {
  term.write(PROMPT)
  term.scrollToBottom()
  term.focus()
}

export const writeIntroMessage = (term: Terminal) => {
  term.writeln('')
  term.writeln('\x1b[1m\x1b[38;5;81mWelcome to Yubi Portfolio Terminal!\x1b[0m')
  term.writeln('\x1b[1mAsk me anything about my projects, skills and experiences and press Enter.\x1b[0m\r\n')
  writePrompt(term)
  term.scrollToBottom()
  term.focus()
}

export const clearTerminalWithIntro = (term: Terminal) => {
  term.clear()
  writeIntroMessage(term)
}

export const writeHelpMessage = (term: Terminal) => {
  const B = '\x1b[1m'
  const R = '\x1b[0m'
  const D = '\x1b[38;5;244m'
  const S = '\x1b[38;5;238m'

  term.writeln('')
  term.writeln(`${B}Commands${R}  ${S}${'─'.repeat(28)}${R}`)
  term.writeln(`  ${B}help${R}    ${D}—${R} show this message`)
  term.writeln(`  ${B}about${R}   ${D}—${R} profile and links`)
  term.writeln(`  ${B}resume${R}  ${D}—${R} download resume`)
  term.writeln(`  ${B}clear${R}   ${D}—${R} clear the terminal`)
  term.writeln('')
  term.writeln(`${B}Ask me anything:${R}`)
  term.writeln(`  ${D}"What has Yubi built?"${R}`)
  term.writeln(`  ${D}"What's Yubi's experience with AI?"${R}`)
  term.writeln(`  ${D}"Tell me about Yubi's background"${R}`)
}

export const writeErrorMessage = (term: Terminal, message: string) => {
  term.write('\x1b[1A\x1b[2K') // Move up one line and clear it
  term.writeln(`${ERROR_STYLE}Error: ${message}${RESET}`)
}

export const writeThinkingMessage = (term: Terminal) => {
  term.scrollToBottom()
}

export const clearThinkingMessage = (term: Terminal) => {
  term.write('\x1b[1A\x1b[2K') // Move up one line and clear it
}

export const writeSessionStart = (term: Terminal, sessionId: string) => {
  term.write('\x1b[1A\x1b[2K')
  term.writeln(`\x1b[2m\x1b[90m[Session ${sessionId} started]\x1b[0m`)
}

export const writePartialResponse = (term: Terminal, text: string) => {
  term.write(`\x1b[38;5;250m${text}\x1b[0m`)
  term.scrollToBottom()
}

export const writeFinalResponse = (term: Terminal, reply: string) => {
  term.writeln(`\x1b[38;5;250m${reply}\x1b[0m`)
  term.writeln('')
}

export const getApiUrl = (): string => {
  return getApiBaseUrl()
}

export const writeToTerminal = (terminal: Terminal, text: string) => {
  terminal.write(text);
};

export const clearLine = (terminal: Terminal) => {
  terminal.write('\x1b[2K\r');
};

// ---------------------------------------------------------------------------
// Code-block syntax highlighting (streaming-safe)
// ---------------------------------------------------------------------------

export interface CodeHighlightState {
  inCodeBlock: boolean   // inside a ``` fence
  fenceBuffer: string    // accumulates partial ``` sequences at chunk boundaries
  inInlineCode: boolean  // inside a single-backtick span
}

export const initialCodeHighlightState = (): CodeHighlightState => ({
  inCodeBlock: false,
  fenceBuffer: '',
  inInlineCode: false,
})

const CODE_BLOCK_COLOR = '\x1b[38;5;114m'  // muted green for fenced code blocks
const INLINE_CODE_COLOR = '\x1b[38;5;152m'  // mint/teal for inline code
const PROSE_COLOR = '\x1b[38;5;250m'  // normal muted gray for prose

/**
 * Applies ANSI colour highlighting to a streaming text chunk based on
 * markdown code fences (```) and inline backticks (`).
 *
 * Returns the coloured output string and updated state for the next chunk.
 */
export const applyCodeHighlighting = (
  chunk: string,
  state: CodeHighlightState,
): { output: string; newState: CodeHighlightState } => {
  let { inCodeBlock, fenceBuffer, inInlineCode } = state
  let output = ''

  // Prepend any pending partial fence from the previous chunk
  const input = fenceBuffer + chunk
  fenceBuffer = ''

  let i = 0
  while (i < input.length) {
    const char = input[i]

    // --- Detect triple backtick fence ---
    if (char === '`') {
      // Peek ahead to see if we have ``` (possibly split at the chunk boundary)
      const remaining = input.slice(i)
      if (remaining.startsWith('```')) {
        // Consume the fence marker plus any optional language tag on the same line
        let fenceEnd = i + 3
        // Skip language identifier (e.g. "python", "ts") up to the newline
        while (fenceEnd < input.length && input[fenceEnd] !== '\n') fenceEnd++
        if (fenceEnd < input.length) {
          // Include the newline in the consumed range
          const fenceSlice = input.slice(i, fenceEnd + 1)
          if (inCodeBlock) {
            // Closing fence — emit it dimmed and switch back to prose
            output += `\x1b[38;5;238m${fenceSlice}\x1b[0m`
            inCodeBlock = false
            inInlineCode = false
          } else {
            // Opening fence — emit it dimmed and switch to code block colour
            output += `\x1b[38;5;238m${fenceSlice}\x1b[0m`
            inCodeBlock = true
            inInlineCode = false
          }
          i = fenceEnd + 1
          continue
        } else {
          // The fence starts here but no newline yet — we're at the chunk end.
          // Buffer the partial fence so the next chunk can complete it.
          fenceBuffer = remaining
          break
        }
      } else if (remaining.length < 3 && remaining.split('').every(c => c === '`')) {
        // Could be the start of a ``` split across chunks — buffer it
        fenceBuffer = remaining
        break
      } else if (!inCodeBlock) {
        // Single backtick: toggle inline code
        output += char
        inInlineCode = !inInlineCode
        i++
        continue
      }
    }

    // --- Emit character with appropriate colour ---
    const color = inCodeBlock
      ? CODE_BLOCK_COLOR
      : inInlineCode
        ? INLINE_CODE_COLOR
        : PROSE_COLOR
    output += `${color}${char}\x1b[0m`
    i++
  }

  return {
    output,
    newState: { inCodeBlock, fenceBuffer, inInlineCode },
  }
}
