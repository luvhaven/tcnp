'use client'

import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, BookOpen, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PapaBriefingCard, { type PapaBriefingPapa } from './PapaBriefingCard'
import { getBriefingConfig, canEditBriefing } from '@/lib/constants/papaBriefingFields'
import { useUnitAccess } from '@/hooks/useUnitAccess'
import {
  canEditPapaPassport,
  canViewPapaPassport,
  fetchPapaPrivateDetailsBatch,
  papaPrivateBatchKey,
  papaPrivateSiblingFilter,
  type PapaPrivateDetails,
} from '@/lib/papa-privacy'

interface PapaBriefingsSectionProps {
  /** The viewing user's role — determines which fields to show */
  role: string
  userId?: string | null
}

export default function PapaBriefingsSection({ role, userId: providedUserId }: PapaBriefingsSectionProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const config = getBriefingConfig(role)
  const canEdit = canEditBriefing(role)
  const papaFields = [...new Set([
    'id', 'program_id', 'title', 'full_name', 'profile_photo_url', 'organization', 'position',
    ...((config?.viewFields ?? []).map((field) => field.key)),
  ])]
  const { data: papas = [], isLoading, isError, refetch } = useQuery<PapaBriefingPapa[]>({
    queryKey: ['papa-briefings', providedUserId || 'session-user', role],
    enabled: Boolean(config) && providedUserId !== null,
    queryFn: async () => {
      let userId = providedUserId
      if (!userId) {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        userId = user?.id
      }
      if (!userId) return []
      const { data: assignments, error: assignmentsError } = await (supabase as any)
        .from('current_title_assignments')
        .select('program_id')
        .eq('user_id', userId)
        .eq('is_active', true)
      if (assignmentsError) throw assignmentsError
      const programIds = [...new Set((assignments || []).map((assignment: any) => assignment.program_id).filter(Boolean))]
      if (programIds.length === 0) return [] as PapaBriefingPapa[]

      const { data, error } = await (supabase as any)
        .from('papas')
        .select(papaFields.join(', '))
        .in('program_id', programIds)
        .order('full_name')
      if (error) throw error
      return (data || []) as PapaBriefingPapa[]
    },
    staleTime: 60_000,
    retry: 1,
  })

  // Passports never come with the briefing read. For a config that shows
  // them, Command and Alpha leads get one extra batch read of
  // papa_private_details; everyone else never requests it.
  const alpha = useUnitAccess('alpha')
  const passportAllowed = Boolean(config?.showsPassport) && canViewPapaPassport(alpha)
  const passportEditable = passportAllowed && canEditPapaPassport(alpha)
  const papaIds = papas.map((papa) => papa.id)
  const passportKey = papaPrivateBatchKey(papaIds)
  const passports = useQuery({
    queryKey: passportKey,
    queryFn: () => fetchPapaPrivateDetailsBatch(supabase as any, papaIds),
    enabled: passportAllowed && papaIds.length > 0,
    staleTime: 60_000,
  })
  const savePassport = (papaId: string, details: PapaPrivateDetails) => {
    queryClient.setQueryData(passportKey, (old: Record<string, PapaPrivateDetails> | undefined) => ({ ...(old ?? {}), [papaId]: details }))
    // /papas keeps its own single-Papa copy; mark it (and any other batch)
    // stale so it never shows, or saves over, the older passport.
    void queryClient.invalidateQueries(papaPrivateSiblingFilter(passportKey))
  }

  if (!config) return null // role has no briefing config

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{config.sectionTitle}</h2>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        {canEdit && (
          <span className="w-fit basis-full text-xs sm:ml-auto sm:basis-auto bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
            Team Lead — Edit enabled
          </span>
        )}
      </div>

      {/* Papa cards */}
      {isError ? (
        <Card role="alert">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6 text-sm">
            <span>Unable to load Papa briefings. Please try again.</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : papas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p>No Papas assigned to your program yet.</p>
            <p className="text-xs mt-1">Briefings will appear here once Papas are added.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {papas.map((papa) => (
            <PapaBriefingCard
              key={papa.id}
              papa={papa}
              config={config}
              canEdit={canEdit}
              passport={passportAllowed ? {
                details: passports.data?.[papa.id] ?? (passports.isSuccess ? null : undefined),
                isLoading: passports.isLoading,
                isError: passports.isError && passports.data === undefined,
                onRetry: () => { void passports.refetch() },
                retrying: passports.isFetching,
              } : undefined}
              canEditPassport={passportEditable}
              onPassportSaved={(details) => savePassport(papa.id, details)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
