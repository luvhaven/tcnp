'use client'

/**
 * Device (Web Push) notifications for TCNP.
 *
 * One small worker (/notification-worker.js, scope /notifications/) owns push,
 * independent of the app's large precache worker so it installs in seconds.
 *
 * Design rules, learned from iPhone and slow-network failures:
 *  - Permission is requested synchronously inside the Enable click (iOS/Safari
 *    refuse it otherwise). Nothing is awaited before that call.
 *  - Network calls retry with backoff, wait for the page to be visible, and
 *    never surface a raw "Fetch is aborted" to an officer.
 *  - "Connected" is persisted per device (endpoint + account), so a reload does
 *    not make a working device look disconnected.
 *  - The page writes the account marker into Cache Storage itself; it never
 *    depends on a sleeping worker answering a message.
 */

const DISABLED = 'tcnp-device-push-disabled'
const STATE = 'tcnp-device-push-state'
const KEY_CACHE = 'tcnp-device-push-key'
export const PUSH_SCOPE = '/notifications/'
const PUSH_SCRIPT = '/notification-worker.js'
const DEVICES_API = '/api/notifications/devices'
const OWNER_CACHE = 'tcnp-push-owner-v1'
const OWNER_URL = '/__tcnp_push_owner__'
const FEEDBACK_URL = '/__tcnp_push_feedback__'
const BADGE_URL = '/__tcnp_push_badge__'
/** Two firm pulses, the rhythm a messaging app uses. Must match notification-worker.js. */
export const PUSH_VIBRATION = [200, 100, 200]
export interface PushFeedback { vibration: boolean; sound: boolean }
export interface DevicePushConfig { ready: boolean; publicKey: string; userId: string }
export type PushSupport = 'supported' | 'ios-install' | 'ios-update' | 'insecure' | 'unsupported'

class PushError extends Error {
  status?: number
  retryable: boolean
  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message)
    this.name = 'PushError'
    this.status = options.status
    this.retryable = options.retryable ?? false
  }
}

const NETWORK_MESSAGE = 'Could not reach TCNP. Check your internet connection, then tap Enable again.'

/* ───────────────────────── environment ───────────────────────── */

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
}
export function isStandalone() {
  if (typeof window === 'undefined') return false
  try { if (['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(mode => window.matchMedia?.(`(display-mode: ${mode})`).matches)) return true } catch {}
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported'
  // The desktop program has the browser APIs but no push service behind them:
  // it shows alerts itself while it is running.
  if (/TCNPDesktop\//.test(navigator.userAgent || '')) return 'unsupported'
  const apis = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  if (isIOS()) {
    // iPhone and iPad only offer Web Push to apps opened from the Home Screen (iOS 16.4+).
    if (!isStandalone()) return 'ios-install'
    if (!apis) return 'ios-update'
  }
  if (!window.isSecureContext) return 'insecure'
  return apis ? 'supported' : 'unsupported'
}
export function pushSupported() { return pushSupport() === 'supported' }
export function pushSupportMessage(support: PushSupport = pushSupport()) {
  switch (support) {
    case 'ios-install': return 'On iPhone or iPad, notifications only work from the Home Screen app. In Safari tap Share, then “Add to Home Screen”, open TCNP from your Home Screen and tap Enable.'
    case 'ios-update': return 'Update this iPhone or iPad to iOS 16.4 or later to receive TCNP notifications, then open TCNP from the Home Screen.'
    case 'insecure': return 'Notifications need a secure (https) connection. Open TCNP from its official address.'
    case 'unsupported': return 'This browser cannot receive notifications. Use Chrome, Edge, Firefox or Safari, or install TCNP to your device.'
    default: return ''
  }
}
/** Where to go to un-block notifications on this kind of device. */
export function blockedHelp() {
  if (isIOS()) return 'Notifications are turned off for TCNP. Open iPhone Settings → Notifications → TCNP Central and turn on Allow Notifications, then come back.'
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) return isStandalone()
    ? 'Notifications are blocked for TCNP. Long-press the TCNP app icon → App info → Notifications, turn them on, then come back.'
    : 'Notifications are blocked for TCNP. Tap the icon left of the address bar → Permissions → Notifications → Allow, then come back.'
  return 'Notifications are blocked for TCNP. Click the icon left of the address bar, set Notifications to Allow, then reload the page.'
}

export function pushDisabled() { try { return localStorage.getItem(DISABLED) === 'true' } catch { return false } }
function setDisabled(value: boolean) { try { if (value) localStorage.setItem(DISABLED, 'true'); else localStorage.removeItem(DISABLED) } catch {} }
interface SavedState { endpoint: string; userId: string; syncedAt: number }
function readState(): SavedState | null {
  try {
    const value = JSON.parse(localStorage.getItem(STATE) || 'null')
    return value && typeof value.endpoint === 'string' && typeof value.userId === 'string' ? value : null
  } catch { return null }
}
function writeState(value: SavedState | null) { try { if (value) localStorage.setItem(STATE, JSON.stringify(value)); else localStorage.removeItem(STATE) } catch {} }
function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('tcnp-push-change')) }

/* ───────────────────────── helpers ───────────────────────── */

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
/** iOS freezes timers and sockets in the background; only talk to the network while visible. */
function whenVisible(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return Promise.resolve()
  return new Promise(resolve => {
    const done = () => { if (document.visibilityState !== 'hidden') { document.removeEventListener('visibilitychange', done); resolve() } }
    document.addEventListener('visibilitychange', done)
  })
}
function bounded<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new PushError(message, { retryable: true })), ms)
    work.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}

async function request(method: 'GET' | 'POST' | 'DELETE', body?: unknown, options: { attempts?: number; timeout?: number } = {}) {
  const attempts = options.attempts ?? 3
  let last: PushError = new PushError(NETWORK_MESSAGE, { retryable: true })
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await pause(700 * 2 ** (attempt - 1))
    await whenVisible()
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = setTimeout(() => controller?.abort(), options.timeout ?? 25000)
    let response: Response
    try {
      response = await fetch(DEVICES_API, {
        method, cache: 'no-store', credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined, signal: controller?.signal,
      })
    } catch {
      // Network drop, iOS suspending the request, or our own timeout: retry.
      last = new PushError(NETWORK_MESSAGE, { retryable: true })
      continue
    } finally { clearTimeout(timer) }
    const data = await response.json().catch(() => ({}))
    if (response.ok) return data
    const message = typeof data?.error === 'string' && data.error ? data.error : 'Could not connect device notifications. Please try again.'
    last = new PushError(message, { status: response.status, retryable: response.status === 429 || response.status >= 500 })
    if (!last.retryable) throw last
  }
  throw last
}

export async function getPushConfig(): Promise<DevicePushConfig> {
  const config = await request('GET')
  if (config?.ready && typeof config.publicKey === 'string') { try { localStorage.setItem(KEY_CACHE, config.publicKey) } catch {} }
  return config
}
async function publicKey(): Promise<string> {
  let cached: string | null = null
  try { cached = localStorage.getItem(KEY_CACHE) } catch {}
  if (cached) return cached
  const config = await getPushConfig()
  if (!config.ready || !config.publicKey) throw new PushError('Device notifications are still being set up on the server. Please try again in a few minutes.', { retryable: true })
  return config.publicKey
}
function keyBytes(key: string) {
  const padded = key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)
  const raw = atob(padded)
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}
function sameKey(sub: PushSubscription, key: string) {
  const current = sub.options?.applicationServerKey
  if (!current) return true
  const a = new Uint8Array(current), b = keyBytes(key)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/* ───────────────────────── worker + subscription ───────────────────────── */

async function existingRegistration() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SCOPE).catch(() => undefined)
  // getRegistration matches by URL, so it can return the app's root worker; only ours counts.
  return reg && new URL(reg.scope).pathname === PUSH_SCOPE ? reg : undefined
}
async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  let reg = await existingRegistration()
  if (reg) void reg.update().catch(() => undefined)
  else reg = await bounded(navigator.serviceWorker.register(PUSH_SCRIPT, { scope: PUSH_SCOPE, updateViaCache: 'none' }), 20000,
    'Could not install notifications. Check your connection and that site storage is allowed, then try again.')
  const deadline = Date.now() + 20000
  while (!reg.active) {
    if (Date.now() > deadline) throw new PushError('Notification setup is taking too long. Check your connection, then try again.', { retryable: true })
    await new Promise<void>(resolve => {
      const worker = reg!.installing || reg!.waiting
      const timer = setTimeout(done, 300)
      function done() { clearTimeout(timer); worker?.removeEventListener('statechange', done); resolve() }
      worker?.addEventListener('statechange', done)
    })
  }
  return reg
}
async function subscription(reg: ServiceWorkerRegistration, key: string): Promise<PushSubscription> {
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe().catch(() => undefined); sub = null }
  if (sub) return sub
  for (let attempt = 0; ; attempt++) {
    try {
      return await bounded(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }), 25000,
        'Could not reach the device notification service. Check your connection, then try again.')
    } catch (error) {
      const name = (error as { name?: string })?.name
      if (name === 'NotAllowedError') throw new PushError(blockedHelp())
      // Chrome/Edge occasionally fail the first registration with the push service; one retry usually succeeds.
      if (attempt === 0 && name !== 'PushError') { await pause(1200); continue }
      if (error instanceof PushError) throw error
      throw new PushError('brave' in navigator || name === 'AbortError'
        ? 'This browser could not register for notifications. If you use Brave, turn on “Use Google services for push messaging” in Settings → Privacy, then try again.'
        : 'This device could not register for notifications. Please try again.', { retryable: true })
    }
  }
}
async function writeOwner(userId: string | null) {
  try {
    const cache = await caches.open(OWNER_CACHE)
    if (userId) await cache.put(OWNER_URL, new Response(userId)); else await cache.delete(OWNER_URL)
  } catch { /* Storage blocked: the worker still shows the (privacy-safe) notification. */ }
}

/* ───────────────────────── enrolment ───────────────────────── */

let revision = 0
let inflight: Promise<void> | null = null
const progressListeners = new Set<(message: string) => void>()
function progress(message: string) { progressListeners.forEach(listener => listener(message)) }

async function enrol(started: number) {
  const cancelled = () => started !== revision
  progress('Preparing notifications…')
  const key = await publicKey()
  if (cancelled()) throw new PushError('Notification setup was cancelled.')
  progress('Starting the notification service…')
  const reg = await pushRegistration()
  if (cancelled()) throw new PushError('Notification setup was cancelled.')
  progress('Connecting this device…')
  let sub = await subscription(reg, key)
  let result: { userId?: string }
  try { result = await request('POST', sub.toJSON()) }
  catch (error) {
    // Keys changed for this endpoint: start a fresh subscription.
    if ((error as PushError).status !== 409) throw error
    await sub.unsubscribe().catch(() => undefined)
    sub = await subscription(reg, key)
    result = await request('POST', sub.toJSON())
  }
  if (cancelled()) {
    await request('DELETE', { endpoint: sub.endpoint }, { attempts: 1, timeout: 5000 }).catch(() => undefined)
    await sub.unsubscribe().catch(() => undefined)
    throw new PushError('Notification setup was cancelled.')
  }
  const userId = typeof result?.userId === 'string' && result.userId ? result.userId : (await getPushConfig()).userId
  await writeOwner(userId)
  writeState({ endpoint: sub.endpoint, userId, syncedAt: Date.now() })
  // Retire a subscription left on the old root worker by earlier versions.
  void navigator.serviceWorker.getRegistration('/').then(async legacy => {
    if (!legacy || legacy.scope === reg.scope) return
    const old = await legacy.pushManager?.getSubscription()
    if (old && old.endpoint !== sub.endpoint) await old.unsubscribe()
  }).catch(() => undefined)
  changed()
}
function run(onProgress?: (message: string) => void, started = revision) {
  if (started !== revision) return Promise.reject(new PushError('Notification setup was cancelled.'))
  if (onProgress) progressListeners.add(onProgress)
  if (!inflight) inflight = enrol(started).finally(() => { inflight = null })
  return inflight.finally(() => { if (onProgress) progressListeners.delete(onProgress) })
}

function askPermission(): Promise<NotificationPermission> {
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission)
  return new Promise(resolve => {
    // Older Safari only supports the callback form; newer browsers return a promise.
    let settled = false
    const done = (value: NotificationPermission) => { if (!settled) { settled = true; resolve(value) } }
    try {
      const result = Notification.requestPermission(done)
      if (result && typeof result.then === 'function') result.then(done, () => done(Notification.permission))
    } catch { done(Notification.permission) }
  })
}

/**
 * Call directly from the Enable click handler, with nothing awaited before it:
 * iPhone and Safari only show the permission prompt inside the tap itself.
 */
export function enableDevicePush(onProgress?: (message: string) => void): Promise<void> {
  const support = pushSupport()
  if (support !== 'supported') return Promise.reject(new PushError(pushSupportMessage(support)))
  const started = revision
  const permission = askPermission()
  return permission.then(result => {
    if (result !== 'granted') throw new PushError(result === 'denied' ? blockedHelp() : 'Notifications were not allowed. Tap Enable and choose Allow.')
    if (started !== revision) throw new PushError('Notification setup was cancelled.')
    setDisabled(false)
    return run(onProgress, started)
  })
}

/**
 * Quietly keeps an already-allowed device connected (app start, returning to
 * the app, new login on this device). Never shows a prompt.
 */
export async function resumeDevicePush(): Promise<boolean> {
  if (!pushSupported() || pushDisabled() || Notification.permission !== 'granted') return false
  try { await run(); return true } catch { return false }
}

/** Warm up before the officer taps Enable, so the tap has less to do. */
export async function prepareDevicePush() {
  if (!pushSupported() || pushDisabled()) return
  try { await publicKey() } catch {}
  try { if (!await existingRegistration()) await navigator.serviceWorker.register(PUSH_SCRIPT, { scope: PUSH_SCOPE, updateViaCache: 'none' }) } catch {}
}

export async function disconnectDevicePush(disable = true) {
  revision++
  if (disable) setDisabled(true)
  writeState(null)
  try {
    await writeOwner(null)
    const registrations = await navigator.serviceWorker?.getRegistrations().catch(() => []) || []
    for (const reg of registrations) {
      if (!['/', PUSH_SCOPE].includes(new URL(reg.scope).pathname)) continue
      const sub = await reg.pushManager?.getSubscription().catch(() => null)
      if (!sub) continue
      // Logout must stay fast; delivery removes expired endpoints if this misses.
      await request('DELETE', { endpoint: sub.endpoint }, { attempts: 1, timeout: 4000 }).catch(() => undefined)
      await sub.unsubscribe().catch(() => undefined)
    }
  } finally { changed() }
}

export async function devicePushConnected() {
  if (!pushSupported() || pushDisabled() || Notification.permission !== 'granted') return false
  const state = readState()
  if (!state) return false
  try {
    const reg = await existingRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return Boolean(sub && sub.endpoint === state.endpoint)
  } catch { return false }
}
/** Account this device last enrolled for, so a new login can re-bind it. */
export function devicePushAccount() { return readState()?.userId ?? null }
export function devicePushSyncedAt() { return readState()?.syncedAt ?? 0 }

export async function sendDeviceNotificationTest() {
  const reg = await existingRegistration()
  if (!reg || !await devicePushConnected()) throw new PushError('Enable device notifications first.')
  await reg.showNotification('TCNP notifications are on', {
    body: 'This is how TCNP updates will appear on this device, even when the app is closed.',
    icon: '/icon-192.png', badge: '/notification-badge.png', tag: 'tcnp-device-test', silent: false,
    data: { url: '/settings' }, vibrate: PUSH_VIBRATION,
  } as NotificationOptions)
}

/**
 * Hands the worker this device's alert choices so it can honour them while
 * TCNP is closed. The page and the worker share Cache Storage, which is the
 * one store both can reach without the worker being awake.
 */
export async function syncPushFeedback(feedback: PushFeedback) {
  if (typeof caches === 'undefined') return
  try {
    await (await caches.open(OWNER_CACHE)).put(FEEDBACK_URL, new Response(JSON.stringify({ vibration: feedback.vibration, sound: feedback.sound })))
  } catch { /* Storage blocked: the worker keeps its defaults, which alert. */ }
}

/** Mirror the unread total on the app icon (iPhone, Android, desktop PWAs). */
export async function syncAppBadge(count: number) {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try { if (count > 0) await nav?.setAppBadge?.(count); else await nav?.clearAppBadge?.() } catch {}
  if (typeof caches === 'undefined') return
  try { await (await caches.open(OWNER_CACHE)).put(BADGE_URL, new Response(String(Math.max(0, count)))) } catch {}
}
