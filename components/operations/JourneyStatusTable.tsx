"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { audioManager } from '@/lib/audio/AudioManager'
import FlightStatusBadge from '@/components/tracking/FlightStatusBadge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { formatDistanceToNow } from 'date-fns'
import { Search, Radio, Clock, Loader2, ChevronDown, Download, Waves, AlertTriangle } from 'lucide-react'
import { CALL_SIGNS, getCallSignLabel, getCallSignColor, SITREP_CODES, CALL_SIGN_KEY_TO_DB_ENUM, type CallSignKey } from '@/lib/constants/call-signs'
import { CallSignChip } from '@/components/ui/call-sign-chip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Latest live SITREP broadcast (traffic / route / emergency) per journey — these
// come from journey_events, not journeys.status, so they'd otherwise be invisible
// on this monitor. Keyed by journey_id.
interface LiveBroadcast {
    key: string        // underscored call sign key — drives the shared severity system
    code: string       // Title-case call sign, e.g. "Red Cocktail"
    meaning: string
    kind: 'status' | 'broadcast' | 'emergency'
    at: string
    notes: string | null
}
// SITREP_CODES.code is the same Title-case value stored in journey_events.event_type
const SITREP_BY_DB_CODE: Record<string, (typeof SITREP_CODES)[number]> = Object.fromEntries(
    SITREP_CODES.map(s => [s.code, s])
)

interface DutyOfficerRow {
    user_id: string
    is_lead: boolean
    users: { full_name: string; oscar: string | null } | null
}

interface Journey {
    id: string
    program_id: string
    papa_id: string
    assigned_cheetah_id: string
    assigned_duty_officer_id: string
    current_call_sign: string
    status: string
    eta: string | null
    etd: string | null
    status_updated_at: string
    created_at: string
    papas: { full_name: string; title: string; flight_number?: string; flight_departure_time?: string; flight_arrival_time?: string } | null
    cheetahs: { call_sign: string; registration_number: string } | null
    assigned_do: { full_name: string; oscar: string } | null
    duty_officers?: DutyOfficerRow[]
}

export default function JourneyStatusTable() {
    const supabase = createClient()
    const [journeys, setJourneys] = useState<Journey[]>([])
    const [broadcasts, setBroadcasts] = useState<Record<string, LiveBroadcast>>({})
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [programs, setPrograms] = useState<any[]>([])
    const [selectedProgram, setSelectedProgram] = useState<string>('all')
    const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null)
    const [callSignDialogOpen, setCallSignDialogOpen] = useState(false)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [canUpdateCallSigns, setCanUpdateCallSigns] = useState(false)
    const [setTimesDialogOpen, setSetTimesDialogOpen] = useState(false)
    const [selectedJourneyForTimes, setSelectedJourneyForTimes] = useState<Journey | null>(null)
    const [timesForm, setTimesForm] = useState({ eta: '', etd: '' })
    const [savingTimes, setSavingTimes] = useState(false)
    // Realtime connection status for the status dot in the footer
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
    // Stable per-tab channel name — prevents multi-tab subscription collision
    const channelName = useRef(`journey-monitor-${Math.random().toString(36).slice(2)}`).current
    // Debounce timer for INSERT-triggered full reloads
    const insertDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        let mounted = true

        loadCurrentUser()
        loadPrograms()
        loadActiveJourneys()

        // Unique channel per tab — prevents multi-admin-tab subscription conflicts
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'journeys'
                },
                (payload) => {
                    if (!mounted) return

                    // Journeys that just left the active set disappear instantly
                    // (soft-delete, completion or cancellation) instead of waiting
                    // for the 60s fallback poll
                    if (
                        payload.new?.is_deleted === true ||
                        payload.new?.status === 'completed' ||
                        payload.new?.status === 'cancelled'
                    ) {
                        setJourneys(prev => prev.filter(j => j.id !== payload.new?.id))
                        return
                    }

                    // DIRECT state update for instant UI change
                    setJourneys(prev => {
                        const updated = prev.map(journey => {
                            if (journey.id === payload.new?.id) {
                                return {
                                    ...journey,
                                    current_call_sign: payload.new.current_call_sign || journey.current_call_sign,
                                    status: payload.new.status || journey.status,
                                    status_updated_at: payload.new.status_updated_at || journey.status_updated_at
                                }
                            }
                            return journey
                        })
                        return updated
                    })

                    // Flash effect for visual feedback
                    const element = document.querySelector(`[data-journey-id="${payload.new?.id}"]`)
                    if (element) {
                        element.classList.add('animate-pulse', 'bg-primary/10')
                        setTimeout(() => {
                            element?.classList.remove('animate-pulse', 'bg-primary/10')
                        }, 2000)
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'journeys'
                },
                (payload) => {
                    if (!mounted) return
                    // Debounce burst inserts — reload once after 200ms of quiet
                    if (insertDebounceRef.current) clearTimeout(insertDebounceRef.current)
                    insertDebounceRef.current = setTimeout(() => {
                        if (mounted) loadActiveJourneys()
                    }, 200)
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'journey_duty_officers'
                },
                (payload) => {
                    if (!mounted) return
                    // Reload when DOs are assigned or they acknowledge the shift
                    if (insertDebounceRef.current) clearTimeout(insertDebounceRef.current)
                    insertDebounceRef.current = setTimeout(() => {
                        if (mounted) loadActiveJourneys()
                    }, 200)
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'journeys'
                },
                (payload) => {
                    if (!mounted) return
                    // Remove deleted journey from state immediately
                    setJourneys(prev => prev.filter(j => j.id !== (payload.old as any)?.id))
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'journey_events'
                },
                (payload) => {
                    if (!mounted) return
                    // Live SITREP broadcasts (traffic / route / emergency) only ever
                    // land here — journeys.status doesn't change for them — so this
                    // is the relay that makes them visible on the monitor.
                    const row = payload.new as any
                    const meta = SITREP_BY_DB_CODE[row?.event_type]
                    if (!row?.journey_id || !meta) return
                    setBroadcasts(prev => ({
                        ...prev,
                        [row.journey_id]: {
                            key: meta.key,
                            code: meta.code,
                            meaning: meta.meaning,
                            kind: meta.kind,
                            at: row.triggered_at || row.created_at || new Date().toISOString(),
                            notes: row.description ?? null,
                        }
                    }))
                    // Flash the affected row + audible cue for traffic / emergency
                    const el = document.querySelector(`[data-journey-id="${row.journey_id}"]`)
                    if (el) {
                        el.classList.add('animate-pulse', 'bg-primary/10')
                        setTimeout(() => el.classList.remove('animate-pulse', 'bg-primary/10'), 2000)
                    }
                    if (meta.kind === 'emergency') {
                        try { audioManager.playChime('broken_arrow') } catch { /* ignore */ }
                        toast.error(meta.code, { description: meta.meaning })
                    } else if (meta.kind === 'broadcast') {
                        try { audioManager.playChime('info') } catch { /* ignore */ }
                        toast.info(meta.code, { description: meta.meaning })
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    if (mounted) setRealtimeStatus('connected')
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    if (mounted) setRealtimeStatus('disconnected')
                    console.error('Ops Monitor realtime error:', err)
                } else if (status === 'CLOSED') {
                    if (mounted) setRealtimeStatus('disconnected')
                }
            })

        // Reduced polling to 60 seconds as fallback (realtime is primary)
        const pollInterval = setInterval(() => {
            if (mounted) loadActiveJourneys()
        }, 60000)

        return () => {
            mounted = false
            if (insertDebounceRef.current) clearTimeout(insertDebounceRef.current)
            clearInterval(pollInterval)
            supabase.removeChannel(channel)
        }
    }, [])

    const loadCurrentUser = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: userData } = await supabase
                .from('users')
                .select('id, full_name, role, oscar')
                .eq('id', user.id)
                .single()

            setCurrentUser(userData)

            // Check if user can update call signs (DO or admin)
            const userRole = (userData as any)?.role as string | undefined
            const canUpdate = userRole && ['super_admin', 'dev_admin', 'admin', 'delta_oscar', 'captain', 'vice_captain', 'command', 'head_of_command', 'head_of_operations'].includes(userRole)
            setCanUpdateCallSigns(Boolean(canUpdate))
        } catch (error) {
            console.error('Error loading current user:', error)
        }
    }

    const loadPrograms = async () => {
        const { data } = await supabase.from('programs').select('id, name').eq('status', 'active')
        if (data) setPrograms(data)
    }

    const loadActiveJourneys = async () => {
        try {
            const { data, error } = await (supabase as any)
                .from('journeys')
                .select(`
                    *,
                    papas:papa_id(full_name, title, flight_number, flight_departure_time, flight_arrival_time),
                    cheetahs:assigned_cheetah_id(call_sign, registration_number),
                    assigned_do:assigned_duty_officer_id(full_name, oscar)
                `)
                .not('status', 'in', '(completed,cancelled)')
                // Soft-deleted journeys must never appear on the Ops Monitor
                .or('is_deleted.is.null,is_deleted.eq.false')
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Supabase query error:', JSON.stringify(error, null, 2))
                throw error
            }

            const rawJourneys = (data || []) as Journey[]

            // Fetch duty officer teams for all journeys
            const ids = rawJourneys.map(j => j.id)
            let doMap: Record<string, DutyOfficerRow[]> = {}
            if (ids.length > 0) {
                const { data: doData } = await (supabase as any)
                    .from('journey_duty_officers')
                    .select('journey_id, user_id, is_lead, users:user_id(full_name, oscar)')
                    .in('journey_id', ids)
                for (const row of doData || []) {
                    if (!doMap[row.journey_id]) doMap[row.journey_id] = []
                    doMap[row.journey_id].push(row)
                }
            }

            setJourneys(rawJourneys.map(j => ({ ...j, duty_officers: doMap[j.id] || [] })))

            // Seed the latest live broadcast (traffic / route / emergency) per journey
            // so a monitor opened mid-operation shows the last SITREP, not a blank.
            if (ids.length > 0) {
                const { data: evData } = await (supabase as any)
                    .from('journey_events')
                    .select('journey_id, event_type, description, triggered_at, created_at')
                    .in('journey_id', ids)
                    .order('triggered_at', { ascending: false, nullsFirst: false })
                const seeded: Record<string, LiveBroadcast> = {}
                for (const row of evData || []) {
                    if (seeded[row.journey_id]) continue // rows are newest-first — keep the first
                    const meta = SITREP_BY_DB_CODE[row.event_type]
                    if (!meta) continue
                    seeded[row.journey_id] = {
                        key: meta.key,
                        code: meta.code,
                        meaning: meta.meaning,
                        kind: meta.kind,
                        at: row.triggered_at || row.created_at || new Date().toISOString(),
                        notes: row.description ?? null,
                    }
                }
                setBroadcasts(seeded)
            }
        } catch (error) {
            console.error('Error loading journeys:', JSON.stringify(error, null, 2))
            toast.error('Failed to load active journeys')
        } finally {
            setLoading(false)
        }
    }

    const handleSetTimes = (journey: Journey) => {
        setSelectedJourneyForTimes(journey)
        setTimesForm({
            eta: journey.eta ? new Date(journey.eta).toISOString().slice(0, 16) : '',
            etd: journey.etd ? new Date(journey.etd).toISOString().slice(0, 16) : '',
        })
        setSetTimesDialogOpen(true)
    }

    const handleSaveTimes = async () => {
        if (!selectedJourneyForTimes) return
        setSavingTimes(true)
        try {
            const { error } = await (supabase as any)
                .from('journeys')
                .update({
                    eta: timesForm.eta ? new Date(timesForm.eta).toISOString() : null,
                    etd: timesForm.etd ? new Date(timesForm.etd).toISOString() : null,
                })
                .eq('id', selectedJourneyForTimes.id)
            if (error) throw error
            toast.success('Journey times updated')
            setSetTimesDialogOpen(false)
            setSelectedJourneyForTimes(null)
            loadActiveJourneys()
        } catch (error: any) {
            toast.error(error.message || 'Failed to update times')
        } finally {
            setSavingTimes(false)
        }
    }

    const playCallSignChime = () => {
        audioManager.playChime('success')
    }

    const handleCallSignClick = (journey: Journey) => {
        // Admin is READ-ONLY on Ops Monitor — status changes come from the assigned DO only
        const isAssignedDO = !!(journey.duty_officers?.some(d => d.user_id === currentUser?.id)) ||
            currentUser?.id === journey.assigned_duty_officer_id ||
            currentUser?.id === (journey as any).assigned_do_id

        if (!isAssignedDO) return   // admin sees the badge but cannot click

        setSelectedJourney(journey)
        setCallSignDialogOpen(true)
    }

    const handleUpdateCallSign = async (newCallSign: string) => {
        if (!selectedJourney) return

        // Traffic / route-change signs are live broadcasts — they must NOT overwrite
        // the journey's movement status, only emit a journey_events row (same rule the
        // DO's My Operations panel follows), so the two surfaces stay consistent.
        const isEventOnly = ['blue_cocktail', 'red_cocktail', 're_order'].includes(newCallSign)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const now = new Date().toISOString()

            if (!isEventOnly) {
                // journey_status enum accepts underscored keys (e.g. 'first_course') ✓
                const { error } = await (supabase as any)
                    .from('journeys')
                    .update({ status: newCallSign, status_updated_at: now, updated_at: now })
                    .eq('id', selectedJourney.id)
                if (error) throw error
            }

            // Log the SITREP event (Title-case call_sign enum). For event-only signs
            // this is the whole signal, so its error must surface.
            const eventEnum = CALL_SIGN_KEY_TO_DB_ENUM[newCallSign as CallSignKey]
            if (eventEnum) {
                const { error: evErr } = await (supabase as any).from('journey_events').insert({
                    journey_id: selectedJourney.id,
                    event_type: eventEnum,
                    triggered_by: user?.id ?? null,
                    triggered_at: now,
                })
                if (evErr && isEventOnly) throw evErr
            }

            playCallSignChime()
            toast.success(
                isEventOnly
                    ? `${getCallSignLabel(newCallSign)} broadcast sent`
                    : `Call sign updated to ${getCallSignLabel(newCallSign)}`
            )
            setCallSignDialogOpen(false)
            setSelectedJourney(null)
            loadActiveJourneys()
        } catch (error: any) {
            console.error('Error updating call sign:', error)
            toast.error(error.message || 'Failed to update call sign')
        }
    }

    // Call-sign colours now come from the canonical severity system via
    // <CallSignChip>. The two local colour maps that used to live here disagreed
    // with the other surfaces (Cocktail was amber here, green on My Operations)
    // and have been removed rather than re-synced, so there is only one source.

    const ADMIN_ROLES = ['super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations', 'command', 'hod', 'hop']
    const isAdmin = currentUser?.role && ADMIN_ROLES.includes(currentUser.role)

    const filteredJourneys = journeys.filter(journey => {
        const doNames = journey.duty_officers?.map(d => d.users?.full_name?.toLowerCase() ?? '').join(' ') ??
            (journey.assigned_do?.full_name?.toLowerCase() ?? '')
        const matchesSearch =
            journey.papas?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            doNames.includes(searchQuery.toLowerCase()) ||
            journey.cheetahs?.call_sign.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesStatus = statusFilter === 'all' || journey.current_call_sign === statusFilter || journey.status === statusFilter
        const matchesProgram = selectedProgram === 'all' || journey.program_id === selectedProgram

        return matchesSearch && matchesStatus && matchesProgram
    })

    // CSV Export
    const handleExportCSV = () => {
        const headers = ['Papa', 'Title', 'DO Name', 'Cheetah', 'Status', 'ETA', 'ETD', 'Last Updated']
        const rows = filteredJourneys.map(j => [
            j.papas?.full_name ?? '',
            j.papas?.title ?? '',
            j.duty_officers?.find(d => d.is_lead)?.users?.full_name ?? j.assigned_do?.full_name ?? '',
            j.cheetahs?.call_sign ?? '',
            j.status || j.current_call_sign || '',
            j.eta ? new Date(j.eta).toLocaleString('en-GB') : '',
            j.etd ? new Date(j.etd).toLocaleString('en-GB') : '',
            j.status_updated_at ? new Date(j.status_updated_at).toLocaleString('en-GB') : '',
        ])
        const csv = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ops-monitor-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(`Exported ${filteredJourneys.length} journey${filteredJourneys.length !== 1 ? 's' : ''} to CSV`)
    }

    // Stats
    const stats = {
        total: journeys.length,
        inTransit: journeys.filter(j => ['cocktail', 'first_course', 'dessert', 're_order'].includes(j.status)).length,
        brokenArrow: journeys.filter(j => j.status === 'broken_arrow').length,
        planned: journeys.filter(j => j.status === 'planned').length,
    }

    if (loading) {
        return (
            <div className="space-y-4">
                {/* Stats strip skeleton */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between">
                            <div className="space-y-2">
                                <div className="h-3 w-20 rounded skeleton" />
                                <div className="h-7 w-10 rounded skeleton" />
                            </div>
                            <div className="h-6 w-6 rounded skeleton" />
                        </div>
                    ))}
                </div>
                {/* Filter bar skeleton */}
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="h-10 flex-1 rounded-md skeleton" />
                    <div className="h-10 w-[180px] rounded-md skeleton" />
                    <div className="h-10 w-[180px] rounded-md skeleton" />
                    <div className="h-10 w-24 rounded-md skeleton" />
                </div>
                {/* Table skeleton */}
                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-3 border-b flex gap-4">
                        {['w-24', 'w-28', 'w-20', 'w-16', 'w-16', 'w-20', 'w-16'].map((w, i) => (
                            <div key={i} className={`h-3 ${w} rounded skeleton`} />
                        ))}
                    </div>
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-4 border-b last:border-b-0">
                            <div className="space-y-1.5 flex-1">
                                <div className="h-4 w-32 rounded skeleton" />
                                <div className="h-3 w-20 rounded skeleton" />
                            </div>
                            <div className="h-4 w-28 rounded skeleton" />
                            <div className="h-6 w-24 rounded-full skeleton" />
                            <div className="h-3 w-14 rounded skeleton" />
                            <div className="h-3 w-14 rounded skeleton" />
                            <div className="h-3 w-20 rounded skeleton" />
                            <div className="h-7 w-20 rounded skeleton" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">

            {/* ─── Live Stats Strip ────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-muted-foreground">Total Active</p>
                        <p className="text-2xl font-bold">{stats.total}</p>
                    </div>
                    <Radio className="h-6 w-6 text-primary opacity-50" />
                </div>
                <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-muted-foreground">In Transit</p>
                        <p className="text-2xl font-bold text-emerald-600">{stats.inTransit}</p>
                    </div>
                    <Radio className="h-6 w-6 text-emerald-500 animate-pulse" />
                </div>
                <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-muted-foreground">Planned</p>
                        <p className="text-2xl font-bold text-blue-600">{stats.planned}</p>
                    </div>
                    <Clock className="h-6 w-6 text-blue-400" />
                </div>
                <div className={cn(
                    "rounded-lg border px-4 py-3 flex items-center justify-between",
                    stats.brokenArrow > 0 ? "border-destructive bg-destructive/10 animate-pulse" : "bg-card"
                )}>
                    <div>
                        <p className="text-xs text-muted-foreground">Broken Arrow</p>
                        <p className={cn("text-2xl font-bold", stats.brokenArrow > 0 ? "text-destructive" : "")}>{stats.brokenArrow}</p>
                    </div>
                    <Radio className={cn("h-6 w-6", stats.brokenArrow > 0 ? "text-destructive" : "text-muted-foreground/30")} />
                </div>
            </div>
            {/* Filters + Export */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search Papa, DO, or Cheetah..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {CALL_SIGNS.filter(cs => cs.category === 'movement').map(cs => (
                            <SelectItem key={cs.key} value={cs.key}>
                                {cs.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Program" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Programs</SelectItem>
                        {programs.map(program => (
                            <SelectItem key={program.id} value={program.id}>
                                {program.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    variant="outline"
                    size="default"
                    onClick={handleExportCSV}
                    disabled={filteredJourneys.length === 0}
                    title="Export visible journeys to CSV"
                    className="shrink-0"
                >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                </Button>
            </div>

            {/* Journey Table */}
            <div className="table-scroll-wrapper border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Papa</TableHead>
                            <TableHead className="font-semibold">DO Team</TableHead>
                            <TableHead className="font-semibold">Status</TableHead>
                            <TableHead className="font-semibold">ETA</TableHead>
                            <TableHead className="font-semibold">ETD</TableHead>
                            <TableHead className="font-semibold">Updated</TableHead>
                            <TableHead className="font-semibold">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredJourneys.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                    <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No active journeys at the moment</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredJourneys.map((journey) => {
                                const callSign = journey.status || journey.current_call_sign || 'planned'
                                const callSignLabel = getCallSignLabel(callSign) || callSign.replace(/_/g, ' ')
                                const canClick = !!(journey.duty_officers?.some(d => d.user_id === currentUser?.id) || currentUser?.id === journey.assigned_duty_officer_id || currentUser?.id === (journey as any).assigned_do_id)
                                const isBroken = callSign === 'broken_arrow'
                                const broadcast = broadcasts[journey.id]
                                const leadDO = journey.duty_officers?.find(d => d.is_lead) ?? null
                                const allDOs = journey.duty_officers ?? []

                                return (
                                    <TableRow
                                        key={journey.id}
                                        data-journey-id={journey.id}
                                        className={cn(
                                            "hover:bg-muted/30 transition-all duration-300",
                                            isBroken && "border-destructive/50 bg-destructive/5 animate-pulse"
                                        )}
                                    >
                                        <TableCell>
                                            <div className="flex flex-col items-start min-w-[140px]">
                                                <span className="font-medium">{journey.papas?.full_name || 'Unknown Papa'}</span>
                                                <span className="text-xs text-muted-foreground">{journey.papas?.title}</span>
                                                {journey.papas?.flight_number && (
                                                    <FlightStatusBadge
                                                        flightNumber={journey.papas.flight_number}
                                                        departureTime={journey.papas.flight_departure_time}
                                                        arrivalTime={journey.papas.flight_arrival_time}
                                                    />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {allDOs.length > 0 ? (
                                                <div className="flex flex-col gap-0.5">
                                                    {allDOs.map(d => (
                                                        <div key={d.user_id} className="flex items-center gap-1 text-xs">
                                                            {d.is_lead && <span className="text-yellow-500" title="Team Lead">⭐</span>}
                                                            <span className={d.is_lead ? 'font-semibold' : ''}>{d.users?.full_name ?? '—'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">{journey.assigned_do?.full_name || 'Unassigned'}</span>
                                            )}
                                        </TableCell>
                                        <TableCell colSpan={1}>
                                            {/* Only the assigned DO can change a call sign. Previously the
                                                read-only case rendered the same button at 70% opacity, which
                                                reads as "disabled control" rather than "status" — so admins
                                                now get a plain chip with no false affordance. */}
                                            {canClick ? (
                                                <button
                                                    onClick={() => handleCallSignClick(journey)}
                                                    title={`Update call sign — currently ${callSignLabel}`}
                                                    className={cn(
                                                        "group flex w-full items-center gap-1.5 rounded-full p-0.5 pr-2 text-left transition-all",
                                                        "hover:bg-muted/60 focus-visible:outline-none"
                                                    )}
                                                >
                                                    <CallSignChip callSign={callSign} />
                                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
                                                </button>
                                            ) : (
                                                <CallSignChip callSign={callSign} />
                                            )}
                                            {/* Latest live SITREP broadcast (traffic / route / emergency).
                                                Rendered through the same chip as the status above so a
                                                "Red Cocktail" here is the exact colour it is everywhere else. */}
                                            {broadcast && broadcast.kind !== 'status' && (
                                                <div
                                                    className="mt-1.5 flex items-center gap-1.5"
                                                    title={broadcast.notes || broadcast.meaning}
                                                >
                                                    <CallSignChip callSign={broadcast.key} variant="soft" size="sm" />
                                                    <span className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                                                        {formatDistanceToNow(new Date(broadcast.at), { addSuffix: true })}
                                                    </span>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {journey.eta ? (
                                                <div className="flex items-center gap-1 text-sm">
                                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                                    {new Date(journey.eta).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            ) : <span className="text-muted-foreground text-xs">—</span>}
                                        </TableCell>
                                        <TableCell>
                                            {journey.etd ? (
                                                <div className="flex items-center gap-1 text-sm">
                                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                                    {new Date(journey.etd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            ) : <span className="text-muted-foreground text-xs">—</span>}
                                        </TableCell>
                                        <TableCell>
                                            {journey.status_updated_at ? (
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDistanceToNow(new Date(journey.status_updated_at), { addSuffix: true })}
                                                </span>
                                            ) : <span className="text-xs text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-xs"
                                                onClick={() => handleSetTimes(journey)}
                                            >
                                                <Clock className="h-3 w-3 mr-1" />
                                                {journey.eta ? 'Edit Times' : 'Set Times'}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Summary Stats + Realtime Status */}
            <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-4">
                <span>
                    Showing {filteredJourneys.length} of {journeys.length} active {journeys.length === 1 ? 'journey' : 'journeys'}
                </span>
                <span className="flex items-center gap-2">
                    <span
                        className={cn(
                            "h-2.5 w-2.5 rounded-full inline-block transition-colors duration-500",
                            realtimeStatus === 'connected' && "bg-green-500 animate-pulse",
                            realtimeStatus === 'connecting' && "bg-amber-400 animate-pulse",
                            realtimeStatus === 'disconnected' && "bg-red-500"
                        )}
                        title={realtimeStatus === 'connected' ? 'Live updates active' : realtimeStatus === 'connecting' ? 'Connecting...' : 'Realtime disconnected — data may be stale'}
                    />
                    {realtimeStatus === 'connected' ? 'Live' : realtimeStatus === 'connecting' ? 'Connecting...' : '⚠ Disconnected'}
                </span>
            </div>

            {/* Call Sign Update Dialog */}
            <Dialog open={callSignDialogOpen} onOpenChange={setCallSignDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Update Call Sign</DialogTitle>
                        <DialogDescription>
                            Select the new call sign for {selectedJourney?.papas?.full_name}'s journey
                        </DialogDescription>
                    </DialogHeader>

                    {/* Movement Call Signs */}
                    <div className="space-y-4 py-4">
                        <div>
                            <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Movement Updates</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {CALL_SIGNS.filter(cs => cs.category === 'movement').map((callSign) => (
                                    <button
                                        key={callSign.key}
                                        onClick={() => handleUpdateCallSign(callSign.key)}
                                        className={cn(
                                            "p-3 rounded-lg border-2 transition-all hover:scale-105 flex flex-col items-center text-center",
                                            callSign.color,
                                            "text-white hover:opacity-90",
                                            selectedJourney?.current_call_sign === callSign.key && "ring-2 ring-primary ring-offset-2"
                                        )}
                                    >
                                        <div className="w-3 h-3 rounded-full bg-white/30 mb-2" />
                                        <span className="font-semibold text-sm">{callSign.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Incident Call Signs */}
                        <div>
                            <h4 className="text-sm font-semibold mb-3 text-destructive">Emergency / Incident</h4>
                            <div className="grid grid-cols-1 gap-2">
                                {CALL_SIGNS.filter(cs => cs.category === 'incident').map((callSign) => (
                                    <button
                                        key={callSign.key}
                                        onClick={() => handleUpdateCallSign(callSign.key)}
                                        className={cn(
                                            "p-3 rounded-lg border-2 border-destructive/50 transition-all hover:scale-[1.02] flex items-center gap-3",
                                            "bg-destructive/10 hover:bg-destructive/20 text-destructive",
                                            selectedJourney?.current_call_sign === callSign.key && "ring-2 ring-destructive ring-offset-2"
                                        )}
                                    >
                                        <div className="w-3 h-3 rounded-full bg-destructive" />
                                        <div className="text-left">
                                            <span className="font-semibold text-sm block">{callSign.label}</span>
                                            <span className="text-xs opacity-75">{callSign.description}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Set Times Dialog */}
            <Dialog open={setTimesDialogOpen} onOpenChange={setSetTimesDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Set Journey Times</DialogTitle>
                        <DialogDescription>
                            Update ETA and ETD for {selectedJourneyForTimes?.papas?.full_name ?? 'this journey'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">ETA — Estimated Time of Arrival</label>
                            <input
                                type="datetime-local"
                                value={timesForm.eta}
                                onChange={(e) => setTimesForm(prev => ({ ...prev, eta: e.target.value }))}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">ETD — Estimated Time of Departure</label>
                            <input
                                type="datetime-local"
                                value={timesForm.etd}
                                onChange={(e) => setTimesForm(prev => ({ ...prev, etd: e.target.value }))}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={() => setSetTimesDialogOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={handleSaveTimes} disabled={savingTimes}>
                            {savingTimes && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Save Times
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
