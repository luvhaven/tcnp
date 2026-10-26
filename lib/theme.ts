export type AppTheme = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'
export function normalizeTheme(value: unknown): AppTheme {
  return value === 'light' || value === 'dark' ? value : 'auto'
}
export function resolveTheme(theme: AppTheme, prefersDark: boolean): ResolvedTheme {
  return theme === 'auto' ? prefersDark ? 'dark' : 'light' : theme
}
// Apply the same device preference before hydration, without writing a new one.
export const THEME_BOOTSTRAP_SCRIPT = `(()=>{var t='auto';try{var s=localStorage.getItem('tcnp-theme');if(s==='light'||s==='dark')t=s}catch(e){}try{var d=t==='dark'||(t==='auto'&&!!window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`
