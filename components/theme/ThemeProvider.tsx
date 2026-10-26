'use client'

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { normalizeTheme, resolveTheme, type AppTheme, type ResolvedTheme } from '@/lib/theme'
export type { AppTheme } from '@/lib/theme'

type ThemeContextValue = { theme: AppTheme; resolvedTheme: ResolvedTheme; setTheme: (theme: AppTheme) => void }
const THEME_KEY = 'tcnp-theme'
let memoryTheme: AppTheme = 'auto'
let memoryOnly = false
function prefersDark() { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches }
function applyTheme(next: AppTheme) {
  memoryTheme = next
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(next, prefersDark())
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
}
function setTheme(next: AppTheme) {
  const choice = normalizeTheme(next)
  applyTheme(choice)
  try { window.localStorage.setItem(THEME_KEY, choice); memoryOnly = false } catch { memoryOnly = true }
  window.dispatchEvent(new Event('tcnp-theme-change'))
}
function readTheme(): AppTheme {
  if (memoryOnly) return memoryTheme
  try { return normalizeTheme(localStorage.getItem(THEME_KEY)) } catch { return memoryTheme }
}
function subscribeTheme(notify: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) { memoryOnly = false; notify() } }
  window.addEventListener('storage', storage)
  window.addEventListener('tcnp-theme-change', notify)
  return () => { window.removeEventListener('storage', storage); window.removeEventListener('tcnp-theme-change', notify) }
}
function subscribeSystemTheme(notify: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  if (typeof media.addEventListener === 'function') { media.addEventListener('change', notify); return () => media.removeEventListener('change', notify) }
  media.addListener?.(notify)
  return () => media.removeListener?.(notify)
}
const ThemeContext = createContext<ThemeContextValue>({ theme: 'auto', resolvedTheme: 'light', setTheme })
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'auto' as AppTheme)
  const systemDark = useSyncExternalStore(subscribeSystemTheme, prefersDark, () => false)
  const resolvedTheme = resolveTheme(theme, systemDark)
  useEffect(() => { applyTheme(theme) }, [theme, resolvedTheme])
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)
