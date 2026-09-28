import React, { createContext, useContext, useEffect, useState } from 'react'

interface ThemeContextValue {
  isDark: boolean
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({ isDark: true, toggle: () => {} })

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem('yubi_theme')
    if (stored) return stored === 'dark'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  })

  useEffect(() => {
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  }, [isDark])

  const toggle = () =>
    setIsDark(prev => {
      const next = !prev
      localStorage.setItem('yubi_theme', next ? 'dark' : 'light')
      return next
    })

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
