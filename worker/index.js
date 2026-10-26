/* Custom worker imported by next-pwa. Never cache authenticated API responses. */
const OWNER_CACHE = 'tcnp-push-owner-v1'
const OWNER_URL = '/__tcnp_push_owner__'
self.addEventListener('message', event => {
  if (event.data?.type !== 'TCNP_PUSH_OWNER') return
  event.waitUntil((async () => {
    const cache = await caches.open(OWNER_CACHE)
    if (event.data.userId) await cache.put(OWNER_URL, new Response(String(event.data.userId)))
    else await cache.delete(OWNER_URL)
    event.ports[0]?.postMessage({ ok: true })
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
    await self.registration.showNotification('TCNP', { body: 'You have a new update. Open TCNP to view it.', tag: payload.tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url }, renotify: false })
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
