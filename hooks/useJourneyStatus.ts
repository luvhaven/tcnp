"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { CallSignKey } from '@/lib/constants/call-signs'

/**
 * Status-advancing call signs (update the journey's main status)
 */
export const STATUS_CALL_SIGNS: CallSignKey[] = [
  'first_course',
  'cocktail',
  'chapman',
  'dessert',
]

/**
 * Event-only call signs (broadcast without changing main journey status)
 */
export const EVENT_CALL_SIGNS: CallSignKey[] = [
  'blue_cocktail',
  'red_cocktail',
  're_order',
]

export function useJourneyStatus(journeyId: string) {
  const supabase = createClient()
  const [status, setStatus] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Load initial status + realtime subscription
  useEffect(() => {
    if (!journeyId) return
    let mounted = true

    const loadStatus = async () => {
      const { data, error } = await supabase
        .from('journeys')
        .select('status, updated_at')
        .eq('id', journeyId)
        .single()

      if (!mounted || error) return

      const row = data as { status: string; updated_at: string | null }
      setStatus(row.status)
      setLastUpdated(row.updated_at)
    }

    void loadStatus()

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
          if (!mounted) return
          setStatus(payload.new.status)
          setLastUpdated(payload.new.updated_at)
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [journeyId, supabase])

  /**
   * updateStatus — advances the journey status (status-advancing call signs)
   * or records an event-only call sign without changing status
   */
  const updateStatus = useCallback(async (callSign: CallSignKey, notes?: string) => {
    if (!journeyId) return
    setLoading(true)

    const isEventOnly = EVENT_CALL_SIGNS.includes(callSign)
    const previousStatus = status
    const previousTime = lastUpdated

    if (!isEventOnly) {
      // Optimistic status update
      setStatus(callSign)
      setLastUpdated(new Date().toISOString())
    }

    try {
      if (!isEventOnly) {
        // Update journey status and timestamp
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

      // Always log the event (status advance OR event-only broadcast)
      await (supabase as any).from('journey_events').insert({
        journey_id: journeyId,
        event_type: callSign,
        description: notes || null,
        triggered_at: new Date().toISOString(),
      })

      const label = callSign.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      toast.success(`${label} — call sign executed`)
    } catch (error: any) {
      console.error('Error updating status:', error)
      toast.error(error.message || 'Failed to update call sign')
      // Revert optimistic update
      if (!isEventOnly) {
        setStatus(previousStatus)
        setLastUpdated(previousTime)
      }
    } finally {
      setLoading(false)
    }
  }, [journeyId, status, lastUpdated, supabase])

  const completeJourney = useCallback(async () => {
    if (!journeyId) return
    if (!confirm('Mark this journey as complete?')) return

    setLoading(true)
    try {
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

      setStatus('completed')
      toast.success('Journey marked as complete')
    } catch (error: any) {
      console.error('Error completing journey:', error)
      toast.error('Failed to complete journey')
    } finally {
      setLoading(false)
    }
  }, [journeyId, supabase])

  return { status, lastUpdated, loading, updateStatus, completeJourney }
}
