import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DenProgrammeTeamMember } from '@/lib/den-work'

/**
 * The Den officers who can be given a programme's work: those added to the
 * programme, plus the head and sub-leads who run it. Used by the task and
 * roster pickers, so nobody can be offered who the database would refuse.
 */
export function useDenProgrammeTeam(programId: string | null) {
  const supabase = createClient()
  return useQuery<DenProgrammeTeamMember[]>({
    queryKey: ['den', 'programme-team', programId],
    enabled: Boolean(programId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('den_programme_team', { target_program: programId })
      if (error) throw error
      return (data ?? []) as DenProgrammeTeamMember[]
    },
    staleTime: 30 * 1000,
  })
}
