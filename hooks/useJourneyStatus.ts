"use client"

import { useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
          // Immediately update React Query Cache upon realtime event
          queryClient.setQueryData(['journeyStatus', journeyId], {
            status: payload.new.status,
            updated_at: payload.new.updated_at
          })
          // Also invalidate list views so other components stay fresh
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

      if (!isEventOnly) {
        const updates: Record<string, any> = {
          status: callSign,
          updated_at: new Date().toISOString(),
        }
        if (callSign === 'first_course' || callSign === 'cocktail') {
          updates.actual_departure = new Date().toISOString()
        }
        if (callSign === 'chapman') {
          updates.actual_arrival = new Date().toISOString()
        }

        const { error } = await (supabase as any)
          .from('journeys')
          .update(updates)
          .eq('id', journeyId)

        if (error) throw error
      }

      await (supabase as any).from('journey_events').insert({
        journey_id: journeyId,
        event_type: callSign,
        description: notes || null,
        triggered_at: new Date().toISOString(),
      })

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
      toast.error('Failed to update call sign')
    },
    onSuccess: (result) => {
      const label = result.callSign.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      toast.success(`${label} – call sign executed`)
    }
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('journeys')
        .update({
          status: 'completed',
          actual_arrival: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', journeyId)

      if (error) throw error

      await (supabase as any).from('journey_events').insert({
        journey_id: journeyId,
        event_type: 'completed',
        description: 'Journey completed',
        triggered_at: new Date().toISOString(),
      })
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
