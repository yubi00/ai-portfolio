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
      theme: {
        background: '#000000',
        foreground: '#E6E6E6',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    termRef.current = term

    if (containerRef.current) {
      term.open(containerRef.current)
      fitAddon.fit()
      window.addEventListener('resize', () => fitAddon.fit())
    }

    term.writeln('Welcome to your AI Portfolio Terminal!')
    term.writeln('Type your prompt and press Enter.\r\n')

    const ws = new WebSocket(WS_URL)
    ws.addEventListener('open', () => {
      term.writeln('[connected]')
    })
    ws.addEventListener('close', () => {
      term.writeln('[disconnected]')
    })
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'token') {
        term.write(data.content)
      } else if (data.type === 'line') {
        term.writeln(data.content)
      } else if (data.type === 'ready') {
        term.writeln('> ready')
      }
    })
    setSocket(ws)

    let current = ''
    term.onData((d) => {
      if (d === '\r') {
        const trimmed = current.trim()
        term.write('\r\n')
        if (trimmed.length > 0) {
          ws.send(JSON.stringify({ type: 'prompt', content: trimmed }))
        }
        current = ''
      } else if (d === '\u007F') { // backspace
        if (current.length > 0) {
          current = current.slice(0, -1)
          term.write('\b \b')
        }
      } else {
        current += d
        term.write(d)
      }
    })

    return () => {
      ws.close()
      term.dispose()
    }
  }, [])

  return (
    <div className="h-screen w-screen bg-black text-white p-4">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
