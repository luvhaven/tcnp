'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, BookOpen } from 'lucide-react'
import PapaBriefingCard, { type PapaBriefingPapa } from './PapaBriefingCard'
import { getBriefingConfig, canEditBriefing } from '@/lib/constants/papaBriefingFields'

interface PapaBriefingsSectionProps {
  /** The viewing user's role — determines which fields to show */
  role: string
}

export default function PapaBriefingsSection({ role }: PapaBriefingsSectionProps) {
  const supabase = createClient()
  const [papas, setPapas] = useState<PapaBriefingPapa[]>([])
  const [loading, setLoading] = useState(true)

  const config = getBriefingConfig(role)
  const canEdit = canEditBriefing(role)

  const loadPapas = useCallback(async () => {
    try {
      // Get user's assigned program IDs
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: assignments } = await (supabase as any)
        .from('current_title_assignments')
        .select('program_id')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const programIds = (assignments || []).map((a: any) => a.program_id).filter(Boolean)

      // Fetch papas in those programs (active only — not cancelled/completed)
      let query = (supabase as any)
        .from('papas')
        .select(`
          id, title, full_name, profile_photo_url, organization, position,
          mic_preference, presentation_style, has_slides, uses_stage_props, speaking_schedule,
          accommodation_preferences, accommodations, entourage_size, entourage_count, personal_assistants,
          food_preferences, dietary_restrictions, needs_water_on_stage, water_temperature, needs_face_towels,
          flight_number, airline, flight_provider, flight_arrival_time, flight_departure_time,
          arrival_country, arrival_city, arrival_date, departure_date, passport_number,
          special_requirements, notes
        `)
        .order('full_name')

      if (programIds.length > 0) {
        query = query.in('program_id', programIds)
      } else {
        // No program assignment — show nothing
        setPapas([])
        return
      }

      const { data, error } = await query
      if (error) throw error
      setPapas(data || [])
    } catch (err) {
      console.error('PapaBriefingsSection load error:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadPapas()
  }, [loadPapas])

  if (!config) return null // role has no briefing config

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{config.sectionTitle}</h2>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        {canEdit && (
          <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
            Team Lead — Edit enabled
          </span>
        )}
      </div>

      {/* Papa cards */}
      {papas.length === 0 ? (
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
