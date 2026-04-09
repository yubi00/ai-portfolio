import { Terminal } from '@xterm/xterm'
import { THEMES } from '../config/terminal'
import { writePrompt } from './terminal'

export interface InputState {
  current: string
  cursorPos: number
}

export const createInputHandler = (
  onCommand: (command: string) => void,
  getInputState: () => InputState,
  setInputState: (state: InputState) => void
) => {
  return (term: Terminal) => (data: string) => {
    const { current, cursorPos } = getInputState()

    // Handle specific escape sequences we want
    if (data === '\u001b[D') { // Left arrow
      if (cursorPos > 0) {
        setInputState({ current, cursorPos: cursorPos - 1 })
        term.write('\u001b[D')
      }
      return
    }
    
    if (data === '\u001b[C') { // Right arrow  
      if (cursorPos < current.length) {
        setInputState({ current, cursorPos: cursorPos + 1 })
        term.write('\u001b[C')
      }
      return
    }
    
    if (data === '\u001b[A' || data === '\u001b[B') { // Up/Down arrows
      return // Ignore for now
    }
    
    // Block ALL other escape sequences (anything starting with ESC)
    if (data.includes('\u001b') || data.charCodeAt(0) === 27) {
      return
    }

    if (data === '\r') {
      const trimmed = current.trim()
      term.write('\r\n')

      if (trimmed.length > 0) {
        onCommand(trimmed)
      } else {
        writePrompt(term)
      }
      setInputState({ current: '', cursorPos: 0 })
    } else if (data === '\u0003') { // Ctrl+C
      setInputState({ current: '', cursorPos: 0 })
      term.write('^C\r\n')
      writePrompt(term)
    } else if (data === '\u007F') { // backspace
      if (cursorPos > 0) {
        // Remove character at cursor position - 1
        const newCurrent = current.slice(0, cursorPos - 1) + current.slice(cursorPos)
        const newCursorPos = cursorPos - 1
        setInputState({ current: newCurrent, cursorPos: newCursorPos })
        
        // Clear from cursor to end of line, then redraw the remaining text
        const remaining = newCurrent.slice(newCursorPos)
        term.write('\b' + remaining + ' '.repeat(1) + '\b'.repeat(remaining.length + 1))
      }
    } else {
      const sanitized = data.replace(/\r|\n/g, '').replace(/\t/g, '  ').replace(/[^\x20-\x7E]+/g, '')
      if (sanitized.length > 0) {
        // Insert character at cursor position
        const newCurrent = current.slice(0, cursorPos) + sanitized + current.slice(cursorPos)
        const newCursorPos = cursorPos + sanitized.length
        setInputState({ current: newCurrent, cursorPos: newCursorPos })
        
        // Redraw from cursor position: write new char + remaining text, then move cursor back
        const remaining = newCurrent.slice(newCursorPos)
        term.write(sanitized + remaining + '\u001b[D'.repeat(remaining.length))
      }
    }
  }
}

// Additional utility function for the new hook-based architecture
export interface CommandResult {
  output: string;
  sessionId: string;
}

export const handleCommand = async (input: string, sessionId: string): Promise<CommandResult> => {
  const trimmedInput = input.trim();

  if (trimmedInput === 'help') {
    const B = '\x1b[1m'
    const R = '\x1b[0m'
    const D = '\x1b[38;5;244m'
    const S = '\x1b[38;5;238m'
    return {
      output: `\r\n${B}Commands${R}  ${S}${'─'.repeat(28)}${R}\r\n  ${B}help${R}    ${D}—${R} show this message\r\n  ${B}about${R}   ${D}—${R} profile and links\r\n  ${B}resume${R}  ${D}—${R} download resume\r\n  ${B}clear${R}   ${D}—${R} clear the terminal\r\n\r\n${B}Ask me anything:${R}\r\n  ${D}"What has Yubi built?"\r\n  "What's Yubi's experience with AI?"\r\n  "Tell me about Yubi's background"${R}\r\n\r\n`,
      sessionId
    };
  }

  if (trimmedInput === 'about') {
    // About is shown as a UI card overlay; keep terminal output minimal.
    return { output: '', sessionId };
  }

  if (trimmedInput === 'clear') {
    return {
      output: `\x1b[H\x1b[2J\x1b[3J${THEMES.matrix.welcome}`,
      sessionId
    };
  }

  if (trimmedInput === 'resume') {
    const url = `${window.location.origin}/resume.pdf`
    window.open(url, '_blank', 'noopener,noreferrer')
    return {
      output: `\r\n\x1b[38;5;244m  Opening resume in a new tab...\x1b[0m\r\n\r\n`,
      sessionId
    };
  }

  // Everything else → AI streaming
  throw new Error('AI_STREAMING_NEEDED');
};
