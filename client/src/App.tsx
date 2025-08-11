import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

const WS_URL = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.hostname + ':8787/ws'

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const [socket, setSocket] = useState<WebSocket | null>(null)

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      // No scrollback so the terminal never shows an internal scrollbar
      scrollback: 0,
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e7eb',
        cursor: '#93c5fd',
        selectionBackground: '#3b82f680',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    termRef.current = term

    const container = containerRef.current
    let raf: number | undefined
    const fitSafe = () => {
      try { fitAddon.fit() } catch { /* xterm may throw if not yet opened */ }
    }
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(fitSafe)
    }
    if (container) {
      term.open(container)
      raf = requestAnimationFrame(fitSafe)
      window.addEventListener('resize', onResize)
    }

    term.writeln('Welcome to Yubi Terminal!')
    term.writeln('Type your prompt and press Enter.\r\n')

    // Block navigation keys so the cursor can't move away from the prompt line
    term.attachCustomKeyEventHandler((e) => {
      const blockedKeys = new Set([
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown'
      ])
      if (blockedKeys.has(e.key)) return false
      return true
    })

  const ws = new WebSocket(WS_URL)
    ws.addEventListener('open', () => {
      term.writeln('[CONNECTED]')
    })
    ws.addEventListener('close', () => {
      term.writeln('[DISCONNECTED]')
    })
    ws.addEventListener('error', () => {
      term.writeln('[ERROR] websocket connection error')
    })
    let lineBuffer = ''
    const normalizeLine = (s: string) => s.replace(/^\s{3,}/, '  ')

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'token') {
        lineBuffer += data.content
        // Flush complete lines to avoid massive left padding
        const parts = lineBuffer.split(/\r?\n/)
        for (let i = 0; i < parts.length - 1; i++) {
          term.writeln(normalizeLine(parts[i]))
        }
        lineBuffer = parts[parts.length - 1]
      } else if (data.type === 'line') {
        term.writeln(normalizeLine(String(data.content ?? '')))
      } else if (data.type === 'ready') {
        term.writeln('[READY]')
        term.writeln('[HINT] type /reset to start a fresh session')
        term.write('> ')
      } else if (data.type === 'status') {
        if ((data.message || '').toLowerCase() === 'done') {
          // Flush any remaining buffered text and show a fresh prompt
          if (lineBuffer && lineBuffer.length > 0) {
            term.writeln(normalizeLine(lineBuffer))
            lineBuffer = ''
          }
          const lvl = data.level?.toUpperCase?.() ?? 'INFO'
          term.writeln(`[${lvl}] ${data.message}`)
          term.write('> ')
        } else if ((data.message || '').toLowerCase() === 'session reset') {
          term.writeln('[INFO] session reset')
          term.write('> ')
        } else {
          const lvl = data.level?.toUpperCase?.() ?? 'INFO'
          term.writeln(`[${lvl}] ${data.message}`)
        }
      } else if (data.type === 'error') {
        term.writeln(`[ERROR] ${data.message}`)
      }
    })
  setSocket(ws)

    let current = ''
    term.onData((d) => {
      // Ignore ESC-based control sequences (arrows, etc.)
      if (d && d.charCodeAt(0) === 27) {
        return
      }

      if (d === '\r') {
        const trimmed = current.trim()
        term.write('\r\n')
        if (trimmed.length > 0) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'prompt', content: trimmed }))
          } else {
            term.writeln('[WARN] connection not open')
          }
        } else {
          // Empty enter: show a fresh prompt immediately
          term.write('> ')
        }
        current = ''
        // Reprint prompt handled by server via status "done"/"session reset"
      } else if (d === '\u0003') { // Ctrl+C
        // Cancel current input and show a fresh prompt line
        current = ''
        term.write('^C\r\n> ')
      } else if (d === '\u007F') { // backspace
        if (current.length > 0) {
          current = current.slice(0, -1)
          term.write('\b \b')
        }
      } else {
        // Only echo printable characters (basic ASCII range)
        // Sanitize the entire chunk to avoid embedded control codes/newlines in pastes
        if (d.includes('\u001b')) return // drop anything with ESC
        const sanitized = d
          .replace(/\r|\n/g, '') // drop newlines
          .replace(/\t/g, '  ')   // turn tabs into two spaces
          .replace(/[^\x20-\x7E]+/g, '') // keep printable ASCII only
        if (sanitized.length > 0) {
          current += sanitized
          term.write(sanitized)
        }
      }
    })

    // Cleanup
    return () => {
      try { window.removeEventListener('resize', onResize) } catch {}
      try { if (raf) cancelAnimationFrame(raf) } catch {}
      try { ws.close() } catch {}
      try { term.dispose() } catch {}
    }
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
