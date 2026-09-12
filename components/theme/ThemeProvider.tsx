'use client'

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'

export type AppTheme = 'light' | 'dark' | 'auto'

type ThemeContextValue = {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => { },
})

const THEME_KEY = 'tcnp-theme'
let memoryTheme: AppTheme = 'auto'

function applyTheme(next: AppTheme) {
  if (typeof document === 'undefined') return
  memoryTheme = next

  const root = document.documentElement
  root.classList.remove('dark')

  let resolved = next

  if (next === 'auto') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    resolved = prefersDark ? 'dark' : 'light'
  }

  if (resolved === 'dark') {
    root.classList.add('dark')
  }

}

function readTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch { return memoryTheme }
  return 'auto'
}
function subscribeTheme(notify: () => void) {
  window.addEventListener('storage', notify)
  window.addEventListener('tcnp-theme-change', notify)
  return () => { window.removeEventListener('storage', notify); window.removeEventListener('tcnp-theme-change', notify) }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'auto' as AppTheme)
  useEffect(() => {
    applyTheme(theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => applyTheme(theme)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme])
  const setTheme = (next: AppTheme) => {
    applyTheme(next)
    try { window.localStorage.setItem(THEME_KEY, next) } catch { /* Keep in-memory choice when storage is blocked. */ }
    window.dispatchEvent(new Event('tcnp-theme-change'))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
