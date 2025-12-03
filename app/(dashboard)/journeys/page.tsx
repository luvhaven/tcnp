"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn, canManageJourney, isAdmin } from "@/lib/utils"
import {
  MapPin,
  Plus,
  Radio,
  AlertTriangle,
  CheckCircle,
  Clock,
  Navigation,
  Flag,
  User,
  Car,
  Hotel,
  Plane,
  Calendar
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { getCallSignLabel, resolveCallSignKey, TNCP_CALL_SIGN_COLORS } from "@/lib/constants/tncpCallSigns"

const FALLBACK_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  broken_arrow: "BROKEN ARROW",
}

const FALLBACK_STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-500 text-white",
  in_progress: "bg-yellow-500 text-white",
  completed: "bg-green-500 text-white",
  cancelled: "bg-red-500 text-white",
  broken_arrow: "bg-red-600 text-white",
}

const toTitleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())

const getStatusColor = (status: string): string => {
  const key = resolveCallSignKey(status)

  if (key) {
    return TNCP_CALL_SIGN_COLORS[key]
  }
  return FALLBACK_STATUS_COLORS[status] || "bg-gray-500 text-white"
}

const getStatusIndicatorClass = (status: string): string => {
  const classes = getStatusColor(status)
  const background = classes.split(" ").find((className) => className.startsWith("bg-"))
  return background || "bg-gray-500"
}

const getStatusLabel = (status: string): string =>
  getCallSignLabel(status) || FALLBACK_STATUS_LABELS[status] || toTitleCase(status)

type Journey = {
  id: string
  papa_id: string
  cheetah_id: string
  status: string
  assigned_do_id?: string | null
  origin: string
  destination: string
  scheduled_departure: string
  scheduled_arrival: string | null
  actual_departure: string | null
  actual_arrival: string | null
  notes: string | null
  created_at: string
  eta: string | null
  etd: string | null
  papas: { full_name: string; title: string } | null
  cheetahs: { call_sign: string; registration_number: string; driver_name?: string; driver_phone?: string } | null
  assigned_do?: { full_name: string; oscar: string } | null
  nests?: { name: string } | null
  eagle_squares?: { name: string; code: string } | null
}

export default function JourneysPage() {
  const supabase = createClient()
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [papas, setPapas] = useState<any[]>([])
  const [cheetahs, setCheetahs] = useState<any[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [officers, setOfficers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [callSignDialogOpen, setCallSignDialogOpen] = useState(false)
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentRole, setCurrentRole] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    papa_id: '',
    cheetah_id: '',
    program_id: '',
    assigned_duty_officer_id: '',
    origin: '',
    destination: '',
    scheduled_departure: '',
    scheduled_arrival: '',
    notes: ''
  })

  const canCreateJourney = currentRole ? isAdmin(currentRole) : false

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          setCurrentUserId(user.id)

          const { data: userRow, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single<any>()

          if (!error && userRow?.role) {
            setCurrentRole(userRow.role)
          }
        }
      } catch (error) {
        console.error('Error loading current user for JourneysPage:', error)
      } finally {
        await loadData()
      }
    }

    init()

    // Subscribe to real-time updates
    const channel = supabase
      .channel('journeys_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadData = async () => {
    try {
      const [journeysRes, papasRes, cheetahsRes, programsRes, officersRes] = await Promise.all([
        supabase.from('journeys').select(`
          *,
          papas (title, full_name),
          cheetahs (registration_number, driver_name, driver_phone),
          assigned_do:users!journeys_assigned_duty_officer_id_fkey (full_name),
          nests (name),
          eagle_squares (name, code),
          programs (name, status)
        `).order('created_at', { ascending: false }),
        supabase.from('papas').select('*').order('full_name'),
        supabase.from('cheetahs').select('*').order('registration_number'),
        supabase.from('programs').select('*').order('name'),
        supabase.from('users').select('id, full_name, role').eq('role', 'delta_oscar').order('full_name')
      ])

      if (journeysRes.data) setJourneys(journeysRes.data as any)
      if (papasRes.data) setPapas(papasRes.data)
      if (cheetahsRes.data) setCheetahs(cheetahsRes.data)
      if (programsRes.data) setPrograms(programsRes.data)
      if (officersRes.data) setOfficers(officersRes.data)
    } catch (error) {
      console.error('Error loading journeys data:', error)
      toast.error('Failed to load journeys')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateJourney = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canCreateJourney) {
      toast.error('You are not authorized to create journeys')
      return
    }

    try {
      const { error } = await (supabase as any).from('journeys').insert([
        {
          ...formData,
          status: 'planned'
        }
      ])

      if (error) throw error

      toast.success('Journey created successfully!')
      setCreateDialogOpen(false)
      setFormData({
        papa_id: '',
        cheetah_id: '',
        program_id: '',
        assigned_duty_officer_id: '',
        origin: '',
        destination: '',
        scheduled_departure: '',
        scheduled_arrival: '',
        notes: ''
      })
      loadData()
    } catch (error: any) {
      console.error('Error creating journey:', error)
      toast.error(error.message || 'Failed to create journey')
    }
  }

  const handleCallSign = async (journey: Journey, newStatus: string) => {
    try {
      const canUpdate = currentRole && currentUserId
        ? canManageJourney(currentRole, journey.assigned_do_id === currentUserId)
        : false

      if (!canUpdate) {
        toast.error('You are not authorized to update this journey')
        return
      }

      const { data, error } = await (supabase as any).rpc('update_journey_call_sign', {
        journey_uuid: journey.id,
        new_status: newStatus
      })

      if (error) {
        throw error
      }

      await (supabase as any).from('journey_events').insert([
        {
          journey_id: journey.id,
          event_type: newStatus,
          description: `Journey status updated to ${newStatus}`,
          triggered_at: new Date().toISOString(),
        }
      ])

      toast.success(`Call-sign ${newStatus.toUpperCase()} executed!`)
      setCallSignDialogOpen(false)
      setSelectedJourney(null)
      loadData()
    } catch (error: any) {
      console.error('Error updating journey:', error)
      toast.error(error.message || 'Failed to update journey')
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planned: 'bg-blue-500',
      in_progress: 'bg-yellow-500',
      first_course: 'bg-orange-500',
      chapman: 'bg-purple-500',
      dessert: 'bg-indigo-500',
      completed: 'bg-green-500',
      cancelled: 'bg-red-500',
      broken_arrow: 'bg-red-600',
    }
    return colors[status] || 'bg-gray-500'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      planned: 'Planned',
      in_progress: 'In Progress',
      first_course: 'First Course',
      chapman: 'Chapman',
      dessert: 'Dessert',
      completed: 'Completed',
      cancelled: 'Cancelled',
      broken_arrow: 'BROKEN ARROW',
    }
    return labels[status] || status
  }

  const getAvailableCallSigns = (currentStatus: string) => {
    const workflow: Record<string, string[]> = {
      planned: ['first_course', 'in_progress', 'cancelled'],
      in_progress: ['first_course', 'chapman', 'broken_arrow', 'cancelled'],
      first_course: ['chapman', 'broken_arrow', 'cancelled'],
      chapman: ['dessert', 'broken_arrow', 'cancelled'],
      dessert: ['completed', 'broken_arrow'],
    }
    return workflow[currentStatus] || []
  }

  const canUpdateSelectedJourney = selectedJourney && currentRole && currentUserId
    ? canManageJourney(currentRole, selectedJourney.assigned_do_id === currentUserId)
    : false

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 rounded-md skeleton" />
            <div className="mt-2 h-4 w-96 rounded-md skeleton" />
          </div>
          <div className="h-10 w-36 rounded-md skeleton" />
        </div>

        {/* Stats cards skeleton */}
        <div className="grid gap-6 md:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <div className="h-4 w-28 rounded-md skeleton" />
              </CardHeader>
              <CardContent>
                <div className="h-7 w-16 rounded-md skeleton" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs skeleton */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="h-9 w-32 rounded-md skeleton" />
            <div className="h-9 w-40 rounded-md skeleton" />
          </div>

          {/* Journey cards skeleton */}
          <Card>
            <CardHeader>
              <div className="h-5 w-36 rounded-md skeleton" />
              <div className="mt-2 h-4 w-48 rounded-md skeleton" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(3)].map((_, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-4 rounded-lg border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-6 w-24 rounded-md skeleton" />
                        <div className="h-4 w-32 rounded-md skeleton" />
                      </div>
                      <div className="h-4 w-28 rounded-md skeleton" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="mt-1 h-8 w-8 rounded-full skeleton" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-32 rounded-md skeleton" />
                            <div className="h-3 w-24 rounded-md skeleton" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Journeys</h1>
          <p className="text-muted-foreground">Manage all Papa journeys and call-signs</p>
        </div>
        {canCreateJourney && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Journey
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Journeys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{journeys.length}</div>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {journeys.filter(j => ['in_progress', 'first_course', 'chapman', 'dessert'].includes(j.status)).length}
            </div>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {journeys.filter(j => j.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {journeys.filter(j => j.status === 'broken_arrow').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Journeys Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active Journeys</TabsTrigger>
          <TabsTrigger value="completed">Completed / Archived</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Journeys</CardTitle>
              <CardDescription>Live monitoring of ongoing movements</CardDescription>
            </CardHeader>
            <CardContent>
              {journeys.filter(j => ['planned', 'in_progress', 'first_course', 'chapman', 'dessert', 'broken_arrow'].includes(j.status)).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MapPin className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-sm font-medium">No active journeys</p>
                  <p className="text-xs text-muted-foreground">Create a new journey to get started</p>
                  {canCreateJourney && (
                    <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Journey
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {journeys
                    .filter(j => ['planned', 'in_progress', 'first_course', 'chapman', 'dessert', 'broken_arrow'].includes(j.status))
                    .map((journey) => (
                      <div
                        key={journey.id}
                        className="flex flex-col gap-4 rounded-lg border p-4 transition-all hover:bg-accent/50 hover:shadow-md cursor-pointer animate-slide-up"
                        onClick={() => {
                          setSelectedJourney(journey)
                          setCallSignDialogOpen(true)
                        }}
                      >
                        {/* Header Row: Status & Time */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="secondary"
                              className={cn(
                                getStatusColor(journey.status),
                                "px-3 py-1 text-sm font-medium text-white"
                              )}
                            >
                              {getStatusLabel(journey.status)}
                            </Badge>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {journey.etd ? `ETD: ${new Date(journey.etd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No ETD'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Updated {formatDistanceToNow(new Date(journey.created_at), { addSuffix: true })}
                          </div>
                        </div>

                        {/* Main Info Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* Papa */}
                          <div className="flex items-start gap-2">
                            <div className="mt-1 p-1.5 bg-primary/10 rounded-full">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{journey.papas?.title} {journey.papas?.full_name}</p>
                              <p className="text-xs text-muted-foreground">Guest</p>
                            </div>
                          </div>

                          {/* Route */}
                          <div className="flex items-start gap-2">
                            <div className="mt-1 p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                              <MapPin className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{journey.origin} → {journey.destination}</p>
                              <p className="text-xs text-muted-foreground">Route</p>
                            </div>
                          </div>

                          {/* DO & Cheetah */}
                          <div className="flex items-start gap-2">
                            <div className="mt-1 p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                              <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{journey.cheetahs?.call_sign} ({journey.cheetahs?.registration_number})</p>
                              <p className="text-xs text-muted-foreground">
                                DO: {journey.assigned_do?.full_name || 'Unassigned'}
                              </p>
                            </div>
                          </div>

                          {/* Nest/Eagle */}
                          <div className="flex items-start gap-2">
                            <div className="mt-1 p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                              <Hotel className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{journey.nests?.name || journey.eagle_squares?.name || 'No Base'}</p>
                              <p className="text-xs text-muted-foreground">Base Location</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>Completed & Archived</CardTitle>
              <CardDescription>History of past journeys</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {journeys
                  .filter(j => ['completed', 'cancelled'].includes(j.status))
                  .map((journey) => (
                    <div
                      key={journey.id}
                      className="flex items-center justify-between rounded-lg border p-4 opacity-75 hover:opacity-100 transition-all"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={cn('h-3 w-3 rounded-full', getStatusIndicatorClass(journey.status))} />
                        <div>
                          <p className="font-medium">
                            {journey.papas?.title} {journey.papas?.full_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {journey.origin} → {journey.destination}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <Badge variant="outline">
                          {getStatusLabel(journey.status)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(journey.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                {journeys.filter(j => ['completed', 'cancelled'].includes(j.status)).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No completed journeys found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Journey Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Journey</DialogTitle>
            <DialogDescription>Plan a new journey for a Papa</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateJourney} className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="program_id">Program *</Label>
                <select
                  id="program_id"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.program_id}
                  onChange={(e) => setFormData({ ...formData, program_id: e.target.value })}
                >
                  <option value="">Select Program</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assigned_duty_officer_id">Designated Officer (DO)</Label>
                <select
                  id="assigned_duty_officer_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.assigned_duty_officer_id}
                  onChange={(e) => setFormData({ ...formData, assigned_duty_officer_id: e.target.value })}
                >
                  <option value="">No DO assigned</option>
                  {officers.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="papa_id">Papa (Guest) *</Label>
                <select
                  id="papa_id"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.papa_id}
                  onChange={(e) => setFormData({ ...formData, papa_id: e.target.value })}
                >
                  <option value="">Select Papa</option>
                  {papas.map((papa) => (
                    <option key={papa.id} value={papa.id}>
                      {papa.title} {papa.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cheetah_id">Cheetah (Vehicle) *</Label>
                <select
                  id="cheetah_id"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.cheetah_id}
                  onChange={(e) => setFormData({ ...formData, cheetah_id: e.target.value })}
                >
                  <option value="">Select Cheetah</option>
                  {cheetahs.map((cheetah) => (
                    <option key={cheetah.id} value={cheetah.id}>
                      {cheetah.call_sign} - {cheetah.registration_number}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="origin">Origin *</Label>
                <Input
                  id="origin"
                  required
                  placeholder="e.g., Transcorp Hilton"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Destination *</Label>
                <Input
                  id="destination"
                  required
                  placeholder="e.g., Aso Rock Villa"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scheduled_departure">Scheduled Departure *</Label>
                <Input
                  id="scheduled_departure"
                  type="datetime-local"
                  required
                  value={formData.scheduled_departure}
                  onChange={(e) => setFormData({ ...formData, scheduled_departure: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduled_arrival">Scheduled Arrival</Label>
                <Input
                  id="scheduled_arrival"
                  type="datetime-local"
                  value={formData.scheduled_arrival}
                  onChange={(e) => setFormData({ ...formData, scheduled_arrival: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional journey details..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Journey</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Call-Sign Dialog */}
      <Dialog open={callSignDialogOpen} onOpenChange={setCallSignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Execute Call-Sign</DialogTitle>
            <DialogDescription>
              Update journey status for {selectedJourney?.papas?.title} {selectedJourney?.papas?.full_name}
            </DialogDescription>
          </DialogHeader>

          {selectedJourney && canUpdateSelectedJourney && (
            <div className="space-y-4 mt-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Current Status:</span>
                  <Badge variant="secondary">{getStatusLabel(selectedJourney.status)}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>{selectedJourney.origin} → {selectedJourney.destination}</p>
                  <p>{selectedJourney.cheetahs?.call_sign}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Available Call-Signs:</Label>
                <div className="grid gap-2">
                  {getAvailableCallSigns(selectedJourney.status).map((callSign) => (
                    <Button
                      key={callSign}
                      variant={callSign === 'broken_arrow' ? 'destructive' : 'outline'}
                      className="justify-start"
                      onClick={() => handleCallSign(selectedJourney, callSign)}
                    >
                      {callSign === 'first_course' && <Navigation className="mr-2 h-4 w-4" />}
                      {callSign === 'chapman' && <Flag className="mr-2 h-4 w-4" />}
                      {callSign === 'dessert' && <Clock className="mr-2 h-4 w-4" />}
                      {callSign === 'completed' && <CheckCircle className="mr-2 h-4 w-4" />}
                      {callSign === 'broken_arrow' && <AlertTriangle className="mr-2 h-4 w-4" />}
                      {callSign === 'in_progress' && <Radio className="mr-2 h-4 w-4" />}
                      {getStatusLabel(callSign)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {selectedJourney && !canUpdateSelectedJourney && (
            <div className="mt-4 text-sm text-muted-foreground">
              You do not have permission to execute call-signs for this journey.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
