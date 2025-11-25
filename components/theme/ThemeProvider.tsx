'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type AppTheme = 'light' | 'dark' | 'auto' | 'tcnp' | string

type ThemeContextValue = {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'tcnp',
  setTheme: () => {},
})

const THEME_KEY = 'tcnp-theme'

function applyTheme(next: AppTheme) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.classList.remove('dark', 'theme-tcnp')

  let resolved = next

  if (next === 'auto') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    resolved = prefersDark ? 'dark' : 'light'
  }

  if (resolved === 'dark') {
    root.classList.add('dark')
  } else if (resolved === 'tcnp') {
    root.classList.add('theme-tcnp')
  }

  try {
    window.localStorage.setItem(THEME_KEY, next)
  } catch {
    // ignore storage errors
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('tcnp')

  useEffect(() => {
    if (typeof window === 'undefined') return

    let initial: AppTheme = 'tcnp'
    try {
      const stored = window.localStorage.getItem(THEME_KEY) as AppTheme | null
      if (stored) {
        initial = stored
      }
    } catch {
      // ignore
    }

    applyTheme(initial)
    setThemeState(initial)
  }, [])

  const setTheme = (next: AppTheme) => {
    applyTheme(next)
    setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
