import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/useCurrentUser'

const supabase = createClient()

/**
 * Is the signed-in officer active on this programme
 * (is_program_active_officer)? Used only to explain why programme work is
 * not open to them; the work check itself is useCanWorkUnitProgramme.
 * `activeOnProgramme` is null while unknown, when no programme is chosen, or
 * when the read failed (the page then says nothing rather than guessing).
 */
export function useProgrammeStanding(programId: string | null | undefined, enabled = true) {
  const { data: currentUser } = useCurrentUser()
  const query = useQuery({
    // Starts with 'unit-access' so membership refreshes also refresh this.
    queryKey: ['unit-access', 'programme-active', currentUser?.id ?? null, programId ?? null] as const,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('is_program_active_officer', {
        target_user: currentUser!.id,
        target_program: programId,
      })
      if (error) throw error
      return data === true
    },
    enabled: Boolean(enabled && currentUser?.id && programId),
    staleTime: 60 * 1000,
  })
  return { activeOnProgramme: query.data ?? null }
}
