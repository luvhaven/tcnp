import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { isPlatformAdministrator, isUnitHeadRole } from '@/lib/utils'

export type UnitSlug =
  | 'alpha'
  | 'command'
  | 'compliance'
  | 'november_nest'
  | 'tango'
  | 'training'
  | 'victor'
  | 'welfare'

/**
 * Mirrors the membership-backed SQL capability checks used by new unit pages.
 * The legacy-role fallback keeps the UI usable during the additive migration;
 * RLS remains the final authority for every write.
 */
export function useUnitAccess(unit: UnitSlug) {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const supabase = createClient()

  const membershipQuery = useQuery({
    queryKey: ['unit-access', unit, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { authorityAvailable: true, membership: null }
      const { data, error } = await (supabase as any)
        .from('unit_memberships')
        .select('access_level, status, units!inner(slug)')
        .eq('user_id', currentUser.id)
        .eq('units.slug', unit)
        .eq('status', 'active')
        .maybeSingle()

      // A missing table during a staged deploy should not crash an existing
      // unit page; legacy head-role checks cover the short transition window.
      if (error) return { authorityAvailable: false, membership: null }
      return {
        authorityAvailable: true,
        membership: data as { access_level: 'member' | 'head'; status: 'active' } | null,
      }
    },
    enabled: Boolean(currentUser?.id),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const isPlatformAdmin = isPlatformAdministrator(currentUser?.role)
  const legacyHead = isUnitHeadRole(unit, currentUser?.role, currentUser?.oscar)
  const authorityAvailable = membershipQuery.data?.authorityAvailable === true
  const membership = membershipQuery.data?.membership ?? null
  const isHead = authorityAvailable ? membership?.access_level === 'head' : legacyHead
  const isMember = authorityAvailable ? Boolean(membership) : isHead

  return {
    currentUser,
    isPlatformAdmin,
    isHead,
    isMember,
    canManage: isPlatformAdmin || isHead,
    isLoading: userLoading || membershipQuery.isLoading,
  }
}
