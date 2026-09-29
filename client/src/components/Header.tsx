import React from 'react'
import { Code2, FileText, Mic, MicOff, Moon, Sun, UserRound } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { TERMINAL_STYLES } from '../config/terminal'

interface HeaderProps {
  voiceOpen?: boolean
  voiceEnabled?: boolean
  onAboutOpen: () => void
  onVoiceToggle?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  voiceOpen = false,
  voiceEnabled = false,
  onAboutOpen,
  onVoiceToggle,
}) => {
  const { isDark, toggle } = useTheme()
  const themeLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode'
  const themeClass = isDark ? 'app-header-dark' : 'app-header-light'

  return (
    <header className={`app-header ${themeClass}`} style={TERMINAL_STYLES.header(isDark)}>
      <div className="app-header-inner">
        <button
          type="button"
          className="header-brand"
          onClick={onAboutOpen}
          aria-label="About Yubi"
          title="About Yubi"
        >
          <span className="header-brand-mark" aria-hidden="true">&gt;_</span>
          <span className="header-brand-name">yubi.sh</span>
        </button>

        <nav className="header-actions" aria-label="Portfolio links and controls">
          <button
            type="button"
            className="header-action"
            onClick={onAboutOpen}
            aria-label="About Yubi"
            title="About Yubi"
          >
            <UserRound size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="header-action-label">About</span>
          </button>

          <a
            className="header-action"
            href="/resume.pdf"
            target="_blank"
            rel="noreferrer"
            aria-label="Open Yubi's résumé"
            title="Open résumé"
          >
            <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="header-action-label">Résumé</span>
          </a>

          <a
            className="header-action header-icon-action"
            href="https://github.com/yubi00"
            target="_blank"
            rel="noreferrer"
            aria-label="Open Yubi's GitHub profile"
            title="GitHub"
          >
            <Code2 size={16} strokeWidth={1.8} aria-hidden="true" />
          </a>

          {voiceEnabled && (
            <button
              type="button"
              className={`header-action header-icon-action ${voiceOpen ? 'header-action-active' : ''}`}
              onClick={onVoiceToggle}
              aria-label={voiceOpen ? 'Close voice panel' : 'Talk to Yubi using voice'}
              aria-pressed={voiceOpen}
              title={voiceOpen ? 'Close voice chat' : 'Voice chat'}
            >
              {voiceOpen
                ? <MicOff size={16} strokeWidth={1.8} aria-hidden="true" />
                : <Mic size={16} strokeWidth={1.8} aria-hidden="true" />}
            </button>
          )}

          <button
            type="button"
            className="header-action header-icon-action"
            onClick={toggle}
            aria-label={themeLabel}
            title={themeLabel}
          >
            {isDark
              ? <Sun size={16} strokeWidth={1.8} aria-hidden="true" />
              : <Moon size={16} strokeWidth={1.8} aria-hidden="true" />}
          </button>
        </nav>
      </div>
    </header>
  )
}
