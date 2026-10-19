"use client"

import { useEffect, useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { offlineQueue } from '@/lib/offline-queue'
import { CALL_SIGN_KEY_TO_DB_ENUM, getCallSignLabel, type CallSignKey } from '@/lib/constants/call-signs'

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

// journey_events.event_type is the `call_sign` enum (Title Case + spaces).
// Single source of truth lives in lib/constants/call-signs.ts.
const CALL_SIGN_KEY_TO_DB = CALL_SIGN_KEY_TO_DB_ENUM

const OFFLINE_SAVED_MESSAGE = 'Saved offline – will send when connected'

/**
 * True when a write failed because the request never reached Supabase.
 * Browsers disagree on the wording: Chrome "Failed to fetch", Safari "Load
 * failed", Firefox "NetworkError when attempting…". postgrest-js also turns a
 * thrown fetch into `{ message: 'TypeError: …' }` rather than rethrowing, so
 * both the raw TypeError and its stringified form have to be recognised.
 */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (err instanceof TypeError) return true
  const message = String((err as { message?: unknown })?.message ?? err ?? '')
  return /TypeError|Load failed|NetworkError|Failed to fetch|fetch failed|Network request failed/i.test(message)
}

async function logJourneyEvent(
  supabase: ReturnType<typeof createClient>,
  journeyId: string,
  callSign: CallSignKey,
  notes: string | null | undefined,
  userId: string | null,
  at: string
) {
  const dbValue = CALL_SIGN_KEY_TO_DB[callSign]
  if (!dbValue) return // 'completed' and others are not call_sign enum values – skip
  // Attribute the broadcast to the reporting officer so the Ops Monitor can show
  // who sent it. This is the ONLY signal event-only call signs (traffic/route)
  // emit — the journeys.status row doesn't change — so it must not be dropped.
  const { error } = await (supabase as any).from('journey_events').insert({
    journey_id: journeyId,
    event_type: dbValue,        // call_sign enum (Title Case) ✓
    description: notes ?? null,
    triggered_by: userId,
    triggered_at: at,
  })
  if (error) throw error   // surfaced by caller; event-only signs depend on this
}

interface UpdateVariables {
  /** A call sign, or — for Undo only — any journey_status value (e.g. 'planned'). */
  callSign: CallSignKey | string
  notes?: string
  /** Restoring the previous status: no event row, no further Undo offered. */
  isUndo?: boolean
  /** Status before this update, used to offer Undo for routine movement signs. */
  previousStatus?: string | null
  /** Offer a 5s Undo toast instead of the plain success toast. */
  undoable?: boolean
}

export interface UpdateResult {
  callSign: string
  isEventOnly: boolean
  queued: boolean
}

export interface UseJourneyStatusOptions {
  /** Called after any status write settles successfully (sent or queued). */
  onChanged?: () => void
}

export function useJourneyStatus(journeyId: string, options: UseJourneyStatusOptions = {}) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  // A stable unique suffix so two components watching the same journey (or a
  // remount racing the previous unmount's removeChannel) never share a topic.
  const [channelSuffix] = useState(() => Math.random().toString(36).slice(2, 10))
  const onChangedRef = useRef(options.onChanged)
  useEffect(() => { onChangedRef.current = options.onChanged }, [options.onChanged])
  // Double taps on a phone fire two clicks before React re-renders the
  // disabled state — this ref is the guard that actually stops the duplicate.
  const inFlight = useRef(false)

  // 1. Fetch Status with React Query
  const { data, isLoading } = useQuery({
    queryKey: ['journeyStatus', journeyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('journeys')
        .select('status, updated_at, status_updated_at')
        .eq('id', journeyId)
        .single()
      if (error) throw error
      return data as { status: string; updated_at: string | null; status_updated_at: string | null }
    },
    enabled: !!journeyId
  })

  // 2. Realtime Subscriptions targeting the Query Cache
  useEffect(() => {
    if (!journeyId) return
    const channel = supabase
      .channel(`journey-status-${journeyId}-${channelSuffix}`)
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
            updated_at: payload.new.updated_at,
            status_updated_at: payload.new.status_updated_at ?? null,
          })
          queryClient.invalidateQueries({ queryKey: ['journeys'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [journeyId, supabase, queryClient, channelSuffix])

  // 3. React Query Mutations for status updates
  const updateMutation = useMutation({
    mutationFn: async ({ callSign, notes, isUndo }: UpdateVariables): Promise<UpdateResult> => {
      const isEventOnly = EVENT_CALL_SIGNS.includes(callSign as CallSignKey)
      const now = new Date().toISOString()
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user.id ?? null
      let queued = false

      try {
        if (!isEventOnly) {
          // Only update columns that actually exist in the journeys schema.
          // NOTE: actual_departure / actual_arrival do NOT exist — do NOT include them.
          const updates: Record<string, any> = {
            status: callSign,                   // journey_status enum (underscores ✓)
            status_updated_at: now,             // Ops Monitor "last update" clock
            updated_at: now,
          }

          const { error } = await (supabase as any)
            .from('journeys')
            .update(updates)
            .eq('id', journeyId)

          if (error) throw error

          // Event log is secondary for status signs — the status row already
          // changed and drives the UI, so a failed log here is non-fatal.
          // An Undo is a correction, not a new SITREP, so it is not logged.
          if (!isUndo) {
            try {
              await logJourneyEvent(supabase, journeyId, callSign as CallSignKey, notes, userId, now)
            } catch (e) {
              console.warn('journey_events log failed (non-critical):', e)
            }
          }
        } else {
          // For event-only broadcasts (traffic / route change) the journey_events
          // row IS the whole signal — nothing else changes — so a failure here
          // must surface to the officer, not be swallowed.
          await logJourneyEvent(supabase, journeyId, callSign as CallSignKey, notes, userId, now)
        }
      } catch (err: any) {
        if (!isNetworkFailure(err)) throw err
        if (!isEventOnly) {
          await offlineQueue.addToQueue('journey_update', {
            id: journeyId,
            // status_updated_at lets the replay skip this if a newer status
            // reached the server while the device was offline.
            updates: { status: callSign, status_updated_at: now, updated_at: now },
            isEmergency: callSign === 'broken_arrow'
          })
        }
        const dbValue = CALL_SIGN_KEY_TO_DB[callSign as CallSignKey]
        if (dbValue && !isUndo) {
          await offlineQueue.addToQueue('journey_event', {
            journey_id: journeyId,
            event_type: dbValue,
            description: notes ?? null,
            triggered_by: userId,
            triggered_at: now,
            isEmergency: callSign === 'broken_arrow',
          })
        }
        queued = true
      }

      // ── Auto-log Broken Arrow to incidents ─────────────────────────────────
      // Creates a CRITICAL incident record automatically so the Incidents page
      // always has a timestamped record with full context. Queued with the
      // status when offline, so the distress record is never lost.
      if (callSign === 'broken_arrow' && !isUndo) {
        const incident = {
          journey_id: journeyId,
          type: 'BROKEN ARROW',
          severity: 'critical',
          description: `BROKEN ARROW automatically declared by duty officer. Major incident — Cheetah immobilized. Auto-logged at ${new Date(now).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}.`,
          status: 'open',
          reported_by: userId,
          created_by: userId,
        }
        try {
          if (queued) {
            await offlineQueue.addToQueue('incident', { ...incident, isEmergency: true })
          } else {
            const { error } = await (supabase as any).from('incidents').insert(incident)
            if (error) throw error
          }
        } catch (e) {
          if (!queued && isNetworkFailure(e)) {
            try {
              await offlineQueue.addToQueue('incident', { ...incident, isEmergency: true })
            } catch (queueError) {
              console.warn('Auto-incident queue failed:', queueError)
            }
          } else {
            console.warn('Auto-incident log failed (non-critical):', e)
          }
        }
      }

      return { callSign, isEventOnly, queued }
    },
    onMutate: async ({ callSign }) => {
      const isEventOnly = EVENT_CALL_SIGNS.includes(callSign as CallSignKey)
      if (isEventOnly) return

      // Optimistic Update
      await queryClient.cancelQueries({ queryKey: ['journeyStatus', journeyId] })
      const previousState = queryClient.getQueryData(['journeyStatus', journeyId])
      const now = new Date().toISOString()

      queryClient.setQueryData(['journeyStatus', journeyId], {
        status: callSign,
        updated_at: now,
        status_updated_at: now,
      })

      return { previousState }
    },
    onError: (err: any, variables, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(['journeyStatus', journeyId], context.previousState)
      }
      console.error('Call sign update failed:', err)
      const label = variables.isUndo ? 'Undo' : getCallSignLabel(variables.callSign)
      toast.error(`${label} failed to send`, {
        description: err?.message ? String(err.message).slice(0, 120) : 'Check your connection or permissions and retry.',
      })
    },
    onSuccess: (result, variables) => {
      onChangedRef.current?.()
      const label = getCallSignLabel(result.callSign)
      if (result.queued) {
        toast.info(OFFLINE_SAVED_MESSAGE, { description: variables.isUndo ? 'Undo' : label })
        return
      }
      if (variables.isUndo) {
        toast.success(`Restored ${getCallSignLabel(result.callSign).replace(/_/g, ' ')}`)
        return
      }
      if (result.isEventOnly) {
        toast.success(`📡 ${label} broadcast — relayed to Ops Monitor`)
        return
      }
      const previous = variables.previousStatus
      if (variables.undoable && previous && previous !== result.callSign) {
        toast.success(`${label} — call sign relayed`, {
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () => {
              if (inFlight.current) return
              inFlight.current = true
              updateMutation.mutate(
                { callSign: previous, isUndo: true },
                { onSettled: () => { inFlight.current = false } }
              )
            },
          },
        })
        return
      }
      toast.success(`${label} — call sign relayed`)
    }
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      // NOTE: actual_arrival does NOT exist in the journeys schema — omitted.
      const { data: { user } } = await supabase.auth.getUser()
      const now = new Date().toISOString()
      const { error } = await (supabase as any)
        .from('journeys')
        .update({
          status: 'completed',
          status_updated_at: now,
          completed_at: now,               // after-op reporting relies on this
          completed_by: user?.id ?? null,
          updated_at: now,
        })
        .eq('id', journeyId)

      if (error) throw error

      // 'completed' is not a call_sign enum value so we skip journey_events for completion
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['journeyStatus', journeyId] })
      const previousState = queryClient.getQueryData(['journeyStatus', journeyId])
      const now = new Date().toISOString()
      queryClient.setQueryData(['journeyStatus', journeyId], {
        status: 'completed',
        updated_at: now,
        status_updated_at: now,
      })
      return { previousState }
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['journeyStatus', journeyId], context?.previousState)
      toast.error(isNetworkFailure(err)
        ? 'No connection — journey not completed. Retry when back online.'
        : 'Failed to complete journey')
    },
    onSuccess: () => {
      onChangedRef.current?.()
      toast.success('Journey marked as complete')
    }
  })

  /**
   * Send a call sign. Resolves with the result (or null when it failed or a
   * send was already in flight). Pass `undoable` for routine movement signs.
   */
  const updateStatus = useCallback(async (
    callSign: CallSignKey,
    notes?: string,
    opts: { undoable?: boolean } = {}
  ): Promise<UpdateResult | null> => {
    // Distress always goes through — a routine send hanging on a bad network
    // must never be what stops a Broken Arrow.
    const isDistress = callSign === 'broken_arrow'
    if (inFlight.current && !isDistress) return null
    inFlight.current = true
    try {
      const previousStatus = (queryClient.getQueryData(['journeyStatus', journeyId]) as { status?: string } | undefined)?.status ?? null
      return await updateMutation.mutateAsync({ callSign, notes, previousStatus, undoable: opts.undoable })
    } catch {
      return null // already surfaced by onError
    } finally {
      inFlight.current = false
    }
  }, [updateMutation, queryClient, journeyId])

  const completeJourney = useCallback(async () => {
    if (inFlight.current) return
    if (!await confirm({ message: 'Mark this journey as complete?', confirmText: 'Complete', variant: 'default' })) return
    inFlight.current = true
    completeMutation.mutate(undefined, { onSettled: () => { inFlight.current = false } })
  }, [completeMutation, confirm])

  return {
    status: data?.status || null,
    lastUpdated: data?.status_updated_at || data?.updated_at || null,
    loading: isLoading || updateMutation.isPending || completeMutation.isPending,
    sending: updateMutation.isPending || completeMutation.isPending,
    updateStatus,
    completeJourney
  }
}
