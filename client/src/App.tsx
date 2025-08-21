import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import './terminal-custom.css'

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)

  // 👇 hybrid-banner state
  const [showIntroBanner, setShowIntroBanner] = useState(true)

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'JetBrains Mono, Fira Mono, Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
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

    const container = containerRef.current
    let raf: number | undefined
    const fitSafe = () => { try { fitAddon.fit() } catch {} }
    const onResize = () => { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(fitSafe) }

    if (container) {
      term.open(container)
      raf = requestAnimationFrame(fitSafe)
      window.addEventListener('resize', onResize)
    }

    term.writeln('\x1b]1337;SetMark;\x07')
    term.writeln('')
    term.writeln('\x1b[1m\x1b[38;5;81mWelcome to Yubi Portfolio Terminal!\x1b[0m')
    term.writeln('\x1b[1mAsk me anything about my projects, skills and experiences and press Enter.\x1b[0m\r\n')
    term.write('\x1b[1m> \x1b[0m')

    let current = ''
    term.onData((d) => {
      if (d && d.charCodeAt(0) === 27) return

      if (d === '\r') {
        const trimmed = current.trim()
        term.write('\r\n')

        // 👇 first real command hides the big banner
        if (trimmed.length > 0 && showIntroBanner) setShowIntroBanner(false)

        if (trimmed.length > 0) {
          handleCommand(trimmed, term)
        } else {
          term.write('\x1b[1m> \x1b[0m')
        }
        current = ''
      } else if (d === '\u0003') {
        current = ''
        term.write('^C\r\n> ')
      } else if (d === '\u007F') {
        if (current.length > 0) { current = current.slice(0, -1); term.write('\b \b') }
      } else {
        if (d.includes('\u001b')) return
        const sanitized = d.replace(/\r|\n/g, '').replace(/\t/g, '  ').replace(/[^\x20-\x7E]+/g, '')
        if (sanitized.length > 0) { current += sanitized; term.write(sanitized) }
      }
    })

    return () => {
      try { window.removeEventListener('resize', onResize) } catch {}
      try { if (raf) cancelAnimationFrame(raf) } catch {}
      try { term.dispose() } catch {}
    }
  }, [showIntroBanner])

  const handleCommand = async (command: string, term: Terminal) => {
    const cmd = command.toLowerCase().trim()
    switch (cmd) {
      case 'help':
        term.writeln('Available commands:')
        term.writeln('  help    - Show this help message')
        term.writeln('  clear   - Clear the terminal')
        term.writeln('  info    - Show server info')
        term.writeln('  ping    - Test server connection')
        term.writeln('  You can also just ask: "What projects have you worked on?"')
        break
      case 'clear':
        term.clear()
        term.writeln('Welcome to Yubi Terminal!')
        term.writeln('Ask me anything about my projects, skills and experiences and press Enter.\r\n')
        break
      case 'info':
        term.writeln('AI Portfolio Terminal v0.1.0')
        term.writeln('Ready for AI integration')
        break
      case 'ping':
        term.writeln('Server: Ready (local mode)')
        break
      default:
        try {
          const res = await fetch('http://127.0.0.1:9000/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: command })
          })
          if (!res.ok) {
            term.writeln('\x1b[31mError: Failed to fetch from MCP client.\x1b[0m')
          } else {
            const data = await res.json()
            let answer = ''
            if (typeof data.result === 'string') answer = data.result
            else if (typeof data === 'string') answer = data
            else answer = JSON.stringify(data, null, 2)
            term.writeln('\r\n\x1b[1m\x1b[38;5;81mYubi Assistant:\x1b[0m')
            term.writeln(`\x1b[38;5;250m${answer}\x1b[0m\r\n`)
          }
        } catch {
          term.writeln('\x1b[31mError: Could not reach MCP client.\x1b[0m')
        }
        break
    }
    term.write('> ')
  }

  return (
    <div style={{ width: '100%', height: '100vh', background: '#101014', position: 'relative' }}>
      {/* Sticky mini header (always visible) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 3,
          padding: '8px 10px',          // 10px gutters
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(16,16,20,0.75)',
          backdropFilter: 'blur(6px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          color: '#cbd5e1'
        }}
      >
        <span style={{ fontWeight: 700, color: '#93c5fd' }}>Yubi Terminal</span>
        <span style={{ opacity: 0.7 }}>v0.1</span>
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>[ type <b>help</b> ]</span>
      </div>

      {/* Big intro banner (scrolls away by “hiding” after first command) */}
      {showIntroBanner && (
        <img
          src="/banner.png"
          alt="Banner"
          style={{
            position: 'absolute',
            top: 36,                   // below sticky header
            left: '10px',
            right: '10px',
            zIndex: 2,
            maxWidth: 'calc(100% - 20px)',
            height: 'auto',
            pointerEvents: 'none',
            transition: 'opacity 300ms ease',
            opacity: 1
          }}
        />
      )}

      {/* xterm container with matching gutters */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 1,
          paddingTop: showIntroBanner ? 160 : 56, // space for banner vs. sticky header
          paddingLeft: '10px',
          paddingRight: '10px',
          boxSizing: 'border-box'
        }}
      />
    </div>
  )
}
