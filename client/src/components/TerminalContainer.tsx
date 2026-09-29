import React from 'react';
import { TERMINAL_STYLES, DARK_CARD_STYLE, LIGHT_CARD_STYLE } from '../config/terminal';

interface TerminalContainerProps {
  terminalRef: React.RefObject<HTMLDivElement>;
  topOffset: number;
  isDark: boolean;
  prompts: string[];
  promptLabel: string;
  promptPlaceholder: string;
  promptsDisabled: boolean;
  onPromptSelect: (prompt: string) => boolean;
}

export const TerminalContainer: React.FC<TerminalContainerProps> = ({
  terminalRef,
  topOffset,
  isDark,
  prompts,
  promptLabel,
  promptPlaceholder,
  promptsDisabled,
  onPromptSelect,
}) => {
  const card = isDark ? DARK_CARD_STYLE : LIGHT_CARD_STYLE;

  return (
    <div style={TERMINAL_STYLES.terminal(topOffset, isDark)}>
      <div
        className="terminal-outer-container"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: card.background,
          border: card.border,
          borderRadius: card.borderRadius,
          boxShadow: card.boxShadow,
        }}
      >
        <div className={`terminal-toolbar ${isDark ? 'terminal-toolbar-dark' : 'terminal-toolbar-light'}`}>
          <div className="terminal-toolbar-label">
            <span className="terminal-status-dot" aria-hidden="true" />
            <span>Ask Yubi</span>
          </div>
          <div className="starter-prompts starter-prompts-desktop" aria-label={promptLabel}>
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="starter-prompt"
                disabled={promptsDisabled}
                onClick={() => onPromptSelect(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <select
            className="starter-prompt-select"
            aria-label={promptLabel}
            value=""
            disabled={promptsDisabled}
            onChange={(event) => {
              const prompt = event.currentTarget.value;
              if (prompt && onPromptSelect(prompt)) event.currentTarget.value = '';
            }}
          >
            <option value="" disabled>{promptPlaceholder}</option>
            {prompts.map((prompt) => (
              <option key={prompt} value={prompt}>{prompt}</option>
            ))}
          </select>
        </div>
        <div className="terminal-content">
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div ref={terminalRef} style={{ flex: 1, minHeight: 0, width: '100%' }} />
            <div className="terminal-bottom-spacer" />
          </div>
        </div>
      </div>
    </div>
  );
};
