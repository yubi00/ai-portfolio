import React from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { TERMINAL_STYLES } from '../config/terminal'

export const Header: React.FC = () => {
  const { isDark, toggle } = useTheme()

  return (
    <div style={TERMINAL_STYLES.header(isDark)}>
      <button
        onClick={toggle}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
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
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = isDark
            ? 'rgba(255,255,255,0.07)'
            : 'rgba(0,0,0,0.06)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
        }}
      >
        {isDark ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
      </button>
    </div>
  )
}
