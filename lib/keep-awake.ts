import { KEEP_AWAKE_MP4, KEEP_AWAKE_WEBM } from '@/lib/keep-awake-media'

/**
 * Keeps the phone screen on while location sharing runs.
 *
 * Why this matters: a web app only receives the phone's location while it is
 * on screen. The moment the screen locks, an iPhone stops giving it location
 * at all, and nothing a web app does can change that. So the way to keep an
 * officer on the map is to stop the screen locking while TCNP is open.
 *
 * Two methods run side by side:
 *  1. The Wake Lock API, where the browser offers it.
 *  2. A looping silent video. On iPhone the Wake Lock API is unreliable inside
 *     Home Screen apps (it reports success and the screen locks anyway before
 *     iOS 18.4), and playing video is what actually holds the screen there.
 *
 * Both need a tap on iPhone, so `enable()` is safe to call from every tap: it
 * does nothing when the screen is already being held.
 */

type Sentinel = { released: boolean; release(): Promise<void> }

function isAppleTouchDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
}

export interface KeepAwake {
  /** Start or restore holding the screen. Call from taps and when the app returns to view. */
  enable(): void
  /** Let the screen sleep normally again. */
  disable(): void
  /** True while at least one method is holding the screen. */
  isHeld(): boolean
}

export function createKeepAwake(): KeepAwake {
  let wanted = false
  let sentinel: Sentinel | null = null
  let requesting = false
  let video: HTMLVideoElement | null = null
  let videoPlaying = false
  const useVideo = isAppleTouchDevice() || !(typeof navigator !== 'undefined' && 'wakeLock' in navigator)

  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'

  async function requestLock() {
    if (!wanted || requesting || (sentinel && !sentinel.released) || !visible()) return
    const api = typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock : undefined
    if (!api) return
    requesting = true
    try {
      const lock = await api.request('screen')
      if (!wanted) { void lock.release().catch(() => undefined); return }
      sentinel = lock
    } catch { /* Refused (no tap yet, low power mode): the next tap tries again. */ }
    finally { requesting = false }
  }

  function ensureVideo() {
    if (video || typeof document === 'undefined') return video
    const element = document.createElement('video')
    element.setAttribute('title', 'TCNP location sharing')
    element.setAttribute('playsinline', '')
    element.setAttribute('aria-hidden', 'true')
    element.tabIndex = -1
    // On screen but invisible: iPhone ignores media that is display:none.
    element.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1'
    for (const [type, src] of [['webm', KEEP_AWAKE_WEBM], ['mp4', KEEP_AWAKE_MP4]] as const) {
      const source = document.createElement('source')
      source.src = src
      source.type = `video/${type}`
      element.appendChild(source)
    }
    element.addEventListener('loadedmetadata', () => {
      if (element.duration <= 1) element.setAttribute('loop', '')
      else element.addEventListener('timeupdate', () => { if (element.currentTime > 0.5) element.currentTime = Math.random() })
    })
    element.addEventListener('pause', () => { videoPlaying = false })
    element.addEventListener('playing', () => { videoPlaying = true })
    document.body.appendChild(element)
    video = element
    return element
  }

  function playVideo() {
    if (!wanted || !useVideo || videoPlaying || !visible()) return
    const element = ensureVideo()
    if (!element) return
    try {
      const playing = element.play()
      if (playing && typeof playing.then === 'function') playing.then(() => { videoPlaying = true }, () => { videoPlaying = false })
    } catch { /* Needs a tap first: the next tap tries again. */ }
  }

  return {
    enable() {
      wanted = true
      void requestLock()
      playVideo()
    },
    disable() {
      wanted = false
      const lock = sentinel
      sentinel = null
      if (lock && !lock.released) void lock.release().catch(() => undefined)
      if (video) {
        try { video.pause() } catch { /* already stopped */ }
        video.remove()
        video = null
        videoPlaying = false
      }
    },
    isHeld() {
      return Boolean((sentinel && !sentinel.released) || videoPlaying)
    },
  }
}
