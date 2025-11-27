'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  User,
  MapPin,
  Calendar,
  Phone,
  Mail,
  FileText,
  Navigation,
  Hotel,
  Plane,
  Car,
  MessageCircle
} from 'lucide-react'
import { toast } from 'sonner'
import CallSignUpdater from '@/components/journeys/CallSignUpdater'
import { formatDistanceToNow } from 'date-fns'
import { getCallSignLabel } from '@/lib/constants/tncpCallSigns'

type Journey = {
  id: string
  papa_id: string
  status: string
  origin: string
  destination: string
  scheduled_departure: string
  scheduled_arrival: string | null
  actual_departure: string | null
  actual_arrival: string | null
  notes: string | null
  eta: string | null
  etd: string | null
  papas?: {
    id: string
    full_name: string
    title?: string
    phone?: string
    email?: string
    nationality?: string
    special_requirements?: string
    notes?: string
  }
  cheetahs?: {
    id: string
    call_sign?: string
    registration_number?: string
    driver_name?: string
    driver_phone?: string
  }
  nests?: {
    id: string
    name: string
    address: string
    city?: string
    contact?: string
    email?: string
  }
  eagle_squares?: {
    id: string
    name: string
    code: string
    city: string
    country: string
    contact?: string
  }
}

type JourneyEvent = {
  id: string
  journey_id: string
  event_type: string
  description: string | null
  triggered_at: string | null
}

export default function MyAssignmentsPage() {
  const supabase = createClient()
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [journeyEvents, setJourneyEvents] = useState<Record<string, JourneyEvent[]>>({})

  useEffect(() => {
    loadCurrentUser()
    loadAssignments()
  }, [])

  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('id, full_name, oscar, role')
          .eq('id', user.id)
          .single()
        setCurrentUser(data)
      }
    } catch (error) {
      console.error('Error loading current user:', error)
    }
  }

  const loadAssignments = async () => {
    try {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load journeys assigned to current user
      const { data, error } = await supabase
        .from('journeys')
        .select(`
          *,
          papas:papas!papa_id (
            id,
            full_name,
            title,
            phone,
            email,
            nationality,
            special_requirements,
            notes
          ),
          cheetahs:cheetahs!assigned_cheetah_id (
            id,
            call_sign,
            registration_number,
            driver_name,
            driver_phone
          ),
          nests:nests!assigned_nest_id (
            id,
            name,
            address,
            city,
            contact,
            email
          ),
          eagle_squares:eagle_squares!assigned_eagle_square_id (
            id,
            name,
            code,
            city,
            country,
            contact
          )
        `)
        .eq('assigned_do_id', user.id)
        .order('etd', { ascending: true, nullsFirst: false })

      if (error) throw error

      console.log('✅ Loaded assignments:', data)
      setJourneys(data || [])

      if (data && data.length > 0) {
        const journeyIds = (data as any[]).map((j) => j.id)

        const { data: events, error: eventsError } = await supabase
          .from('journey_events')
          .select('id, journey_id, event_type, description, triggered_at')
          .in('journey_id', journeyIds)
          .order('triggered_at', { ascending: false })

        if (eventsError) {
          console.error('Error loading journey events:', eventsError)
        } else if (events) {
          const grouped: Record<string, JourneyEvent[]> = {}
          for (const event of events as any[]) {
            if (!grouped[event.journey_id]) grouped[event.journey_id] = []
            grouped[event.journey_id].push(event as JourneyEvent)
          }
          setJourneyEvents(grouped)
        }
      } else {
        setJourneyEvents({})
      }
    } catch (error) {
      console.error('Error loading assignments:', error)
      toast.error('Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }

  const activeJourneys = journeys.filter(j =>
    ['planned', 'first_course', 'in_progress'].includes(j.status)
  )

  const completedJourneys = journeys.filter(j =>
    ['completed', 'cancelled'].includes(j.status)
  )

  const getEventLabel = (eventType: string) => {
    return getCallSignLabel(eventType) || eventType
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div>
          <div className="h-8 w-56 rounded-md skeleton" />
          <div className="mt-2 h-4 w-80 rounded-md skeleton" />
        </div>

        {/* Tabs skeleton */}
        <div className="flex gap-2">
          <div className="h-9 w-36 rounded-md skeleton" />
          <div className="h-9 w-40 rounded-md skeleton" />
        </div>

        {/* Journey cards skeleton */}
        <div className="space-y-6">
          {[...Array(2)].map((_, index) => (
            <div key={index} className="space-y-4">
              {/* Call-Sign Updater skeleton */}
              <Card>
                <CardHeader>
                  <div className="h-5 w-40 rounded-md skeleton" />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-9 rounded-md skeleton" />
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Papa Details skeleton */}
              <Card>
                <CardHeader>
                  <div className="h-5 w-32 rounded-md skeleton" />
                  <div className="mt-2 h-4 w-48 rounded-md skeleton" />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-3 w-20 rounded-md skeleton" />
                        <div className="h-4 w-32 rounded-md skeleton" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Communication skeleton */}
              <Card>
                <CardHeader>
                  <div className="h-5 w-48 rounded-md skeleton" />
                  <div className="mt-2 h-4 w-56 rounded-md skeleton" />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-9 rounded-md skeleton" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">My Assignments</h1>
        <p className="text-muted-foreground mt-2">
          {currentUser?.oscar && (
            <Badge variant="outline" className="mr-2">
              {currentUser.oscar}
            </Badge>
          )}
          Manage your assigned journeys and papa details
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Active Journeys</CardDescription>
            <CardTitle className="text-3xl">{activeJourneys.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl">{completedJourneys.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-3">
            <CardDescription>Total Assignments</CardDescription>
            <CardTitle className="text-3xl">{journeys.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">
            Active Journeys ({activeJourneys.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedJourneys.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeJourneys.length === 0 ? (
            <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Navigation className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">No active journeys assigned</p>
              </CardContent>
            </Card>
          ) : (
            activeJourneys.map((journey) => (
              <div key={journey.id} className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-slide-up">
                {/* Journey Status Card */}
                <CallSignUpdater journey={journey} onUpdate={loadAssignments} />

                {/* Papa & Cheetah Details Card */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Papa & Cheetah Details</CardTitle>
                        <CardDescription>Context for your current assignment</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {journey.cheetahs && (
                      <div className="p-3 bg-muted/50 rounded-lg text-xs">
                        <p className="font-semibold mb-1 flex items-center gap-2">
                          <Car className="h-3 w-3" /> Assigned Cheetah
                        </p>
                        <p className="text-sm">
                          {journey.cheetahs.call_sign || 'Unassigned'}
                          {journey.cheetahs.registration_number && ` • ${journey.cheetahs.registration_number}`}
                        </p>
                        {(journey.cheetahs.driver_name || journey.cheetahs.driver_phone) && (
                          <p className="mt-1 text-muted-foreground">
                            Driver: {journey.cheetahs.driver_name || 'N/A'}
                            {journey.cheetahs.driver_phone && ` • ${journey.cheetahs.driver_phone}`}
                          </p>
                        )}
                      </div>
                    )}

                    {journey.nests && (
                      <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg text-xs">
                        <p className="font-semibold mb-1 flex items-center gap-2 text-blue-700 dark:text-blue-300">
                          <Hotel className="h-3 w-3" /> Assigned Nest
                        </p>
                        <p className="text-sm font-medium">{journey.nests.name}</p>
                        <p className="text-muted-foreground">{journey.nests.address}</p>
                        {journey.nests.contact && (
                          <p className="mt-1 text-muted-foreground">Contact: {journey.nests.contact}</p>
                        )}
                      </div>
                    )}

                    {journey.eagle_squares && (
                      <div className="p-3 bg-sky-50/50 dark:bg-sky-900/10 rounded-lg text-xs">
                        <p className="font-semibold mb-1 flex items-center gap-2 text-sky-700 dark:text-sky-300">
                          <Plane className="h-3 w-3" /> Eagle Square
                        </p>
                        <p className="text-sm font-medium">{journey.eagle_squares.name} ({journey.eagle_squares.code})</p>
                        <p className="text-muted-foreground">{journey.eagle_squares.city}, {journey.eagle_squares.country}</p>
                      </div>
                    )}

                    {journey.papas ? (
                      <>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Name</p>
                            <p className="text-base font-semibold">
                              {journey.papas.title && `${journey.papas.title} `}
                              {journey.papas.full_name}
                            </p>
                          </div>

                          {journey.papas.nationality && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Nationality</p>
                              <p className="text-sm">{journey.papas.nationality}</p>
                            </div>
                          )}

                          {journey.papas.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <a href={`tel:${journey.papas.phone}`} className="text-sm hover:underline">
                                {journey.papas.phone}
                              </a>
                            </div>
                          )}

                          {journey.papas.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <a href={`mailto:${journey.papas.email}`} className="text-sm hover:underline">
                                {journey.papas.email}
                              </a>
                            </div>
                          )}

                          {journey.papas.special_requirements && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-xs font-semibold text-amber-900 mb-1">Special Requirements</p>
                              <p className="text-sm text-amber-800">{journey.papas.special_requirements}</p>
                            </div>
                          )}

                          {journey.papas.notes && (
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <p className="text-xs font-semibold">Notes</p>
                              </div>
                              <p className="text-sm text-muted-foreground">{journey.papas.notes}</p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Papa details not available</p>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Communication Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MessageCircle className="h-5 w-5" />
                      Quick Communication
                    </CardTitle>
                    <CardDescription>Contact team members about this journey</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="justify-start"
                      >
                        <a href={`/chat?message=Regarding ${journey.papas?.full_name || 'journey'}: `}>
                          <User className="h-4 w-4 mr-2" />
                          Contact Admin
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="justify-start"
                      >
                        <a href={`/chat?message=Command - Journey for ${journey.papas?.full_name || 'Papa'}: `}>
                          <Navigation className="h-4 w-4 mr-2" />
                          Contact Command
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="justify-start"
                      >
                        <a href={`/chat?message=HOP - Need assistance with ${journey.papas?.full_name || 'journey'}: `}>
                          <User className="h-4 w-4 mr-2" />
                          Contact HOP
                        </a>
                      </Button>
                      {journey.cheetahs && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="justify-start"
                        >
                          <a href={`/chat?message=Tango - ${journey.cheetahs.call_sign} for ${journey.papas?.full_name || 'Papa'}: `}>
                            <Car className="h-4 w-4 mr-2" />
                            Contact Tango
                          </a>
                        </Button>
                      )}
                      {journey.nests && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="justify-start"
                        >
                          <a href={`/chat?message=Nest - ${journey.nests.name} for ${journey.papas?.full_name || 'Papa'}: `}>
                            <Hotel className="h-4 w-4 mr-2" />
                            Contact Nest
                          </a>
                        </Button>
                      )}
                      {journey.eagle_squares && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="justify-start"
                        >
                          <a href={`/chat?message=Eagle - ${journey.eagle_squares.code} for ${journey.papas?.full_name || 'Papa'}: `}>
                            <Plane className="h-4 w-4 mr-2" />
                            Contact Eagle
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Call-Sign History Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Call-Sign History</CardTitle>
                    <CardDescription>Recent updates you've made on this journey</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {journeyEvents[journey.id]?.length ? (
                      journeyEvents[journey.id].slice(0, 3).map((event) => (
                        <div key={event.id} className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{getEventLabel(event.event_type)}</p>
                            {event.description && (
                              <p className="text-xs text-muted-foreground">{event.description}</p>
                            )}
                          </div>
                          {event.triggered_at && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(event.triggered_at), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No call-sign history yet for this journey.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedJourneys.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">No completed journeys</p>
              </CardContent>
            </Card>
          ) : (
            completedJourneys.map((journey) => (
              <Card key={journey.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{journey.papas?.full_name || 'Unknown Papa'}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <MapPin className="h-3 w-3" />
                        {journey.origin} → {journey.destination}
                      </CardDescription>
                    </div>
                    <Badge variant={journey.status === 'completed' ? 'default' : 'destructive'}>
                      {journey.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {new Date(journey.scheduled_departure).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
