"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
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
  Calendar,
  Pencil,
  History
} from "lucide-react"
import { JourneyTimelineDialog } from "@/components/journeys/JourneyTimelineDialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { getCallSignLabel, resolveCallSignKey, TNCP_CALL_SIGN_COLORS } from "@/lib/constants/tncpCallSigns"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { usePagination } from "@/hooks/usePagination"
import OperationalReadiness from "@/components/journeys/OperationalReadiness"

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
  assigned_cheetah_id: string
  status: string
  journey_type?: string | null
  assigned_do_id?: string | null
  assigned_duty_officer_id?: string | null
  assigned_nest_id?: string | null
  assigned_eagle_square_id?: string | null
  program_id?: string | null
  origin: string
  destination: string
  scheduled_departure: string
  scheduled_arrival: string | null
  actual_departure: string | null
  actual_arrival: string | null
  notes: string | null
  created_at: string
  updated_at?: string | null
  eta: string | null
  etd: string | null
  papas: { full_name: string; title: string } | null
  cheetahs: { call_sign: string | null; registration_number: string; driver_name?: string; driver_phone?: string } | null
  assigned_do?: { full_name: string; oscar: string } | null
  nests?: { name: string } | null
  eagle_squares?: { name: string; code: string } | null
}

export default function JourneysClient({
  initialJourneys,
  initialPapas,
  initialCheetahs,
  initialPrograms,
  initialOfficers,
  initialNests,
  initialEagleSquares
}: {
  initialJourneys: Journey[]
  initialPapas: any[]
  initialCheetahs: any[]
  initialPrograms: any[]
  initialOfficers: any[]
  initialNests: any[]
  initialEagleSquares: any[]
}) {
  const supabase = createClient()
  const [journeys, setJourneys] = useState<Journey[]>(initialJourneys)
  const [papas, setPapas] = useState<any[]>(initialPapas)
  const [cheetahs, setCheetahs] = useState<any[]>(initialCheetahs)
  const [programs, setPrograms] = useState<any[]>(initialPrograms)
  const [officers, setOfficers] = useState<any[]>(initialOfficers)
  const [nests, setNests] = useState<any[]>(initialNests)
  const [eagleSquares, setEagleSquares] = useState<any[]>(initialEagleSquares)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const { page, from, to, hasMore, setHasMore, nextPage, resetPage } = usePagination({ pageSize: 50 })
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [callSignDialogOpen, setCallSignDialogOpen] = useState(false)
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentRole, setCurrentRole] = useState<string | null>(null)

  // Timeline UI State
  const [timelineJourneyId, setTimelineJourneyId] = useState<string | null>(null)
  const [timelinePapaName, setTimelinePapaName] = useState<string>('')

  // Multi-DO state
  const [allOfficers, setAllOfficers] = useState<any[]>([])
  const [loadingOfficers, setLoadingOfficers] = useState(false)
  const [doSearch, setDoSearch] = useState('')
  const searchParams = useSearchParams()
  const [pulsingJourneyId, setPulsingJourneyId] = useState<string | null>(null)

  const filteredDOOfficers = allOfficers
    .filter(officer => !['captain', 'head_of_operations'].includes(officer.role))
    .filter(officer => {
      if (!doSearch.trim()) return true
      const q = doSearch.trim().toLowerCase()
      return (officer.full_name ?? '').toLowerCase().includes(q) || (officer.oscar ?? '').toLowerCase().includes(q)
    })
  const [selectedDOs, setSelectedDOs] = useState<string[]>([])
  const [teamLeadId, setTeamLeadId] = useState<string>('')

  const [formData, setFormData] = useState({
    papa_id: '',
    secondary_papa_ids: [] as string[],
    assigned_cheetah_id: '',
    program_id: '',
    journey_type: 'airport_to_nest_to_theatre',
    assigned_duty_officer_id: '',
    assigned_nest_id: '',
    assigned_eagle_square_id: '',
    origin: '',
    destination: '',
    scheduled_departure: '',
    scheduled_arrival: '',
    etd: '',
    eta: '',
    notes: ''
  })

  const canCreateJourney = currentRole ? isAdmin(currentRole) : false

  // Fetch every Protocol Officer once — Admin/Command can assign ANY officer
  // as DO to a journey, not just those with a title assignment in the
  // selected program (that program-scoped picker was the reason this
  // feature felt "missing": an admin picking a program with no title
  // assignments yet just saw an empty list).
  useEffect(() => {
    const fetchOfficers = async () => {
      setLoadingOfficers(true)
      try {
        const res = await fetch('/api/officers/list')
        if (!res.ok) {
          const errText = await res.text()
          console.error('officers/list error response:', errText)
          toast.error('Could not load officers')
          setAllOfficers([])
          return
        }
        const json = await res.json()
        if (json.error) {
          console.error('officers/list API error:', json.error)
          toast.error('Could not load officers: ' + json.error)
          setAllOfficers([])
        } else {
          const officers = (json.officers || [])
            .filter((o: any) => o.activation_status === 'active')
            .sort((a: any, b: any) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
          setAllOfficers(officers)
        }
      } catch (err) {
        console.error('Error fetching officers:', err)
        toast.error('Failed to load officers')
        setAllOfficers([])
      } finally {
        setLoadingOfficers(false)
      }
    }
    void fetchOfficers()
  }, [])

  // Deep link from a notification (e.g. "/journeys?highlight=<id>") — scroll
  // the referenced journey into view and pulse it so it's unmistakable which
  // row the notification was about.
  useEffect(() => {
    const highlightId = searchParams.get('highlight')
    if (!highlightId || journeys.length === 0) return
    const match = journeys.find(j => j.id === highlightId)
    if (!match) return
    const t = setTimeout(() => {
      const el = document.getElementById(`journey-${highlightId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPulsingJourneyId(highlightId)
      setTimeout(() => setPulsingJourneyId(null), 2600)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeys, searchParams])

  const toggleDO = (userId: string) => {
    setSelectedDOs(prev => {
      const next = prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
      // If removing the current team lead, clear it
      if (!next.includes(teamLeadId)) setTeamLeadId(next[0] ?? '')
      // Auto-set lead if first selection
      if (next.length === 1) setTeamLeadId(next[0])
      return next
    })
  }

  const resetDOState = () => {
    setSelectedDOs([])
    setTeamLeadId('')
  }

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
        // Lookups and initial journeys already loaded via Server Components
      }
    }

    init()

    // Subscribe to real-time updates
    const channel = supabase
      .channel('journeys_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, () => {
        resetPage()
        loadJourneys(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (page > 0) loadJourneys(true)
  }, [page])

  const loadJourneys = async (isLoadMore = false) => {
    if (isLoadMore) setLoadingMore(true)
    try {
      const rangeFrom = isLoadMore ? from : 0
      const rangeTo = isLoadMore ? to : 49

      const { data, error } = await supabase.from('journeys').select(`
        *,
        papas (title, full_name),
        cheetahs (call_sign, registration_number, driver_name, driver_phone),
        assigned_do:users!journeys_assigned_duty_officer_id_fkey (full_name),
        nests (name),
        eagle_squares (name, code),
        programs (name, status)
      `)
        .order('created_at', { ascending: false })
        .range(rangeFrom, rangeTo)

      if (error) throw error

      if (data) {
        if (isLoadMore) {
          setJourneys(prev => {
            const existingIds = new Set(prev.map(j => j.id))
            const newItems = data.filter(j => !existingIds.has(j.id))
            return [...prev, ...newItems] as any
          })
        } else {
          setJourneys(data as any)
        }
        setHasMore(data.length === 50)
      }
    } catch (error) {
      console.error('Error loading journeys data:', error)
      toast.error('Failed to load journeys')
    } finally {
      if (isLoadMore) setLoadingMore(false)
      else setLoading(false)
    }
  }

  const loadLookups = async () => {
    try {
      const [papasRes, cheetahsRes, programsRes, officersResult] = await Promise.all([
        supabase.from('papas_basic').select('*').order('full_name'),
        supabase.from('cheetahs').select('*').order('registration_number'),
        supabase.from('programs').select('*').order('name'),
        supabase.from('users').select('id, full_name, role').eq('role', 'delta_oscar').order('full_name')
      ])

      if (papasRes.data) setPapas(papasRes.data)
      if (cheetahsRes.data) setCheetahs(cheetahsRes.data)
      if (programsRes.data) setPrograms(programsRes.data)
      if (officersResult.error) throw officersResult.error
      setOfficers(officersResult.data || [])

      // Fetch Nests
      const nestsResult = await supabase
        .from('nests')
        .select('*')
        .order('name', { ascending: true })

      if (!nestsResult.error) {
        setNests(nestsResult.data || [])
      }

      // Fetch Eagle Squares
      const eagleResult = await supabase
        .from('eagle_squares')
        .select('*')
        .order('name', { ascending: true })

      if (!eagleResult.error) {
        setEagleSquares(eagleResult.data || [])
      }

    } catch (error) {
      console.error('Error loading lookups:', error)
    }
  }

  const handleCreateJourney = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canCreateJourney) {
      toast.error('You are not authorized to create journeys')
      return
    }

    try {
      const lead = teamLeadId || selectedDOs[0] || null
      // Convert empty-string UUID fields to null to avoid Postgres uuid parse errors
      const sanitized = {
        ...formData,
        papa_id: formData.papa_id || null,
        assigned_cheetah_id: formData.assigned_cheetah_id || null,
        program_id: formData.program_id || null,
        assigned_nest_id: formData.assigned_nest_id || null,
        assigned_eagle_square_id: formData.assigned_eagle_square_id || null,
        assigned_duty_officer_id: lead,
        assigned_do_id: lead,
        scheduled_departure: formData.scheduled_departure || null,
        scheduled_arrival: formData.scheduled_arrival || null,
        etd: formData.etd || null,
        eta: formData.eta || null,
      }
      const { data: newJourney, error } = await (supabase as any)
        .from('journeys')
        .insert([{ ...sanitized, status: 'planned' }])
        .select('id')
        .single()

      if (error) throw error

      // Save DO assignments to junction table
      if (selectedDOs.length > 0 && newJourney?.id) {
        const doPayload = selectedDOs.map(uid => ({ user_id: uid, is_lead: uid === (lead ?? '') }))
        await fetch('/api/journey-duty-officers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ journey_id: newJourney.id, officers: doPayload })
        })
      }

      // Save secondary papas if junction table migration is applied
      if (formData.secondary_papa_ids.length > 0 && newJourney?.id) {
        try {
          const papaPayload = formData.secondary_papa_ids.map(pid => ({ journey_id: newJourney.id, papa_id: pid, is_primary: false }))
          await (supabase as any).from('journey_papas').insert(papaPayload)
        } catch (e) {
          console.warn('Failed to save secondary papas (migration may be missing).', e)
        }
      }

      toast.success('Journey created successfully!')
      setCreateDialogOpen(false)
      setFormData({
        papa_id: '', secondary_papa_ids: [], assigned_cheetah_id: '', program_id: '',
        journey_type: 'airport_to_nest_to_theatre', assigned_duty_officer_id: '',
        assigned_nest_id: '', assigned_eagle_square_id: '', origin: '',
        destination: '', scheduled_departure: '', scheduled_arrival: '',
        etd: '', eta: '', notes: ''
      })
      resetDOState()
      resetPage()
      loadJourneys(false)
    } catch (error: any) {
      console.error('Error creating journey:', error)
      toast.error(error.message || 'Failed to create journey')
    }
  }

  const handleEditClick = async (journey: Journey, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click
    setSelectedJourney(journey)

    let initialDOs: string[] = []
    let initialLead = journey.assigned_duty_officer_id || journey.assigned_do_id || ''
    if (initialLead) {
      initialDOs = [initialLead]
    }

    try {
      const res = await fetch(`/api/journey-duty-officers?journey_id=${journey.id}`)
      if (res.ok) {
        const json = await res.json()
        if (json.duty_officers && json.duty_officers.length > 0) {
          initialDOs = json.duty_officers.map((d: any) => d.user_id)
          const leadObj = json.duty_officers.find((d: any) => d.is_lead)
          initialLead = leadObj ? leadObj.user_id : initialDOs[0]
        }
      }
    } catch {
      console.warn("Using legacy DO assignment scalar")
    }

    setSelectedDOs(initialDOs)
    setTeamLeadId(initialLead)

    let initialSecondaryPapas: string[] = []
    try {
      const { data } = await (supabase as any)
        .from('journey_papas')
        .select('papa_id')
        .eq('journey_id', journey.id)
        .eq('is_primary', false)
      if (data) {
        initialSecondaryPapas = data.map((row: any) => row.papa_id)
      }
    } catch (e) {
      console.warn('Could not fetch secondary papas', e)
    }

    setFormData({
      papa_id: journey.papa_id || '',
      secondary_papa_ids: initialSecondaryPapas,
      assigned_cheetah_id: journey.assigned_cheetah_id || '',
      program_id: journey.program_id || '',
      journey_type: journey.journey_type || 'airport_to_nest_to_theatre',
      assigned_duty_officer_id: initialLead,
      assigned_nest_id: journey.assigned_nest_id || '',
      assigned_eagle_square_id: journey.assigned_eagle_square_id || '',
      origin: journey.origin || '',
      destination: journey.destination || '',
      scheduled_departure: journey.scheduled_departure ? new Date(journey.scheduled_departure).toISOString().slice(0, 16) : '',
      scheduled_arrival: journey.scheduled_arrival ? new Date(journey.scheduled_arrival).toISOString().slice(0, 16) : '',
      etd: journey.etd || '',
      eta: journey.eta || '',
      notes: journey.notes || ''
    })
    setEditDialogOpen(true)
  }

  const handleUpdateJourney = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedJourney) return
    if (!canCreateJourney) {
      toast.error('You are not authorized to edit journeys')
      return
    }

    try {
      const lead = teamLeadId || selectedDOs[0] || formData.assigned_duty_officer_id || null
      const sanitized = {
        ...formData,
        papa_id: formData.papa_id || null,
        assigned_cheetah_id: formData.assigned_cheetah_id || null,
        program_id: formData.program_id || null,
        assigned_nest_id: formData.assigned_nest_id || null,
        assigned_eagle_square_id: formData.assigned_eagle_square_id || null,
        assigned_duty_officer_id: lead,
        assigned_do_id: lead,
        scheduled_departure: formData.scheduled_departure || null,
        scheduled_arrival: formData.scheduled_arrival || null,
        etd: formData.etd || null,
        eta: formData.eta || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await (supabase as any)
        .from('journeys')
        .update(sanitized)
        .eq('id', selectedJourney.id)

      if (error) throw error

      // Update secondary papas
      try {
        await (supabase as any).from('journey_papas').delete().eq('journey_id', selectedJourney.id).eq('is_primary', false)
        if (formData.secondary_papa_ids.length > 0) {
          const papaPayload = formData.secondary_papa_ids.map(pid => ({ journey_id: selectedJourney.id, papa_id: pid, is_primary: false }))
          await (supabase as any).from('journey_papas').insert(papaPayload)
        }
      } catch (e) {
        console.warn('Failed to update secondary papas', e)
      }

      // Sync DO assignments if any were selected
      if (selectedDOs.length > 0) {
        const doPayload = selectedDOs.map(uid => ({ user_id: uid, is_lead: uid === (lead ?? '') }))
        await fetch('/api/journey-duty-officers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ journey_id: selectedJourney.id, officers: doPayload })
        })
      }

      toast.success('Journey updated successfully!')
      setSelectedJourney(null)
      resetDOState()
      resetPage()
      loadJourneys(false)
    } catch (error: any) {
      console.error('Error updating journey:', error)
      toast.error(error.message || 'Failed to update journey')
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
      setSelectedJourney(null)
      resetPage()
      loadJourneys(false)
    } catch (error: any) {
      console.error('Error updating journey:', error)
      toast.error(error.message || 'Failed to update journey')
    }
  }



  const getAvailableCallSigns = (currentStatus: string, journeyType?: string | null) => {
    const type = journeyType || 'airport_to_nest_to_theatre'
    const workflows: Record<string, Record<string, string[]>> = {
      airport_to_nest_to_theatre: {
        planned: ['cocktail', 'broken_arrow', 'cancelled'],
        cocktail: ['first_course', 'broken_arrow', 'cancelled'],
        first_course: ['chapman', 'broken_arrow', 'cancelled'],
        chapman: ['dessert', 'broken_arrow', 'cancelled'],
        dessert: ['completed', 'broken_arrow', 'cancelled'],
      },
      airport_to_theatre: {
        planned: ['cocktail', 'broken_arrow', 'cancelled'],
        cocktail: ['chapman', 'broken_arrow', 'cancelled'],
        chapman: ['dessert', 'broken_arrow', 'cancelled'],
        dessert: ['completed', 'broken_arrow', 'cancelled'],
      },
      self_arrival: {
        planned: ['chapman', 'broken_arrow', 'cancelled'],
        chapman: ['dessert', 'broken_arrow', 'cancelled'],
        dessert: ['completed', 'broken_arrow', 'cancelled'],
      },
    }
    const workflow = workflows[type] ?? workflows.airport_to_nest_to_theatre
    return workflow[currentStatus] ?? []
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

      {/* Registry readiness — journeys compose unit-owned registries, never create them */}
      {canCreateJourney && (
        <OperationalReadiness
          programs={programs.length}
          papas={papas.length}
          cheetahs={cheetahs.length}
          nests={nests.length}
          eagleSquares={eagleSquares.length}
        />
      )}

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
                        id={`journey-${journey.id}`}
                        className={cn(
                          "flex flex-col gap-4 rounded-lg border p-4 transition-all hover:bg-accent/50 hover:shadow-md cursor-pointer animate-slide-up",
                          pulsingJourneyId === journey.id && "ring-2 ring-primary animate-pulse-highlight"
                        )}
                        onClick={() => {
                          setSelectedJourney(journey)
                          setCallSignDialogOpen(true)
                        }}
                      >
                        {/* Header Row: Status & Time */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-3">
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

                          <div className="flex items-center gap-3">
                            <div className="hidden text-xs text-muted-foreground sm:block">
                              Updated {formatDistanceToNow(new Date(journey.updated_at ?? journey.created_at), { addSuffix: true })}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-muted text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                              onClick={(e) => {
                                e.stopPropagation()
                                setTimelineJourneyId(journey.id)
                                setTimelinePapaName(`${journey.papas?.title || ''} ${journey.papas?.full_name || ''}`)
                              }}
                              title="View Audit Trail"
                            >
                              <History className="h-4 w-4" />
                              <span className="sr-only">History</span>
                            </Button>
                            {canCreateJourney && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-muted"
                                onClick={(e) => handleEditClick(journey, e)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit</span>
                              </Button>
                            )}
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
                              <p className="text-sm font-medium">
                                {journey.cheetahs?.call_sign
                                  ? `${journey.cheetahs.call_sign}`
                                  : (journey.cheetahs?.registration_number ? 'Vehicle' : 'No Vehicle')
                                }
                                {journey.cheetahs?.registration_number && ` (${journey.cheetahs.registration_number})`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                DO: {journey.assigned_do?.full_name || 'Unassigned'}
                                {journey.assigned_do?.oscar && ` (${journey.assigned_do.oscar})`}
                              </p>
                            </div>
                          </div>

                          {/* Nest/Eagle */}
                          <div className="flex items-start gap-2">
                            <div className="mt-1 p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                              <Hotel className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{journey.nests?.name || journey.eagle_squares?.name || 'Not Assigned'}</p>
                              <p className="text-xs text-muted-foreground">
                                {journey.nests?.name ? 'Nest' : journey.eagle_squares?.name ? 'Eagle Square' : 'Base Location'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" onClick={nextPage} disabled={loadingMore}>
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </Button>
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
                      id={`journey-${journey.id}`}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-4 opacity-75 hover:opacity-100 transition-all",
                        pulsingJourneyId === journey.id && "ring-2 ring-primary animate-pulse-highlight opacity-100"
                      )}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-muted text-blue-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTimelineJourneyId(journey.id)
                            setTimelinePapaName(`${journey.papas?.title || ''} ${journey.papas?.full_name || ''}`)
                          }}
                          title="View Audit Trail"
                        >
                          <History className="h-4 w-4" />
                        </Button>
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
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={nextPage} disabled={loadingMore}>
                      {loadingMore ? 'Loading...' : 'Load More'}
                    </Button>
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

              <div className="space-y-2 md:col-span-2">
                <Label>Duty Officer(s) — DO Team</Label>
                <p className="text-[11px] text-muted-foreground">Any Protocol Officer can be assigned — they'll be notified and must accept before starting the journey.</p>
                {loadingOfficers ? (
                  <p className="text-xs text-muted-foreground animate-pulse">Loading officers…</p>
                ) : (
                  <>
                    <Input
                      value={doSearch}
                      onChange={(e) => setDoSearch(e.target.value)}
                      placeholder="Search officers by name or Oscar unit…"
                      className="h-8 text-sm"
                    />
                    <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
                      {filteredDOOfficers.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">No officers match "{doSearch}"</p>
                      ) : filteredDOOfficers.map(officer => {
                        const isSelected = selectedDOs.includes(officer.id)
                        const isLead = teamLeadId === officer.id
                        return (
                          <div key={officer.id} className={`flex items-center gap-3 px-3 py-2 transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                            <input
                              type="checkbox"
                              id={`do-${officer.id}`}
                              checked={isSelected}
                              onChange={() => toggleDO(officer.id)}
                              className="h-4 w-4 rounded border-input"
                            />
                            <label htmlFor={`do-${officer.id}`} className="flex-1 cursor-pointer">
                              <span className="font-medium text-sm">{officer.full_name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{officer.oscar || officer.role}</span>
                            </label>
                            {isSelected && selectedDOs.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setTeamLeadId(officer.id)}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${isLead
                                  ? 'bg-yellow-400 text-yellow-900 border-yellow-500 font-bold'
                                  : 'bg-muted text-muted-foreground border-border hover:border-yellow-400'
                                  }`}
                              >
                                {isLead ? '⭐ Lead' : 'Set Lead'}
                              </button>
                            )}
                            {isSelected && selectedDOs.length === 1 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900 font-bold">⭐ Lead</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {selectedDOs.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedDOs.length} DO{selectedDOs.length > 1 ? 's' : ''} selected. {selectedDOs.length > 1 ? 'Team lead marked with ⭐.' : 'Auto-designated as Team Lead.'}</p>
                )}
              </div>
            </div>

            {/* Journey Route (FROM and TO) */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="origin">From (Origin) *</Label>
                <select
                  id="origin"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                >
                  <option value="">Select Origin...</option>
                  <option value="Eagle Square">Eagle Square</option>
                  <option value="Nest">Nest</option>
                  <option value="Theatre">Theatre</option>
                  <option value="Self-Driven">Self-Driven</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">To (Destination) *</Label>
                <select
                  id="destination"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                >
                  <option value="">Select Destination...</option>
                  <option value="Eagle Square">Eagle Square</option>
                  <option value="Nest">Nest</option>
                  <option value="Theatre">Theatre</option>
                  <option value="Self-Driven">Self-Driven</option>
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


            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assigned_cheetah_id">Cheetah (Vehicle) *</Label>
                <select
                  id="assigned_cheetah_id"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.assigned_cheetah_id}
                  onChange={(e) => setFormData({ ...formData, assigned_cheetah_id: e.target.value })}
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
                <Label htmlFor="assigned_nest_id">Base Location (Nest - Optional)</Label>
                <select
                  id="assigned_nest_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.assigned_nest_id || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, assigned_nest_id: e.target.value, assigned_eagle_square_id: '' })
                  }}
                >
                  <option value="">Select Nest</option>
                  {nests.map((nest) => (
                    <option key={nest.id} value={nest.id}>
                      {nest.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">Select where the DO/Team is based</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assigned_eagle_square_id">Base Location (Eagle Square - Optional)</Label>
                <select
                  id="assigned_eagle_square_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.assigned_eagle_square_id || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, assigned_eagle_square_id: e.target.value, assigned_nest_id: '' })
                  }}
                >
                  <option value="">Select Eagle Square</option>
                  {eagleSquares.map((es) => (
                    <option key={es.id} value={es.id}>
                      {es.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>




            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="etd">ETD (Estimated Time of Departure)</Label>
                <DateTimePicker
                  value={formData.etd}
                  onChange={(value) => {
                    setFormData(prev => {
                      const newData = { ...prev, etd: value }
                      if (newData.eta && value && new Date(value) > new Date(newData.eta)) {
                        newData.eta = value
                      }
                      return newData
                    })
                  }}
                  placeholder="Select estimated departure"
                />
                <p className="text-xs text-muted-foreground">When DO should depart</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="eta">ETA (Estimated Time of Arrival)</Label>
                <DateTimePicker
                  value={formData.eta}
                  onChange={(value) => setFormData({ ...formData, eta: value })}
                  minDate={formData.etd ? new Date(formData.etd) : undefined}
                  placeholder="Select estimated arrival"
                />
                <p className="text-xs text-muted-foreground">When DO should arrive</p>
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
      {/* Edit Journey Dialog - Reusing the form structure */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Journey</DialogTitle>
            <DialogDescription>
              Update journey details, reassign Cheetahs or DOs.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateJourney} className="space-y-6 mt-4">
            {/* Core Assignment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="edit_papa_id">Principal (Papa) *</Label>
                <select
                  id="edit_papa_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.papa_id}
                  onChange={(e) => setFormData({ ...formData, papa_id: e.target.value })}
                  required
                >
                  <option value="">Select Principal</option>
                  {papas.map((papa) => (
                    <option key={papa.id} value={papa.id}>
                      {papa.title} {papa.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_program_id">Program (Optional)</Label>
                <select
                  id="edit_program_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.program_id}
                  onChange={(e) => setFormData({ ...formData, program_id: e.target.value })}
                >
                  <option value="">Select Program</option>
                  {programs.map((prog) => (
                    <option key={prog.id} value={prog.id}>
                      {prog.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="edit_assigned_cheetah_id">Assigned Cheetah</Label>
                <select
                  id="edit_assigned_cheetah_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.assigned_cheetah_id}
                  onChange={(e) => setFormData({ ...formData, assigned_cheetah_id: e.target.value })}
                >
                  <option value="">Select Vehicle</option>
                  {cheetahs.map((cheetah) => (
                    <option key={cheetah.id} value={cheetah.id}>
                      {cheetah.call_sign} - {cheetah.registration_number}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Duty Officer(s) — DO Team</Label>
                {loadingOfficers ? (
                  <p className="text-xs text-muted-foreground animate-pulse">Loading officers…</p>
                ) : (
                  <>
                    <Input
                      value={doSearch}
                      onChange={(e) => setDoSearch(e.target.value)}
                      placeholder="Search officers by name or Oscar unit…"
                      className="h-8 text-sm"
                    />
                    <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                      {filteredDOOfficers.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">No officers match "{doSearch}"</p>
                      ) : filteredDOOfficers.map(officer => {
                        const isSelected = selectedDOs.includes(officer.id)
                        const isLead = teamLeadId === officer.id
                        return (
                          <div key={officer.id} className={`flex items-center gap-3 px-3 py-2 transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                            <input type="checkbox" id={`edit-do-${officer.id}`} checked={isSelected} onChange={() => toggleDO(officer.id)} className="h-4 w-4 rounded border-input" />
                            <label htmlFor={`edit-do-${officer.id}`} className="flex-1 cursor-pointer">
                              <span className="font-medium text-sm">{officer.full_name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{officer.oscar || officer.role}</span>
                            </label>
                            {isSelected && selectedDOs.length > 1 && (
                              <button type="button" onClick={() => setTeamLeadId(officer.id)}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${isLead ? 'bg-yellow-400 text-yellow-900 border-yellow-500 font-bold' : 'bg-muted text-muted-foreground border-border hover:border-yellow-400'
                                  }`}>{isLead ? '⭐ Lead' : 'Set Lead'}</button>
                            )}
                            {isSelected && selectedDOs.length === 1 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900 font-bold">⭐ Lead</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Journey Type */}
            <div className="space-y-2">
              <Label htmlFor="edit_journey_type">Journey Type</Label>
              <select
                id="edit_journey_type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={formData.journey_type}
                onChange={(e) => setFormData({ ...formData, journey_type: e.target.value })}
              >
                <option value="airport_to_nest_to_theatre">Eagle Square → Nest → Theatre → Return</option>
                <option value="airport_to_theatre">Eagle Square → Theatre (Direct) → Return</option>
                <option value="self_arrival">Self-Arrival — Papa arrives own way to Theatre</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="edit_assigned_nest_id">Base Location (Nest)</Label>
                <select
                  id="edit_assigned_nest_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.assigned_nest_id || ''}
                  onChange={(e) => setFormData({ ...formData, assigned_nest_id: e.target.value, assigned_eagle_square_id: '' })}
                >
                  <option value="">Select Nest</option>
                  {nests.map((nest) => (
                    <option key={nest.id} value={nest.id}>
                      {nest.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_assigned_eagle_square_id">Base Location (Eagle Square)</Label>
                <select
                  id="edit_assigned_eagle_square_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.assigned_eagle_square_id || ''}
                  onChange={(e) => setFormData({ ...formData, assigned_eagle_square_id: e.target.value, assigned_nest_id: '' })}
                >
                  <option value="">Select Eagle Square</option>
                  {eagleSquares.map((es) => (
                    <option key={es.id} value={es.id}>
                      {es.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Route Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="edit_origin">Origin *</Label>
                <Input
                  id="edit_origin"
                  placeholder="e.g. Airport"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_destination">Destination *</Label>
                <Input
                  id="edit_destination"
                  placeholder="e.g. Hotel"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  required
                />
              </div>
            </div>


            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="edit_notes">Operational Notes</Label>
              <Textarea
                id="edit_notes"
                placeholder="Any special requirements or instructions..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Journey Timeline Dialog */}
      <JourneyTimelineDialog
        journeyId={timelineJourneyId}
        papaName={timelinePapaName}
        open={!!timelineJourneyId}
        onOpenChange={(open) => !open && setTimelineJourneyId(null)}
      />
    </div >
  )
}
