import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { fetchActiveUnitMemberships, unitAccess, type UnitMembership, type UnitSlug } from '@/lib/unit-access'

export type { UnitSlug, UnitMembership } from '@/lib/unit-access'

const supabase = createClient()
const NO_MEMBERSHIPS: UnitMembership[] = []

/**
 * One cached query for all of the signed-in officer's active memberships, so
 * the sidebar, the bottom bar and every unit page share a single request.
 * The key starts with 'unit-access' so the existing invalidations
 * (DenTeam, useDashboardDeletions) refresh it too.
 */
export const myUnitMembershipsKey = (userId: string | null | undefined) =>
  ['unit-access', 'my-memberships', userId ?? null] as const

export function useMyUnitMemberships() {
  const { data: currentUser, isLoading: userLoading, isError: userError, refetch: refetchUser } = useCurrentUser()
  // A profile read that never succeeded leaves the membership query disabled,
  // which would look like "member of nothing". Report it as a failed load.
  const userFailed = userError && !currentUser

  // Unit pages retry with invalidateQueries({ queryKey: ['unit-access'] }).
  // This entry sits under that prefix so the same retry re-reads the profile
  // when the profile is what failed.
  useQuery({
    queryKey: ['unit-access', 'profile-retry'] as const,
    queryFn: async () => {
      await refetchUser()
      return Date.now()
    },
    enabled: userFailed,
    retry: false,
  })

  const query = useQuery({
    queryKey: myUnitMembershipsKey(currentUser?.id),
    queryFn: async (): Promise<UnitMembership[]> => {
      const { memberships, error } = await fetchActiveUnitMemberships(supabase as any, currentUser!.id)
      if (error) throw error
      return memberships
    },
    enabled: Boolean(currentUser?.id),
    staleTime: 5 * 60 * 1000,
    // No retry override: the provider's retryTransientReads policy applies.
  })

  return {
    currentUser,
    // A failed background refetch keeps the last good rows (React Query keeps
    // data on error), so a flaky connection does not strip the nav. Only a read
    // that never succeeded grants no unit access (platform / Command still apply).
    memberships: query.data ?? NO_MEMBERSHIPS,
    loadFailed: (query.isError && query.data === undefined) || userFailed,
    isLoading: userLoading || query.isLoading,
  }
}

/**
 * Unit permissions for the signed-in officer, from membership only. There is
 * no role or Oscar fallback: if the membership read fails, the officer gets
 * nothing beyond platform admin / Command and `loadFailed` is true so the page
 * can say so. RLS remains the final authority for every write.
 */
export function useUnitAccess(unit: UnitSlug) {
  const { currentUser, memberships, loadFailed, isLoading } = useMyUnitMemberships()
  const access = unitAccess(memberships, unit, {
    role: currentUser?.role,
    hasAdminAccess: currentUser?.has_admin_access,
  })

  // A programme's Tango Team Lead manages the Tango page while that programme
  // is open, without being the unit head (is_tango_programme_lead). Asked of
  // the database, only for Tango members who are not already head.
  const leadQuery = useQuery({
    queryKey: ['unit-access', 'tango-programme-lead', currentUser?.id ?? null] as const,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('is_tango_programme_lead')
      if (error) throw error
      return data === true
    },
    enabled: unit === 'tango' && Boolean(currentUser?.id) && access.isMember && !access.canManage,
    staleTime: 60 * 1000,
  })
  const programmeLead = unit === 'tango' && access.isMember && leadQuery.data === true

  return {
    currentUser,
    ...access,
    canCoordinate: access.canCoordinate || programmeLead,
    canManage: access.canManage || programmeLead,
    isProgrammeLead: programmeLead,
    loadFailed,
    isLoading: isLoading || (leadQuery.isLoading && leadQuery.fetchStatus !== 'idle'),
  }
}

/**
 * Programme work in a unit for one programme, asked of the database
 * (can_work_unit_programme): member AND active on the programme AND
 * (head/sub_lead OR a head-issued grant such as a Den floor grant).
 */
export function useCanWorkUnitProgramme(unit: UnitSlug, programId: string | null | undefined) {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const query = useQuery({
    queryKey: ['unit-access', 'programme-work', currentUser?.id ?? null, unit, programId ?? null] as const,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('can_work_unit_programme', {
        unit_slug: unit,
        target_program: programId,
      })
      if (error) throw error
      return data === true
    },
    enabled: Boolean(currentUser?.id && programId),
    staleTime: 60 * 1000,
  })

  return {
    canWork: query.data === true,
    loadFailed: query.isError && query.data === undefined,
    isLoading: userLoading || query.isLoading,
  }
}
