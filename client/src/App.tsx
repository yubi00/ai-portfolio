import React from 'react';
import { Header, TerminalContainer } from './components';
import { useTerminal } from './hooks/useTerminal';
import { TERMINAL_STYLES } from './config/terminal';
import 'xterm/css/xterm.css';
import './styles.css';
import './terminal-custom.css';

const App: React.FC = () => {
  const { 
    terminalRef, 
    sessionId
  } = useTerminal({
    onSessionChange: (newSessionId) => {
      console.log('Session changed:', newSessionId);
    }
  });

  return (
    <div style={TERMINAL_STYLES.root}>
      <Header sessionId={sessionId} />
      <TerminalContainer terminalRef={terminalRef} />
    </div>
  );
};

export default App;