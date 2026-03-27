'use client'

/**
 * PresenceHeartbeat
 *
 * Updates the current user's `last_seen` timestamp in the database every
 * 60 seconds while the app is open. This allows the Officers page to accurately
 * show which officers are truly online (last_seen within 5 minutes).
 *
 * Also sets last_seen on mount (immediate) and clears it on unmount (tab close).
 */

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const HEARTBEAT_INTERVAL_MS = 60_000 // 1 minute

export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient()
    let intervalId: ReturnType<typeof setInterval> | null = null

    const updatePresence = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        await (supabase as any)
          .from('users')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id)
      } catch {
        // Non-fatal - presence update failure should not disrupt the app
      }
    }

    // Ping immediately on mount
    void updatePresence()

    // Then ping every minute
    intervalId = setInterval(() => void updatePresence(), HEARTBEAT_INTERVAL_MS)

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  return null
}
