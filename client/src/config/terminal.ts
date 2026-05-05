export const MOBILE_BREAKPOINT = 640
export const DESKTOP_FONT_SIZE = 14
export const MOBILE_FONT_SIZE = 11

// ---------------------------------------------------------------------------
// xterm.js themes
//
// We use these explicit palette entries via \x1b[38;5;Nm:
//   81  — logo/banner (cyan in dark, Solarized cyan in light)
//   203 — error red
//   238 — dim separator
//   244 — muted secondary text (tagline)
//   248 — prompt username
//   250 — prose response text
//   114 — code block
//   152 — inline code
//
// xterm's extendedAnsi covers colours 16–255, so array index = paletteIndex - 16.
// ---------------------------------------------------------------------------

function buildExtendedAnsi(overrides: Record<number, string>): string[] {
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  // 240 entries covering palette indices 16–255
  const c: string[] = []
  // 16–231: 6×6×6 colour cube
  const lvl = [0, 95, 135, 175, 215, 255]
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++)
        c.push(`#${hex(lvl[r])}${hex(lvl[g])}${hex(lvl[b])}`)
  // 232–255: greyscale ramp
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10
    c.push(`#${hex(v)}${hex(v)}${hex(v)}`)
  }
  // Apply overrides — caller passes palette index, we convert to array index
  for (const [idx, colour] of Object.entries(overrides))
    c[Number(idx) - 16] = colour
  return c
}

// --- Dark theme (unchanged) ---
export const DARK_XTERM_THEME = {
  background: '#101014',
  foreground: '#b0b3b8',
  cursor: '#93c5fd',
  selectionBackground: '#3b82f680',
}

// --- Solarized Light theme ---
// 3 roles, mirroring dark:
//   accent  → Solarized cyan  #2aa198  (logo, cursor, $ sign)
//   body    → Solarized base00 #657b83  (prose, prompt username)
//   bg      → Solarized base3  #fdf6e3  (cream)
export const LIGHT_XTERM_THEME = {
  background: '#fdf6e3',
  foreground: '#657b83',   // base00 — main body text
  cursor: '#2aa198',   // Solarized cyan — matches accent
  selectionBackground: '#93a1a130',

  // Remap the 16 standard ANSI colours to Solarized Light values
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#002b36',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3',

  // 256-colour overrides — index is the palette number (16–255)
  extendedAnsi: buildExtendedAnsi({
    81: '#2aa198',  // logo banner     → Solarized cyan  (same role as dark's cyan)
    114: '#859900',  // code block      → Solarized green
    152: '#2aa198',  // inline code     → Solarized cyan
    203: '#dc322f',  // error red       → Solarized red
    238: '#eee8d5',  // dim separator   → base2 (very light warm)
    244: '#93a1a1',  // muted text      → base1 (tagline)
    248: '#657b83',  // prompt username → base00
    250: '#586e75',  // prose text      → base01 (slightly darker, readable)
  }),
}

// Page background (outside the terminal card in light mode)
export const DARK_BG = '#101014'
export const LIGHT_BG = '#e8e0cc'   // slightly deeper than base3 so the card lifts off

// Terminal card styles per theme
export const DARK_CARD_STYLE = {
  background: '#101014',
  border: '1.5px solid #23232a',
  borderRadius: 12,
  boxShadow: '0 2px 16px 0 #00000044',
}

export const LIGHT_CARD_STYLE = {
  background: '#fdf6e3',
  border: '1px solid #d4c9b0',
  borderRadius: 12,
  boxShadow: '0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
}

// ---------------------------------------------------------------------------

export const TERMINAL_CONFIG = {
  cursorBlink: true,
  cursorStyle: 'bar' as const,
  cursorInactiveStyle: 'bar' as const,
  cursorWidth: 1,
  convertEol: true,
  fontFamily:
    'JetBrains Mono, Fira Mono, Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: DESKTOP_FONT_SIZE,
  lineHeight: 1.3,
  letterSpacing: 0,
  scrollback: 1000,
  theme: DARK_XTERM_THEME,
} as const

export const LAYOUT_CONSTANTS = {
  STICKY_H: 36,
  BANNER_SPACE: 124,
  HEADER_H: 42,
} as const

export const TERMINAL_STYLES = {
  root: (bg: string) => ({
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 'var(--app-height, 100dvh)',
    margin: 0,
    padding: 0,
    border: 'none',
    background: bg,
    overflow: 'hidden',
  }),
  header: (isDark: boolean) => ({
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    height: LAYOUT_CONSTANTS.HEADER_H,
    zIndex: 3,
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    background: isDark ? 'rgba(16,16,20,0.80)' : 'rgba(232,224,204,0.85)',
    backdropFilter: 'blur(6px)',
  }),
  terminal: (topOffset: number, _isDark: boolean) => ({
    position: 'absolute' as const,
    top: topOffset,
    left: 5,
    right: 5,
    bottom: 5,
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

\x1b[38;5;244mTalk to Yubi - my work, projects, and experience in conversation\x1b[0m

`
  }
} as const
