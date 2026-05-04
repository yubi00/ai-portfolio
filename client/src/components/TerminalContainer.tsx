import React from 'react';
import { TERMINAL_STYLES, DARK_CARD_STYLE, LIGHT_CARD_STYLE } from '../config/terminal';

interface TerminalContainerProps {
  terminalRef: React.RefObject<HTMLDivElement>;
  topOffset: number;
  isDark: boolean;
}

export const TerminalContainer: React.FC<TerminalContainerProps> = ({ terminalRef, topOffset, isDark }) => {
  const card = isDark ? DARK_CARD_STYLE : LIGHT_CARD_STYLE;

  return (
    <div style={TERMINAL_STYLES.terminal(topOffset, isDark)}>
      <div
        className="terminal-outer-container"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: card.background,
          border: card.border,
          borderRadius: card.borderRadius,
          boxShadow: card.boxShadow,
        }}
      >
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
          <div ref={terminalRef} style={{ flex: 1, minHeight: 0, width: '100%' }} />
          <div className="terminal-bottom-spacer" />
        </div>
      </div>
    </div>
  );
};
