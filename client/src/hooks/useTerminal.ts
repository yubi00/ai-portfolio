import { useRef, useState, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  TERMINAL_CONFIG,
  MOBILE_BREAKPOINT,
  MOBILE_FONT_SIZE,
} from '../config/terminal';
import { getWelcomeMessage, writeToTerminal, writePrompt } from '../utils/terminal';
import { handleCommand as processCommand } from '../utils/inputHandler';
import { createInputHandler } from './useTerminalInput';
import { runStreamingPrompt } from './useStreamingResponse';

export interface UseTerminalOptions {
  onSessionChange?: (sessionId: string) => void;
  onCommand?: (command: string) => void;
  voiceEnabled?: boolean;
}

export const useTerminal = (options: UseTerminalOptions = {}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [inputState, setInputState] = useState({ current: '', cursorPos: 0 });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fitAddon] = useState(() => new FitAddon());
  const [webLinksAddon] = useState(() => new WebLinksAddon());

  // -------------------------------------------------------------------------
  // Terminal initialization
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!terminalRef.current) return;

    const initialFontSize =
      window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_FONT_SIZE : TERMINAL_CONFIG.fontSize;

    const term = new Terminal({ ...TERMINAL_CONFIG, fontSize: initialFontSize });
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    // Fit immediately, then again once fonts are ready to correct column count.
    // Guard with a flag so a late font-ready callback doesn't corrupt mid-session state.
    let fontFitDone = false;
    requestAnimationFrame(() => { try { fitAddon.fit() } catch {} });
    document.fonts?.ready.then(() => {
      if (!fontFitDone) {
        fontFitDone = true;
        requestAnimationFrame(() => { try { fitAddon.fit() } catch {} });
      }
    });

    writeToTerminal(term, getWelcomeMessage(Boolean(options.voiceEnabled)));
    writePrompt(term);

    let busy = false;

    const handleCommand = async (command: string) => {
      options.onCommand?.(command);
      busy = true;
      setIsLoading(true);
      try {
        const result = await processCommand(command, sessionIdRef.current ?? sessionId ?? '');
        if (result.output) writeToTerminal(term, result.output);
        if (result.sessionId && result.sessionId !== sessionIdRef.current) {
          setSessionId(result.sessionId);
          sessionIdRef.current = result.sessionId;
          options.onSessionChange?.(result.sessionId);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'AI_STREAMING_NEEDED') {
          await runStreamingPrompt(command, sessionId, sessionIdRef, term, {
            onSessionId: (id) => {
              setSessionId(id);
              options.onSessionChange?.(id);
            },
          });
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

    const { handleData } = createInputHandler(
      term,
      () => inputState,
      (s) => setInputState(s),
      handleCommand,
      () => busy,
      () => { fontFitDone = true },
    );

    term.onData(handleData);
    setTerminal(term);

    return () => { term.dispose(); };
  }, [fitAddon]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Resize & orientation handling
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!terminal) return;

    let raf: number | undefined;

    const fitSafe = () => { try { fitAddon.fit() } catch {} };

    const handleResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
        const targetSize = isMobile ? MOBILE_FONT_SIZE : TERMINAL_CONFIG.fontSize;
        if (terminal.options.fontSize !== targetSize) terminal.options.fontSize = targetSize;
        fitSafe();
      });
    };

    const handleOrientation = () => setTimeout(handleResize, 150);

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientation);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, [terminal, fitAddon]);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const clearTerminal = () => {
    if (!terminal) return;
    terminal.clear();
    writeToTerminal(terminal, getWelcomeMessage(Boolean(options.voiceEnabled)));
    writePrompt(terminal);
  };

  const resetSession = () => {
    setSessionId(null);
    sessionIdRef.current = null;
    setInputState({ current: '', cursorPos: 0 });
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
    resetSession,
  };
};
