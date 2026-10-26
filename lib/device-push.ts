'use client'

const DISABLED = 'tcnp-device-push-disabled'
const PUSH_SCOPE = '/notifications/'
const PUSH_SCRIPT = '/notification-worker.js'
const OWNER_CACHE = 'tcnp-push-owner-v1'
const OWNER_URL = '/__tcnp_push_owner__'
let connection: Promise<void> | null = null
let revision = 0
const progressListeners = new Set<(message: string) => void>()
export interface DevicePushConfig { ready: boolean; publicKey: string; userId: string }
export function pushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext
}
export function pushDisabled() { try { return localStorage.getItem(DISABLED) === 'true' } catch { return false } }
function setDisabled(value: boolean) { try { localStorage.setItem(DISABLED, String(value)) } catch {} }
function progress(message: string) { progressListeners.forEach(listener => listener(message)) }
async function api(method: string, body?: unknown) {
  const response = await fetch('/api/notifications/devices', { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Could not connect device notifications. Check your connection and try again.')
  return data
}
export const getPushConfig = (): Promise<DevicePushConfig> => api('GET')
function bounded<T>(work: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds)
    work.then(value => { window.clearTimeout(timer); resolve(value) }, error => { window.clearTimeout(timer); reject(error) })
  })
}
async function registration(): Promise<ServiceWorkerRegistration> {
  // Do not use serviceWorker.ready: it may resolve to an old app-cache worker
  // which cannot acknowledge notification setup, even after refreshing the page.
  const reg = await bounded(navigator.serviceWorker.register(PUSH_SCRIPT, { scope: PUSH_SCOPE, updateViaCache: 'none' }), 15000,
    'Could not install notifications. Check your connection and allow site storage, then try again.')
  if (reg.active?.state === 'activated') return reg
  await new Promise<void>((resolve, reject) => {
    const worker = reg.installing || reg.waiting || reg.active
    if (!worker) { reject(new Error('Notification setup could not start. Please try again.')); return }
    const done = (error?: Error) => {
      window.clearTimeout(timer)
      worker.removeEventListener('statechange', changed)
      if (error) reject(error); else resolve()
    }
    const changed = () => {
      if (worker.state === 'activated') done()
      else if (worker.state === 'redundant') done(new Error('Notification setup was interrupted. Please try again.'))
    }
    const timer = window.setTimeout(() => done(new Error('Notification setup is taking too long. Check your connection and try again.')), 15000)
    worker.addEventListener('statechange', changed)
    changed()
  })
  return reg
}
async function setOwner(reg: ServiceWorkerRegistration, userId: string | null) {
  if (!reg.active) throw new Error('Notifications are not active yet. Please try again.')
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      channel.port1.close()
      if (error) reject(error); else resolve()
    }
    const timer = window.setTimeout(() => finish(new Error('The notification service did not respond. Close other TCNP tabs and try again.')), 5000)
    channel.port1.onmessage = event => {
      if (event.data?.ok === true) finish()
      else finish(new Error('Site storage is blocked. Allow storage for TCNP in your browser settings, then try again.'))
    }
    try { reg.active!.postMessage({ type: 'TCNP_PUSH_OWNER', userId }, [channel.port2]) }
    catch { finish(new Error('The notification service stopped. Please try again.')) }
  })
}
async function disconnectSubscription(reg: ServiceWorkerRegistration) {
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  // A failed server cleanup must not prevent locally turning notifications off.
  try { await api('DELETE', { endpoint: sub.endpoint }) } catch { /* Expired endpoints are removed by delivery. */ }
  await sub.unsubscribe()
}
async function connect(config: DevicePushConfig, askPermission: boolean, startedRevision: number) {
  if (!pushSupported()) throw new Error('This browser cannot receive device notifications. Open TCNP in a browser with Web Push support. On iPhone or iPad, open the installed Home Screen app.')
  if (!config.ready) throw new Error('Device notifications are being set up. Please try again shortly.')
  progress('Waiting for notification permission…')
  // The permission request must happen in the original click, before any await.
  const permission = askPermission ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Notifications are blocked for TCNP. Allow notifications in the browser’s site settings, then try again.'
    : 'Notification permission was not allowed. Click Enable and choose Allow in the browser prompt.')
  if (startedRevision !== revision) throw new Error('Notification setup was cancelled.')
  progress('Starting the notification service…')
  const reg = await registration()
  if (startedRevision !== revision) throw new Error('Notification setup was cancelled.')
  progress('Connecting this device…')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const raw = atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/'))
    try {
      sub = await bounded(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, char => char.charCodeAt(0)) }), 20000,
        'Could not reach the browser notification service. Check your connection and try again.')
    } catch (error) {
      const name = (error as { name?: string })?.name
      if (name === 'NotAllowedError') throw new Error('Notifications are blocked. Allow notifications for TCNP in your browser settings, then try again.')
      if (name === 'AbortError' || name === 'NetworkError') throw new Error('The browser could not connect to its notification service. Check your internet connection and browser notification settings, then try again.')
      throw error
    }
  }
  if (startedRevision !== revision) { await sub.unsubscribe(); throw new Error('Notification setup was cancelled.') }
  // Preserve a working same-account subscription during a temporary API outage.
  let owner: Response | undefined
  try { owner = await (await caches.open(OWNER_CACHE)).match(OWNER_URL) }
  catch { throw new Error('Site storage is blocked. Allow storage for TCNP in your browser settings, then try again.') }
  if (!owner || await owner.text() !== config.userId) await setOwner(reg, null)
  await api('POST', sub.toJSON())
  if (startedRevision !== revision) { await disconnectSubscription(reg); throw new Error('Notification setup was cancelled.') }
  await setOwner(reg, config.userId)
  if (startedRevision !== revision) { await setOwner(reg, null); await disconnectSubscription(reg); throw new Error('Notification setup was cancelled.') }
  setDisabled(false)
  // Retire the old root worker's push subscription without unregistering the app worker.
  const legacy = await navigator.serviceWorker.getRegistration('/')
  if (legacy && legacy.scope !== reg.scope) await disconnectSubscription(legacy).catch(() => undefined)
  window.dispatchEvent(new Event('tcnp-push-change'))
}
export function connectDevicePush(config: DevicePushConfig, askPermission = false, onProgress?: (message: string) => void) {
  if (onProgress) progressListeners.add(onProgress)
  if (!connection) connection = connect(config, askPermission, revision).finally(() => { connection = null })
  return connection.finally(() => { if (onProgress) progressListeners.delete(onProgress) })
}
export async function sendDeviceNotificationTest() {
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SCOPE)
  if (!reg || !await devicePushConnected()) throw new Error('Enable device notifications first.')
  await reg.showNotification('TCNP notifications enabled', { body: 'This device is ready to receive TCNP updates.', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'tcnp-device-test', data: { url: '/profile' } })
}
export async function disconnectDevicePush(disable = true) {
  revision++
  if (disable) setDisabled(true)
  try {
    // Clear the shared-device marker even when there is no active app worker.
    try { await (await caches.open(OWNER_CACHE)).delete(OWNER_URL) } catch {}
    const registrations = await navigator.serviceWorker?.getRegistrations() || []
    for (const reg of registrations) {
      if (!['/', PUSH_SCOPE].includes(new URL(reg.scope).pathname)) continue
      await disconnectSubscription(reg)
    }
  } finally { window.dispatchEvent(new Event('tcnp-push-change')) }
}
export async function devicePushConnected() {
  if (!pushSupported() || pushDisabled() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SCOPE)
  if (!reg || new URL(reg.scope).pathname !== PUSH_SCOPE) return false
  try {
    const owner = await (await caches.open(OWNER_CACHE)).match(OWNER_URL)
    return Boolean(owner && await owner.text() && await reg.pushManager.getSubscription())
  } catch { return false }
}
