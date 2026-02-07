import { Terminal } from 'xterm'
import { TERMINAL_COLORS } from '../config/terminal'

export const writePrompt = (term: Terminal) => {
  term.write('\x1b[1m> \x1b[0m')
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
  term.writeln('  clear        - Clear the terminal')
  term.writeln('  info         - Show server info')
  term.writeln('')
  term.writeln('\x1b[1mAdvanced: Contextual Conversations\x1b[0m')
  term.writeln('  Ask: "Tell me your 5 projects"')
  term.writeln('  Then: "Tell me about the third one" -> Context remembered!')
}

export const writeErrorMessage = (term: Terminal, message: string) => {
  term.write('\x1b[1A\x1b[2K') // Move up one line and clear it
  term.writeln(`\x1b[31mError: ${message}\x1b[0m`)
}

export const writeThinkingMessage = (term: Terminal) => {
  term.writeln('\r\n\x1b[1m\x1b[38;5;81mYubi Assistant:\x1b[0m')
  term.writeln('\x1b[2m\x1b[90m🧠\x1b[0m')
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
  return (import.meta.env?.VITE_API_URL as string) || 
         (typeof window !== 'undefined' && window.location?.port === '5173' 
           ? 'http://127.0.0.1:9000' 
           : '/api')
}

export const writeToTerminal = (terminal: Terminal, text: string) => {
  terminal.write(text);
};

export const clearLine = (terminal: Terminal) => {
  terminal.write('\x1b[2K\r');
};
