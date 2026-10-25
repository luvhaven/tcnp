'use client'

/**
 * PresenceHeartbeat
 *
 * - Sets is_online = true immediately on mount (with last_seen)
 * - Pings last_seen + is_online every 30s while app is open
 * - Keeps signed-in background tabs online; sets offline on page unload
 */

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OFFICER_PRESENCE_REFRESH_MS } from '@/lib/presence'

export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient()
    let intervalId: ReturnType<typeof setInterval> | null = null
    let stopped = false

    const updatePresence = async (online: boolean) => {
      if (online && stopped) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        if (online && stopped) return
        await (supabase as any)
          .from('users')
          .update({ last_seen: new Date().toISOString(), is_online: online })
          .eq('id', user.id)
      } catch {
        // Non-fatal
      }
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) void updatePresence(true)
    }

    const handleBeforeUnload = () => {
      stopped = true
      void updatePresence(false)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        stopped = true
        if (intervalId) clearInterval(intervalId)
      }
    })

    // Go online immediately
    void updatePresence(true)

    // Keep alive every 30s
    intervalId = setInterval(() => void updatePresence(true), OFFICER_PRESENCE_REFRESH_MS)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      stopped = true
      subscription.unsubscribe()
      if (intervalId) clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      void updatePresence(false)
    }
  }, [])

  return null
}
