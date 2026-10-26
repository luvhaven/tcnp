'use client'

const DISABLED = 'tcnp-device-push-disabled'
let connection: Promise<void> | null = null
let revision = 0
export function pushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext
}
export function pushDisabled() { try { return localStorage.getItem(DISABLED) === 'true' } catch { return false } }
function setDisabled(value: boolean) { try { localStorage.setItem(DISABLED, String(value)) } catch {} }
async function api(method: string, body?: unknown) {
  const response = await fetch('/api/notifications/devices', { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Device notifications are unavailable. Please retry.')
  return data
}
export const getPushConfig = () => api('GET')
async function registration(): Promise<ServiceWorkerRegistration> {
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Refresh the app to finish installing device notifications.')), 10000))])
}
async function setOwner(reg: ServiceWorkerRegistration, userId: string | null) {
  if (!reg.active) throw new Error('Refresh the app to activate notifications.')
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = window.setTimeout(() => { channel.port1.close(); reject(new Error('Refresh the app to finish notification setup.')) }, 4000)
    channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve() }
    reg.active!.postMessage({ type: 'TCNP_PUSH_OWNER', userId }, [channel.port2])
  })
}
async function connect(config: { ready: boolean; publicKey: string; userId: string }, askPermission: boolean, startedRevision: number) {
  if (!pushSupported()) throw new Error('On iPhone or iPad, add TCNP to your Home Screen and open it there to enable notifications. Other devices need a browser that supports Web Push.')
  if (!config.ready) throw new Error('Device notifications are being set up. Please try again shortly.')
  // Keep this before every await so Safari receives a direct user gesture.
  const permission = askPermission ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') throw new Error('Allow notifications in your browser or device settings, then try again.')
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const raw = atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/'))
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, char => char.charCodeAt(0)) })
  }
  await setOwner(reg, null)
  await api('POST', sub.toJSON())
  if (startedRevision !== revision) return
  await setOwner(reg, config.userId)
  if (startedRevision !== revision) { await setOwner(reg, null); return }
  setDisabled(false)
  window.dispatchEvent(new Event('tcnp-push-change'))
}
export function connectDevicePush(config: { ready: boolean; publicKey: string; userId: string }, askPermission = false) {
  if (connection) return connection
  connection = connect(config, askPermission, revision).finally(() => { connection = null })
  return connection
}
export async function disconnectDevicePush(disable = true) {
  revision++
  if (disable) setDisabled(true)
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (!reg) return
    // Clear locally first, including offline logout and an older active worker.
    try { await (await caches.open('tcnp-push-owner-v1')).delete('/__tcnp_push_owner__') } catch {}
    await setOwner(reg, null).catch(() => undefined)
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      try { await api('DELETE', { endpoint: sub.endpoint }) } finally { await sub.unsubscribe() }
    }
  } finally { window.dispatchEvent(new Event('tcnp-push-change')) }
}
export async function devicePushConnected() {
  if (!pushSupported() || pushDisabled() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  return Boolean(await reg?.pushManager.getSubscription())
}
