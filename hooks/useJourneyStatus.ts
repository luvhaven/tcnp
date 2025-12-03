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

        const loadStatus = async () => {
            const { data, error } = await supabase
                .from('journeys')
                .select('current_status, status_updated_at')
                .eq('id', journeyId)
                .single()

            if (error) {
                console.error('Error loading journey status:', error)
                return
            }

            if (data) {
                setStatus(data.current_status as CallSignKey)
                setLastUpdated(data.status_updated_at)
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
                    const newStatus = payload.new.current_status as CallSignKey
                    const newTime = payload.new.status_updated_at
                    setStatus(newStatus)
                    setLastUpdated(newTime)
                }
            )
            .subscribe()

        return () => {
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
            const { error } = await supabase.rpc('update_journey_status', {
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
            const { error } = await supabase.rpc('complete_journey', {
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
