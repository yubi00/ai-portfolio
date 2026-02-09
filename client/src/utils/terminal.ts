import { Terminal } from 'xterm'
import { getApiBaseUrl } from '../config/env'

// Prompt style: keep it readable but low-noise. Change PROMPT_USER_COLOR to taste.
// Good options: 245 (muted gray), 110 (soft blue), 108 (muted green), 137 (muted amber).
const PROMPT_USER = 'yubi@yubikhadka'
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
  term.writeln('Yubi Portfolio Assistant')
  term.writeln('')
  term.writeln('\x1b[1mHow to interact:\x1b[0m')
  term.writeln('  - Ask me about my projects, skills, or experience')
  term.writeln('  - Examples: "What are your projects?"')
  term.writeln('            "Tell me about your technical skills"')
  term.writeln('            "What programming languages do you know?"')
  term.writeln('')
  term.writeln('\x1b[1mAvailable commands:\x1b[0m')
  term.writeln('  help         - Show this help message')
  term.writeln('  about        - About Yubi (profile)')
  term.writeln('  clear        - Clear the terminal')
  term.writeln('  info         - Show server info')
  term.writeln('')
  term.writeln('\x1b[1mAdvanced: Contextual Conversations\x1b[0m')
  term.writeln('  Ask: "Tell me your 5 projects"')
  term.writeln('  Then: "Tell me about the third one" -> Context remembered!')
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
