"use client"

import { useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { offlineQueue } from '@/lib/offline-queue'
import type { CallSignKey } from '@/lib/constants/call-signs'

export const STATUS_CALL_SIGNS: CallSignKey[] = [
  'first_course',
  'cocktail',
  'chapman',
  'dessert',
]

export const EVENT_CALL_SIGNS: CallSignKey[] = [
  'blue_cocktail',
  'red_cocktail',
  're_order',
]

// ── journey_events.event_type is the call_sign enum (Title Case + spaces) ────
// Map from JS key → DB enum value.  Only keys present here will be logged.
const CALL_SIGN_KEY_TO_DB: Partial<Record<CallSignKey, string>> = {
  first_course: 'First Course',
  cocktail: 'Cocktail',
  chapman: 'Chapman',
  dessert: 'Dessert',
  blue_cocktail: 'Blue Cocktail',
  red_cocktail: 'Red Cocktail',
  re_order: 'Re-order',
  broken_arrow: 'Broken Arrow',
}

async function logJourneyEvent(
  supabase: ReturnType<typeof createClient>,
  journeyId: string,
  callSign: CallSignKey,
  notes?: string | null
) {
  const dbValue = CALL_SIGN_KEY_TO_DB[callSign]
  if (!dbValue) return // 'completed' and others are not call_sign enum values – skip
  try {
    await (supabase as any).from('journey_events').insert({
      journey_id: journeyId,
      event_type: dbValue,        // call_sign enum (Title Case) ✓
      description: notes ?? null,
      triggered_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('journey_events log failed (non-critical):', e)
  }
}

export function useJourneyStatus(journeyId: string) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  // 1. Fetch Status with React Query
  const { data, isLoading } = useQuery({
    queryKey: ['journeyStatus', journeyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journeys')
        .select('status, updated_at')
        .eq('id', journeyId)
        .single()
      if (error) throw error
      return data as { status: string; updated_at: string | null }
    },
    enabled: !!journeyId
  })

  // 2. Realtime Subscriptions targeting the Query Cache
  useEffect(() => {
    if (!journeyId) return
    const channel = supabase
      .channel(`journey-status-${journeyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'journeys',
          filter: `id=eq.${journeyId}`,
        },
        (payload) => {
          queryClient.setQueryData(['journeyStatus', journeyId], {
            status: payload.new.status,
            updated_at: payload.new.updated_at
          })
          queryClient.invalidateQueries({ queryKey: ['journeys'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [journeyId, supabase, queryClient])

  // 3. React Query Mutations for status updates
  const updateMutation = useMutation({
    mutationFn: async ({ callSign, notes }: { callSign: CallSignKey, notes?: string }) => {
      const isEventOnly = EVENT_CALL_SIGNS.includes(callSign)

      try {
        if (!isEventOnly) {
          // Only update columns that actually exist in the journeys schema.
          // NOTE: actual_departure / actual_arrival do NOT exist — do NOT include them.
          const updates: Record<string, any> = {
            status: callSign,                   // journey_status enum (underscores ✓)
            updated_at: new Date().toISOString(),
          }

          const { error } = await (supabase as any)
            .from('journeys')
            .update(updates)
            .eq('id', journeyId)

          if (error) throw error
        }

        // Log the event — non-critical, errors are swallowed
        await logJourneyEvent(supabase, journeyId, callSign, notes)
      } catch (err: any) {
        if (!navigator.onLine || err.message?.includes('fetch failed') || err.message?.includes('Failed to fetch')) {
          const now = new Date().toISOString()
          if (!isEventOnly) {
            await offlineQueue.addToQueue('journey_update', {
              id: journeyId,
              updates: { status: callSign, updated_at: now },
              isEmergency: callSign === 'broken_arrow'
            })
          }
          const dbValue = CALL_SIGN_KEY_TO_DB[callSign]
          if (dbValue) {
            await offlineQueue.addToQueue('journey_event', {
              journey_id: journeyId,
              event_type: dbValue,
              description: notes ?? null,
              triggered_at: now
            })
          }
        } else {
          throw err
        }
      }

      // ── Auto-log Broken Arrow to incidents ─────────────────────────────────
      // Creates a CRITICAL incident record automatically so the Incidents page
      // always has a timestamped record with full context. Non-critical.
      if (callSign === 'broken_arrow') {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          await (supabase as any).from('incidents').insert({
            journey_id: journeyId,
            type: 'BROKEN ARROW',
            severity: 'critical',
            description: `BROKEN ARROW automatically declared by duty officer. Major incident — Cheetah immobilized. Auto-logged at ${new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}.`,
            status: 'open',
            reported_by: user?.id ?? null,
            created_by: user?.id ?? null,
          })
        } catch (e) {
          console.warn('Auto-incident log failed (non-critical):', e)
        }
      }

      return { callSign, isEventOnly }
    },
    onMutate: async ({ callSign }) => {
      const isEventOnly = EVENT_CALL_SIGNS.includes(callSign)
      if (isEventOnly) return

      // Optimistic Update
      await queryClient.cancelQueries({ queryKey: ['journeyStatus', journeyId] })
      const previousState = queryClient.getQueryData(['journeyStatus', journeyId])

      queryClient.setQueryData(['journeyStatus', journeyId], {
        status: callSign,
        updated_at: new Date().toISOString()
      })

      return { previousState }
    },
    onError: (err, variables, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(['journeyStatus', journeyId], context.previousState)
      }
      console.error('Call sign update failed:', err)
      toast.error('Failed to update call sign')
    },
    onSuccess: (result) => {
      const label = result.callSign.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      toast.success(`${label} – call sign executed`)
    }
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      // NOTE: actual_arrival does NOT exist in the journeys schema — omitted.
      const { error } = await (supabase as any)
        .from('journeys')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', journeyId)

      if (error) throw error

      // 'completed' is not a call_sign enum value so we skip journey_events for completion
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['journeyStatus', journeyId] })
      const previousState = queryClient.getQueryData(['journeyStatus', journeyId])
      queryClient.setQueryData(['journeyStatus', journeyId], {
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      return { previousState }
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['journeyStatus', journeyId], context?.previousState)
      toast.error('Failed to complete journey')
    },
    onSuccess: () => {
      toast.success('Journey marked as complete')
    }
  })

  const updateStatus = useCallback(async (callSign: CallSignKey, notes?: string) => {
    updateMutation.mutate({ callSign, notes })
  }, [updateMutation])

  const completeJourney = useCallback(async () => {
    if (!await confirm({ message: 'Mark this journey as complete?', confirmText: 'Complete', variant: 'default' })) return
    completeMutation.mutate()
  }, [completeMutation, confirm])

  return {
    status: data?.status || null,
    lastUpdated: data?.updated_at || null,
    loading: isLoading || updateMutation.isPending || completeMutation.isPending,
    updateStatus,
    completeJourney
  }
}
