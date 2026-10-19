"use client"

import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { uniqueTopic } from '@/lib/realtime/topic'

/**
 * Returns the count of unread assignment notifications for the current user.
 * Used by the sidebar to show a badge on "My Operations".
 */
export function useUnreadAssignments() {
  const supabase = createClient()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true

    const fetchCount = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !mounted) return

        const { count: c, error } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('type', ['assignment', 'reminder'])
          .eq('is_read', false)

        if (!error && mounted) setCount(c ?? 0)
      } catch (err) {
        console.warn('useUnreadAssignments error:', err)
      }
    }

    void fetchCount()

    // The cleanup must belong to the effect itself; returned from inside .then() it
    // never ran, and the leaked channel left later mounts with dead bindings.
    let channel: RealtimeChannel | null = null
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !mounted) return
      channel = supabase
        .channel(uniqueTopic(`unread-assignments-${user.id}`))
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void fetchCount()
          }
        )
        .subscribe()
    })

    // Deletes aren't filterable server-side, so the notification list announces them.
    const onLocalChange = () => { void fetchCount() }
    window.addEventListener('tcnp:notifications-changed', onLocalChange)

    return () => {
      mounted = false
      window.removeEventListener('tcnp:notifications-changed', onLocalChange)
      if (channel) void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { count }
}
