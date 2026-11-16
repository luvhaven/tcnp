import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  DEN_UNIT_SLUG,
  compareDenMembers,
  isDenOfficer,
  legacyDenAccessLevel,
  normalizeDenAccessLevel,
  type DenAccessLevel,
} from '@/lib/den'

export type DenTeamMember = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  oscar: string | null
  phone: string | null
  photo_url: string | null
  unit: string | null
  current_title_id: string | null
  is_active: boolean
  activation_status: string
  created_at: string
  level: DenAccessLevel
  /** unit_memberships row id; null until the Den unit is registered. */
  membershipId: string | null
}

export type DenTeam = {
  members: DenTeamMember[]
  /** False until the november_den unit exists; levels then come from role/Oscar. */
  unitRegistered: boolean
}

export const DEN_TEAM_QUERY_KEY = ['den', 'team'] as const

const USER_COLUMNS = 'id, full_name, email, role, oscar, phone, photo_url, unit, current_title_id, is_active, activation_status, created_at'

/**
 * Everyone who serves in November (Den), with their level in the unit.
 *
 * The roster comes from the officer directory (role or Oscar), and levels come
 * from unit_memberships once the Den unit is registered. Reading the roster
 * from `users` rather than only from memberships means the list is right on
 * both sides of the migration, and nobody is missing because their role is
 * still the signup default.
 */
export function useDenTeam() {
  const supabase = createClient()

  return useQuery<DenTeam>({
    queryKey: DEN_TEAM_QUERY_KEY,
    queryFn: async () => {
      const db = supabase as any

      const [usersResult, unitResult] = await Promise.all([
        db
          .from('users')
          .select(USER_COLUMNS)
          .or('role.in.(noscar_den,head_noscar_den),oscar.ilike.%den%')
          .eq('is_active', true)
          .order('full_name'),
        db.from('units').select('id').eq('slug', DEN_UNIT_SLUG).maybeSingle(),
      ])
      if (usersResult.error) throw usersResult.error

      const unitId: string | null = unitResult.error ? null : unitResult.data?.id ?? null
      const levels = new Map<string, { id: string; level: DenAccessLevel }>()

      if (unitId) {
        const { data: memberships, error } = await db
          .from('unit_memberships')
          .select('id, user_id, access_level')
          .eq('unit_id', unitId)
          .eq('status', 'active')
        if (error) throw error
        for (const row of memberships ?? []) {
          const level = normalizeDenAccessLevel(row.access_level)
          if (level) levels.set(row.user_id, { id: row.id, level })
        }
      }

      const members: DenTeamMember[] = (usersResult.data ?? [])
        .filter((user: any) => isDenOfficer(user.role, user.oscar))
        .map((user: any) => {
          const membership = levels.get(user.id)
          return {
            id: user.id,
            full_name: user.full_name ?? null,
            email: user.email ?? null,
            role: user.role ?? 'viewer',
            oscar: user.oscar ?? null,
            phone: user.phone ?? null,
            photo_url: user.photo_url ?? null,
            unit: user.unit ?? null,
            current_title_id: user.current_title_id ?? null,
            is_active: user.is_active !== false,
            activation_status: user.activation_status ?? 'active',
            created_at: user.created_at,
            level: membership?.level ?? legacyDenAccessLevel(user.role, user.oscar),
            membershipId: membership?.id ?? null,
          }
        })
        .sort(compareDenMembers)

      return { members, unitRegistered: Boolean(unitId) }
    },
    staleTime: 60 * 1000,
  })
}
