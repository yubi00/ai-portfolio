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
  const commandRunnerRef = useRef<((command: string) => Promise<void>) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const awayFromBottomRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [lastFailedCommand, setLastFailedCommand] = useState<string | null>(null);
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
    term.textarea?.setAttribute('aria-label', 'Ask Yubi a question');

    // Fit immediately, then refit once web fonts settle so xterm's column count
    // always matches the glyphs the visitor actually sees.
    let containerFitFrame: number | undefined;
    const fitToContainer = () => {
      if (containerFitFrame) cancelAnimationFrame(containerFitFrame);
      containerFitFrame = requestAnimationFrame(() => { try { fitAddon.fit() } catch {} });
    };
    const resizeObserver = new ResizeObserver(fitToContainer);
    resizeObserver.observe(terminalRef.current);
    fitToContainer();
    document.fonts?.ready.then(() => {
      fitToContainer();
    });

    writeToTerminal(term, getWelcomeMessage(Boolean(options.voiceEnabled)));
    writePrompt(term);

    const syncScrollState = (viewportY = term.buffer.active.viewportY) => {
      const awayFromBottom = term.buffer.active.baseY - viewportY > 1;
      awayFromBottomRef.current = awayFromBottom;
      setIsAwayFromBottom(awayFromBottom);
    };
    const scrollDisposable = term.onScroll(syncScrollState);
    const writeDisposable = term.onWriteParsed(() => syncScrollState());

    const handleCommand = async (command: string) => {
      try { fitAddon.fit(); } catch {}
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setSuggestedPrompts([]);
      setLastFailedCommand(null);
      options.onCommand?.(command);
      busyRef.current = true;
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
          const outcome = await runStreamingPrompt(command, sessionId, sessionIdRef, term, {
            onSessionId: (id) => {
              setSessionId(id);
              options.onSessionChange?.(id);
            },
            onSuggestedPrompts: setSuggestedPrompts,
          }, controller.signal);
          if (outcome === 'error') setLastFailedCommand(command);
        } else {
          console.error('Error processing command:', error);
          writeToTerminal(term, 'Error: Failed to process command');
          setLastFailedCommand(command);
        }
      } finally {
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
        setIsLoading(false);
        busyRef.current = false;
      }
      writePrompt(term, {
        scroll: !awayFromBottomRef.current,
        focus: !awayFromBottomRef.current,
      });
    };

    commandRunnerRef.current = handleCommand;

    const { handleData } = createInputHandler(
      term,
      () => inputState,
      (s) => setInputState(s),
      handleCommand,
      () => busyRef.current,
      () => abortControllerRef.current?.abort(),
    );

    // Browsers may reserve Ctrl+C for copy before xterm emits terminal data.
    // Capture it while a response is active and the terminal owns focus.
    const handleCancelShortcut = (event: KeyboardEvent) => {
      if (
        event.type === 'keydown' &&
        event.ctrlKey &&
        event.key.toLowerCase() === 'c' &&
        busyRef.current &&
        !term.hasSelection() &&
        term.element?.contains(event.target as Node)
      ) {
        event.preventDefault();
        event.stopPropagation();
        handleData('\u0003');
      }
    };
    window.addEventListener('keydown', handleCancelShortcut, true);

    term.onData(handleData);
    setTerminal(term);

    return () => {
      resizeObserver.disconnect();
      scrollDisposable.dispose();
      writeDisposable.dispose();
      window.removeEventListener('keydown', handleCancelShortcut, true);
      if (containerFitFrame) cancelAnimationFrame(containerFitFrame);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      commandRunnerRef.current = null;
      busyRef.current = false;
      term.dispose();
    };
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
    const handleViewportChange = () => {
      setTimeout(() => {
        handleResize();
        terminal.scrollToBottom();
      }, 50);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientation);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientation);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, [terminal, fitAddon]);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const clearTerminal = () => {
    if (!terminal) return;
    terminal.clear();
    awayFromBottomRef.current = false;
    setIsAwayFromBottom(false);
    writeToTerminal(terminal, getWelcomeMessage(Boolean(options.voiceEnabled)));
    writePrompt(terminal);
  };

  const resetSession = () => {
    setSessionId(null);
    setSuggestedPrompts([]);
    setLastFailedCommand(null);
    sessionIdRef.current = null;
    setInputState({ current: '', cursorPos: 0 });
    options.onSessionChange?.('');
    clearTerminal();
  };

  const submitCommand = (command: string): boolean => {
    const trimmed = command.trim();
    const runner = commandRunnerRef.current;
    if (!terminal || !runner || busyRef.current || !trimmed) return false;

    terminal.scrollToBottom();
    awayFromBottomRef.current = false;
    setIsAwayFromBottom(false);
    setInputState({ current: '', cursorPos: 0 });
    terminal.write(trimmed);
    terminal.write('\r\n');
    void runner(trimmed);
    return true;
  };

  const scrollToLatest = () => {
    if (!terminal) return;
    terminal.scrollToBottom();
    terminal.focus();
    awayFromBottomRef.current = false;
    setIsAwayFromBottom(false);
  };

  const retryLastCommand = (): boolean => {
    if (!lastFailedCommand) return false;
    return submitCommand(lastFailedCommand);
  };

  return {
    terminalRef,
    terminal,
    currentInput: inputState.current,
    sessionId,
    isLoading,
    suggestedPrompts,
    retryAvailable: Boolean(lastFailedCommand),
    isAwayFromBottom,
    clearTerminal,
    resetSession,
    scrollToLatest,
    retryLastCommand,
    submitCommand,
  };
};
