"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { Search, Radio, Clock, Loader2, ChevronDown } from 'lucide-react'
import { CALL_SIGNS, getCallSignLabel, getCallSignColor, type CallSignKey } from '@/lib/constants/call-signs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
    papas: { full_name: string; title: string } | null
    cheetahs: { call_sign: string; registration_number: string } | null
    assigned_do: { full_name: string; oscar: string } | null
    duty_officers?: DutyOfficerRow[]
}

export default function JourneyStatusTable() {
    const supabase = createClient()
    const [journeys, setJourneys] = useState<Journey[]>([])
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

    useEffect(() => {
        let mounted = true

        loadCurrentUser()
        loadPrograms()
        loadActiveJourneys()

        // Realtime subscription for journey updates - with DIRECT state updates
        const channel = supabase
            .channel('journey-monitor')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'journeys'
                },
                (payload) => {
                    if (!mounted) return
                    console.log('🔄 Journey UPDATE received:', {
                        id: payload.new?.id,
                        status: payload.new?.status,
                        current_call_sign: payload.new?.current_call_sign
                    })

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
                    console.log('➕ Journey INSERT received:', payload.new?.id)
                    // For new journeys, we need to reload to get relations
                    loadActiveJourneys()
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Ops Monitor realtime subscription active')
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Ops Monitor realtime error:', err)
                }
            })

        // Reduced polling to 60 seconds as fallback (realtime is primary)
        const pollInterval = setInterval(() => {
            if (mounted) {
                console.log('⏰ Fallback polling for journey updates...')
                loadActiveJourneys()
            }
        }, 60000)

        return () => {
            mounted = false
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
            const canUpdate = userRole && ['super_admin', 'dev_admin', 'admin', 'delta_oscar', 'captain', 'head_of_command'].includes(userRole)
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
                    papas:papa_id(full_name, title),
                    cheetahs:assigned_cheetah_id(call_sign, registration_number),
                    assigned_do:assigned_duty_officer_id(full_name, oscar)
                `)
                .not('status', 'in', '(completed,cancelled)')
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
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = 'sine'
            osc.frequency.value = 660
            gain.gain.setValueAtTime(0.25, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start()
            osc.stop(ctx.currentTime + 0.4)
        } catch (e) {}
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

        try {
            // Direct update — journey_status enum accepts underscored keys (e.g. 'first_course') ✓
            // We intentionally skip the update_journey_call_sign RPC because it writes to
            // current_call_sign which is a call_sign enum (Title Case) and would reject
            // the underscore values we send.
            const { error } = await (supabase as any)
                .from('journeys')
                .update({
                    status: newCallSign,
                    status_updated_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', selectedJourney.id)

            if (error) throw error

            playCallSignChime()
            toast.success(`Call sign updated to ${getCallSignLabel(newCallSign)}`)
            setCallSignDialogOpen(false)
            setSelectedJourney(null)
            loadActiveJourneys()
        } catch (error: any) {
            console.error('Error updating call sign:', error)
            toast.error(error.message || 'Failed to update call sign')
        }
    }

    const getCallSignBadgeColor = (callSign: string): string => {
        const colorMap: Record<string, string> = {
            'first_course': 'bg-blue-500 hover:bg-blue-600 text-white',
            'dessert': 'bg-indigo-500 hover:bg-indigo-600 text-white',
            'cocktail': 'bg-amber-500 hover:bg-amber-600 text-white',
            'blue_cocktail': 'bg-cyan-500 hover:bg-cyan-600 text-white',
            'red_cocktail': 'bg-orange-500 hover:bg-orange-600 text-white',
            're_order': 'bg-purple-500 hover:bg-purple-600 text-white',
            'chapman': 'bg-teal-500 hover:bg-teal-600 text-white',
            'broken_arrow': 'bg-destructive hover:bg-destructive/90 text-white',
        }
        return colorMap[callSign] || 'bg-gray-500 hover:bg-gray-600 text-white'
    }

    const getStatusBadgeColor = (status: string): string => {
        if (status === 'broken_arrow') return 'bg-destructive text-white'
        if (status === 'chapman' || status === 'cocktail') return 'bg-teal-500 text-white'
        if (status.includes('route')) return 'bg-blue-500 text-white'
        return 'bg-green-500 text-white'
    }

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

    // Stats
    const stats = {
        total:        journeys.length,
        inTransit:    journeys.filter(j => ['cocktail','first_course','dessert','re_order'].includes(j.status)).length,
        brokenArrow:  journeys.filter(j => j.status === 'broken_arrow').length,
        planned:      journeys.filter(j => j.status === 'planned').length,
    }

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
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
                    <SelectTrigger className="w-[200px]">
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
                    <SelectTrigger className="w-[200px]">
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
            </div>

            {/* Journey Table */}
            <div className="table-scroll-wrapper border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Papa</TableHead>
                            <TableHead className="font-semibold">DO Team</TableHead>
                            <TableHead className="font-semibold">Status</TableHead>
                            <TableHead className="font-semibold">Call Sign</TableHead>
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
                                const callSign = journey.current_call_sign || journey.status || 'planned'
                                const callSignLabel = getCallSignLabel(callSign) || callSign.replace(/_/g,' ')
                                const callSignColor = getCallSignBadgeColor(callSign)
                                const canClick = !!(journey.duty_officers?.some(d => d.user_id === currentUser?.id) || currentUser?.id === journey.assigned_duty_officer_id || currentUser?.id === (journey as any).assigned_do_id)
                                const isBroken = callSign === 'broken_arrow'
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
                                            <div className="flex flex-col">
                                                <span className="font-medium">{journey.papas?.full_name || 'Unknown Papa'}</span>
                                                <span className="text-xs text-muted-foreground">{journey.papas?.title}</span>
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
                                            <button
                                                onClick={() => handleCallSignClick(journey)}
                                                disabled={!canClick}
                                                title={!canClick ? 'Only assigned DOs or admins can update' : `Update call sign: ${callSignLabel}`}
                                                className={cn(
                                                    "px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 w-full",
                                                    callSignColor,
                                                    canClick ? "cursor-pointer hover:opacity-90" : "cursor-default opacity-70",
                                                    isBroken && "animate-pulse ring-2 ring-destructive ring-offset-1"
                                                )}
                                            >
                                                <Radio className="h-3 w-3" />
                                                {callSignLabel}
                                                {canClick && <ChevronDown className="h-3 w-3 ml-auto" />}
                                            </button>
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

            {/* Summary Stats */}
            <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-4">
                <span>
                    Showing {filteredJourneys.length} of {journeys.length} active {journeys.length === 1 ? 'journey' : 'journeys'}
                </span>
                <span className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-green-500 animate-pulse" />
                    Live updates enabled
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
