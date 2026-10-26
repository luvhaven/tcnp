import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { uniqueTopic } from '@/lib/realtime/topic'
import { useRouter } from 'next/navigation'
import { presentNotification } from '@/lib/notification-presentation'

export type NotificationType =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'broken_arrow'
  | 'call_sign'
  | 'chat'
  | 'announcement'
  | 'birthday_reminder'
  | 'alert'
  | 'reminder'

export interface AppNotification {
  id: string
  user_id: string
  title: string
  message: string
  type: NotificationType
  is_read: boolean
  created_at: string
  journey_id?: string | null
  metadata?: { kind?: string; program_id?: string; request_id?: string; [key: string]: unknown } | null
}

/**
 * Where clicking a notification should take the user. Kept alongside
 * resolveChimeKey since both classify a notification by kind/type — the
 * single source of truth for "what is this notification about".
 */
export function resolveNotificationRoute(n: AppNotification): string | null {
  const url = n.metadata?.url
  if (typeof url === 'string' && url.startsWith('/chat?') && !/[\\\r\n]/.test(url)) return url
  const kind = n.metadata?.kind
  if (kind === 'password_reset_request') return '/officers?tab=resets'
  if (kind === 'food_ready') return '/welfare'
  if (kind === 'birthday_0700' || n.type === 'birthday_reminder') return '/welfare'
  if (kind === 'mission_request') return '/dashboard'
  if (kind === 'mention') return '/chat'
  if (kind === 'announcement' || n.type === 'announcement') {
    const category = String(n.metadata?.category || '').toLowerCase()
    if (category === 'training' || category === 'recruitment') return '/training'
    if (category === 'birthday' || category === 'wedding' || category === 'welfare') return '/welfare'
    return '/dashboard'
  }
  if (n.journey_id) return `/journeys?highlight=${n.journey_id}`
  if (n.type === 'chat') return '/chat'
  if (n.type === 'broken_arrow') return '/incidents'
  if (n.type === 'call_sign') return '/operations-monitor'
  return null
}

// The bell shows the last 10 notifications
const NOTIFICATION_PAGE_SIZE = 10

/**
 * Sound identity comes from the event kind first (food_ready, mission_request,
 * mention), then falls back to the notification type — so the Welfare dinner
 * bell never sounds like a Broken Arrow.
 */
function resolveChimeKey(n: AppNotification): string {
  const kind = n.metadata?.kind
  if (kind === 'password_reset_request') return 'warning'
  if (kind === 'food_ready' || kind === 'mission_request' || kind === 'mention') return kind
  if (kind === 'birthday_0700' || n.type === 'birthday_reminder') return 'success'
  if (n.type === 'announcement' || n.type === 'reminder') return 'info'
  if (n.type === 'alert') return 'warning'
  return n.type
}


// --- Hook ---
export function useNotifications() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const receiveNotification = useCallback((incoming: AppNotification, uid: string) => {
    if (incoming.user_id !== uid) return
    setNotifications(prev => prev.some(n => n.id === incoming.id) ? prev : [incoming, ...prev.slice(0, NOTIFICATION_PAGE_SIZE - 1)])
    if (incoming.is_read) return
    const messageId = incoming.metadata?.message_id
    presentNotification({
      id: typeof messageId === 'string' ? `chat:${messageId}` : incoming.id,
      title: incoming.title, message: incoming.message, kind: resolveChimeKey(incoming),
      category: incoming.type === 'broken_arrow' ? 'emergency' : incoming.type === 'chat' ? 'chat' : 'update',
      onOpen: () => {
        const url = resolveNotificationRoute(incoming)
        if (url) router.push(url)
        else document.getElementById('notification-bell')?.click()
      },
    })
  }, [router])

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
        // Unmounted while loading: creating the channel now would leak it.
        if (cancelled) return

        // Real-time subscription
        const channel = supabase
          .channel(uniqueTopic(`notifications:${user.id}`))
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
              receiveNotification(incoming, user.id)
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
            }
          )
          .subscribe()

        if (cancelled) {
          void supabase.removeChannel(channel)
          return
        }
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
  }, [supabase, loadNotifications, receiveNotification])

  // A push can arrive while realtime reconnects. Read the row with this user's
  // session rather than putting private message text in the push payload.
  useEffect(() => {
    if (!userId) return
    let live = true
    const onPush = async (event: MessageEvent) => {
      if (event.data?.type !== 'TCNP_NOTIFICATION' || typeof event.data.notificationId !== 'string') return
      try {
        const { data, error } = await supabase.from('notifications').select('*').eq('id', event.data.notificationId).eq('user_id', userId).maybeSingle()
        if (live && !error && data) receiveNotification(data as unknown as AppNotification, userId)
      } catch { /* Realtime and the next inbox refresh can recover. */ }
    }
    navigator.serviceWorker?.addEventListener('message', onPush)
    const refresh = () => { if (!document.hidden) void loadNotifications(userId) }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    return () => {
      live = false
      navigator.serviceWorker?.removeEventListener('message', onPush)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [userId, supabase, receiveNotification, loadNotifications])

  const markAsRead = useCallback(async (id: string) => {
    try {
      const { error } = await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('id', id)
      if (error) throw error
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
    } catch (err) {
      console.error('[useNotifications] markAsRead failed:', err)
      toast.error('Could not mark notification as read. Please retry.')
    }
  }, [supabase])

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    try {
      const { error } = await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)
      if (error) throw error
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch (err) {
      console.error('[useNotifications] markAllAsRead failed:', err)
      toast.error('Failed to mark notifications as read')
    }
  }, [supabase, userId])

  const deleteNotification = useCallback(async (id: string) => {
    try {
      const { error } = await (supabase.from('notifications') as any).delete().eq('id', id)
      if (error) throw error
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      // Realtime can't filter DELETEs by user, so tell the sidebar badge directly.
      window.dispatchEvent(new Event('tcnp:notifications-changed'))
    } catch (err) {
      console.error('[useNotifications] delete failed:', err)
      toast.error('Failed to delete notification')
    }
  }, [supabase])

  // Derived, so a local mark-as-read followed by its realtime echo can't count twice.
  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications])

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
