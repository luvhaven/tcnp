/** Restrict outbound Web Push to browser vendors; never fetch arbitrary client URLs. */
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return false
    const host = url.hostname.toLowerCase()
    return host === 'fcm.googleapis.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')
  } catch { return false }
}
export function validPushKey(value: unknown, bytes: number): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, 'base64url').length === bytes
}
export function safeNotificationUrl(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value) ? value : '/dashboard'
}
