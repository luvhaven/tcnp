'use client'

import { toast } from 'sonner'
import { NotificationBanner } from '@/components/notifications/NotificationBanner'
import { playNotificationFeedback } from '@/lib/notification-feedback'

const presented = new Map<string, number>()
let lastFeedback = 0
export function presentNotification(options: {
  id: string; title: string; message: string; kind?: string; category?: 'chat' | 'update' | 'emergency'; onOpen: () => void; persisted?: boolean
}) {
  if (typeof document === 'undefined' || document.hidden || !document.hasFocus()) return false
  const now = Date.now()
  for (const [key, time] of presented) if (now - time > 120000) presented.delete(key)
  if (presented.has(options.id)) return false
  presented.set(options.id, now)
  // A burst updates the inbox immediately without playing overlapping chimes.
  if (now - lastFeedback >= 1500) { playNotificationFeedback(options.kind); lastFeedback = now }
  toast.custom(id => <NotificationBanner title={options.title} message={options.message} category={options.category} saved={options.persisted !== false}
    onOpen={() => { toast.dismiss(id); options.onOpen() }} onDismiss={() => toast.dismiss(id)} />, {
    id: `notification-${options.id}`, duration: options.category === 'emergency' ? 10000 : 6500,
    // Sonner pauses on hover/focus and supports swiping banners away on phones.
  })
  return true
}
