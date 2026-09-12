/** Only allow same-origin app pages after login. */
export function safeDestination(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s\u0000-\u001f]/.test(value)) return '/dashboard'
  try {
    const url = new URL(value, 'https://app.invalid')
    if (url.origin !== 'https://app.invalid' || /^\/(api|login|signup)(\/|$)/.test(url.pathname)) return '/dashboard'
    return url.pathname + url.search + url.hash
  } catch { return '/dashboard' }
}
