/**
 * The link between TCNP's web screens and the native app that hosts them
 * (mobile/). Inside the native app the screens run in a web view; anything the
 * web cannot do (location while the phone is locked) is asked of the app.
 *
 * Web to app:   window.ReactNativeWebView.postMessage(JSON)
 * App to web:   window.__tcnpNativeReceive(message)
 *
 * Every message is `{ type, id?, ...payload }`. A request carries an `id` and
 * the app answers with the same `id`. In a normal browser none of this runs:
 * `isNativeShell()` is false and callers fall back to the web behaviour.
 */

export type NativeLocationStatus = {
  /** The app is delivering positions in the background. */
  running: boolean
  /** 'always' is needed for tracking with the phone locked. */
  permission: 'always' | 'foreground' | 'denied' | 'undetermined'
  /** When a position last reached the server (ms since epoch), if any. */
  lastSentAt: number | null
  deviceId: string
  platform: string
}

type NativeWindow = Window & {
  ReactNativeWebView?: { postMessage(message: string): void }
  __tcnpNativeReceive?: (message: unknown) => void
}

const REQUEST_TIMEOUT_MS = 20_000
const STATUS_EVENT = 'tcnp-native-location'
let counter = 0
const pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
let installed = false

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && typeof (window as NativeWindow).ReactNativeWebView?.postMessage === 'function'
}

/**
 * True inside the desktop program for Windows and Mac (desktop/). It is a
 * plain browser window around TCNP, with no bridge: this is only used to hide
 * things that make no sense there, such as "install this app".
 */
export function isDesktopShell(): boolean {
  return typeof navigator !== 'undefined' && /TCNPDesktop\//.test(navigator.userAgent || '')
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  ;(window as NativeWindow).__tcnpNativeReceive = (raw: unknown) => {
    let message: any = raw
    if (typeof raw === 'string') { try { message = JSON.parse(raw) } catch { return } }
    if (!message || typeof message !== 'object') return
    if (typeof message.id === 'string' && pending.has(message.id)) {
      const entry = pending.get(message.id)!
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(String(message.error)))
      else entry.resolve(message)
      return
    }
    if (message.type === 'location:status') window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: message.status }))
  }
}

export function postToNative(message: Record<string, unknown>) {
  if (!isNativeShell()) return
  install()
  try { (window as NativeWindow).ReactNativeWebView!.postMessage(JSON.stringify(message)) } catch { /* app is closing */ }
}

/**
 * Tells the app which colour the page is, so the strip it paints behind the
 * phone's status bar matches the chosen theme instead of the phone's setting.
 * Older app versions ignore the message.
 */
export function reportChromeToNative() {
  if (!isNativeShell()) return
  try {
    postToNative({
      type: 'ui:chrome',
      dark: document.documentElement.classList.contains('dark'),
      background: getComputedStyle(document.body).backgroundColor,
    })
  } catch { /* cosmetic only */ }
}

/**
 * What the phone's Back button does inside the app. A web page would simply
 * go back a page, which on a phone means an open sheet, menu or the "More"
 * drawer stays up while the screen behind it changes, and a half-filled form
 * is lost. Here Back closes whatever is open first, then goes back a screen,
 * and only leaves the app when there is nowhere left to go.
 */
const OPEN_OVERLAY = '[role="dialog"][aria-modal="true"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'
export function installNativeBack() {
  if (!isNativeShell()) return
  ;(window as NativeWindow & { __tcnpNativeBack?: (canGoBack: boolean) => void }).__tcnpNativeBack = (canGoBack) => {
    if (document.querySelector(OPEN_OVERLAY)) {
      // Every sheet, menu and drawer already closes on Escape.
      ;(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
      return
    }
    if (canGoBack) window.history.back()
    else postToNative({ type: 'app:exit' })
  }
}

export function requestNative<T = any>(type: string, payload: Record<string, unknown> = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  if (!isNativeShell()) return Promise.reject(new Error('Not running inside the TCNP app.'))
  install()
  const id = `web-${Date.now()}-${++counter}`
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('The TCNP app did not respond. Close and reopen it, then try again.')) }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    postToNative({ ...payload, type, id })
  })
}

/** Subscribe to background-tracking updates pushed by the app. */
export function subscribeToNativeLocation(listener: (status: NativeLocationStatus) => void) {
  if (typeof window === 'undefined') return () => {}
  install()
  const handler = (event: Event) => listener((event as CustomEvent<NativeLocationStatus>).detail)
  window.addEventListener(STATUS_EVENT, handler)
  return () => window.removeEventListener(STATUS_EVENT, handler)
}

export async function getNativeLocationStatus(): Promise<NativeLocationStatus> {
  return (await requestNative<{ status: NativeLocationStatus }>('location:status')).status
}

/**
 * Asks the phone for location permission through the app. Resolves with what
 * was granted; 'always' is what keeps an officer on the map with the phone
 * locked. The request can sit behind system dialogs and the Settings app, so
 * it is given a long time to answer.
 */
export async function requestNativeLocationPermission(): Promise<NativeLocationStatus['permission']> {
  return (await requestNative<{ permission: NativeLocationStatus['permission'] }>('location:request-permission', {}, 5 * 60_000)).permission
}

async function deviceTokenRequest(method: 'POST' | 'DELETE', deviceId: string, platform: string) {
  const response = await fetch('/api/location/device-token', {
    method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, platform }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not connect this device for location sharing. Please retry.')
  return body as { token?: string }
}

let starting: Promise<NativeLocationStatus> | null = null

/**
 * Makes sure the app is tracking in the background for the signed-in officer.
 * Safe to call on every app start: if tracking is already running it only
 * reads the status. Otherwise it gets a fresh device token and starts.
 */
export function ensureNativeTracking(): Promise<NativeLocationStatus> {
  if (starting) return starting
  starting = (async () => {
    const status = await getNativeLocationStatus()
    if (status.running) return status
    const { token } = await deviceTokenRequest('POST', status.deviceId, status.platform)
    if (!token) throw new Error('Could not connect this device for location sharing. Please retry.')
    const started = await requestNative<{ status: NativeLocationStatus }>('location:start', {
      token, ingestUrl: new URL('/api/location/ingest', window.location.origin).href,
    }, 60_000)
    return started.status
  })().finally(() => { starting = null })
  return starting
}

/**
 * Stops background tracking and gives up this device's token. `revoke` needs
 * the session cookie, so sign-out calls this before the session is cleared.
 */
export async function stopNativeTracking(options: { revoke?: boolean } = {}) {
  if (!isNativeShell()) return
  let status: NativeLocationStatus | null = null
  try { status = await getNativeLocationStatus() } catch { /* still tell the app to stop */ }
  postToNative({ type: 'location:stop' })
  if (options.revoke !== false && status?.deviceId) {
    try { await deviceTokenRequest('DELETE', status.deviceId, status.platform) } catch { /* the token is unused once the app has stopped */ }
  }
}
