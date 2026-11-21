"use client"

import { useReloadOnDeletion } from "@/hooks/useDashboardDeletions"
import { useEffect, useState, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn, canManageJourney, isAdmin } from "@/lib/utils"
import { useCurrentUser } from "@/hooks/useCurrentUser"
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
  Trash2,
  History,
  Route,
  Search
} from "lucide-react"
import { JourneyTimelineDialog } from "@/components/journeys/JourneyTimelineDialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { format, formatDistanceToNow, isValid } from "date-fns"
import { toast } from "sonner"
import { notifyError } from '@/lib/notify'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { getCallSignLabel, resolveCallSignKey, TNCP_CALL_SIGN_COLORS } from "@/lib/constants/tncpCallSigns"
import { CALL_SIGN_KEY_TO_DB_ENUM, type CallSignKey } from "@/lib/constants/call-signs"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { usePagination } from "@/hooks/usePagination"
import OperationalReadiness from "@/components/journeys/OperationalReadiness"
import { DutyJourneyActions } from '@/components/operations/DutyJourneyActions'

/**
 * The role journey permissions are checked against: 'admin' for an admin
 * grant, otherwise the officer's own role. The Oscar never counts (it is a
 * display label), so a Delta Oscar whose Oscar reads "Command" is not
 * leadership here, matching SQL is_admin() and update_journey_call_sign.
 */
function journeyAuthorityRole(role: string | null | undefined, hasAdminAccess: boolean | null | undefined): string | null {
  if (hasAdminAccess === true) return 'admin'
  return role ?? null
}

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
  assigned_theatre_id?: string | null
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
  is_deleted?: boolean | null
  eta: string | null
  etd: string | null
  papas: { full_name: string; title: string } | null
  cheetahs: { call_sign: string | null; registration_number: string; driver_name?: string; driver_phone?: string } | null
  assigned_do?: { full_name: string; oscar: string } | null
  nests?: { name: string } | null
  eagle_squares?: { name: string; code: string } | null
}

// Everything that isn't finished is live. A fixed allow-list here once hid
// journeys in Cocktail (Papa in transit) and other early statuses until the
// DO sent a later call sign.
const FINISHED_JOURNEY_STATUSES = new Set(['completed', 'cancelled'])
const isActiveJourneyStatus = (status?: string | null) => !!status && !FINISHED_JOURNEY_STATUSES.has(status)

type JourneyTab = 'active' | 'completed'
const resolveJourneyTab = (value: string | null): JourneyTab => value === 'completed' ? 'completed' : 'active'

/** ETD as a timestamp for sorting; journeys without a usable ETD sort last. */
const etdSortKey = (journey: Journey) => {
  const time = journey.etd ? new Date(journey.etd).getTime() : NaN
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

const formatEtd = (etd: string | null) => {
  if (!etd) return 'No ETD'
  const date = new Date(etd)
  return isValid(date) ? `ETD: ${format(date, 'EEE d MMM, HH:mm')}` : 'No ETD'
}

// Realtime sends one event per changed row; a DO sending a call sign can touch
// several rows at once. Wait for the burst to settle and reload once.
const REALTIME_RELOAD_DELAY_MS = 1000

export default function JourneysClient({
  initialJourneys,
  initialPapas,
  initialCheetahs,
  initialPrograms,
  initialOfficers,
  initialNests,
  initialEagleSquares
}: {
  /** null when the server read failed; the client then loads them itself. */
  initialJourneys: Journey[] | null
  initialPapas: any[]
  initialCheetahs: any[]
  initialPrograms: any[]
  initialOfficers: any[]
  initialNests: any[]
  initialEagleSquares: any[]
}) {
  const supabase = createClient()
  // The server's first page does not exclude soft-deleted journeys; hide them
  // here and re-read that page (below) so "Load more" offsets line up.
  const [journeys, setJourneys] = useState<Journey[]>(() => (initialJourneys ?? []).filter(j => j.is_deleted !== true))
  const serverJourneysIncludedDeleted = useRef((initialJourneys ?? []).some(j => j.is_deleted === true))
  const [papas, setPapas] = useState<any[]>(initialPapas)
  const [cheetahs, setCheetahs] = useState<any[]>(initialCheetahs)
  const [programs, setPrograms] = useState<any[]>(initialPrograms)
  const [officers, setOfficers] = useState<any[]>(initialOfficers)
  const [nests, setNests] = useState<any[]>(initialNests)
  const [eagleSquares, setEagleSquares] = useState<any[]>(initialEagleSquares)
  // Start in the loading state when the server could not supply the first
  // page, so "No active journeys" is never shown for a list we never read.
  const serverJourneysMissing = useRef(initialJourneys == null)
  const [loading, setLoading] = useState(initialJourneys == null)
  const [journeysLoadFailed, setJourneysLoadFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const { page, from, to, hasMore, setHasMore, nextPage, resetPage } = usePagination({ pageSize: 50 })
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [isCreatingJourney, setIsCreatingJourney] = useState(false)
  const [isUpdatingJourney, setIsUpdatingJourney] = useState(false)
  const createJourneyInFlight = useRef(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [callSignDialogOpen, setCallSignDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [journeyToDelete, setJourneyToDelete] = useState<Journey | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentRole, setCurrentRole] = useState<string | null>(null)
  const { data: currentUser } = useCurrentUser()

  // Derive role/id from the shared cached hook — no async race condition.
  // Leadership comes from the role or the admin grant only; the Oscar is a
  // display label and never makes anyone leadership. A Delta Oscar keeps their
  // own journey powers through the assigned-DO check below.
  const resolvedRole = useMemo(() => {
    if (!currentUser) return currentRole
    return journeyAuthorityRole(currentUser.role, currentUser.has_admin_access)
  }, [currentUser, currentRole])

  const resolvedUserId = currentUser?.id ?? currentUserId

  // Timeline UI State
  const [timelineJourneyId, setTimelineJourneyId] = useState<string | null>(null)
  const [timelinePapaName, setTimelinePapaName] = useState<string>('')

  // Multi-DO state
  const [programOfficers, setProgramOfficers] = useState<any[]>([])
  const [loadingOfficers, setLoadingOfficers] = useState(false)
  const [doSearch, setDoSearch] = useState('')
  const searchParams = useSearchParams()
  const [pulsingJourneyId, setPulsingJourneyId] = useState<string | null>(null)
  const confirm = useConfirm()

  // The tab, search and programme live in the address bar, so a link or a
  // refresh lands on the same view.
  const [activeTab, setActiveTab] = useState<JourneyTab>(() => resolveJourneyTab(searchParams.get('tab')))
  const [journeySearch, setJourneySearch] = useState(() => searchParams.get('q') ?? '')
  const [programmeFilter, setProgrammeFilter] = useState(() => searchParams.get('programme') || 'all')
  const writeAddress = (name: 'tab' | 'q' | 'programme', value: string | null) => {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set(name, value)
    else url.searchParams.delete(name)
    // A notification's ?highlight= has done its job once the view changes;
    // leaving it would re-scroll to that journey on every filter change.
    url.searchParams.delete('highlight')
    window.history.replaceState(null, '', url)
  }
  const selectTab = (next: string) => {
    const tab = resolveJourneyTab(next)
    setActiveTab(tab)
    writeAddress('tab', tab === 'active' ? null : tab)
  }
  const changeSearch = (next: string) => {
    setJourneySearch(next)
    writeAddress('q', next.trim() ? next : null)
  }
  const selectProgramme = (next: string) => {
    setProgrammeFilter(next)
    writeAddress('programme', next === 'all' ? null : next)
  }
  const clearFilters = () => {
    setJourneySearch('')
    setProgrammeFilter('all')
    const url = new URL(window.location.href)
    url.searchParams.delete('q')
    url.searchParams.delete('programme')
    url.searchParams.delete('highlight')
    window.history.replaceState(null, '', url)
  }
  const hasFilters = journeySearch.trim() !== '' || programmeFilter !== 'all'

  const filteredDOOfficers = programOfficers
    .filter(officer => !['captain', 'head_of_operations'].includes(officer.role))
    .filter(officer => {
      if (!doSearch.trim()) return true
      const q = doSearch.trim().toLowerCase()
      return (officer.full_name ?? '').toLowerCase().includes(q) || (officer.oscar ?? '').toLowerCase().includes(q)
    })
  const [selectedDOs, setSelectedDOs] = useState<string[]>([])
  const [teamLeadId, setTeamLeadId] = useState<string>('')
  // True once the officer adds or removes a duty officer in the open dialog.
  // An edited list is authoritative (it may be empty); an untouched one keeps
  // the journey's existing lead.
  const [doListTouched, setDOListTouched] = useState(false)

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

  const canCreateJourney = resolvedRole ? isAdmin(resolvedRole) : false

  // Fetch officers eligible for the SELECTED program only — eligible means
  // formally title-assigned to it, or having responded "available" to a
  // mission-availability request tied to it. Not "any officer in the
  // system": a DO must actually be working/available for this specific
  // program.
  useEffect(() => {
    if (!formData.program_id) {
      setProgramOfficers([])
      return
    }
    const fetchOfficers = async () => {
      setLoadingOfficers(true)
      try {
        const res = await fetch(`/api/officers/by-program?program_id=${formData.program_id}`)
        if (!res.ok) {
          const errText = await res.text()
          console.error('by-program error response:', errText)
          toast.error('Could not load officers for this program')
          setProgramOfficers([])
          return
        }
        const json = await res.json()
        if (json.error) {
          console.error('by-program API error:', json.error)
          notifyError(json.error, 'Could not load officers')
          setProgramOfficers([])
        } else {
          setProgramOfficers(json.officers || [])
        }
      } catch (err) {
        console.error('Error fetching program officers:', err)
        toast.error('Failed to load officers for this program')
        setProgramOfficers([])
      } finally {
        setLoadingOfficers(false)
      }
    }
    void fetchOfficers()
  }, [formData.program_id])

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

  const loadedCountRef = useRef(0)
  useEffect(() => { loadedCountRef.current = journeys.length }, [journeys])

  const toggleDO = (userId: string) => {
    // Work out the next selection and lead together in the handler, not inside
    // a state updater, so the lead can never point at an unselected officer.
    const next = selectedDOs.includes(userId) ? selectedDOs.filter(id => id !== userId) : [...selectedDOs, userId]
    setSelectedDOs(next)
    setDOListTouched(true)
    if (next.length === 1 || !next.includes(teamLeadId)) setTeamLeadId(next[0] ?? '')
  }

  const resetDOState = () => {
    setSelectedDOs([])
    setTeamLeadId('')
    setDOListTouched(false)
  }

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setCurrentUserId(user.id)
          // Also set currentRole as fallback in case useCurrentUser hasn't resolved yet
          const { data: userRow } = await supabase
            .from('users')
            .select('role, has_admin_access')
            .eq('id', user.id)
            .single<any>()
          if (userRow?.role) setCurrentRole(journeyAuthorityRole(userRow.role, userRow.has_admin_access))
        }
      } catch (error) {
        console.error('Error loading current user for JourneysPage:', error)
      }
    }
    init()
    if (serverJourneysMissing.current) void loadJourneys(false)
    else if (serverJourneysIncludedDeleted.current) void loadJourneys(false, false)

    // Subscribe to real-time updates
    let reloadTimer: ReturnType<typeof setTimeout> | null = null
    const channel = supabase
      .channel(`journeys_changes_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, () => {
        // Refresh in place, keeping every page already loaded, instead of
        // throwing the user back to page one on each DO call sign.
        // Realtime refreshes are background work. Their failures must not
        // emit a second, contradictory toast after a successful create/update.
        // Debounced so a burst of changes triggers a single reload.
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => {
          reloadTimer = null
          void loadJourneys(false, false, loadedCountRef.current)
        }, REALTIME_RELOAD_DELAY_MS)
      })
      .subscribe()

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (page > 0) loadJourneys(true)
  }, [page])

  const loadJourneys = async (isLoadMore = false, reportError = true, keepLoaded = 0): Promise<boolean> => {
    if (isLoadMore) setLoadingMore(true)
    try {
      const rangeFrom = isLoadMore ? from : 0
      const rangeTo = isLoadMore ? to : Math.max(49, keepLoaded - 1)

      const { data, error } = await supabase.from('journeys').select(`
        *,
        papas!journeys_papa_id_fkey(title, full_name),
        cheetahs (call_sign, registration_number, driver_name, driver_phone),
        assigned_do:users!journeys_assigned_duty_officer_id_fkey (full_name),
        nests (name),
        eagle_squares (name, code),
        programs (name, status)
      `)
        // Soft-deleted journeys are hidden, as in My Operations and Ops Monitor.
        .or('is_deleted.is.null,is_deleted.eq.false')
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
        setHasMore(isLoadMore || !keepLoaded ? data.length === 50 : data.length >= Math.max(50, keepLoaded))
      }
      if (!isLoadMore) setJourneysLoadFailed(false)
      return true
    } catch (error) {
      console.error('Error loading journeys data:', error)
      if (!isLoadMore) setJourneysLoadFailed(true)
      if (reportError) notifyError(error, 'Failed to load journeys')
      return false
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

  useReloadOnDeletion(['programs', 'papas', 'cheetahs', 'nests', 'eagle_squares', 'users'], () => {
    void loadLookups()
  })
  useReloadOnDeletion(['programs', 'journeys', 'papas', 'cheetahs', 'nests', 'eagle_squares', 'users'], () => {
    void loadJourneys(false, false, loadedCountRef.current)
  })

  const handleCreateJourney = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canCreateJourney) {
      toast.error('You are not authorized to create journeys')
      return
    }

    // React state updates on the next render; the ref closes the window for a
    // second submit event arriving before the button becomes disabled.
    if (createJourneyInFlight.current) return
    createJourneyInFlight.current = true
    setIsCreatingJourney(true)

    try {
      const lead = teamLeadId || selectedDOs[0] || null
      // secondary_papa_ids is client-only form state for the journey_papas
      // junction table below — it has no matching column on `journeys`
      // itself, so it must never be spread into this insert payload.
      const { secondary_papa_ids: _secondaryPapaIds, ...formDataForJourneysTable } = formData
      // Convert empty-string UUID fields to null to avoid Postgres uuid parse errors
      const sanitized = {
        ...formDataForJourneysTable,
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
      if (!newJourney?.id) throw new Error('Journey was not returned after creation')

      let relatedSaveFailed = false
      // Save DO assignments to junction table
      if (selectedDOs.length > 0 && newJourney?.id) {
        try {
          const doPayload = selectedDOs.map(uid => ({ user_id: uid, is_lead: uid === (lead ?? '') }))
          const response = await fetch('/api/journey-duty-officers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ journey_id: newJourney.id, officers: doPayload })
          })
          if (!response.ok) throw new Error(`Duty officer assignment failed (${response.status})`)
        } catch (assignmentError) {
          console.error('Journey created, but duty officer assignments could not be saved:', assignmentError)
          // The journey exists; report this as a partial save below, not as a
          // failed journey creation.
          relatedSaveFailed = true
        }
      }

      // Save secondary papas if junction table migration is applied
      if (formData.secondary_papa_ids.length > 0 && newJourney?.id) {
        try {
          const papaPayload = formData.secondary_papa_ids.map(pid => ({ journey_id: newJourney.id, papa_id: pid, is_primary: false }))
          const { error: papaError } = await (supabase as any).from('journey_papas').insert(papaPayload)
          if (papaError) throw papaError
        } catch (papaError) {
          console.warn('Journey created, but secondary papas could not be saved.', papaError)
          relatedSaveFailed = true
        }
      }

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
      const journeyListRefreshed = await loadJourneys(false, false)
      if (relatedSaveFailed || !journeyListRefreshed) {
        const followUpIssues = [
          relatedSaveFailed && 'some assignments could not be saved',
          !journeyListRefreshed && 'the journey list could not be refreshed',
        ].filter(Boolean)
        toast.warning(`Journey created, but ${followUpIssues.join(' and ')}.`)
      } else {
        toast.success('Journey created successfully!')
      }
    } catch (error: any) {
      console.error('Error creating journey:', error)
      notifyError(error, 'Failed to create journey')
    } finally {
      createJourneyInFlight.current = false
      setIsCreatingJourney(false)
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
    setDOListTouched(false)

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

    if (isUpdatingJourney) return
    setIsUpdatingJourney(true)
    try {
      // An edited DO list is authoritative, so removing every DO clears the
      // lead. Only an untouched list falls back to the journey's old lead.
      const lead = doListTouched
        ? (teamLeadId || selectedDOs[0] || null)
        : (teamLeadId || selectedDOs[0] || formData.assigned_duty_officer_id || null)
      // secondary_papa_ids is client-only form state for the journey_papas
      // junction table below — no matching column on `journeys` itself.
      const { secondary_papa_ids: _secondaryPapaIds, ...formDataForJourneysTable } = formData
      const sanitized = {
        ...formDataForJourneysTable,
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

      const failedParts: string[] = []

      // Update secondary papas. supabase-js returns errors rather than
      // throwing, so each response is checked explicitly.
      try {
        const { error: deleteError } = await (supabase as any).from('journey_papas').delete().eq('journey_id', selectedJourney.id).eq('is_primary', false)
        if (deleteError) throw deleteError
        if (formData.secondary_papa_ids.length > 0) {
          const papaPayload = formData.secondary_papa_ids.map(pid => ({ journey_id: selectedJourney.id, papa_id: pid, is_primary: false }))
          const { error: insertError } = await (supabase as any).from('journey_papas').insert(papaPayload)
          if (insertError) throw insertError
        }
      } catch (e) {
        console.warn('Journey updated, but secondary papas could not be saved.', e)
        failedParts.push('the secondary Papas')
      }

      // Sync DO assignments. An edited list is always sent, even when empty,
      // so removing every DO actually clears them.
      if (doListTouched || selectedDOs.length > 0) {
        try {
          const doPayload = selectedDOs.map(uid => ({ user_id: uid, is_lead: uid === (lead ?? '') }))
          const response = await fetch('/api/journey-duty-officers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ journey_id: selectedJourney.id, officers: doPayload })
          })
          if (!response.ok) throw new Error(`Duty officer assignment failed (${response.status})`)
        } catch (assignmentError) {
          console.error('Journey updated, but duty officer assignments could not be saved:', assignmentError)
          failedParts.push('the duty officers')
        }
      }

      if (failedParts.length > 0) {
        toast.warning(`Journey updated, but ${failedParts.join(' and ')} could not be saved.`)
      } else {
        toast.success('Journey updated successfully!')
      }
      setSelectedJourney(null)
      resetDOState()
      resetPage()
      loadJourneys(false)
    } catch (error: any) {
      console.error('Error updating journey:', error)
      notifyError(error, 'Failed to update journey')
    } finally {
      setIsUpdatingJourney(false)
    }
  }

  const handleCallSign = async (journey: Journey, newStatus: string) => {
    try {
      const canUpdate = resolvedRole && resolvedUserId
        ? canManageJourney(resolvedRole, journey.assigned_do_id === resolvedUserId)
        : false

      if (!canUpdate) {
        toast.error('You are not authorized to update this journey')
        return
      }

      // Direct update, governed by RLS journeys_update_role_scoped (the same
      // write Ops Monitor and My Operations make). The update_journey_call_sign
      // RPC is not used: it writes text into the call_sign enum column
      // (error 42804) and never set journeys.status, which this page reads.
      const { data: { user } } = await supabase.auth.getUser()
      const now = new Date().toISOString()
      const { data: updated, error } = await (supabase as any)
        .from('journeys')
        .update({ status: newStatus, current_status: newStatus, status_updated_at: now, updated_at: now })
        .eq('id', journey.id)
        .select('id')

      if (error) {
        throw error
      }
      // RLS filters a refused update to zero rows rather than raising.
      if (!updated || updated.length === 0) {
        toast.error('You are not authorized to update this journey')
        return
      }

      // journey_events.event_type is the Title-case call_sign enum; statuses
      // with no call sign (completed, cancelled) log no event.
      const eventType = CALL_SIGN_KEY_TO_DB_ENUM[newStatus as CallSignKey]
      if (eventType) {
        const { error: eventError } = await (supabase as any).from('journey_events').insert({
          journey_id: journey.id,
          event_type: eventType,
          description: `Journey status updated to ${newStatus}`,
          triggered_by: user?.id ?? null,
          triggered_at: now,
        })
        if (eventError) console.warn('Journey event not logged:', eventError)
      }

      toast.success(`Call-sign ${newStatus.toUpperCase()} executed!`)
      // Close the dialog too: clearing the journey alone left an empty dialog open.
      setCallSignDialogOpen(false)
      setSelectedJourney(null)
      resetPage()
      loadJourneys(false)
    } catch (error: any) {
      console.error('Error updating journey:', error)
      notifyError(error, 'Failed to update journey')
    }
  }

  const handleDeleteClick = (journey: Journey, e: React.MouseEvent) => {
    e.stopPropagation()
    setJourneyToDelete(journey)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!journeyToDelete) return
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('journeys')
        .delete()
        .eq('id', journeyToDelete.id)

      if (error) throw error

      toast.success('Journey deleted successfully')
      setDeleteDialogOpen(false)
      setJourneyToDelete(null)
      resetPage()
      await loadJourneys(false)
    } catch (err: any) {
      console.error('Error deleting journey:', err)
      notifyError(err, 'Failed to delete journey')
    } finally {
      setIsDeleting(false)
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
    // Statuses a type's map leaves out (e.g. cocktail after an Eagle Square
    // escort) fall back to the default workflow, so Broken Arrow and Cancel
    // stay available on every active status.
    return workflow[currentStatus] ?? workflows.airport_to_nest_to_theatre[currentStatus] ?? []
  }

  // One rule for opening the call-sign dialog, showing its actions and
  // executing a call sign (handleCallSign applies the same check).
  const canUpdateJourney = (journey: Journey | null) => journey && resolvedRole && resolvedUserId
    ? canManageJourney(resolvedRole, journey.assigned_do_id === resolvedUserId)
    : false
  const canUpdateSelectedJourney = canUpdateJourney(selectedJourney)

  const openCallSignDialog = (journey: Journey) => {
    setSelectedJourney(journey)
    setCallSignDialogOpen(true)
  }

  // Broken Arrow raises an incident and Cancelled ends the journey: ask first.
  const executeCallSign = async (journey: Journey, callSign: string) => {
    if (callSign === 'broken_arrow' && !await confirm({
      title: 'Declare Broken Arrow?',
      message: `This marks the journey for ${journey.papas?.title ?? ''} ${journey.papas?.full_name ?? 'this Papa'} as an incident (BROKEN ARROW).`.replace(/\s+/g, ' '),
      confirmText: 'Declare Broken Arrow',
      // Not 'destructive': that variant plays the delete animation.
    })) return
    if (callSign === 'cancelled' && !await confirm({
      title: 'Cancel this journey?',
      message: `The journey for ${journey.papas?.title ?? ''} ${journey.papas?.full_name ?? 'this Papa'} will be marked Cancelled and leave the active list.`.replace(/\s+/g, ' '),
      confirmText: 'Cancel journey',
      cancelText: 'Keep journey',
    })) return
    await handleCallSign(journey, callSign)
  }

  const matchesJourneyFilters = (journey: Journey) => {
    if (programmeFilter !== 'all' && journey.program_id !== programmeFilter) return false
    const q = journeySearch.trim().toLowerCase()
    if (!q) return true
    return [
      journey.papas?.title,
      journey.papas?.full_name,
      journey.assigned_do?.full_name,
      journey.cheetahs?.call_sign,
      journey.cheetahs?.registration_number,
      getStatusLabel(journey.status),
    ].filter(Boolean).join(' ').toLowerCase().includes(q)
  }
  const allActiveJourneys = journeys.filter(j => isActiveJourneyStatus(j.status))
  const allFinishedJourneys = journeys.filter(j => ['completed', 'cancelled'].includes(j.status))
  // Soonest ETD first; journeys without an ETD after them, newest first.
  const activeJourneys = allActiveJourneys
    .filter(matchesJourneyFilters)
    .sort((a, b) => etdSortKey(a) - etdSortKey(b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const finishedJourneys = allFinishedJourneys.filter(matchesJourneyFilters)

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
                    <div className="grid grid-cols-1 md:grid-cols-2 nav:grid-cols-4 gap-4">
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
      <PageHeader
        icon={Route}
        title="Journeys"
        description="Manage all Papa journeys and call-signs."
        actions={canCreateJourney && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus aria-hidden="true" />
            Create Journey
          </Button>
        )}
      />

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
      <StatGrid>
        <StatCard label="Total Journeys" icon={Route} value={journeys.length} />
        <StatCard label="Active" icon={Radio} tone="info" value={journeys.filter(j => isActiveJourneyStatus(j.status) && !['planned', 'planning', 'scheduled'].includes(j.status)).length} />
        <StatCard label="Completed" icon={CheckCircle} tone="success" value={journeys.filter(j => j.status === 'completed').length} />
        <StatCard label="Incidents" icon={AlertTriangle} tone="destructive" value={journeys.filter(j => j.status === 'broken_arrow').length} />
      </StatGrid>

      {/* Journeys Tabs */}
      <Tabs value={activeTab} onValueChange={selectTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active Journeys</TabsTrigger>
          <TabsTrigger value="completed">Completed / Archived</TabsTrigger>
        </TabsList>

        {/* Search and programme filter apply to both tabs. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search journeys"
              placeholder="Search Papa, DO or call sign…"
              className="h-9 bg-background pl-9 text-base sm:text-sm"
              value={journeySearch}
              onChange={(e) => changeSearch(e.target.value)}
            />
          </div>
          <Select value={programmeFilter} onValueChange={selectProgramme}>
            <SelectTrigger className="h-9 w-full bg-background sm:w-56" aria-label="Filter by programme">
              <SelectValue placeholder="All programmes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programmes</SelectItem>
              {programs.map((program: any) => (
                <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>
              ))}
              {/* A programme from the link that is not in the list (deleted, or not visible to you). */}
              {programmeFilter !== 'all' && !programs.some((program: any) => program.id === programmeFilter) && (
                <SelectItem value={programmeFilter}>Unknown programme</SelectItem>
              )}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>

        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Journeys</CardTitle>
              <CardDescription>Live monitoring of ongoing movements</CardDescription>
            </CardHeader>
            <CardContent>
              {journeysLoadFailed && journeys.length === 0 ? (
                <ErrorState title="Couldn't load journeys" onRetry={() => { setLoading(true); void loadJourneys(false) }} />
              ) : allActiveJourneys.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  title="No active journeys"
                  description={canCreateJourney ? "Create a new journey to get started" : "Journeys will appear here once they are planned."}
                  action={canCreateJourney && (
                    <Button onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Journey
                    </Button>
                  )}
                />
              ) : activeJourneys.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No active journeys match"
                  description="Try another search or programme."
                  action={<Button variant="outline" className="h-9" onClick={clearFilters}>Clear filters</Button>}
                />
              ) : (
                <div className="space-y-4">
                  {activeJourneys
                    .map((journey) => {
                      // Only people the call-sign dialog would accept can open it.
                      const canOpen = canUpdateJourney(journey)
                      return (
                      <div
                        key={journey.id}
                        id={`journey-${journey.id}`}
                        className={cn(
                          "flex flex-col gap-4 rounded-lg border p-4 transition-all animate-slide-up",
                          canOpen && "cursor-pointer hover:bg-accent/50 hover:shadow-md",
                          pulsingJourneyId === journey.id && "ring-2 ring-primary animate-pulse-highlight"
                        )}
                        // The card stays a plain container so its History/Edit/Delete
                        // buttons remain separate controls; the status badge below is
                        // the real button for keyboard and screen-reader users.
                        onClick={canOpen ? () => openCallSignDialog(journey) : undefined}
                      >
                        {/* Header Row: Status & Time */}
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 flex-wrap items-center gap-3">
                            {(() => {
                              const badge = (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    getStatusColor(journey.status),
                                    "px-3 py-1 text-sm font-medium text-white"
                                  )}
                                >
                                  {getStatusLabel(journey.status)}
                                </Badge>
                              )
                              return canOpen ? (
                                <button
                                  type="button"
                                  className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={`Execute call-sign for ${[journey.papas?.title, journey.papas?.full_name].filter(Boolean).join(' ') || 'this journey'} (status: ${getStatusLabel(journey.status)})`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openCallSignDialog(journey)
                                  }}
                                >
                                  {badge}
                                </button>
                              ) : badge
                            })()}
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatEtd(journey.etd)}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="hidden text-xs text-muted-foreground sm:block">
                              Updated {formatDistanceToNow(new Date(journey.updated_at ?? journey.created_at), { addSuffix: true })}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 hover:bg-muted text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
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
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 hover:bg-muted"
                                  onClick={(e) => handleEditClick(journey, e)}
                                  title="Edit Journey"
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Edit</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 hover:bg-destructive/10 text-destructive hover:text-destructive"
                                  onClick={(e) => handleDeleteClick(journey, e)}
                                  title="Delete Journey"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Main Info Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 nav:grid-cols-4 gap-4">
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
                            <div className="mt-1 p-1.5 bg-primary/10 rounded-full">
                              <Hotel className="h-4 w-4 text-primary" />
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
                      )
                    })}
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
                {finishedJourneys
                  .map((journey) => (
                    <div
                      key={journey.id}
                      id={`journey-${journey.id}`}
                      className={cn(
                        "flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg border p-4 opacity-75 transition-all hover:opacity-100 sm:flex-row sm:items-center sm:justify-between",
                        pulsingJourneyId === journey.id && "ring-2 ring-primary animate-pulse-highlight opacity-100"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className={cn('h-3 w-3 shrink-0 rounded-full', getStatusIndicatorClass(journey.status))} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {journey.papas?.title} {journey.papas?.full_name}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {journey.origin} → {journey.destination}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-4">
                        <Badge variant="outline">
                          {getStatusLabel(journey.status)}
                        </Badge>
                        <Button aria-label="View timeline"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 hover:bg-muted text-blue-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTimelineJourneyId(journey.id)
                            setTimelinePapaName(`${journey.papas?.title || ''} ${journey.papas?.full_name || ''}`)
                          }}
                          title="View Audit Trail"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {canCreateJourney && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 hover:bg-destructive/10 text-destructive hover:text-destructive"
                            onClick={(e) => handleDeleteClick(journey, e)}
                            title="Delete Journey"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(journey.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                {journeysLoadFailed && journeys.length === 0 && (
                  <ErrorState title="Couldn't load journeys" onRetry={() => { setLoading(true); void loadJourneys(false) }} />
                )}
                {!journeysLoadFailed && finishedJourneys.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {allFinishedJourneys.length > 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <span>No completed journeys match these filters</span>
                        <Button variant="outline" className="h-9" onClick={clearFilters}>Clear filters</Button>
                      </div>
                    ) : 'No completed journeys found'}
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                <p className="text-[11px] text-muted-foreground">Only officers working or available for the selected Program are eligible. They&apos;ll be notified and must accept before starting the journey.</p>
                {!formData.program_id ? (
                  <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">Select a Program above to load eligible officers.</p>
                ) : loadingOfficers ? (
                  <p className="text-xs text-muted-foreground animate-pulse">Loading officers for this program…</p>
                ) : filteredDOOfficers.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">No officers are working or available for this program yet. Send a mission availability request, or assign officers in the Officers page.</p>
                ) : (
                  <>
                    <Input
                      value={doSearch}
                      onChange={(e) => setDoSearch(e.target.value)}
                      placeholder="Search officers by name or Oscar unit…"
                      className="h-8 text-sm"
                    />
                    <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
                      {filteredDOOfficers.map(officer => {
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
                              <span className="ml-2 text-xs text-muted-foreground">{officer.title_name || officer.oscar || officer.role}</span>
                              {officer.is_available_only && (
                                <span className="ml-2 text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Available</span>
                              )}
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              <Button type="submit" disabled={isCreatingJourney}>
                {isCreatingJourney ? 'Creating Journey…' : 'Create Journey'}
              </Button>
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
                {selectedJourney.papa_id && <DutyJourneyActions journey={selectedJourney} onChanged={() => { setSelectedJourney(null); void loadJourneys(false) }} />}
                <Label>Available Call-Signs:</Label>
                <div className="grid gap-2">
                  {getAvailableCallSigns(selectedJourney.status, selectedJourney.journey_type).filter(sign => !selectedJourney.papa_id || sign !== 'completed').map((callSign) => (
                    <Button
                      key={callSign}
                      variant={callSign === 'broken_arrow' ? 'destructive' : 'outline'}
                      className="justify-start"
                      onClick={() => { void executeCallSign(selectedJourney, callSign) }}
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                {!formData.program_id ? (
                  <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">Select a Program to load eligible officers.</p>
                ) : loadingOfficers ? (
                  <p className="text-xs text-muted-foreground animate-pulse">Loading officers…</p>
                ) : filteredDOOfficers.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">No officers are working or available for this program yet.</p>
                ) : (
                  <>
                    <Input
                      value={doSearch}
                      onChange={(e) => setDoSearch(e.target.value)}
                      placeholder="Search officers by name or Oscar unit…"
                      className="h-8 text-sm"
                    />
                    <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                      {filteredDOOfficers.map(officer => {
                        const isSelected = selectedDOs.includes(officer.id)
                        const isLead = teamLeadId === officer.id
                        return (
                          <div key={officer.id} className={`flex items-center gap-3 px-3 py-2 transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                            <input type="checkbox" id={`edit-do-${officer.id}`} checked={isSelected} onChange={() => toggleDO(officer.id)} className="h-4 w-4 rounded border-input" />
                            <label htmlFor={`edit-do-${officer.id}`} className="flex-1 cursor-pointer">
                              <span className="font-medium text-sm">{officer.full_name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{officer.title_name || officer.oscar || officer.role}</span>
                              {officer.is_available_only && (
                                <span className="ml-2 text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Available</span>
                              )}
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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={formData.journey_type}
                onChange={(e) => setFormData({ ...formData, journey_type: e.target.value })}
              >
                <option value="airport_to_nest_to_theatre">Eagle Square → Nest → Theatre → Return</option>
                <option value="airport_to_theatre">Eagle Square → Theatre (Direct) → Return</option>
                <option value="self_arrival">Self-Arrival — Papa arrives own way to Theatre</option>
              </select>
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
              <Button type="submit" pending={isUpdatingJourney}>
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Delete Journey Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open && !isDeleting) {
          setDeleteDialogOpen(false)
          setJourneyToDelete(null)
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete Journey
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this journey? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {journeyToDelete && (
            <div className="rounded-md border p-3 bg-muted/30 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guest:</span>
                <span className="font-medium">
                  {journeyToDelete.papas?.title} {journeyToDelete.papas?.full_name || 'Unknown Papa'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Route:</span>
                <span className="font-medium">{journeyToDelete.origin} → {journeyToDelete.destination}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className={getStatusColor(journeyToDelete.status)}>
                  {getStatusLabel(journeyToDelete.status)}
                </Badge>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setJourneyToDelete(null)
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Journey'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Journey Timeline Dialog */}
      <JourneyTimelineDialog
        journeyId={timelineJourneyId}
        papaName={timelinePapaName}
        open={!!timelineJourneyId}
        onOpenChange={(open) => !open && setTimelineJourneyId(null)}
      />
    </div>
  )
}
