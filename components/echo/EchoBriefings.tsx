'use client'

import { useQuery } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import PapaBriefingCard, { type PapaBriefingPapa } from '@/components/papas/PapaBriefingCard'
import { ROLE_BRIEFING_CONFIG } from '@/lib/constants/papaBriefingFields'

const supabase = createClient()

/**
 * The Echo (AV) briefing config. Views and edits share one field list; who may
 * edit is decided per Papa below, never from the role. The keys name the
 * config, not a permission.
 */
const ECHO_CONFIG = ROLE_BRIEFING_CONFIG['head_echo_oscar']
const ECHO_VIEW_ONLY = ROLE_BRIEFING_CONFIG['echo_oscar']

type ProgrammeWork = {
    canWork: (programId: string | null | undefined) => boolean
    loadFailed: boolean
    isLoading: boolean
    retry: () => void
}

/**
 * Papa AV briefings for Echo members, for the programmes the officer is active
 * on. Editing a Papa's AV fields is Echo programme work on that Papa's
 * programme: an Echo head/sub-lead, or a member `can_work_unit_programme('echo',
 * papa.program_id)` admits. This mirrors `PATCH /api/papas/[id]/role-update`,
 * which checks the same thing on the server.
 */
export default function EchoBriefings({
    userId,
    canCoordinate,
    work,
}: {
    userId: string | null | undefined
    canCoordinate: boolean
    work: ProgrammeWork
}) {
    const fields = [...new Set([
        'id', 'program_id', 'title', 'full_name', 'profile_photo_url', 'organization', 'position',
        ...ECHO_CONFIG.viewFields.map(field => field.key),
    ])]

    const papasQuery = useQuery<PapaBriefingPapa[]>({
        queryKey: ['echo-briefings', userId ?? null],
        enabled: Boolean(userId),
        queryFn: async () => {
            const { data: assignments, error: assignmentsError } = await (supabase as any)
                .from('current_title_assignments')
                .select('program_id')
                .eq('user_id', userId)
                .eq('is_active', true)
            if (assignmentsError) throw assignmentsError
            const programIds = [...new Set((assignments || []).map((row: any) => row.program_id).filter(Boolean))]
            if (programIds.length === 0) return []

            const { data, error } = await (supabase as any)
                .from('papas')
                .select(fields.join(', '))
                .in('program_id', programIds)
                .order('full_name')
            if (error) throw error
            return (data || []) as PapaBriefingPapa[]
        },
        staleTime: 60_000,
    })

    const papas = papasQuery.data ?? []
    const editableCount = papas.filter(papa => work.canWork(papa.program_id)).length

    let editNote: string | null = null
    if (canCoordinate) {
        editNote = 'Echo lead: you can edit every briefing.'
    } else if (work.isLoading) {
        editNote = null
    } else if (editableCount > 0) {
        editNote = editableCount === papas.length
            ? 'You are on the Echo programme team: you can edit these briefings.'
            : 'You can edit briefings for the programmes your Echo head added you to.'
    } else if (papas.length > 0) {
        // These Papas come from programmes the officer is active on, so what is
        // missing is the head's grant (same wording as programmeWorkNotice).
        editNote = 'Read only. You are active on these programmes, but your Echo head has not given you this work yet.'
    }

    return (
        <section className="space-y-4" aria-labelledby="echo-briefings-title">
            <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-lg bg-primary/10 p-2">
                    <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <h2 id="echo-briefings-title" className="text-lg font-semibold">{ECHO_CONFIG.sectionTitle}</h2>
                    <p className="text-sm text-muted-foreground">{ECHO_CONFIG.description}</p>
                    {editNote && <p className="mt-1 text-xs text-muted-foreground">{editNote}</p>}
                </div>
            </div>

            {work.loadFailed && !canCoordinate && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                    <span>Could not check which programmes you can work on. Briefings are read only for now.</span>
                    <Button variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={work.retry}>
                        Try again
                    </Button>
                </div>
            )}

            {papasQuery.isLoading ? (
                <div className="space-y-3" aria-busy="true" aria-label="Loading briefings">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
            ) : papasQuery.isError && papasQuery.data === undefined ? (
                <Card>
                    <ErrorState
                        title="Could not load Papa briefings"
                        onRetry={() => { void papasQuery.refetch() }}
                        retrying={papasQuery.isFetching}
                    />
                </Card>
            ) : papas.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        <BookOpen className="mx-auto mb-3 h-8 w-8 opacity-30" aria-hidden="true" />
                        <p>No Papas on your programmes yet.</p>
                        <p className="mt-1 text-xs">Briefings appear here once you are active on a programme with Papas.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {papas.map(papa => {
                        const canEdit = work.canWork(papa.program_id)
                        return (
                            <PapaBriefingCard
                                key={papa.id}
                                papa={papa}
                                config={canEdit ? ECHO_CONFIG : ECHO_VIEW_ONLY}
                                canEdit={canEdit}
                            />
                        )
                    })}
                </div>
            )}
        </section>
    )
}
