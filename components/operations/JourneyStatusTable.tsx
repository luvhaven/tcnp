"use client"

import { useReloadOnDeletion } from "@/hooks/useDashboardDeletions"
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
import { format, formatDistanceToNow } from 'date-fns'
import { Search, Radio, Clock, Loader2, ChevronDown, Download, AlertTriangle } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { CALL_SIGNS, getCallSignLabel, SITREP_CODES, CALL_SIGN_KEY_TO_DB_ENUM, type CallSignKey } from '@/lib/constants/call-signs'
import { CallSignChip } from '@/components/ui/call-sign-chip'
import { toast } from 'sonner'
import { cn, isAdmin, effectiveOscarRole } from '@/lib/utils'
import { OfficerProfileDialog, type OfficerProfileData } from '@/components/officers/OfficerProfileDialog'
import { isOwnAssignment } from '@/hooks/useMyOperations'

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
    status?: string | null
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
    cheetahs: { call_sign: string | null; registration_number: string | null } | null
    assigned_do: { full_name: string; oscar: string } | null
    duty_officers?: DutyOfficerRow[]
}

export default function JourneyStatusTable() {
    const supabase = createClient()
    const [journeys, setJourneys] = useState<Journey[]>([])
    const [broadcasts, setBroadcasts] = useState<Record<string, LiveBroadcast>>({})
    const [loading, setLoading] = useState(true)
    // The last load failed. With no journeys on screen this shows an error
    // instead of "No active journeys", which would be a guess.
    const [loadFailed, setLoadFailed] = useState(false)
    const [retrying, setRetrying] = useState(false)
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
    const [selectedOfficer, setSelectedOfficer] = useState<OfficerProfileData | null>(null)
    // Realtime connection status for the status dot in the footer
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
    // Stable per-tab channel name — prevents multi-tab subscription collision
    const loadSeqRef = useRef(0)
    const channelName = useRef(`journey-monitor-${Math.random().toString(36).slice(2)}`).current
    // Debounce timer for INSERT-triggered full reloads
    const insertDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // True once the profile read succeeds; until then the poll and retry try again,
    // so a one-off failed read doesn't hide Set Times for the whole visit
    const currentUserLoadedRef = useRef(false)

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

                    // The instant patch covers status only. Reload shortly after to
                    // pick up restored journeys and edits to ETA, DO or Cheetah.
                    if (insertDebounceRef.current) clearTimeout(insertDebounceRef.current)
                    insertDebounceRef.current = setTimeout(() => {
                        if (mounted) loadActiveJourneys()
                    }, 500)

                    // Flash effect for visual feedback (the phone card and the
                    // table row both carry the id; only one is visible)
                    document.querySelectorAll(`[data-journey-id="${payload.new?.id}"]`).forEach(element => {
                        element.classList.add('animate-pulse', 'bg-primary/10')
                        setTimeout(() => {
                            element.classList.remove('animate-pulse', 'bg-primary/10')
                        }, 2000)
                    })
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
                    document.querySelectorAll(`[data-journey-id="${row.journey_id}"]`).forEach(el => {
                        el.classList.add('animate-pulse', 'bg-primary/10')
                        setTimeout(() => el.classList.remove('animate-pulse', 'bg-primary/10'), 2000)
                    })
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
            if (!mounted) return
            if (!currentUserLoadedRef.current) loadCurrentUser()
            loadActiveJourneys()
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
                .select('id, full_name, role, oscar, has_admin_access')
                .eq('id', user.id)
                .single()

            if (!userData) return
            currentUserLoadedRef.current = true
            setCurrentUser(userData)

            // Check if user can update call signs (DO or admin)
            const userRole = (userData as any)?.role as string | undefined
            const userOscar = (userData as any)?.oscar as string | undefined
            const canUpdate = userRole && (isAdmin(userRole) || isAdmin(effectiveOscarRole(userRole, userOscar)) || userRole === 'delta_oscar')
            setCanUpdateCallSigns(Boolean(canUpdate))
        } catch (error) {
            console.error('Error loading current user:', error)
        }
    }

    useReloadOnDeletion(['programs', 'journeys', 'papas', 'cheetahs', 'nests', 'eagle_squares', 'users'], () => {
        void loadPrograms()
        void loadActiveJourneys()
    })

    const loadPrograms = async () => {
        const { data } = await supabase.from('programs').select('id, name').eq('status', 'active')
        if (data) setPrograms(data)
    }

    const loadActiveJourneys = async () => {
        // Overlapping loads (poll, realtime, post-save) must not let an older
        // response overwrite a newer one.
        const seq = ++loadSeqRef.current
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
                    .select('journey_id, user_id, is_lead, status, users:user_id(full_name, oscar)')
                    .in('journey_id', ids)
                for (const row of doData || []) {
                    if (!doMap[row.journey_id]) doMap[row.journey_id] = []
                    doMap[row.journey_id].push(row)
                }
            }

            if (seq !== loadSeqRef.current) return
            setJourneys(rawJourneys.map(j => ({ ...j, duty_officers: doMap[j.id] || [] })))
            setLoadFailed(false)

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
                if (seq === loadSeqRef.current) setBroadcasts(seeded)
            }
        } catch (error) {
            console.error('Error loading journeys:', JSON.stringify(error, null, 2))
            if (seq === loadSeqRef.current) setLoadFailed(true)
            toast.error('Failed to load active journeys', { id: 'ops-monitor-load-failed' })
        } finally {
            setLoading(false)
        }
    }

    // datetime-local wants the officer's local wall-clock time. toISOString()
    // is UTC, which shifted every pre-filled time by the UTC offset.
    const toLocalInput = (iso: string | null) => {
        if (!iso) return ''
        const date = new Date(iso)
        return Number.isNaN(date.getTime()) ? '' : format(date, "yyyy-MM-dd'T'HH:mm")
    }

    const handleSetTimes = (journey: Journey) => {
        setSelectedJourneyForTimes(journey)
        setTimesForm({
            eta: toLocalInput(journey.eta),
            etd: toLocalInput(journey.etd),
        })
        setSetTimesDialogOpen(true)
    }

    const handleSaveTimes = async () => {
        if (!selectedJourneyForTimes) return
        setSavingTimes(true)
        try {
            // new Date('yyyy-MM-ddTHH:mm') parses as local time, so this is the
            // exact inverse of toLocalInput above.
            const { data: updated, error } = await (supabase as any)
                .from('journeys')
                .update({
                    eta: timesForm.eta ? new Date(timesForm.eta).toISOString() : null,
                    etd: timesForm.etd ? new Date(timesForm.etd).toISOString() : null,
                })
                .eq('id', selectedJourneyForTimes.id)
                .select('id')
            if (error) throw error
            // Row-level security refuses silently (no error, no rows), which used
            // to report "updated" for a change that never happened.
            if (!updated || updated.length === 0) {
                throw new Error('These times were not saved. Only leadership or the journey\'s assigned DO can change them.')
            }
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
        // Same rule as My Operations: a rejected or released DO row doesn't count.
        const isAssignedDO = isOwnAssignment(journey as any, currentUser?.id ?? null) ||
            (!journey.duty_officers?.some(d => d.user_id === currentUser?.id) && currentUser?.id === (journey as any).assigned_do_id)

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

    const isLeadership = Boolean(currentUser?.role && (isAdmin(currentUser.role, currentUser.has_admin_access) || isAdmin(effectiveOscarRole(currentUser.role, currentUser.oscar))))

    // Mirrors journeys_update_role_scoped (supabase/migrations/20260927120000):
    // leadership roles, or a DO on this journey whose assignment wasn't rejected.
    // Everyone else is refused by the database, so the button would only fail.
    const canEditTimes = (journey: Journey) => {
        if (isLeadership) return true
        const uid = currentUser?.id as string | undefined
        if (!uid) return false
        const ownRow = journey.duty_officers?.find(d => d.user_id === uid)
        if (ownRow) return ownRow.status !== 'rejected'
        return journey.assigned_duty_officer_id === uid || (journey as any).assigned_do_id === uid
    }

    const query = searchQuery.trim().toLowerCase()
    const filteredJourneys = journeys.filter(journey => {
        // `[].join(' ')` is '' (never nullish), so the old `??` fallback to the
        // legacy lead-DO column was dead code. Search both.
        const doNames = [
            ...(journey.duty_officers ?? []).map(d => d.users?.full_name ?? ''),
            journey.assigned_do?.full_name ?? '',
        ].join(' ').toLowerCase()
        const matchesSearch = !query ||
            (journey.papas?.full_name ?? '').toLowerCase().includes(query) ||
            doNames.includes(query) ||
            (journey.cheetahs?.call_sign ?? '').toLowerCase().includes(query) ||
            (journey.cheetahs?.registration_number ?? '').toLowerCase().includes(query)

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

    // 24-hour time with the day, so a 01:30 ETA tomorrow can't be read as today.
    const formatWhen = (iso: string | null) => {
        if (!iso) return null
        const date = new Date(iso)
        return Number.isNaN(date.getTime()) ? null : format(date, 'EEE d MMM, HH:mm')
    }

    const retryLoad = () => {
        setRetrying(true)
        if (!currentUserLoadedRef.current) void loadCurrentUser()
        void loadActiveJourneys().finally(() => setRetrying(false))
    }

    const filtersActive = query !== '' || statusFilter !== 'all' || selectedProgram !== 'all'
    const clearFilters = () => {
        setSearchQuery('')
        setStatusFilter('all')
        setSelectedProgram('all')
    }

    const renderStatus = (journey: Journey) => {
        const callSign = journey.status || journey.current_call_sign || 'planned'
        const callSignLabel = getCallSignLabel(callSign) || callSign.replace(/_/g, ' ')
        const canClick = !!(journey.duty_officers?.some(d => d.user_id === currentUser?.id) || currentUser?.id === journey.assigned_duty_officer_id || currentUser?.id === (journey as any).assigned_do_id)
        const broadcast = broadcasts[journey.id]
        return (
            <>
                {/* Only the assigned DO can change a call sign. Previously the
                    read-only case rendered the same button at 70% opacity, which
                    reads as "disabled control" rather than "status" — so admins
                    now get a plain chip with no false affordance. */}
                {canClick ? (
                    <button
                        type="button"
                        onClick={() => handleCallSignClick(journey)}
                        title={`Update call sign — currently ${callSignLabel}`}
                        aria-label={`Update call sign, currently ${callSignLabel}`}
                        className={cn(
                            "group flex min-h-9 w-full items-center gap-1.5 rounded-full p-0.5 pr-2 text-left transition-all",
                            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        )}
                    >
                        <CallSignChip callSign={callSign} />
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
                    </button>
                ) : (
                    <CallSignChip callSign={callSign} />
                )}
                {/* A Broken Arrow pulses its own badge, not the whole row: a
                    pulsing row is hard to read and drowns out the rest of the table. */}
                {callSign === 'broken_arrow' && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold text-white motion-safe:animate-pulse">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Emergency
                    </span>
                )}
                {/* Latest live SITREP broadcast (traffic / route / emergency).
                    Rendered through the same chip as the status above so a
                    "Red Cocktail" here is the exact colour it is everywhere else. */}
                {broadcast && broadcast.kind !== 'status' && (
                    <div
                        className="mt-1.5 flex flex-wrap items-center gap-1.5"
                        title={broadcast.notes || broadcast.meaning}
                    >
                        <CallSignChip callSign={broadcast.key} variant="soft" size="sm" />
                        <span className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                            {formatDistanceToNow(new Date(broadcast.at), { addSuffix: true })}
                        </span>
                    </div>
                )}
            </>
        )
    }

    const renderDOTeam = (journey: Journey) => {
        const allDOs = journey.duty_officers ?? []
        if (allDOs.length === 0) {
            return <span className="text-xs text-muted-foreground">{journey.assigned_do?.full_name || 'Unassigned'}</span>
        }
        return (
            <div className="flex min-w-0 flex-col gap-0.5">
                {allDOs.map(d => (
                    <button
                        key={d.user_id}
                        type="button"
                        onClick={() => setSelectedOfficer({
                            id: d.user_id,
                            full_name: d.users?.full_name ?? null,
                            email: '',
                            phone: null,
                            oscar: d.users?.oscar ?? null,
                            role: 'officer',
                            unit: null,
                            current_title_id: null,
                            is_active: true,
                            activation_status: 'active',
                            created_at: new Date().toISOString()
                        })}
                        className="group -mx-1 flex min-h-8 min-w-0 cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-accent/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="View Officer Full Profile"
                        aria-label={`View profile of ${d.users?.full_name ?? 'this officer'}${d.is_lead ? ', team lead' : ''}`}
                    >
                        {d.is_lead && <span className="text-yellow-500" aria-hidden="true">⭐</span>}
                        <span className={cn('truncate group-hover:underline', d.is_lead && 'font-semibold')}>{d.users?.full_name ?? '—'}</span>
                        <Badge variant={d.status === 'rejected' ? 'destructive' : d.status === 'acknowledged' ? 'secondary' : 'outline'} className="ml-1 h-4 shrink-0 px-1 text-[9px] leading-none">
                            {d.status === 'rejected' ? 'Declined' : d.status === 'acknowledged' ? 'Accepted' : 'Pending'}
                        </Badge>
                    </button>
                ))}
            </div>
        )
    }

    const renderTimesButton = (journey: Journey, className?: string) => canEditTimes(journey) ? (
        <Button
            variant="outline"
            size="sm"
            className={cn('h-9 text-xs', className)}
            onClick={() => handleSetTimes(journey)}
            aria-label={`${journey.eta || journey.etd ? 'Edit' : 'Set'} times for ${journey.papas?.full_name ?? 'this journey'}`}
        >
            <Clock className="h-3 w-3 mr-1" aria-hidden="true" />
            {journey.eta || journey.etd ? 'Edit Times' : 'Set Times'}
        </Button>
    ) : null

    if (loading) {
        return (
            <div className="space-y-4" role="status" aria-label="Loading active journeys">
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
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <div className="h-10 flex-1 rounded-md skeleton" />
                    <div className="h-10 w-full rounded-md skeleton sm:w-[180px]" />
                    <div className="h-10 w-full rounded-md skeleton sm:w-[180px]" />
                    <div className="h-10 w-full rounded-md skeleton sm:w-24" />
                </div>
                {/* Card skeleton (phones) */}
                <div className="space-y-3 sm:hidden">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="space-y-3 rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="h-4 w-36 rounded skeleton" />
                                <div className="h-6 w-20 rounded-full skeleton" />
                            </div>
                            <div className="h-3 w-48 rounded skeleton" />
                            <div className="grid grid-cols-2 gap-2">
                                <div className="h-8 rounded skeleton" />
                                <div className="h-8 rounded skeleton" />
                            </div>
                        </div>
                    ))}
                </div>
                {/* Table skeleton */}
                <div className="hidden border rounded-lg overflow-hidden sm:block">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                        placeholder="Search Papa, DO, or Cheetah..."
                        aria-label="Search journeys by Papa, DO or Cheetah"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by status">
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
                    <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by program">
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

            {filteredJourneys.length === 0 ? (
                journeys.length === 0 && loadFailed ? (
                    <ErrorState
                        className="rounded-lg border"
                        title="We couldn't load active journeys"
                        onRetry={retryLoad}
                        retrying={retrying}
                    />
                ) : (
                    <EmptyState
                        className="rounded-lg border"
                        icon={Radio}
                        title={journeys.length === 0 ? 'No active journeys at the moment' : 'No journeys match your filters'}
                        action={filtersActive && journeys.length > 0 ? (
                            <Button variant="outline" className="h-9" onClick={clearFilters}>Clear filters</Button>
                        ) : undefined}
                    />
                )
            ) : (
                <>
                    {/* Phones: one card per journey. Seven columns don't fit. */}
                    <ul className="space-y-3 sm:hidden" aria-label="Active journeys">
                        {filteredJourneys.map((journey) => {
                            const isBroken = (journey.status || journey.current_call_sign) === 'broken_arrow'
                            const eta = formatWhen(journey.eta)
                            const etd = formatWhen(journey.etd)
                            return (
                                <li
                                    key={journey.id}
                                    data-journey-id={journey.id}
                                    className={cn(
                                        "min-w-0 rounded-lg border bg-card p-3 transition-colors duration-300",
                                        isBroken && "border-destructive/50 bg-destructive/5"
                                    )}
                                >
                                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium">{journey.papas?.full_name || 'Unknown Papa'}</p>
                                            {(journey.papas?.title || journey.cheetahs?.call_sign) && (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {[journey.papas?.title, journey.cheetahs?.call_sign && `Cheetah ${journey.cheetahs.call_sign}`].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="max-w-full shrink-0">{renderStatus(journey)}</div>
                                    </div>
                                    {journey.papas?.flight_number && (
                                        <div className="mt-1">
                                            <FlightStatusBadge
                                                flightNumber={journey.papas.flight_number}
                                                departureTime={journey.papas.flight_departure_time}
                                                arrivalTime={journey.papas.flight_arrival_time}
                                            />
                                        </div>
                                    )}
                                    <div className="mt-2">
                                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">DO team</p>
                                        {renderDOTeam(journey)}
                                    </div>
                                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <div className="min-w-0 rounded-md bg-muted/40 px-2 py-1.5">
                                            <dt className="text-muted-foreground">ETA</dt>
                                            <dd className="font-medium tabular-nums">{eta ?? '—'}</dd>
                                        </div>
                                        <div className="min-w-0 rounded-md bg-muted/40 px-2 py-1.5">
                                            <dt className="text-muted-foreground">ETD</dt>
                                            <dd className="font-medium tabular-nums">{etd ?? '—'}</dd>
                                        </div>
                                    </dl>
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            {journey.status_updated_at
                                                ? `Updated ${formatDistanceToNow(new Date(journey.status_updated_at), { addSuffix: true })}`
                                                : 'No status update yet'}
                                        </span>
                                        {renderTimesButton(journey)}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>

                    {/* Journey Table (sm and up) */}
                    <div className="table-scroll-wrapper hidden border rounded-lg sm:block">
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
                                {filteredJourneys.map((journey) => {
                                    const isBroken = (journey.status || journey.current_call_sign) === 'broken_arrow'
                                    const eta = formatWhen(journey.eta)
                                    const etd = formatWhen(journey.etd)
                                    return (
                                        <TableRow
                                            key={journey.id}
                                            data-journey-id={journey.id}
                                            className={cn(
                                                "hover:bg-muted/30 transition-all duration-300",
                                                isBroken && "border-destructive/50 bg-destructive/5"
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
                                            <TableCell>{renderDOTeam(journey)}</TableCell>
                                            <TableCell>{renderStatus(journey)}</TableCell>
                                            <TableCell>
                                                {eta ? (
                                                    <div className="flex items-center gap-1 whitespace-nowrap text-sm tabular-nums">
                                                        <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                                        {eta}
                                                    </div>
                                                ) : <span className="text-muted-foreground text-xs">—</span>}
                                            </TableCell>
                                            <TableCell>
                                                {etd ? (
                                                    <div className="flex items-center gap-1 whitespace-nowrap text-sm tabular-nums">
                                                        <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                                        {etd}
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
                                                {renderTimesButton(journey) ?? <span className="text-xs text-muted-foreground">—</span>}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            {/* Summary Stats + Realtime Status */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground border-t pt-4">
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
                            Select the new call sign for {selectedJourney?.papas?.full_name}&apos;s journey
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
                            <label htmlFor="ops-monitor-eta" className="text-sm font-medium">ETA — Estimated Time of Arrival</label>
                            <input
                                id="ops-monitor-eta"
                                type="datetime-local"
                                value={timesForm.eta}
                                onChange={(e) => setTimesForm(prev => ({ ...prev, eta: e.target.value }))}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="ops-monitor-etd" className="text-sm font-medium">ETD — Estimated Time of Departure</label>
                            <input
                                id="ops-monitor-etd"
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

            {/* Officer Full Profile Dialog */}
            <OfficerProfileDialog
                officer={selectedOfficer}
                open={!!selectedOfficer}
                onOpenChange={(open) => {
                    if (!open) setSelectedOfficer(null)
                }}
                canManage={isLeadership}
            />
        </div>
    )
}
