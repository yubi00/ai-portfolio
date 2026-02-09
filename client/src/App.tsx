import React, { useState } from 'react';
import { TerminalContainer } from './components';
import { useTerminal } from './hooks/useTerminal';
import { TERMINAL_STYLES } from './config/terminal';
import { AboutOverlay } from './components/AboutOverlay';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import './terminal-custom.css';

const App: React.FC = () => {
  const [aboutVisible, setAboutVisible] = useState(false);
  const { 
    terminalRef
  } = useTerminal({
    onCommand: (command) => {
      const trimmed = command.trim().toLowerCase();
      if (trimmed === 'about') {
        setAboutVisible(v => !v);
        return;
      }
      // Any other command dismisses the about card.
      setAboutVisible(false);
    },
  });

  const closeAbout = () => {
    setAboutVisible(false);
    // Restore focus to xterm so the user can keep typing immediately.
    window.setTimeout(() => {
      const textarea = terminalRef.current?.querySelector('textarea') as HTMLTextAreaElement | null;
      textarea?.focus();
    }, 0);
  };

  return (
    <div style={TERMINAL_STYLES.root}>
      <AboutOverlay visible={aboutVisible} onClose={closeAbout} />
      <TerminalContainer terminalRef={terminalRef} />
    </div>
  );
};

export default App;
