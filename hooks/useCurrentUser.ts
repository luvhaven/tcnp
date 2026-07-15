import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CurrentUser = {
    id: string
    email: string | null
    full_name: string | null
    role: string | null
    oscar: string | null
    photo_url: string | null
    is_active: boolean
    team: string | null
    is_team_head: boolean
    // Profile fields (drive completion indicator + enforcer)
    phone: string | null
    job_title: string | null
    bio: string | null
    date_of_birth: string | null
    gender: string | null
    address: string | null
    city: string | null
    emergency_contact_name: string | null
    emergency_contact_phone: string | null
    profile_completed_at: string | null
}

/**
 * Shared hook for the authenticated user's profile.
 * Uses React Query with a 5-minute stale time so every consuming
 * component shares a single cached network request — eliminates the
 * 15+ redundant `supabase.auth.getUser()` calls fired on every page mount.
 */
export function useCurrentUser() {
    const supabase = createClient()

    return useQuery<CurrentUser | null>({
        queryKey: ['currentUser'],
        queryFn: async () => {
            const { data: { user }, error: authError } = await supabase.auth.getUser()
            if (authError || !user) return null

            const { data: profile, error } = await supabase
                .from('users')
                .select('id, full_name, role, oscar, photo_url, is_active, team, is_team_head, phone, job_title, bio, date_of_birth, gender, address, city, emergency_contact_name, emergency_contact_phone, profile_completed_at')
                .eq('id', user.id)
                .single()

            if (error || !profile) return null

            const p = profile as any
            return {
                id: user.id,
                email: user.email ?? null,
                full_name: p.full_name ?? null,
                role: p.role ?? null,
                oscar: p.oscar ?? null,
                photo_url: p.photo_url ?? null,
                is_active: p.is_active ?? true,
                team: p.team ?? null,
                is_team_head: p.is_team_head === true,
                phone: p.phone ?? null,
                job_title: p.job_title ?? null,
                bio: p.bio ?? null,
                date_of_birth: p.date_of_birth ?? null,
                gender: p.gender ?? null,
                address: p.address ?? null,
                city: p.city ?? null,
                emergency_contact_name: p.emergency_contact_name ?? null,
                emergency_contact_phone: p.emergency_contact_phone ?? null,
                profile_completed_at: p.profile_completed_at ?? null,
            }
        },
        staleTime: 5 * 60 * 1000,   // 5 minutes — profile changes are not realtime-critical
        gcTime: 10 * 60 * 1000,     // keep in cache for 10 minutes after last subscriber
        retry: 1,
    })
}
