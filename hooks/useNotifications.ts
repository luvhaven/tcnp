import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { audioManager } from '@/lib/audio/AudioManager'

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'broken_arrow' | 'call_sign' | 'chat'

export interface AppNotification {
  id: string
  user_id: string
  title: string
  message: string
  type: NotificationType
  is_read: boolean
  created_at: string
  journey_id?: string | null
  related_url?: string | null
}

const NOTIFICATION_PAGE_SIZE = 20


function vibrateDevice(type: NotificationType = 'info') {
  try {
    if (!('vibrate' in navigator)) return
    if (type === 'broken_arrow') {
      navigator.vibrate([300, 100, 300, 100, 300]) // Triple pulse for emergency
    } else {
      navigator.vibrate([150, 80, 150]) // Standard double pulse
    }
  } catch {
    // Silent
  }
}

// --- Hook ---
export function useNotifications() {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const loadNotifications = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(NOTIFICATION_PAGE_SIZE)

      if (error) throw error

      const notifs = (data || []) as unknown as AppNotification[]
      setNotifications(notifs)
      setUnreadCount(notifs.filter((n) => !n.is_read).length)
    } catch (err) {
      console.warn('[useNotifications] load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  // Bootstrap
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

        setUserId(user.id)
        await loadNotifications(user.id)

        // Real-time subscription
        const channel = supabase
          .channel(`notifications:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (cancelled) return
              const incoming = payload.new as AppNotification
              setNotifications((prev) => [incoming, ...prev.slice(0, NOTIFICATION_PAGE_SIZE - 1)])
              setUnreadCount((c) => c + 1)

              // Teams-quality alerts — route through AudioManager (BrokenArrowAlert owns broken_arrow audio)
              audioManager.playChime(incoming.type)
              vibrateDevice(incoming.type)

              // Toast
              const toastFn =
                incoming.type === 'broken_arrow'
                  ? toast.error
                  : incoming.type === 'error'
                    ? toast.error
                    : incoming.type === 'warning'
                      ? toast.warning
                      : incoming.type === 'success'
                        ? toast.success
                        : toast.info

              toastFn(incoming.title, {
                description: incoming.message,
                duration: incoming.type === 'broken_arrow' ? 10000 : 5000,
              })
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (cancelled) return
              const updated = payload.new as AppNotification
              setNotifications((prev) =>
                prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n))
              )
              setUnreadCount((prev) =>
                Math.max(0, prev - (updated.is_read ? 1 : 0))
              )
            }
          )
          .subscribe()

        channelRef.current = channel
      } catch (err) {
        console.warn('[useNotifications] init error (non-fatal):', err)
        setLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [supabase, loadNotifications])

  const markAsRead = useCallback(async (id: string) => {
    try {
      await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('id', id)

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (err) {
      console.error('[useNotifications] markAsRead failed:', err)
    }
  }, [supabase])

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    try {
      await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error('[useNotifications] markAllAsRead failed:', err)
      toast.error('Failed to mark notifications as read')
    }
  }, [supabase, userId])

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await (supabase.from('notifications') as any).delete().eq('id', id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      setUnreadCount((prev) => {
        const wasUnread = notifications.find((n) => n.id === id && !n.is_read)
        return wasUnread ? Math.max(0, prev - 1) : prev
      })
    } catch (err) {
      console.error('[useNotifications] delete failed:', err)
    }
  }, [supabase, notifications])

  return {
    notifications,
    unreadCount,
    loading,
    userId,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    reload: () => userId ? loadNotifications(userId) : undefined,
  }
}
