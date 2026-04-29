"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import CallSignPanel from '@/components/operations/CallSignPanel'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Radio, MapPin, Car, User, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { notificationService } from '@/lib/services/notificationService'
import { toast } from 'sonner'

interface Journey {
  id: string
  status: string
  origin: string
  destination: string
  scheduled_departure: string | null
  etd: string | null
  eta: string | null
  notes: string | null
  assigned_duty_officer_id: string | null
  papas: { full_name: string; title: string } | null
  cheetahs: { call_sign: string | null; registration_number: string } | null
  nests: { name: string } | null
  eagle_squares: { name: string; code: string } | null
}

export default function MyOperationsPage() {
  const supabase = createClient()
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null)
  const knownIds = useRef<Set<string>>(new Set())

  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  const loadJourneys = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user role
      const { data: userData } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', user.id)
        .single()

      setUserId(user.id)
      setUserRole((userData as any)?.role ?? null)

      const isAdmin = ['super_admin', 'dev_admin', 'admin'].includes((userData as any)?.role)

      // Get program IDs where this user is assigned
      const { data: assignments } = await (supabase as any)
        .from('current_title_assignments')
        .select('program_id')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const programIds: string[] = (assignments || [])
        .map((a: any) => a.program_id)
        .filter(Boolean)

      // Build journey query — include journeys the user is DO for OR in their assigned programs
      let query = (supabase as any)
        .from('journeys')
        .select(`
          id, status, origin, destination,
          scheduled_departure, etd, eta, notes,
          assigned_duty_officer_id,
          papas:papas!papa_id(full_name, title),
          cheetahs:cheetahs!assigned_cheetah_id(call_sign, registration_number),
          nests:nests!assigned_nest_id(name),
          eagle_squares:eagle_squares!assigned_eagle_square_id(name, code)
        `)
        .not('status', 'in', '(completed,cancelled)')
        .order('etd', { ascending: true, nullsFirst: false })

      if (!isAdmin) {
        // Build OR filter: direct DO assignment OR in assigned programs
        const filters: string[] = [`assigned_duty_officer_id.eq.${user.id}`]
        if (programIds.length > 0) {
          filters.push(`program_id.in.(${programIds.join(',')})`)
        }
        query = query.or(filters.join(','))
      }

      const { data, error } = await query
      if (error) throw error

      const incoming = (data || []) as unknown as Journey[]

      // Detect newly assigned journeys
      if (!isInitial && knownIds.current.size > 0) {
        for (const j of incoming) {
          if (!knownIds.current.has(j.id)) {
            const papa = j.papas?.full_name || 'Unknown Papa'
            toast.info(`📋 New assignment: ${papa}`, { description: `${j.origin} → ${j.destination}`, duration: 8000 })
            void notificationService.notifyAssignment(
              `Assignment: ${papa}`,
              `New journey. ${j.origin} → ${j.destination}`
            )
          }
        }
      }

      knownIds.current = new Set(incoming.map(j => j.id))
      setJourneys(incoming)

      if (isInitial && incoming.length > 0) {
        setSelectedJourneyId(incoming[0].id)
      }
    } catch (err) {
      console.error('Error loading operations:', err)
      if (isInitial) toast.error('Failed to load operations')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [supabase])



  useEffect(() => {
    const init = async () => {
      await loadJourneys(true)

      const channel = supabase
        .channel('my-operations-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, () => {
          void loadJourneys(false)
        })
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }
    void init()
  }, [loadJourneys, supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (journeys.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Operations</h1>
          <p className="text-muted-foreground">Your active journey assignments and call sign controls</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Radio className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Active Assignments</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              You have no active journey assignments. Contact your Tango Oscar or Captain to receive an assignment.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const selectedJourney = journeys.find(j => j.id === selectedJourneyId) ?? journeys[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Operations</h1>
          <p className="text-muted-foreground">Execute call signs and manage your assigned journeys</p>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1 mt-1">
          <Radio className="h-3 w-3 animate-pulse text-green-500" />
          {journeys.length} Active
        </Badge>
      </div>

      {/* Journey tabs (if multiple) */}
      {journeys.length > 1 ? (
        <Tabs value={selectedJourneyId ?? journeys[0].id} onValueChange={setSelectedJourneyId}>
          <TabsList className="h-auto flex-wrap gap-1">
            {journeys.map(j => (
              <TabsTrigger key={j.id} value={j.id} className="text-xs">
                {j.papas?.title} {j.papas?.full_name ?? 'Journey'}
              </TabsTrigger>
            ))}
          </TabsList>

          {journeys.map(j => (
            <TabsContent key={j.id} value={j.id}>
              <JourneyOperationsPanel journey={j} currentUserId={userId} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <JourneyOperationsPanel journey={selectedJourney} currentUserId={userId} />
      )}
    </div>
  )
}

// ─── Sub-panel for one journey ─────────────────────────────────────────────

function JourneyOperationsPanel({ journey, currentUserId }: { journey: Journey; currentUserId: string | null }) {
  const isDO = journey.assigned_duty_officer_id === currentUserId

  return (
    <div className="space-y-4">
      {/* Journey summary card */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Papa</p>
                <p className="font-semibold">
                  {journey.papas?.title} {journey.papas?.full_name ?? '—'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Car className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Cheetah</p>
                <p className="font-semibold">{journey.cheetahs?.call_sign ?? journey.cheetahs?.registration_number ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Route</p>
                <p className="font-semibold text-xs">{journey.origin} &rarr; {journey.destination}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">ETD / ETA</p>
                <p className="font-semibold text-xs">
                  {journey.etd ? format(new Date(journey.etd), 'HH:mm') : '—'} / {journey.eta ? format(new Date(journey.eta), 'HH:mm') : '—'}
                </p>
              </div>
            </div>
          </div>

          {(journey.nests || journey.eagle_squares) && (
            <div className="mt-3 pt-3 border-t border-primary/10 flex gap-4 text-xs text-muted-foreground">
              {journey.nests && <span>Nest: {journey.nests.name}</span>}
              {journey.eagle_squares && <span>Eagle Square: {journey.eagle_squares.name}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CallSignPanel only for the assigned Delta Oscar */}
      {isDO ? (
        <CallSignPanel
          journeyId={journey.id}
          papaName={journey.papas ? `${journey.papas.title} ${journey.papas.full_name}` : undefined}
          cheetahName={journey.cheetahs?.call_sign ?? journey.cheetahs?.registration_number ?? undefined}
          origin={journey.origin}
          destination={journey.destination}
        />
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <Radio className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">Journey Update Panel</p>
            <p className="text-xs mt-1">Only the assigned Delta Oscar can update this journey&apos;s call sign status.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
