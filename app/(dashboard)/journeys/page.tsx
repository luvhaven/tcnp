"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { 
  MapPin, 
  Plus, 
  Radio, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Navigation,
  Flag
} from "lucide-react"
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
  origin: string
  destination: string
  scheduled_departure: string
  scheduled_arrival: string | null
  actual_departure: string | null
  actual_arrival: string | null
  notes: string | null
  created_at: string
  papas: { full_name: string; title: string } | null
  cheetahs: { call_sign: string; registration_number: string } | null
}

export default function JourneysPage() {
  const supabase = createClient()
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [papas, setPapas] = useState<any[]>([])
  const [cheetahs, setCheetahs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [callSignDialogOpen, setCallSignDialogOpen] = useState(false)
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null)
  const [formData, setFormData] = useState({
    papa_id: '',
    cheetah_id: '',
    origin: '',
    destination: '',
    scheduled_departure: '',
    scheduled_arrival: '',
    notes: ''
  })

  useEffect(() => {
    loadData()
    
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
      const [journeysRes, papasRes, cheetahsRes] = await Promise.all([
        supabase
          .from('journeys')
          .select(`
            *,
            papas(full_name, title),
            cheetahs(call_sign, registration_number)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('papas').select('*').order('full_name'),
        supabase.from('cheetahs').select('*').eq('status', 'available').order('call_sign')
      ])

      if (journeysRes.data) setJourneys(journeysRes.data as Journey[])
      if (papasRes.data) setPapas(papasRes.data)
      if (cheetahsRes.data) setCheetahs(cheetahsRes.data)
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Failed to load journeys')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateJourney = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const { error } = await supabase.from('journeys').insert([
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

  const handleCallSign = async (journeyId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus }
      
      // Set actual times based on call-sign
      if (newStatus === 'first_course' || newStatus === 'in_progress') {
        updates.actual_departure = new Date().toISOString()
      } else if (newStatus === 'completed') {
        updates.actual_arrival = new Date().toISOString()
      }

      const { error } = await supabase
        .from('journeys')
        .update(updates)
        .eq('id', journeyId)

      if (error) throw error

      // Create journey event
      await supabase.from('journey_events').insert([
        {
          journey_id: journeyId,
          event_type: newStatus,
          description: `Journey status updated to ${newStatus}`,
          location: selectedJourney?.origin
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading journeys...</p>
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
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Journey
        </Button>
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

      {/* Journeys List */}
      <Card>
        <CardHeader>
          <CardTitle>All Journeys</CardTitle>
          <CardDescription>Click on a journey to execute call-signs</CardDescription>
        </CardHeader>
        <CardContent>
          {journeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No journeys yet</p>
              <p className="text-xs text-muted-foreground">Create your first journey to get started</p>
              <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Journey
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {journeys.map((journey) => (
                <div
                  key={journey.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:-translate-y-0.5 hover:shadow-md cursor-pointer animate-slide-up"
                  onClick={() => {
                    setSelectedJourney(journey)
                    setCallSignDialogOpen(true)
                  }}
                >
                  <div className="flex items-center space-x-4">
                    <div
                    className={cn(
                      'h-3 w-3 rounded-full',
                      getStatusIndicatorClass(journey.status),
                      journey.status === 'broken_arrow' && 'animate-pulse'
                    )}
                  />
                    <div>
                      <p className="font-medium">
                        {journey.papas?.title} {journey.papas?.full_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {journey.cheetahs?.call_sign} • {journey.origin} → {journey.destination}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Badge
                      variant="secondary"
                      className={cn(
                        getStatusColor(journey.status),
                        journey.status === 'broken_arrow' && 'animate-pulse'
                      )}
                    >
                      {getStatusLabel(journey.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(journey.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                <Label htmlFor="papa_id">Papa (Guest) *</Label>
                <Select
                  id="papa_id"
                  required
                  value={formData.papa_id}
                  onChange={(e) => setFormData({ ...formData, papa_id: e.target.value })}
                >
                  <option value="">Select Papa</option>
                  {papas.map((papa) => (
                    <option key={papa.id} value={papa.id}>
                      {papa.title} {papa.full_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cheetah_id">Cheetah (Vehicle) *</Label>
                <Select
                  id="cheetah_id"
                  required
                  value={formData.cheetah_id}
                  onChange={(e) => setFormData({ ...formData, cheetah_id: e.target.value })}
                >
                  <option value="">Select Cheetah</option>
                  {cheetahs.map((cheetah) => (
                    <option key={cheetah.id} value={cheetah.id}>
                      {cheetah.call_sign} - {cheetah.registration_number}
                    </option>
                  ))}
                </Select>
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
          
          {selectedJourney && (
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
                      onClick={() => handleCallSign(selectedJourney.id, callSign)}
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
