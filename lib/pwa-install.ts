/**
 * One shared record of the browser's install offer.
 *
 * Chromium fires `beforeinstallprompt` once, early in the page's life. The app
 * does not render anything until the session is restored, and the install
 * controls mount later still, so a listener attached inside a component
 * usually arrives after the event has gone. Every control then believed the
 * device could not install and showed the manual instructions instead.
 *
 * The bootstrap script below runs before hydration, parks the event on
 * `window`, and announces changes. Every install control reads the same
 * record, so whichever one the user clicks can raise the native dialog.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type PWAPlatform =
  | 'android'
  | 'ios'
  | 'mac-safari'
  | 'desktop-chrome'
  | 'desktop-other'
  | 'in-app'

export type InstallOutcome = 'accepted' | 'dismissed' | 'show-instructions'

type InstallWindow = Window & {
  __tcnpInstallPrompt?: BeforeInstallPromptEvent | null
  __tcnpInstalled?: boolean
  __tcnpInstallListening?: boolean
}

export const INSTALL_CHANGE_EVENT = 'tcnp-install-change'

/** Inlined in the root layout so it is listening before any app code loads. */
export const INSTALL_BOOTSTRAP_SCRIPT = `(()=>{try{var w=window;if(w.__tcnpInstallListening)return;w.__tcnpInstallListening=true;var n=function(){w.dispatchEvent(new Event('${INSTALL_CHANGE_EVENT}'))};w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();w.__tcnpInstallPrompt=e;n()});w.addEventListener('appinstalled',function(){w.__tcnpInstallPrompt=null;w.__tcnpInstalled=true;n()})}catch(e){}})()`

const view = () => window as InstallWindow
const announce = () => window.dispatchEvent(new Event(INSTALL_CHANGE_EVENT))

/** Same listeners as the bootstrap script, for pages that render without it. */
export function ensureInstallListeners() {
  if (typeof window === 'undefined' || view().__tcnpInstallListening) return
  view().__tcnpInstallListening = true
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    view().__tcnpInstallPrompt = event as BeforeInstallPromptEvent
    announce()
  })
  window.addEventListener('appinstalled', () => {
    view().__tcnpInstallPrompt = null
    view().__tcnpInstalled = true
    announce()
  })
}

export function subscribeToInstall(notify: () => void) {
  ensureInstallListeners()
  window.addEventListener(INSTALL_CHANGE_EVENT, notify)
  return () => window.removeEventListener(INSTALL_CHANGE_EVENT, notify)
}

export const hasInstallPrompt = () => Boolean(view().__tcnpInstallPrompt)
export const wasInstalledThisSession = () => view().__tcnpInstalled === true

const STANDALONE_MODES = ['standalone', 'window-controls-overlay', 'minimal-ui', 'fullscreen']

export function isRunningInstalled() {
  return STANDALONE_MODES.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Apps that open links in their own embedded browser, which cannot install anything. */
const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|; wv\)/

export function detectPlatform(userAgent: string, platform = '', maxTouchPoints = 0): PWAPlatform {
  if (IN_APP_BROWSER.test(userAgent)) return 'in-app'
  if (/iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  if (/Macintosh/.test(userAgent) && /Safari/.test(userAgent) && !/Chrome|Firefox|Edg/.test(userAgent)) return 'mac-safari'
  return /Chrome|Edg/.test(userAgent) ? 'desktop-chrome' : 'desktop-other'
}

/** Platforms whose browsers can raise a native install dialog on request. */
export const offersNativeInstall = (platform: PWAPlatform | null) =>
  platform === 'android' || platform === 'desktop-chrome'

/**
 * The offer normally lands within a few seconds of load. A click before then
 * waits briefly for it rather than sending someone on a capable device to the
 * manual steps; after that window a missing offer means it is not coming.
 */
const OFFER_WINDOW_MS = 8000
const OFFER_WAIT_MS = 1500

function waitForPrompt(timeoutMs: number) {
  return new Promise<BeforeInstallPromptEvent | null>((resolve) => {
    const finish = () => {
      window.clearTimeout(timer)
      window.removeEventListener(INSTALL_CHANGE_EVENT, onChange)
      resolve(view().__tcnpInstallPrompt ?? null)
    }
    const onChange = () => { if (hasInstallPrompt()) finish() }
    const timer = window.setTimeout(finish, timeoutMs)
    window.addEventListener(INSTALL_CHANGE_EVENT, onChange)
  })
}

/**
 * Install now if the device allows it. 'show-instructions' is returned only
 * when the browser gives us nothing to call, so the caller explains the
 * manual route for that device.
 */
export async function requestInstall(platform: PWAPlatform | null): Promise<InstallOutcome> {
  ensureInstallListeners()
  let offer = view().__tcnpInstallPrompt ?? null
  if (!offer && offersNativeInstall(platform) && performance.now() < OFFER_WINDOW_MS) {
    offer = await waitForPrompt(OFFER_WAIT_MS)
  }
  if (!offer) return 'show-instructions'

  // An offer can be used once; clear it before prompting so a second control
  // cannot call prompt() on the same spent event.
  view().__tcnpInstallPrompt = null
  announce()
  try {
    await offer.prompt()
    const { outcome } = await offer.userChoice
    if (outcome === 'accepted') {
      view().__tcnpInstalled = true
      announce()
    }
    return outcome
  } catch {
    return 'show-instructions'
  }
}
