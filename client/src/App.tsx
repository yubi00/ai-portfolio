import { useEffect, useRef } from 'react'
  import { Terminal } from 'xterm'
  import { FitAddon } from 'xterm-addon-fit'
  import 'xterm/css/xterm.css'
  import './terminal-custom.css'

  export default function App() {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const termRef = useRef<Terminal | null>(null)

    useEffect(() => {
  // ASCII art banner (DOH font, static)
  const banner =  
  '    YYYYYYY       YYYYYYYUUUUUUUU     UUUUUUUUBBBBBBBBBBBBBBBBB   IIIIIIIIII  \n'+                                                                                                                 
  '  Y:::::Y       Y:::::YU::::::U     U::::::UB::::::::::::::::B  I::::::::I    \n'+                                                                                                               
  '  Y:::::Y       Y:::::YU::::::U     U::::::UB::::::BBBBBB:::::B I::::::::I    \n'+                                                                                                               
  '  Y::::::Y     Y::::::YUU:::::U     U:::::UUBB:::::B     B:::::BII::::::II    \n'+                                                                                                               
  '  YYY:::::Y   Y:::::YYY U:::::U     U:::::U   B::::B     B:::::B  I::::I      \n'+                                                                                                               
  '    Y:::::Y Y:::::Y    U:::::D     D:::::U   B::::B     B:::::B  I::::I       \n'+                                                                                                              
  '      Y:::::Y:::::Y     U:::::D     D:::::U   B::::BBBBBB:::::B   I::::I      \n'+                                                                                                               
  '      Y:::::::::Y      U:::::D     D:::::U   B:::::::::::::BB    I::::I       \n'+                                                                                                              
  '        Y:::::::Y       U:::::D     D:::::U   B::::BBBBBB:::::B   I::::I      \n'+                                                                                                               
  '        Y:::::Y        U:::::D     D:::::U   B::::B     B:::::B  I::::I       \n'+                                                                                                              
  '        Y:::::Y        U:::::D     D:::::U   B::::B     B:::::B  I::::I       \n'+                                                                                                              
  '        Y:::::Y        U::::::U   U::::::U   B::::B     B:::::B  I::::I       \n'+                                                                                                              
  '        Y:::::Y        U:::::::UUU:::::::U BB:::::BBBBBB::::::BII::::::II     \n'+                                                                                                              
  '      YYYY:::::YYYY      UU:::::::::::::UU  B:::::::::::::::::B I::::::::I    \n'+                                                                                                               
  '      Y:::::::::::Y        UU:::::::::UU    B::::::::::::::::B  I::::::::I    \n'+                                                                                                               
  '      YYYYYYYYYYYYY          UUUUUUUUU      BBBBBBBBBBBBBBBBB   IIIIIIIIII    '                                                                                                               
  
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
      
    // Use xterm.js escape for bold and color, but font-size must be set via CSS on the container
    term.writeln('\x1b]1337;SetMark;\x07') // iTerm2 mark for visual separation (optional)
    term.writeln('');
    // Change banner color to light grey (ANSI 250)
    term.writeln('\x1b[1m\x1b[38;5;250m' + banner + '\x1b[0m')
    term.writeln('\x1b[1m\x1b[38;5;81mWelcome to Yubi Portfolio Terminal!\x1b[0m');
    term.writeln('\x1b[1mAsk me anything about my projects, skills and experiences and press Enter.\x1b[0m\r\n');
    term.write('\x1b[1m> \x1b[0m');

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
            // Draw a rectangular border for the prompt
            const promptWidth = term.cols - 2;
            const pad = Math.max(0, promptWidth - 2); // '> '.length = 2
            const top = '┌' + '─'.repeat(promptWidth) + '┐';
            const mid = '│> ' + ' '.repeat(pad) + '│';
            const bot = '└' + '─'.repeat(promptWidth) + '┘';
            term.write('\x1b[1m> \x1b[0m');
          }
          current = ''
        } else if (d === '\u0003') { // Ctrl+C
    term.writeln('\x1b[1m\x1b[38;5;81m' + banner + '\x1b[0m')
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
    const handleCommand = async (command: string, term: Terminal) => {
      const cmd = command.toLowerCase().trim();
      // Known local commands
      switch (cmd) {
        case 'help':
          term.writeln('Available commands:');
          term.writeln('  help    - Show this help message');
          term.writeln('  clear   - Clear the terminal');
          term.writeln('  info    - Show server info');
          term.writeln('  ping    - Test server connection');
          term.writeln('  You can also just ask: "What projects have you worked on?"');
          break;
        case 'clear':
          term.clear();
          term.writeln('Welcome to Yubi Terminal!');
          term.writeln('Ask me anything about my projects, skills and experiences and press Enter.\r\n');
          break;
        case 'info':
          term.writeln('AI Portfolio Terminal v0.1.0');
          term.writeln('Ready for AI integration');
          break;
        case 'ping':
          term.writeln('Server: Ready (local mode)');
          break;
        default:
          // Treat as chat: send to MCP client endpoint
          try {
            const res = await fetch('http://127.0.0.1:9000/prompt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: command })
            });
            if (!res.ok) {
              term.writeln('\x1b[31mError: Failed to fetch from MCP client.\x1b[0m');
            } else {
              const data = await res.json();
              let answer = '';
              if (typeof data.result === 'string') {
                answer = data.result;
              } else if (typeof data === 'string') {
                answer = data;
              } else {
                answer = JSON.stringify(data, null, 2);
              }
              // Add a colored prefix and extra spacing for clarity
              term.writeln('\r\n\x1b[1m\x1b[38;5;81mYubi Assistant:\x1b[0m');
              term.writeln(`\x1b[38;5;250m${answer}\x1b[0m\r\n`);
            }
          } catch (err) {
            term.writeln('\x1b[31mError: Could not reach MCP client.\x1b[0m');
          }
          break;
      }
      term.write('> ');
    }

    return (
      <div className="min-h-screen flex flex-col p-0 text-neutral-200 bg-transparent" style={{ boxShadow: 'none', border: 'none', overflow: 'hidden' }}>
        <div
          ref={containerRef}
          className="terminal-outer-container"
          style={{
            width: '100%',
            minHeight: '80vh',
            background: '#101014',
            border: '1.5px solid #23232a',
            borderRadius: '12px',
            boxShadow: '0 2px 16px 0 #00000044',
            padding: '18px 12px 18px 12px',
            overflowY: 'auto',
            overflowX: 'hidden',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            position: 'relative',
          }}
        />
      </div>
    )
  }
