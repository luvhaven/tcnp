"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { CallSignKey } from '@/lib/constants/call-signs'

export function useJourneyStatus(journeyId: string) {
    const supabase = createClient()
    const [status, setStatus] = useState<CallSignKey | null>(null)
    const [lastUpdated, setLastUpdated] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    // Load initial status
    useEffect(() => {
        if (!journeyId) return

        let mounted = true

        const loadStatus = async () => {
            const { data, error } = await supabase
                .from('journeys')
                .select('current_status, status_updated_at, current_call_sign')
                .eq('id', journeyId)
                .single()

            if (!mounted) return

            if (error) {
                console.error('Error loading journey status:', error)
                return
            }

            if (data) {
                const journeyData = data as { current_status: string, status_updated_at: string, current_call_sign: string | null }
                // Prefer current_call_sign if available as it's more granular
                setStatus((journeyData.current_call_sign || journeyData.current_status) as CallSignKey)
                setLastUpdated(journeyData.status_updated_at)
            }
        }

        void loadStatus()

        // Subscribe to real-time updates
        const channel = supabase
            .channel(`journey-status-${journeyId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'journeys',
                    filter: `id=eq.${journeyId}`
                },
                (payload) => {
                    if (!mounted) return
                    const newRow = payload.new
                    // Prefer current_call_sign
                    const newStatus = (newRow.current_call_sign || newRow.current_status) as CallSignKey
                    const newTime = newRow.status_updated_at

                    setStatus(newStatus)
                    setLastUpdated(newTime)
                }
            )
            .subscribe()

        return () => {
            mounted = false
            supabase.removeChannel(channel)
        }
    }, [journeyId, supabase])

    const updateStatus = useCallback(async (newStatus: CallSignKey, notes?: string) => {
        if (!journeyId) return

        setLoading(true)
        // Optimistic update
        const previousStatus = status
        const previousTime = lastUpdated
        setStatus(newStatus)
        setLastUpdated(new Date().toISOString())

        try {
            const { error } = await (supabase as any).rpc('update_journey_status', {
                p_journey_id: journeyId,
                p_status: newStatus,
                p_notes: notes
            })

            if (error) throw error

            toast.success(`Status updated to ${newStatus.replace('_', ' ').toUpperCase()}`)
        } catch (error) {
            console.error('Error updating status:', error)
            toast.error('Failed to update status')
            // Revert optimistic update
            setStatus(previousStatus)
            setLastUpdated(previousTime)
        } finally {
            setLoading(false)
        }
    }, [journeyId, status, lastUpdated, supabase])

    const completeJourney = useCallback(async () => {
        if (!journeyId) return

        if (!confirm('Are you sure you want to mark this journey as complete?')) return

        setLoading(true)
        try {
            const { error } = await (supabase as any).rpc('complete_journey', {
                p_journey_id: journeyId
            })

            if (error) throw error

            toast.success('Journey marked as complete')
            setStatus('completed' as any) // Special status
        } catch (error) {
            console.error('Error completing journey:', error)
            toast.error('Failed to complete journey')
        } finally {
            setLoading(false)
        }
    }, [journeyId, supabase])

    return {
        status,
        lastUpdated,
        loading,
        updateStatus,
        completeJourney
    }
}
