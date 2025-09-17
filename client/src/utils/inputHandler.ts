import { Terminal } from 'xterm'

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
        term.write('\x1b[1m> \x1b[0m')
        term.scrollToBottom()
      }
      setInputState({ current: '', cursorPos: 0 })
    } else if (data === '\u0003') { // Ctrl+C
      setInputState({ current: '', cursorPos: 0 })
      term.write('^C\r\n\x1b[1m> \x1b[0m')
      term.scrollToBottom()
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
  
  // Handle built-in commands
  if (trimmedInput === 'help') {
    return {
      output: `
🤖 Yubi AI Portfolio Assistant

How to interact:
  • Ask me about my projects, skills, or experience
  • Examples: "What are your projects?"
            "Tell me about your technical skills"
            "What programming languages do you know?"

Available commands:
  help         - Show this help message
  clear        - Clear the terminal
  info         - Show server info
  ping         - Test server connection

💬 Advanced: Contextual Conversations
  Ask: "Tell me your 5 projects"
  Then: "Tell me about the third one" ← Context remembered!

`,
      sessionId
    };
  }
  
  if (trimmedInput === 'clear') {
    return {
      output: '\x1b[2J\x1b[H', // Clear screen and move cursor to top
      sessionId
    };
  }
  
  if (trimmedInput === 'ping') {
    return {
      output: '🏓 Pong! Server is responding.\n',
      sessionId
    };
  }
  
  if (trimmedInput === 'info') {
    const getApiUrl = (): string => {
      return (import.meta.env?.VITE_API_URL as string) || 'http://127.0.0.1:9000'
    }
    
    return {
      output: `
📊 Server Information:
  • Status: Online
  • API Endpoint: ${getApiUrl()}
  • Session ID: ${sessionId || 'Not started'}

`,
      sessionId
    };
  }

  // For AI conversation, we need to handle streaming in the terminal directly
  // This function will be called from the useTerminal hook with access to the terminal
  throw new Error('AI_STREAMING_NEEDED');
};