import { useRef, useState, useEffect } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { TERMINAL_CONFIG, THEMES } from '../config/terminal';
import { writeToTerminal, writePrompt } from '../utils/terminal';
import { type InputState, handleCommand as processCommand } from '../utils/inputHandler';

export interface UseTerminalOptions {
  onSessionChange?: (sessionId: string) => void;
}

export const useTerminal = (options: UseTerminalOptions = {}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [inputState, setInputState] = useState<InputState>({ current: '', cursorPos: 0 });
  const [sessionId, setSessionId] = useState<string | null>(null); // Start with null like original
  const sessionIdRef = useRef<string | null>(null); // For immediate access
  const [isLoading, setIsLoading] = useState(false);
  const [fitAddon] = useState(() => new FitAddon());
  const [webLinksAddon] = useState(() => new WebLinksAddon());

  // Use ref for immediate state access to avoid React state timing issues
  const inputStateRef = useRef<InputState>({ current: '', cursorPos: 0 });

  // Keep ref in sync with state
  const updateInputState = (newState: InputState) => {
    inputStateRef.current = newState;
    setInputState(newState);
  };

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal(TERMINAL_CONFIG);
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    // Use requestAnimationFrame for proper fitting like original
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    // Write welcome message
    writeToTerminal(term, THEMES.matrix.welcome);
    writePrompt(term);

    // Use local variables like the original for immediate updates
    let current = '';
    let cursorPos = 0;

    const handleData = (data: string) => {
      // Handle specific escape sequences we want
      if (data === '\u001b[D') { // Left arrow
        if (cursorPos > 0) {
          cursorPos--;
          term.write('\u001b[D');
        }
        return;
      }
      
      if (data === '\u001b[C') { // Right arrow  
        if (cursorPos < current.length) {
          cursorPos++;
          term.write('\u001b[C');
        }
        return;
      }
      
      if (data === '\u001b[A' || data === '\u001b[B') { // Up/Down arrows
        return; // Ignore for now
      }
      
      // Block ALL other escape sequences (anything starting with ESC)
      if (data.includes('\u001b') || data.charCodeAt(0) === 27) {
        return;
      }

      if (data === '\r') {
        const trimmed = current.trim();
        term.write('\r\n');

        if (trimmed.length > 0) {
          handleCommand(trimmed);
        } else {
          term.write('\x1b[1m> \x1b[0m');
          term.scrollToBottom();
        }
        current = '';
        cursorPos = 0;
        // Update React state for UI consistency
        updateInputState({ current: '', cursorPos: 0 });
      } else if (data === '\u0003') { // Ctrl+C
        current = '';
        cursorPos = 0;
        term.write('^C\r\n\x1b[1m> \x1b[0m');
        term.scrollToBottom();
        updateInputState({ current: '', cursorPos: 0 });
      } else if (data === '\u007F') { // backspace
        if (cursorPos > 0) {
          // Remove character at cursor position - 1
          current = current.slice(0, cursorPos - 1) + current.slice(cursorPos);
          cursorPos--;
          
          // Clear from cursor to end of line, then redraw the remaining text
          const remaining = current.slice(cursorPos);
          term.write('\b' + remaining + ' '.repeat(1) + '\b'.repeat(remaining.length + 1));
          
          // Update React state
          updateInputState({ current, cursorPos });
        }
      } else {
        const sanitized = data.replace(/\r|\n/g, '').replace(/\t/g, '  ').replace(/[^\x20-\x7E]+/g, '');
        if (sanitized.length > 0) {
          // Insert character at cursor position
          current = current.slice(0, cursorPos) + sanitized + current.slice(cursorPos);
          cursorPos += sanitized.length;
          
          // Redraw from cursor position: write new char + remaining text, then move cursor back
          const remaining = current.slice(cursorPos);
          term.write(sanitized + remaining + '\u001b[D'.repeat(remaining.length));
          
          // Update React state
          updateInputState({ current, cursorPos });
        }
      }
    };

    const handleCommand = async (command: string) => {
      setIsLoading(true);
      try {
        const result = await processCommand(command, sessionId);
        if (result.output) {
          writeToTerminal(term, result.output);
        }
        if (result.sessionId && result.sessionId !== sessionId) {
          setSessionId(result.sessionId);
          options.onSessionChange?.(result.sessionId);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'AI_STREAMING_NEEDED') {
          // Handle streaming AI response directly in terminal like original
          await handleStreamingCommand(command, term);
        } else {
          console.error('Error processing command:', error);
          writeToTerminal(term, 'Error: Failed to process command');
        }
      } finally {
        setIsLoading(false);
      }
      writePrompt(term);
    };

    const handleStreamingCommand = async (command: string, term: Terminal) => {
      // Show thinking indicator while processing
      term.writeln('\r\n\x1b[1m\x1b[38;5;81mYubi Assistant:\x1b[0m');
      term.writeln('\x1b[2m\x1b[90mThinking...\x1b[0m');
      
      // Prepare request payload with session management
      const payload: { prompt: string; session_id?: string } = { prompt: command };
      // Use ref for immediate access to session ID (avoiding React state timing issues)
      const currentSessionId = sessionIdRef.current || sessionId;
      if (currentSessionId) {
        payload.session_id = currentSessionId;
      }

      try {
        const apiUrl = (import.meta.env?.VITE_API_URL as string) || 'http://127.0.0.1:9000';
        const res = await fetch(`${apiUrl}/prompt/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
          body: JSON.stringify(payload),
        });

        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let startedAnswer = false;

          const flushEvent = (raw: string) => {
            const lines = raw.split(/\r?\n/);
            const dataLine = lines.find(l => l.startsWith('data:'));
            if (!dataLine) return;
            const jsonStr = dataLine.slice(5).trim().replace(/^\s*/, '').replace(/^:/, '');
            if (!jsonStr) return;
            let evt: any;
            try { evt = JSON.parse(jsonStr); } catch { return; }
            const { type, payload } = evt || {};

            if (type === 'session' && payload?.session_id) {
              term.write('\x1b[1A\x1b[2K'); // Clear thinking line
              if (!sessionIdRef.current) {
                term.writeln(`\x1b[2m\x1b[90m[Session ${payload.session_id} started]\x1b[0m`);
              }
              setSessionId(payload.session_id);
              sessionIdRef.current = payload.session_id;
              options.onSessionChange?.(payload.session_id);
              if (!startedAnswer) term.writeln('\x1b[2m\x1b[90mThinking...\x1b[0m');
            } else if (type === 'partial' && typeof payload?.text === 'string') {
              if (!startedAnswer) { 
                term.write('\x1b[1A\x1b[2K'); // Clear thinking line
                startedAnswer = true; 
              }
              term.write(`\x1b[38;5;250m${payload.text}\x1b[0m`);
              term.scrollToBottom();
            } else if (type === 'final') {
              if (!startedAnswer) {
                term.write('\x1b[1A\x1b[2K');
                const reply: string = payload?.reply ?? '';
                term.writeln(`\x1b[38;5;250m${reply}\x1b[0m`);
              }
              term.writeln(''); // First line after reply
              term.writeln(''); // Extra spacing line
            } else if (type === 'error') {
              term.write('\x1b[1A\x1b[2K');
              const msg = payload?.message || 'Unknown error';
              term.writeln(`\x1b[31mError: ${msg}\x1b[0m`);
            }
          };

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
              const chunk = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              if (chunk.trim().length > 0) flushEvent(chunk);
            }
          }
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (error) {
        // Clear thinking line and show error
        term.write('\x1b[1A\x1b[2K');
        term.writeln(`\x1b[31mError: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m`);
      }
    };

    term.onData(handleData);

    setTerminal(term);

    return () => {
      term.dispose();
    };
  }, [fitAddon]);

  // Session ID management - removed automatic initialization
  // Session will be created only when first AI conversation happens

  // Handle window resize
  useEffect(() => {
    let raf: number | undefined;
    
    const fitSafe = () => { 
      try { 
        fitAddon.fit() 
      } catch {} 
    }
    
    const handleResize = () => { 
      if (raf) cancelAnimationFrame(raf); 
      raf = requestAnimationFrame(fitSafe) 
    }

    window.addEventListener('resize', handleResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
    }
  }, [terminal, fitAddon]);

  const clearTerminal = () => {
    if (terminal) {
      terminal.clear();
      writeToTerminal(terminal, THEMES.matrix.welcome);
      writePrompt(terminal);
    }
  };

  const resetSession = () => {
    setSessionId(null);
    sessionIdRef.current = null;
    updateInputState({ current: '', cursorPos: 0 });
    options.onSessionChange?.('');
    clearTerminal();
  };

  return {
    terminalRef,
    terminal,
    currentInput: inputState.current,
    sessionId,
    isLoading,
    clearTerminal,
    resetSession
  };
};