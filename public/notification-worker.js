/* A small push worker, independent of the app's potentially lengthy precache update. */
const OWNER_CACHE = 'tcnp-push-owner-v1'
const OWNER_URL = '/__tcnp_push_owner__'
const FEEDBACK_URL = '/__tcnp_push_feedback__'
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('message', event => {
  if (event.data?.type !== 'TCNP_PUSH_OWNER') return
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(OWNER_CACHE)
      if (event.data.userId) await cache.put(OWNER_URL, new Response(String(event.data.userId)))
      else await cache.delete(OWNER_URL)
      event.ports[0]?.postMessage({ ok: true })
    } catch {
      event.ports[0]?.postMessage({ ok: false, error: 'storage_unavailable' })
    }
  })())
})
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload
    try { payload = event.data?.json() } catch { return }
    if (!payload?.targetUserId) return
    const owner = await (await caches.open(OWNER_CACHE)).match(OWNER_URL)
    if (!owner || await owner.text() !== payload.targetUserId) return
    let url = '/dashboard'
    try { const target = new URL(payload.url, self.location.origin); if (target.origin === self.location.origin) url = target.pathname + target.search } catch {}
    // Keep a real system notification in the tray. When TCNP is focused, its
    // in-app banner owns sound/haptics; a background push uses device defaults.
    let windows = []
    try { windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }) } catch {}
    const focused = windows.filter(client => {
      try { return new URL(client.url).origin === self.location.origin && client.focused && client.visibilityState === 'visible' } catch { return false }
    })
    // This device's own choices (App sounds, In-app vibration), copied here by
    // the page because a worker cannot read localStorage. If either is on, the
    // device alerts even with TCNP closed; with both off it arrives quietly in
    // the tray. An emergency always alerts. Nothing saved yet means alert.
    let feedback = { vibration: true, sound: true }
    try {
      const saved = await (await caches.open(OWNER_CACHE)).match(FEEDBACK_URL)
      if (saved) { const value = await saved.json(); feedback = { vibration: value?.vibration !== false, sound: value?.sound !== false } }
    } catch {}
    const alert = payload.critical || feedback.vibration || feedback.sound
    // The server describes the event and the expected action. Anything that is
    // not a short plain string falls back to the generic wording.
    const text = (value, max, fallback) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fallback
    const title = text(payload.title, 80, 'TCNP')
    const options = { body: text(payload.body, 200, 'You have a new update. Open TCNP to view it.'), tag: payload.tag,
      icon: '/icon-192.png', badge: '/notification-badge.png', data: { url, notificationId: payload.notificationId }, renotify: false,
      requireInteraction: false, silent: focused.length > 0 || !alert,
      actions: [{ action: 'open', title: 'Open TCNP' }],
    }
    // Android plays this pattern itself. iPhone, iPad and desktop ignore it and
    // use their own system alert, so leaving the notification un-silenced is
    // what lets each of them ring or buzz in its native way. With vibration
    // switched off the pattern is omitted and the device's own setting decides.
    if (!options.silent && (payload.critical || feedback.vibration)) options.vibrate = payload.critical ? [200, 100, 200, 100, 400] : [200, 100, 200]
    await self.registration.showNotification(title, options)
    for (const client of focused) {
      try { client.postMessage({ type: 'TCNP_NOTIFICATION', notificationId: payload.notificationId }) } catch {}
    }
  })())
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    let url = new URL('/dashboard', self.location.origin)
    try { const target = new URL(event.notification.data?.url, self.location.origin); if (target.origin === self.location.origin) url = target } catch {}
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === url.origin) { await client.navigate(url.href); await client.focus(); return }
    }
    await self.clients.openWindow(url.href)
  })())
})
