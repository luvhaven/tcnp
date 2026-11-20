'use client'

import { useQuery, useQueries } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const NO_PROGRAMMES: string[] = []

/**
 * Programme work in Echo, per programme (the ONE RULE, level 3):
 * Echo member AND active on the programme AND (head/sub-lead OR a head-issued
 * programme grant). The database decides (`can_work_unit_programme`); this hook
 * only asks it for the programmes the officer is active on, because no other
 * programme can pass.
 *
 * Coordinators (and platform admins, through `canCoordinate`) already work every
 * programme, so nothing is asked for them. The per-programme query key matches
 * `useCanWorkUnitProgramme` in hooks/useUnitAccess.ts, so both share one cache
 * entry and `invalidateQueries({ queryKey: ['unit-access'] })` refreshes it.
 */
export function useEchoProgrammeWork({
    userId,
    isMember,
    canCoordinate,
}: {
    userId: string | null | undefined
    isMember: boolean
    canCoordinate: boolean
}) {
    const askDatabase = Boolean(userId) && isMember && !canCoordinate

    const active = useQuery({
        queryKey: ['unit-access', 'echo-active-programmes', userId ?? null] as const,
        queryFn: async (): Promise<string[]> => {
            const { data, error } = await (supabase as any)
                .from('current_title_assignments')
                .select('program_id')
                .eq('user_id', userId)
                .eq('is_active', true)
            if (error) throw error
            return [...new Set<string>((data || []).map((row: any) => row.program_id).filter(Boolean))]
        },
        enabled: askDatabase,
        staleTime: 60 * 1000,
    })

    const programmeIds = askDatabase ? active.data ?? NO_PROGRAMMES : NO_PROGRAMMES

    const checks = useQueries({
        queries: programmeIds.map(programId => ({
            queryKey: ['unit-access', 'programme-work', userId ?? null, 'echo', programId] as const,
            queryFn: async () => {
                const { data, error } = await (supabase as any).rpc('can_work_unit_programme', {
                    unit_slug: 'echo',
                    target_program: programId,
                })
                if (error) throw error
                return data === true
            },
            staleTime: 60 * 1000,
        })),
    })

    const workable = new Set<string>(programmeIds.filter((_, index) => checks[index]?.data === true))

    const loadFailed = askDatabase && (
        (active.isError && active.data === undefined)
        || checks.some(check => check.isError && check.data === undefined)
    )
    const isLoading = askDatabase && (active.isLoading || checks.some(check => check.isLoading))

    return {
        /** Programmes this officer may do Echo work on (empty for coordinators, who may do all). */
        workable,
        /** True when the officer is active on at least one programme (so the hint can be specific). */
        activeOnAnyProgramme: programmeIds.length > 0,
        canWork: (programId: string | null | undefined) => canCoordinate || Boolean(programId && workable.has(programId)),
        loadFailed,
        isLoading,
        retry: () => {
            void active.refetch()
            checks.forEach(check => { if (check.isError) void check.refetch() })
        },
    }
}
