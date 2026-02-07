import React from 'react';
import { TERMINAL_STYLES } from '../config/terminal';

interface TerminalContainerProps {
  terminalRef: React.RefObject<HTMLDivElement>;
}

export const TerminalContainer: React.FC<TerminalContainerProps> = ({ terminalRef }) => {
  const topOffset = 10;

  return (
    <div style={TERMINAL_STYLES.terminal(topOffset)}>
      <div
        className="terminal-outer-container"
        style={{ width: '100%', height: '100%', display: 'flex' }}
      >
        <div ref={terminalRef} style={{ flex: 1, minHeight: 0, width: '100%' }} />
      </div>
    </div>
  );
};
