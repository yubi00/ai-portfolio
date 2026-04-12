import React from 'react'
import { Sun, Moon, Mic, MicOff } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { TERMINAL_STYLES } from '../config/terminal'

interface HeaderProps {
  voiceOpen?: boolean
  onVoiceToggle?: () => void
}

export const Header: React.FC<HeaderProps> = ({ voiceOpen = false, onVoiceToggle }) => {
  const { isDark, toggle } = useTheme()

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

  return (
    <div style={{ ...TERMINAL_STYLES.header(isDark), gap: 6 }}>
      {/* Mic / voice toggle */}
      {onVoiceToggle && (
        <button
          onClick={onVoiceToggle}
          title={voiceOpen ? 'Close voice panel' : 'Talk to Yubi (voice)'}
          style={{
            ...btnStyle,
            color: voiceOpen
              ? (isDark ? '#93c5fd' : '#2563eb')
              : (isDark ? '#94a3b8' : '#475569'),
            borderColor: voiceOpen
              ? (isDark ? 'rgba(147,197,253,0.30)' : 'rgba(37,99,235,0.25)')
              : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'),
          }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          {voiceOpen ? <MicOff size={15} strokeWidth={1.8} /> : <Mic size={15} strokeWidth={1.8} />}
        </button>
      )}

      {/* Theme toggle */}
      <button
        onClick={toggle}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={btnStyle}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {isDark ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
      </button>
    </div>
  )
}
