/* TCNP push worker — small and independent of the app's precache worker. */
const OWNER_CACHE = 'tcnp-push-owner-v1'
const OWNER_URL = '/__tcnp_push_owner__'
const FEEDBACK_URL = '/__tcnp_push_feedback__'
const BADGE_URL = '/__tcnp_push_badge__'
const DEVICES_API = '/api/notifications/devices'

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim ? self.clients.claim() : Promise.resolve()))

async function stored(key) {
  try { return await (await caches.open(OWNER_CACHE)).match(key) } catch { return undefined }
}
async function store(key, value) {
  try { await (await caches.open(OWNER_CACHE)).put(key, new Response(String(value))) } catch {}
}
function sameOrigin(url) {
  try { return new URL(url).origin === self.location.origin } catch { return false }
}
function safePath(value) {
  try { const target = new URL(value, self.location.origin); if (target.origin === self.location.origin) return target.pathname + target.search + target.hash } catch {}
  return '/dashboard'
}

// Older pages ask the worker to record the signed-in account; newer pages write it themselves.
self.addEventListener('message', event => {
  if (event.data?.type !== 'TCNP_PUSH_OWNER') return
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(OWNER_CACHE)
      if (event.data.userId) await cache.put(OWNER_URL, new Response(String(event.data.userId)))
      else await cache.delete(OWNER_URL)
      event.ports?.[0]?.postMessage({ ok: true })
    } catch {
      event.ports?.[0]?.postMessage({ ok: false, error: 'storage_unavailable' })
    }
  })())
})

self.addEventListener('push', event => {
  // Every push MUST show a notification. iPhone and Safari revoke the
  // subscription after a few pushes that show nothing.
  event.waitUntil((async () => {
    let payload = null
    try { payload = event.data ? event.data.json() : null } catch {}
    if (!payload || typeof payload !== 'object') payload = {}

    // Shared device: another officer's update is announced generically and quietly.
    const ownerResponse = await stored(OWNER_URL)
    const owner = ownerResponse ? await ownerResponse.text().catch(() => '') : ''
    const otherAccount = Boolean(owner && payload.targetUserId && owner !== payload.targetUserId)

    let windows = []
    try { windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }) } catch {}
    const focused = windows.filter(client => sameOrigin(client.url) && client.focused && client.visibilityState === 'visible')

    // This device's own choices (App sounds, In-app vibration), copied here by
    // the page because a worker cannot read localStorage. Nothing saved means alert.
    let feedback = { vibration: true, sound: true }
    try {
      const saved = await stored(FEEDBACK_URL)
      if (saved) { const value = await saved.json(); feedback = { vibration: value?.vibration !== false, sound: value?.sound !== false } }
    } catch {}
    const alert = payload.critical || feedback.vibration || feedback.sound

    // The server describes the event and the expected action. Anything that is
    // not a short plain string falls back to the generic wording.
    const text = (value, max, fallback) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fallback
    const title = otherAccount ? 'TCNP' : text(payload.title, 80, 'TCNP')
    const body = otherAccount ? 'There is new activity for another officer on this device.' : text(payload.body, 200, 'You have a new update. Open TCNP to view it.')
    const url = otherAccount ? '/dashboard' : safePath(payload.url || '/dashboard')
    const options = {
      body, icon: '/icon-192.png', badge: '/notification-badge.png',
      // A unique tag per update, so every message alerts like a chat app would.
      tag: otherAccount ? 'tcnp-other-account' : (typeof payload.tag === 'string' && payload.tag) || `tcnp-${Date.now()}`,
      data: { url, notificationId: otherAccount ? undefined : payload.notificationId },
      timestamp: Date.now(),
      requireInteraction: false,
      // When TCNP is open and in front, its in-app banner owns sound and haptics.
      silent: otherAccount || focused.length > 0 || !alert,
    }
    // Android plays this pattern; iPhone, iPad and desktop use their own system alert.
    if (!options.silent && (payload.critical || feedback.vibration)) options.vibrate = payload.critical ? [200, 100, 200, 100, 400] : [200, 100, 200]

    await self.registration.showNotification(title, options)

    if (!otherAccount) {
      // App icon badge, like a messaging app. The page resets it to the true unread total.
      try {
        const saved = await stored(BADGE_URL)
        const count = (saved ? Number(await saved.text()) || 0 : 0) + 1
        await store(BADGE_URL, count)
        if (self.navigator && typeof self.navigator.setAppBadge === 'function') await self.navigator.setAppBadge(count)
      } catch {}
      // The open app fetches the update itself and shows its own banner.
      for (const client of focused) {
        try { client.postMessage({ type: 'TCNP_NOTIFICATION', notificationId: payload.notificationId }) } catch {}
      }
    }
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const path = safePath(event.notification.data?.url || '/dashboard')
  const href = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    let windows = []
    try { windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }) } catch {}
    const open = windows.filter(client => sameOrigin(client.url))
    const client = open.find(item => item.focused) || open.find(item => item.visibilityState === 'visible') || open[0]
    if (client) {
      // The app's pages are not controlled by this worker, so the page routes itself.
      try { client.postMessage({ type: 'TCNP_OPEN', url: path }) } catch {}
      try { await client.focus(); return } catch {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(href)
  })())
})

// Browsers rotate push endpoints; re-register the new one so delivery never silently stops.
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    let sub = event.newSubscription || null
    const key = event.oldSubscription?.options?.applicationServerKey
    if (!sub && key) sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    if (!sub) return
    await fetch(DEVICES_API, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
  })().catch(() => undefined))
})
