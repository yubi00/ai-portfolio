import React from 'react';
import { TERMINAL_STYLES, LAYOUT_CONSTANTS } from '../config/terminal';

export const IntroBanner: React.FC = () => {
  return (
    <div style={TERMINAL_STYLES.banner(LAYOUT_CONSTANTS.STICKY_H)}>
      <img
        src="/banner.png"
        alt="Portfolio Banner"
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: LAYOUT_CONSTANTS.BANNER_SPACE,
          objectFit: 'contain',
          filter: 'brightness(0.9) contrast(1.1)',
        }}
      />
    </div>
  );
};
