import React, { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { TerminalContainer } from './components';
import { useTerminal } from './hooks/useTerminal';
import { TERMINAL_STYLES, LAYOUT_CONSTANTS, DARK_BG, LIGHT_BG, DARK_XTERM_THEME, LIGHT_XTERM_THEME } from './config/terminal';
import { AboutOverlay } from './components/AboutOverlay';
import { Header } from './components/Header';
import { VoiceChat } from './components/VoiceChat';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { isVoiceEnabled } from './config/env';

const VOICE_ENABLED = isVoiceEnabled();
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import './terminal-custom.css';

const AppInner: React.FC = () => {
  const { isDark } = useTheme();
  const [aboutVisible, setAboutVisible] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const { terminalRef, terminal } = useTerminal({
    voiceEnabled: VOICE_ENABLED,
    onCommand: (command) => {
      const trimmed = command.trim().toLowerCase();
      if (trimmed === 'about') {
        setAboutVisible(v => !v);
        return;
      }
      setAboutVisible(false);
    },
  });

  // Swap xterm theme live when toggling
  useEffect(() => {
    if (!terminal) return;
    terminal.options.theme = isDark ? DARK_XTERM_THEME : LIGHT_XTERM_THEME;
  }, [terminal, isDark]);

  // Mobile browsers keep changing the visual viewport as browser chrome and
  // the keyboard appear. Use the visible height so the prompt remains reachable.
  useEffect(() => {
    const setAppHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
    };

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.visualViewport?.addEventListener('resize', setAppHeight);
    window.visualViewport?.addEventListener('scroll', setAppHeight);

    return () => {
      window.removeEventListener('resize', setAppHeight);
      window.visualViewport?.removeEventListener('resize', setAppHeight);
      window.visualViewport?.removeEventListener('scroll', setAppHeight);
    };
  }, []);

  const closeAbout = () => {
    setAboutVisible(false);
    window.setTimeout(() => {
      const textarea = terminalRef.current?.querySelector('textarea') as HTMLTextAreaElement | null;
      textarea?.focus();
    }, 0);
  };

  const bg = isDark ? DARK_BG : LIGHT_BG;
  const topOffset = LAYOUT_CONSTANTS.HEADER_H + 5;

  return (
    <div style={TERMINAL_STYLES.root(bg)}>
      <Header
        voiceOpen={voiceOpen}
        voiceEnabled={VOICE_ENABLED}
        onVoiceToggle={VOICE_ENABLED ? () => setVoiceOpen(v => !v) : undefined}
      />
      <AboutOverlay visible={aboutVisible} onClose={closeAbout} />
      <TerminalContainer terminalRef={terminalRef} topOffset={topOffset} isDark={isDark} />
      {VOICE_ENABLED && voiceOpen && <VoiceChat onClose={() => setVoiceOpen(false)} />}
    </div>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <AppInner />
    <Analytics />
    <SpeedInsights />
  </ThemeProvider>
);

export default App;
