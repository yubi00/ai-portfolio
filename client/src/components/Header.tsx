import React from 'react'
import { Sun, Moon, Mic, MicOff } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { TERMINAL_STYLES } from '../config/terminal'

interface HeaderProps {
  voiceOpen?: boolean
  voiceEnabled?: boolean
  onVoiceToggle?: () => void
}

export const Header: React.FC<HeaderProps> = ({ voiceOpen = false, voiceEnabled = false, onVoiceToggle }) => {
  const { isDark, toggle } = useTheme()
  const [showVoiceTooltip, setShowVoiceTooltip] = React.useState(false)
  const [showThemeTooltip, setShowThemeTooltip] = React.useState(false)
  const voiceTooltip = voiceEnabled
    ? (voiceOpen ? 'Close voice chat' : 'Talk to Yubi')
    : 'Talk to Yubi coming soon'
  const themeTooltip = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    border: isDark
      ? '1px solid rgba(255,255,255,0.10)'
      : '1px solid rgba(0,0,0,0.10)',
    background: 'transparent',
    color: isDark ? '#94a3b8' : '#475569',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    padding: 0,
  }

  const onEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'
  }
  const onLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent'
  }
  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    padding: '6px 8px',
    borderRadius: 8,
    fontSize: 11,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    color: isDark ? '#e2e8f0' : '#0f172a',
    background: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255,255,255,0.98)',
    border: isDark ? '1px solid rgba(148,163,184,0.18)' : '1px solid rgba(15,23,42,0.10)',
    boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(0,0,0,0.12)',
    pointerEvents: 'none',
    zIndex: 30,
  }

  return (
    <div style={{ ...TERMINAL_STYLES.header(isDark), gap: 6 }}>
      {/* Mic / voice toggle */}
      <div
        style={{ position: 'relative', display: 'flex' }}
        onMouseEnter={() => setShowVoiceTooltip(true)}
        onMouseLeave={() => setShowVoiceTooltip(false)}
      >
        <button
          onClick={onVoiceToggle}
          disabled={!voiceEnabled}
          aria-disabled={!voiceEnabled}
          aria-label={voiceEnabled
            ? (voiceOpen ? 'Close voice panel' : 'Talk to Yubi (voice)')
            : 'Voice chat coming soon'}
          style={{
            ...btnStyle,
            color: voiceEnabled
              ? (voiceOpen ? (isDark ? '#93c5fd' : '#2563eb') : (isDark ? '#94a3b8' : '#475569'))
              : (isDark ? 'rgba(148,163,184,0.45)' : 'rgba(71,85,105,0.45)'),
            borderColor: voiceEnabled
              ? (voiceOpen
                ? (isDark ? 'rgba(147,197,253,0.30)' : 'rgba(37,99,235,0.25)')
                : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'))
              : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'),
            background: !voiceEnabled
              ? (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
              : 'transparent',
            cursor: voiceEnabled ? 'pointer' : 'not-allowed',
            opacity: voiceEnabled ? 1 : 0.9,
          }}
          onMouseEnter={voiceEnabled ? onEnter : undefined}
          onMouseLeave={voiceEnabled ? onLeave : undefined}
          onFocus={() => setShowVoiceTooltip(true)}
          onBlur={() => setShowVoiceTooltip(false)}
        >
          {voiceOpen ? <MicOff size={15} strokeWidth={1.8} /> : <Mic size={15} strokeWidth={1.8} />}
        </button>

        {showVoiceTooltip && (
          <div
            role="tooltip"
            style={tooltipStyle}
          >
            {voiceTooltip}
          </div>
        )}
      </div>

      {/* Theme toggle */}
      <div
        style={{ position: 'relative', display: 'flex' }}
        onMouseEnter={() => setShowThemeTooltip(true)}
        onMouseLeave={() => setShowThemeTooltip(false)}
      >
        <button
          onClick={toggle}
          aria-label={themeTooltip}
          style={btnStyle}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onFocus={() => setShowThemeTooltip(true)}
          onBlur={() => setShowThemeTooltip(false)}
        >
          {isDark ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
        </button>

        {showThemeTooltip && (
          <div role="tooltip" style={tooltipStyle}>
            {themeTooltip}
          </div>
        )}
      </div>
    </div>
  )
}
