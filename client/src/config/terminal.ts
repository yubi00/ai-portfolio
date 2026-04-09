export const MOBILE_BREAKPOINT = 640
export const DESKTOP_FONT_SIZE = 16
export const MOBILE_FONT_SIZE = 13

export const TERMINAL_CONFIG = {
  cursorBlink: true,
  convertEol: true,
  fontFamily:
    'JetBrains Mono, Fira Mono, Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: DESKTOP_FONT_SIZE,
  lineHeight: 1.3,
  letterSpacing: 0,
  scrollback: 1000,
  theme: {
    background: '#101014',
    foreground: '#b0b3b8',
    cursor: '#93c5fd',
    selectionBackground: '#3b82f680',
  },
} as const

export const LAYOUT_CONSTANTS = {
  STICKY_H: 36,        // sticky header height
  BANNER_SPACE: 124,   // visual space for banner
} as const

export const TERMINAL_STYLES = {
  root: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
    border: 'none',
    background: '#101014',
    overflow: 'hidden',
  },
  header: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(16,16,20,0.75)',
    backdropFilter: 'blur(6px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    color: '#cbd5e1',
  },
  banner: (stickyHeight: number) => ({
    position: 'fixed' as const,
    top: stickyHeight,
    left: 10,
    right: 10,
    zIndex: 2,
    maxWidth: 'calc(100% - 20px)',
    height: 'auto',
    pointerEvents: 'none' as const,
  }),
  terminal: (topOffset: number) => ({
    position: 'absolute' as const,
    top: topOffset,
    left: 10,
    right: 10,
    bottom: 10,
    zIndex: 1,
    boxSizing: 'border-box' as const,
  }),
} as const

export const TERMINAL_COLORS = {
  primary: '#93c5fd',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  muted: '#6b7280',
  text: '#b0b3b8',
  background: '#101014',
} as const

export const THEMES = {
  matrix: {
    welcome: `
\x1b[1m\x1b[38;5;81m██╗   ██╗██╗   ██╗██████╗ ██╗\x1b[0m
\x1b[1m\x1b[38;5;81m╚██╗ ██╔╝██║   ██║██╔══██╗██║\x1b[0m
\x1b[1m\x1b[38;5;81m ╚████╔╝ ██║   ██║██████╔╝██║\x1b[0m
\x1b[1m\x1b[38;5;81m  ╚██╔╝  ██║   ██║██╔══██╗██║\x1b[0m
\x1b[1m\x1b[38;5;81m   ██║   ╚██████╔╝██████╔╝██║\x1b[0m
\x1b[1m\x1b[38;5;81m   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝\x1b[0m

\x1b[38;5;244m  Software Engineer · Melbourne\x1b[0m

  Type \x1b[1m'help'\x1b[0m to see available commands.

`
  }
} as const
