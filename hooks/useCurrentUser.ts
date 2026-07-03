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
                .select('id, full_name, role, oscar, photo_url, is_active')
                .eq('id', user.id)
                .single()

            if (error || !profile) return null

            return {
                id: user.id,
                email: user.email ?? null,
                full_name: profile.full_name ?? null,
                role: profile.role ?? null,
                oscar: profile.oscar ?? null,
                photo_url: profile.photo_url ?? null,
                is_active: profile.is_active ?? true,
            }
        },
        staleTime: 5 * 60 * 1000,   // 5 minutes — profile changes are not realtime-critical
        gcTime: 10 * 60 * 1000,     // keep in cache for 10 minutes after last subscriber
        retry: 1,
    })
}
