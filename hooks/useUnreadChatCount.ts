import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uniqueTopic } from '@/lib/realtime/topic'

export function useUnreadChatCount() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const pendingRequestRef = useRef<Promise<void> | null>(null)
  const lastSuccessfulFetchRef = useRef<number | null>(null)

  const fetchUnread = useCallback(async () => {
    if (!userId) {
      return
    }

    // Deduplicate overlapping fetches
    if (pendingRequestRef.current) {
      return pendingRequestRef.current
    }

    const request = (async () => {
      try {
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session?.user?.id) {
          console.warn('⚠️ Unread count fetch skipped: no active Supabase session')
          setCount(0)
          return
        }

        // Count through row-level security so only rooms this officer can open
        // are included. The old get_unread_message_count RPC counted every
        // unread message in the database (other rooms, old test chats).
        const uid = session.user.id
        const { count: unread, error } = await (supabase as any)
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .neq('sender_id', uid)
          .is('deleted_at', null)
          .or('is_archived.is.null,is_archived.eq.false')
          .or(`read_by.is.null,read_by.not.cs.${JSON.stringify([uid])}`)

        if (error) {
          throw error
        }

        setCount(typeof unread === 'number' ? unread : 0)
        lastSuccessfulFetchRef.current = Date.now()
      } catch (error) {
  // Downgrade unread-count failures to a warning to avoid red error overlay
  console.warn('Error loading unread chat count (non-fatal):', error)
} finally {
        pendingRequestRef.current = null
      }
    })()

    pendingRequestRef.current = request
    return request
  }, [supabase, userId])

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      setUserId(user?.id ?? null)
    }

    void getUser()
  }, [supabase])

  useEffect(() => {
    if (!userId) return

    void fetchUnread()

    // Only new messages from others can raise the count. Listening to every change
    // made each read receipt (an UPDATE) trigger a refetch on every client.
    let refetchTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefetch = () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      refetchTimer = setTimeout(() => void fetchUnread(), 800)
    }

    let subscribedOnce = false
    const channel = supabase
      .channel(uniqueTopic(`chat-unread-${userId}`))
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `sender_id=neq.${userId}`
      }, scheduleRefetch)
      // A deleted message must drop out of the badge for everyone.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
      }, (payload: any) => { if (payload.new?.deleted_at || payload.new?.is_archived) scheduleRefetch() })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Catch up on anything missed while the connection was down.
          if (subscribedOnce) scheduleRefetch()
          subscribedOnce = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Unread count subscription interrupted:', status)
          scheduleRefetch()
        }
      })

    // ChatSystem announces when it has marked messages read.
    window.addEventListener('tcnp:chat-read', scheduleRefetch)
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleRefetch() }
    document.addEventListener('visibilitychange', onVisible)

    // Safety net in case a realtime event is missed.
    const interval = setInterval(() => {
      void fetchUnread()
    }, 20000)

    return () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      window.removeEventListener('tcnp:chat-read', scheduleRefetch)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [supabase, userId, fetchUnread])

  // Update document title when unread count changes
  useEffect(() => {
    if (typeof document === 'undefined') return
    const base = 'TCNP'
    document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${base}` : base
  }, [count])

  const markRead = useCallback(() => {
    setCount(0)
  }, [])

  return { count, markRead }
}
