"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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

    // Subscribe to real-time changes on notifications table
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

      const channel = supabase
        .channel(`unread-assignments-${user.id}`)
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

      return () => {
        mounted = false
        supabase.removeChannel(channel)
      }
    })

    return () => { mounted = false }
  }, [])

  return { count }
}
