'use client'

/**
 * PresenceHeartbeat
 *
 * - Sets is_online = true immediately on mount (with last_seen)
 * - Pings last_seen + is_online every 30s while app is open
 * - Sets is_online = false on page unload / hidden
 */

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds

export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient()
    let intervalId: ReturnType<typeof setInterval> | null = null

    const updatePresence = async (online: boolean) => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await (supabase as any)
          .from('users')
          .update({ last_seen: new Date().toISOString(), is_online: online })
          .eq('id', user.id)
      } catch {
        // Non-fatal
      }
    }

    const handleVisibilityChange = () => {
      void updatePresence(!document.hidden)
    }

    const handleBeforeUnload = () => {
      void updatePresence(false)
    }

    // Go online immediately
    void updatePresence(true)

    // Keep alive every 30s
    intervalId = setInterval(() => void updatePresence(!document.hidden), HEARTBEAT_INTERVAL_MS)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      if (intervalId) clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      void updatePresence(false)
    }
  }, [])

  return null
}
