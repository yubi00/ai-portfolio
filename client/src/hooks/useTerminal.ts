import { useRef, useState, useEffect } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { TERMINAL_CONFIG, THEMES } from '../config/terminal';
import { writeToTerminal, writePrompt } from '../utils/terminal';
import { type InputState, handleCommand as processCommand } from '../utils/inputHandler';
import { getApiBaseUrl, getAuthEnv } from '../config/env';
import { getAuthorizationHeader } from '../utils/auth';

export interface UseTerminalOptions {
  onSessionChange?: (sessionId: string) => void;
  onCommand?: (command: string) => void;
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
    let busy = false;

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
          if (busy) {
            writeToTerminal(term, '\x1b[2m\x1b[38;5;244m(Please wait for the current response to finish)\x1b[0m\r\n');
            writePrompt(term);
            current = '';
            cursorPos = 0;
            updateInputState({ current: '', cursorPos: 0 });
            return;
          }
          handleCommand(trimmed);
        } else {
          writePrompt(term);
        }
        current = '';
        cursorPos = 0;
        // Update React state for UI consistency
        updateInputState({ current: '', cursorPos: 0 });
      } else if (data === '\u0003') { // Ctrl+C
        current = '';
        cursorPos = 0;
        term.write('^C\r\n');
        writePrompt(term);
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
      options.onCommand?.(command);
      busy = true;
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
        busy = false;
      }
      writePrompt(term);
    };

    const handleStreamingCommand = async (command: string, term: Terminal) => {
      // Minimal: while fetching, show nothing extra (cursor blinks on the empty line).
      // Add one blank line after the user's command so replies don't feel glued to the prompt.
      term.writeln('');
      term.scrollToBottom();
      term.focus();

      const ERROR_MSG = (msg: string) => `\x1b[2m\x1b[38;5;203mError: ${msg}\x1b[0m`;
      
      // Prepare request payload with session management
      const payload: { prompt: string; session_id?: string } = { prompt: command };
      // Use ref for immediate access to session ID (avoiding React state timing issues)
      const currentSessionId = sessionIdRef.current || sessionId;
      if (currentSessionId) {
        payload.session_id = currentSessionId;
      }

      try {
        const apiUrl = getApiBaseUrl();
        const { requireAuth } = getAuthEnv();

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        };

        const authHeader = await getAuthorizationHeader({ enforce: requireAuth });
        if (authHeader) headers.Authorization = authHeader;

        const res = await fetch(`${apiUrl}/prompt/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        // /prompt/stream may return 401 while still sending an SSE error frame.
        if (res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let startedAnswer = false;
          let sawDone = false;

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
              // Keep it quiet: track session without printing extra lines.
              setSessionId(payload.session_id);
              sessionIdRef.current = payload.session_id;
              options.onSessionChange?.(payload.session_id);
            } else if (type === 'partial' && typeof payload?.text === 'string') {
              if (!startedAnswer) startedAnswer = true;
              term.write(`\x1b[38;5;250m${payload.text}\x1b[0m`);
              term.scrollToBottom();
            } else if (type === 'final') {
              if (!startedAnswer) {
                const reply: string = payload?.reply ?? '';
                term.writeln(`\x1b[38;5;250m${reply}\x1b[0m`);
              }
              term.writeln(''); // First line after reply
              term.writeln(''); // Extra spacing line
            } else if (type === 'error') {
              const msg = payload?.message || 'Unknown error';
              const detail = payload?.detail ? ` (${payload.detail})` : '';
              if (startedAnswer) term.writeln('');
              term.writeln(ERROR_MSG(`${msg}${detail}`));
            }

            if (type === 'done') {
              sawDone = true;
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

          // If backend returned a non-2xx without emitting an SSE error, surface status.
          if (!res.ok && !sawDone) {
            term.writeln(ERROR_MSG(`HTTP ${res.status}`));
          }
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        term.writeln(ERROR_MSG(msg));
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
