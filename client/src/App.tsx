import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import './terminal-custom.css'

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)   // keep a handle to FitAddon
  const [showIntroBanner, setShowIntroBanner] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily:
        'JetBrains Mono, Fira Mono, Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 20,
      lineHeight: 1.3,
      letterSpacing: 0,
      scrollback: 1000,
      theme: {
        background: '#101014',
        foreground: '#b0b3b8',
        cursor: '#93c5fd',
        selectionBackground: '#3b82f680',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    termRef.current = term
    fitRef.current = fitAddon

    const container = containerRef.current
    let raf: number | undefined

    const fitSafe = () => { try { fitAddon.fit() } catch {} }
    const onResize = () => { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(fitSafe) }

    if (container) {
      term.open(container)
      raf = requestAnimationFrame(fitSafe)
      window.addEventListener('resize', onResize)
    }

    // Intro text
    term.writeln('\x1b]1337;SetMark;\x07')
    term.writeln('')
    term.writeln('\x1b[1m\x1b[38;5;81mWelcome to Yubi Portfolio Terminal!\x1b[0m')
    term.writeln('\x1b[1mAsk me anything about my projects, skills and experiences and press Enter.\x1b[0m\r\n')
    term.write('\x1b[1m> \x1b[0m')
    term.scrollToBottom()
    term.focus()

    let current = ''
    term.onData((d) => {
      if (d && d.charCodeAt(0) === 27) return  // ignore ESC sequences

      if (d === '\r') {
        const trimmed = current.trim()
        term.write('\r\n')

        if (trimmed.length > 0) {
          handleCommand(trimmed, term)
        } else {
          term.write('\x1b[1m> \x1b[0m')
          term.scrollToBottom()
        }
        current = ''
      } else if (d === '\u0003') { // Ctrl+C
        current = ''
        term.write('^C\r\n> ')
        term.scrollToBottom()
      } else if (d === '\u007F') { // backspace
        if (current.length > 0) {
          current = current.slice(0, -1)
          term.write('\b \b')
        }
      } else {
        if (d.includes('\u001b')) return
        const sanitized = d.replace(/\r|\n/g, '').replace(/\t/g, '  ').replace(/[^\x20-\x7E]+/g, '')
        if (sanitized.length > 0) {
          current += sanitized
          term.write(sanitized)
        }
      }
    })

    return () => {
      try { window.removeEventListener('resize', onResize) } catch {}
      try { if (raf) cancelAnimationFrame(raf) } catch {}
      try { term.dispose() } catch {}
    }
  }, [])

  // Hide intro banner only after a response prints + refit rows after layout change
  const maybeHideIntroBanner = () => {
    setShowIntroBanner(prev => {
      if (prev) {
        // wait a tick for layout to change, then refit
        setTimeout(() => fitRef.current?.fit(), 0)
        return false
      }
      return prev
    })
  }

  const writePrompt = (term: Terminal) => {
    term.write('> ')
    term.scrollToBottom()
    term.focus()
  }

  const handleCommand = async (command: string, term: Terminal) => {
    const cmd = command.toLowerCase().trim()

    switch (cmd) {
      case 'help':
        term.writeln('Available commands:')
        term.writeln('  help         - Show this help message')
        term.writeln('  clear        - Clear the terminal')
        term.writeln('  info         - Show server info')
        term.writeln('  ping         - Test server connection')
        term.writeln('  session      - Show current session info')
        term.writeln('  new-session  - Start a new conversation session')
        term.writeln('')
        term.writeln('💬 \x1b[1mConversational Features:\x1b[0m')
        term.writeln('  First ask: "Tell me your 5 projects"')
        term.writeln('  Then ask: "Tell me about the third one" ← Context remembered!')
        term.writeln('  Or ask: "What about the blockchain project?"')
        maybeHideIntroBanner()
        break

      case 'clear': {
        term.clear()
        term.writeln('') // Add padding at the top
        term.writeln('\x1b[1m\x1b[38;5;81mWelcome to Yubi Portfolio Terminal!\x1b[0m')
        term.writeln('\x1b[1mAsk me anything about my projects, skills and experiences and press Enter.\x1b[0m\r\n')
        // We do not auto-hide banner on 'clear' since it's a reset action; omit maybeHideIntroBanner() here
        break
      }

      case 'info':
        term.writeln('AI Portfolio Terminal v0.1.0')
        term.writeln('Ready for AI integration')
        maybeHideIntroBanner()
        break

      case 'ping':
        term.writeln('Server: Ready (local mode)')
        maybeHideIntroBanner()
        break

      case 'session':
        if (sessionId) {
          term.writeln(`\x1b[32m✓ Active session: ${sessionId}\x1b[0m`)
          term.writeln('\x1b[2m\x1b[90mContext from previous questions is remembered.\x1b[0m')
        } else {
          term.writeln('\x1b[33m○ No active session\x1b[0m')
          term.writeln('\x1b[2m\x1b[90mNext question will start a new session.\x1b[0m')
        }
        maybeHideIntroBanner()
        break

      case 'new-session':
        if (sessionId) {
          term.writeln(`\x1b[2m\x1b[90m[Session ${sessionId} ended]\x1b[0m`)
          setSessionId(null)
          term.writeln('\x1b[32m✓ Ready for new conversation\x1b[0m')
        } else {
          term.writeln('\x1b[33m○ No active session to end\x1b[0m')
        }
        maybeHideIntroBanner()
        break

      default:
        try {
          // Show thinking indicator while processing
          term.writeln('\r\n\x1b[1m\x1b[38;5;81mYubi Assistant:\x1b[0m')
          term.writeln('\x1b[2m\x1b[90m🤔 Thinking...\x1b[0m')
          
          // Prepare request payload with session management
          const payload: { prompt: string; session_id?: string } = { prompt: command }
          if (sessionId) {
            payload.session_id = sessionId
          }

          const res = await fetch('http://127.0.0.1:9000/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            // Clear thinking line and show error
            term.write('\x1b[1A\x1b[2K') // Move up one line and clear it
            term.writeln('\x1b[31m❌ Error: Failed to fetch from MCP client.\x1b[0m')
          } else {
            const data = await res.json()
            
            // Store session_id returned from backend
            if (data?.session_id) {
              const isNewSession = !sessionId  // Only true for very first conversation
              if (isNewSession) {
                setSessionId(data.session_id)
                // First session created - show after clearing thinking line
                term.write('\x1b[1A\x1b[2K') // Move up one line and clear it
                term.writeln(`\x1b[2m\x1b[90m[Session ${data.session_id} started]\x1b[0m`)
              } else {
                // Subsequent conversations - just clear thinking line
                term.write('\x1b[1A\x1b[2K') // Move up one line and clear it
              }
            } else {
              // Clear thinking line
              term.write('\x1b[1A\x1b[2K') // Move up one line and clear it
            }

            let answer = ''
            if (typeof data?.reply === 'string') answer = data.reply
            else if (typeof data === 'string') answer = data
            else answer = JSON.stringify(data, null, 2)

            // Show source indicator and conversation info
            const sourceIndicator = data?.source_indicator || '🤖'
            const conversationLength = data?.conversation_length || 0
            
            if (conversationLength > 1) {
              term.writeln(`\x1b[2m\x1b[90m${sourceIndicator} [Message ${conversationLength}]\x1b[0m`)
            } else {
              term.writeln(`\x1b[2m\x1b[90m${sourceIndicator}\x1b[0m`)
            }
            term.writeln(`\x1b[38;5;250m${answer}\x1b[0m\r\n`)
            maybeHideIntroBanner()
          }
        } catch {
          // Clear thinking line and show error
          term.write('\x1b[1A\x1b[2K') // Move up one line and clear it
          term.writeln('\x1b[31m❌ Error: Could not reach MCP client.\x1b[0m')
        }
        break
    }

    writePrompt(term)
  }

  // layout constants
  const STICKY_H = 36        // sticky header height
  const BANNER_SPACE = 124   // visual space for banner

  const topOffset = showIntroBanner ? STICKY_H + BANNER_SPACE : STICKY_H

  return (
    // fixed, full-viewport root so the page never scrolls (only xterm does)
    <div style={{ position: 'fixed', inset: 0, background: '#101014' }}>
      {/* Sticky mini header */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 3,
          padding: '8px 10px',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(16,16,20,0.75)',
          backdropFilter: 'blur(6px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          fontSize: 13, color: '#cbd5e1',
        }}
      >
        <span style={{ fontWeight: 700, color: '#93c5fd' }}>Yubi Terminal</span>
        <span style={{ opacity: 0.7 }}>v0.1</span>
        {sessionId && (
          <span style={{ 
            marginLeft: 'auto', 
            marginRight: '12px',
            color: '#10b981', 
            opacity: 0.8,
            fontSize: 12,
            display: 'flex', 
            alignItems: 'center', 
            gap: 4 
          }}>
            <span style={{ 
              width: 6, 
              height: 6, 
              borderRadius: '50%', 
              background: '#10b981',
              display: 'inline-block' 
            }}></span>
            Session {sessionId}
          </span>
        )}
        <span style={{ marginLeft: sessionId ? 0 : 'auto', opacity: 0.6 }}>[ type <b>help</b> ]</span>
      </div>

      {/* Big intro banner */}
      {showIntroBanner && (
        <img
          src="/banner.png"
          alt="Banner"
          style={{
            position: 'fixed',
            top: STICKY_H,
            left: 10,
            right: 10,
            zIndex: 2,
            maxWidth: 'calc(100% - 20px)',
            height: 'auto',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Terminal area fills remaining space; has 10px gutters & 10px bottom pad */}
      <div
        ref={containerRef}  
        style={{
          position: 'absolute',
          top: topOffset,
          left: 10,
          right: 10,
          bottom: 10,              // ⬅️ ensures there’s always space for the last row/prompt
          zIndex: 1,
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
