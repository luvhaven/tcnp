/**
 * Shows an OS-level notification when the user has already granted permission.
 *
 * Android Chrome throws "Illegal constructor" for `new Notification()`; notifications
 * there must go through the service worker registration. Permission is never requested
 * here: these calls come from realtime callbacks, not user gestures, so browsers block
 * or silently downgrade the prompt. NotificationPermissionBanner asks instead.
 */
export async function showSystemNotification(
  title: string,
  options: NotificationOptions & { onClickUrl?: string; vibrate?: number[] } = {}
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false

  const { onClickUrl, ...notificationOptions } = options
  const payload: NotificationOptions = {
    icon: '/icon-192.png',
    badge: '/notification-badge.png',
    ...(options.silent ? {} : { vibrate: [45, 70, 90] }),
    ...notificationOptions,
    data: { ...(notificationOptions.data ?? {}), ...(onClickUrl ? { url: onClickUrl } : {}) },
  }
  if (payload.silent) delete (payload as NotificationOptions & { vibrate?: number[] }).vibrate

  try {
    const registration = await navigator.serviceWorker?.getRegistration('/notifications/') || await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, payload)
      return true
    }
  } catch {
    // Fall back to the page-level constructor below.
  }

  try {
    const notification = new Notification(title, payload)
    if (onClickUrl) {
      notification.onclick = () => {
        window.focus()
        window.location.assign(onClickUrl)
        notification.close()
      }
    }
    return true
  } catch {
    return false
  }
}
