'use client'

/**
 * useNestETAReminder
 *
 * SOP: The November Oscar must be notified at least 30 minutes before
 * each Papa's confirmed ETA so the Nest/room is ready upon arrival.
 *
 * This hook polls active journeys assigned to the current user's nest
 * and fires a browser notification + toast when ETA is 30 minutes away.
 */

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { notificationService } from '@/lib/services/notificationService'
import { toast } from 'sonner'

const WARN_BEFORE_MS = 30 * 60 * 1000   // 30 minutes
const POLL_INTERVAL_MS = 2 * 60 * 1000  // check every 2 minutes

export function useNestETAReminder(nestId: string | null) {
    const firedKeys = useRef<Set<string>>(new Set())
    const supabase = createClient()

    useEffect(() => {
        if (!nestId) return

        const check = async () => {
            try {
                // Find active journeys pointing to this nest with an ETA set
                const { data } = await (supabase as any)
                    .from('journeys')
                    .select('id, eta, papas:papas!papa_id(full_name, title)')
                    .eq('assigned_nest_id', nestId)
                    .not('status', 'in', '(completed,cancelled)')
                    .not('eta', 'is', null)

                if (!data) return

                const now = Date.now()
                for (const journey of data) {
                    const eta = new Date(journey.eta).getTime()
                    const diff = eta - now
                    const key = `eta-30-${journey.id}`

                    // Fire if within 30 min and hasn't been fired yet
                    if (diff > 0 && diff <= WARN_BEFORE_MS && !firedKeys.current.has(key)) {
                        firedKeys.current.add(key)
                        const papa = journey.papas
                            ? `${journey.papas.title || ''} ${journey.papas.full_name}`.trim()
                            : 'Principal'
                        const minsLeft = Math.ceil(diff / 60000)

                        toast.warning(`🛎️ ${papa} arriving in ~${minsLeft} min`, {
                            description: 'Ensure Nest is fully prepared — Comfort Checklist complete.',
                            duration: 30000,
                        })

                        void notificationService.showNotification({
                            title: `🛎️ ${papa} — ETA ~${minsLeft} min`,
                            body: 'Nest should be ready now. Complete Comfort Checklist if not done.',
                            tag: key,
                            requireInteraction: true,
                        })
                    }
                }
            } catch (_) {
                // Silent fail — don't disrupt normal page operation
            }
        }

        void check()
        const interval = setInterval(check, POLL_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [nestId, supabase])
}
