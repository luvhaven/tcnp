'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

import { useCurrentUser } from '@/hooks/useCurrentUser'

/**
 * Attaches the signed-in officer's identity to every Sentry event.
 *
 * This is what turns "some users are seeing an error" into "this error hits
 * Papa unit team leads on iOS" — without it, a report is an anonymous stack
 * trace and you are back to asking for someone's login.
 *
 * Deliberately limited: id and email identify who to follow up with, and
 * role/unit/team are tags so you can spot a pattern across reports. Full
 * name, phone, address, date of birth and bio are NEVER sent, and
 * `sendDefaultPii` stays false so Sentry adds nothing on its own.
 */
export function SentryUserContext() {
    const { data: user } = useCurrentUser()

    useEffect(() => {
        if (!user) return

        Sentry.setUser({
            id: user.id,
            email: user.email ?? undefined,
        })

        Sentry.setTags({
            role: user.role ?? 'unknown',
            unit: user.oscar ?? 'unassigned',
            team: user.team ?? 'unassigned',
            is_team_head: String(user.is_team_head),
            // Profile enforcement redirects incomplete profiles, which changes
            // which screens a user can reach at all.
            profile_complete: String(Boolean(user.profile_completed_at)),
        })
    }, [user])

    return null
}
