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

    useEffect(() => {
        loadCurrentUser()
        loadPrograms()
        loadActiveJourneys()

        // Real-time subscription for journey updates
        const channel = supabase
            .channel('journey-monitor')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'journeys'
                },
                () => {
                    loadActiveJourneys()
                }
            )
            .subscribe()

        return () => {
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
            const canUpdate = userData?.role && ['dev_admin', 'admin', 'delta_oscar', 'captain', 'head_of_command'].includes(userData.role)
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
            // First get basic journey data
            const { data, error } = await supabase
                .from('journeys')
                .select('*')
                .in('status', ['planned', 'scheduled', 'arriving', 'at_nest', 'departing_nest', 'enroute_to_theatre', 'at_theatre', 'departing_theatre', 'active', 'planning', 'distress'])
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Supabase query error:', JSON.stringify(error, null, 2))
                throw error
            }

            // Fetch related data separately
            const journeysWithRelations = await Promise.all((data || []).map(async (journey) => {
                let papa = null
                let cheetah = null
                let assignedDO = null

                // Fetch papa
                if (journey.papa_id) {
                    const { data: papaData } = await supabase
                        .from('papas')
                        .select('full_name, title')
                        .eq('id', journey.papa_id)
                        .single()
                    papa = papaData
                }

                // Fetch cheetah
                if (journey.assigned_cheetah_id) {
                    const { data: cheetahData } = await supabase
                        .from('cheetahs')
                        .select('call_sign, registration_number')
                        .eq('id', journey.assigned_cheetah_id)
                        .single()
                    cheetah = cheetahData
                }

                // Fetch assigned DO (check both columns for backward compatibility)
                const doId = journey.assigned_duty_officer_id || journey.assigned_do_id
                if (doId) {
                    const { data: doData } = await supabase
                        .from('users')
                        .select('full_name, oscar')
                        .eq('id', doId)
                        .single()
                    assignedDO = doData
                }

                return {
                    ...journey,
                    papas: papa,
                    cheetahs: cheetah,
                    assigned_do: assignedDO
                }
            }))

            console.log('Successfully loaded journeys:', journeysWithRelations.length)
            setJourneys(journeysWithRelations as any)
        } catch (error) {
            console.error('Error loading journeys:', JSON.stringify(error, null, 2))
            toast.error('Failed to load active journeys')
        } finally {
            setLoading(false)
        }
    }

    const handleCallSignClick = (journey: Journey) => {
        if (!canUpdateCallSigns) {
            toast.error('You do not have permission to update call signs')
            return
        }

        // Check if user is assigned DO or admin
        const isAssignedDO = currentUser?.id === journey.assigned_duty_officer_id
        const isAdmin = currentUser?.role && ['dev_admin', 'admin', 'captain', 'head_of_command'].includes(currentUser.role)

        if (!isAssignedDO && !isAdmin) {
            toast.error('Only the assigned DO or admins can update this journey')
            return
        }

        setSelectedJourney(journey)
        setCallSignDialogOpen(true)
    }

    const handleUpdateCallSign = async (newCallSign: string) => {
        if (!selectedJourney) return

        try {
            const { error } = await supabase.rpc('update_journey_call_sign', {
                journey_uuid: selectedJourney.id,
                new_status: newCallSign
            })

            if (error) throw error

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

    const filteredJourneys = journeys.filter(journey => {
        const matchesSearch =
            journey.papas?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            journey.assigned_do?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            journey.cheetahs?.call_sign.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesStatus = statusFilter === 'all' || journey.current_call_sign === statusFilter
        const matchesProgram = selectedProgram === 'all' || journey.program_id === selectedProgram

        return matchesSearch && matchesStatus && matchesProgram
    })

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
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
            <div className="border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Papa</TableHead>
                            <TableHead className="font-semibold">Duty Officer (DO)</TableHead>
                            <TableHead className="font-semibold">Status</TableHead>
                            <TableHead className="font-semibold">Call Sign</TableHead>
                            <TableHead className="font-semibold">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredJourneys.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                    <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No active journeys at the moment</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredJourneys.map((journey) => {
                                const callSign = journey.current_call_sign || 'planned'
                                const callSignLabel = getCallSignLabel(callSign)
                                const callSignColor = getCallSignBadgeColor(callSign)

                                return (
                                    <TableRow key={journey.id} className="hover:bg-muted/30 transition-colors">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{journey.papas?.full_name || 'Unknown Papa'}</span>
                                                <span className="text-xs text-muted-foreground">{journey.papas?.title}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{journey.assigned_do?.full_name || 'Unassigned'}</span>
                                                {journey.assigned_do?.oscar && (
                                                    <span className="text-xs text-muted-foreground">{journey.assigned_do.oscar}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={cn("capitalize whitespace-nowrap", getStatusBadgeColor(journey.status))}>
                                                {journey.status === 'in_progress' ? 'En Route' : journey.status.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <button
                                                onClick={() => handleCallSignClick(journey)}
                                                disabled={!canUpdateCallSigns}
                                                className={cn(
                                                    "px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                                                    callSignColor,
                                                    canUpdateCallSigns ? "cursor-pointer" : "cursor-default opacity-80"
                                                )}
                                            >
                                                <Radio className="h-3 w-3" />
                                                {callSignLabel}
                                                {canUpdateCallSigns && <ChevronDown className="h-3 w-3" />}
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-xs"
                                                >
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    {journey.eta ? 'ETA/ETD' : 'Set Times'}
                                                </Button>
                                            </div>
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
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Update Call Sign</DialogTitle>
                        <DialogDescription>
                            Select the new call sign for {selectedJourney?.papas?.full_name}'s journey
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-4">
                        {CALL_SIGNS.filter(cs => cs.category !== 'time').map((callSign) => (
                            <button
                                key={callSign.key}
                                onClick={() => handleUpdateCallSign(callSign.key)}
                                className={cn(
                                    "p-4 rounded-lg border-2 transition-all hover:scale-105 flex flex-col items-start text-left",
                                    getCallSignBadgeColor(callSign.key),
                                    selectedJourney?.current_call_sign === callSign.key && "ring-2 ring-primary ring-offset-2"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Radio className="h-4 w-4" />
                                    <span className="font-semibold">{callSign.label}</span>
                                </div>
                                <span className="text-xs opacity-90">{callSign.description}</span>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
