import React from 'react';
import { TERMINAL_STYLES, LAYOUT_CONSTANTS } from '../config/terminal';

interface TerminalContainerProps {
  terminalRef: React.RefObject<HTMLDivElement>;
}

export const TerminalContainer: React.FC<TerminalContainerProps> = ({ terminalRef }) => {
  const topOffset = LAYOUT_CONSTANTS.STICKY_H; // Only header height, no banner space

  return (
    <div style={TERMINAL_STYLES.terminal(topOffset)}>
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};