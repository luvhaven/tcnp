import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logSupabaseError } from '@/lib/supabase/error-utils'

type RpcParams = {
  user_uuid: string
}

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

        const { data, error } = await (supabase as any).rpc('get_unread_message_count', {
          user_uuid: session.user.id
        } satisfies RpcParams)

        if (error) {
          throw error
        }

        const numericCount = typeof data === 'number' ? data : 0
        setCount(numericCount)
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

    const channel = supabase.channel(`chat-unread-${userId}`, {
      config: {
        broadcast: { self: true }
      }
    })

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages'
      }, (payload) => {
        const nextId = typeof (payload.new as { id?: string } | null | undefined)?.id === 'string'
          ? (payload.new as { id: string }).id
          : undefined
        const previousId = typeof (payload.old as { id?: string } | null | undefined)?.id === 'string'
          ? (payload.old as { id: string }).id
          : undefined

        console.log('🔔 Chat message change detected, refreshing unread count', {
          eventType: payload.eventType,
          recordId: nextId ?? previousId
        })
        // Immediate update for better UX
        setTimeout(() => void fetchUnread(), 100)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Unread count subscription active')
        } else if (status === 'CHANNEL_ERROR') {
          const lastFetch = lastSuccessfulFetchRef.current
          if (lastFetch) {
            console.warn('❌ Unread count subscription reported CHANNEL_ERROR', {
              channel: channel.topic,
              lastSuccessfulFetch: new Date(lastFetch).toISOString()
            })
          } else {
            console.warn('❌ Unread count subscription reported CHANNEL_ERROR (no successful fetch yet)')
          }
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Unread count subscription timed out; scheduling retry')
          setTimeout(() => void fetchUnread(), 1000)
        }
      })

    // Refresh every 30 seconds for reliability
    const interval = setInterval(() => {
      void fetchUnread()
    }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [supabase, userId, fetchUnread])

  return { count }
}
