/* A small push worker, independent of the app's potentially lengthy precache update. */
const OWNER_CACHE = 'tcnp-push-owner-v1'
const OWNER_URL = '/__tcnp_push_owner__'
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
    const options = { body: 'You have a new update. Open TCNP to view it.', tag: payload.tag,
      icon: '/icon-192.png', badge: '/notification-badge.png', data: { url, notificationId: payload.notificationId }, renotify: false,
      requireInteraction: false, silent: focused.length > 0,
      actions: [{ action: 'open', title: 'Open TCNP' }],
    }
    if (!options.silent) options.vibrate = payload.critical ? [200, 100, 200, 100, 400] : [45, 70, 90]
    await self.registration.showNotification('TCNP', options)
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
