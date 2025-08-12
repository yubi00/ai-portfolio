import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      scrollback: 1000,
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
    term.writeln('Simple AI Portfolio Terminal')
    term.writeln('Type your commands and press Enter.\r\n')
    term.write('> ')

    // Handle user input
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
          // Process the command locally for now
          handleCommand(trimmed, term)
        } else {
          // Empty enter: show a fresh prompt immediately
          term.write('> ')
        }
        current = ''
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
      try { term.dispose() } catch {}
    }
  }, [])

  // Simple command handler for demonstration
  const handleCommand = (command: string, term: Terminal) => {
    const cmd = command.toLowerCase().trim()
    
    switch (cmd) {
      case 'help':
        term.writeln('Available commands:')
        term.writeln('  help    - Show this help message')
        term.writeln('  clear   - Clear the terminal')
        term.writeln('  info    - Show server info')
        term.writeln('  ping    - Test server connection')
        break
      
      case 'clear':
        term.clear()
        term.writeln('Welcome to Yubi Terminal!')
        term.writeln('Simple AI Portfolio Terminal')
        term.writeln('Type your commands and press Enter.\r\n')
        break
      
      case 'info':
        // This could later make an HTTP call to /info endpoint
        term.writeln('AI Portfolio Terminal v0.1.0')
        term.writeln('Ready for AI integration')
        break
      
      case 'ping':
        // This could later make an HTTP call to /health endpoint
        term.writeln('Server: Ready (local mode)')
        break
      
      default:
        term.writeln(`Unknown command: ${command}`)
        term.writeln('Type "help" for available commands')
        break
    }
    
    term.write('> ')
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
