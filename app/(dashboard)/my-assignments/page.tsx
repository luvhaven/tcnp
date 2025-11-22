'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  User, 
  MapPin, 
  Calendar,
  Phone,
  Mail,
  FileText,
  Navigation
} from 'lucide-react'
import { toast } from 'sonner'
import CallSignUpdater from '@/components/journeys/CallSignUpdater'

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
}

export default function MyAssignmentsPage() {
  const supabase = createClient()
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)

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
      
      // Load journeys assigned to current user
      const { data, error } = await supabase
        .from('journeys')
        .select(`
          *,
          papas:papa_id (
            id,
            full_name,
            title,
            phone,
            email,
            nationality,
            special_requirements,
            notes
          )
        `)
        .eq('assigned_do_id', (await supabase.auth.getUser()).data.user?.id)
        .order('scheduled_departure', { ascending: true })

      if (error) throw error

      console.log('✅ Loaded assignments:', data)
      setJourneys(data || [])
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading your assignments...</p>
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
              <div key={journey.id} className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-slide-up">
                {/* Journey Status Card */}
                <CallSignUpdater journey={journey} onUpdate={loadAssignments} />

                {/* Papa Details Card */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Papa Details</CardTitle>
                        <CardDescription>Full information for your assignment</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
