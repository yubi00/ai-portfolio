import React from 'react';
import { TERMINAL_STYLES } from '../config/terminal';

interface HeaderProps {
  sessionId: string | null;
}

export const Header: React.FC<HeaderProps> = ({ sessionId }) => {
  return (
    <div style={TERMINAL_STYLES.header}>
      <span style={{ fontWeight: 700, color: '#93c5fd' }}>Yubi AI Portfolio Terminal</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {sessionId && (
          <span style={{ 
            color: '#10b981', 
            opacity: 0.8,
            fontSize: 12,
            display: 'flex', 
            alignItems: 'center', 
            gap: 4 
          }}>
            <span style={{ 
              width: 6, 
              height: 6, 
              borderRadius: '50%', 
              background: '#10b981',
              display: 'inline-block' 
            }}></span>
            Session {sessionId}
          </span>
        )}
        <span style={{ 
          marginLeft: sessionId ? 0 : 'auto', 
          opacity: 0.6, 
          fontSize: 11 
        }}>
          [type <strong>help</strong>]
        </span>
      </div>
    </div>
  );
};