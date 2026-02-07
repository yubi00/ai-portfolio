import React from 'react';
import { TerminalContainer } from './components';
import { useTerminal } from './hooks/useTerminal';
import { TERMINAL_STYLES } from './config/terminal';
import 'xterm/css/xterm.css';
import './styles.css';
import './terminal-custom.css';

const App: React.FC = () => {
  const { 
    terminalRef
  } = useTerminal({
    onSessionChange: (newSessionId) => {
      console.log('Session changed:', newSessionId);
    }
  });

  return (
    <div style={TERMINAL_STYLES.root}>
      <TerminalContainer terminalRef={terminalRef} />
    </div>
  );
};

export default App;
