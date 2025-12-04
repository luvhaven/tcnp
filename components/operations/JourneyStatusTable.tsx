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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDistanceToNow } from 'date-fns'
import { Search, Filter, Archive, Eye, CheckCircle, Loader2 } from 'lucide-react'
import { getCallSignLabel, getCallSignColor } from '@/lib/constants/call-signs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Journey {
    id: string
    program_id: string
    papa: { full_name: string, title: string }
    cheetah: { call_sign: string, vehicle_type: string }
    delta_oscar: { full_name: string, oscar: string }
    current_status: string
    status_updated_at: string
    created_at: string
}

export default function JourneyStatusTable() {
    const supabase = createClient()
    const [journeys, setJourneys] = useState<Journey[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [programs, setPrograms] = useState<any[]>([])
    const [selectedProgram, setSelectedProgram] = useState<string>('all')

    useEffect(() => {
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

    const loadPrograms = async () => {
        const { data } = await supabase.from('programs').select('id, name').eq('status', 'active')
        if (data) setPrograms(data)
    }

    const loadActiveJourneys = async () => {
        try {
            const { data, error } = await supabase
                .from('journeys')
                .select(`
          id,
          program_id,
          current_status,
          status_updated_at,
          created_at,
          papa:papas(full_name, title),
          cheetah:cheetahs(call_sign, vehicle_type),
          delta_oscar:users!assigned_do_id(full_name, oscar)
        `)
                .is('completed_at', null)
                .is('archived_at', null)
                .order('status_updated_at', { ascending: false })

            if (error) throw error
            setJourneys(data as any)
        } catch (error) {
            console.error('Error loading journeys:', error)
            toast.error('Failed to load active journeys')
        } finally {
            setLoading(false)
        }
    }

    const handleArchive = async (id: string) => {
        if (!confirm('Are you sure you want to archive this journey?')) return

        try {
            const { error } = await supabase.rpc('archive_journey', { p_journey_id: id })
            if (error) throw error
            toast.success('Journey archived')
            loadActiveJourneys()
        } catch (error) {
            console.error('Error archiving journey:', error)
            toast.error('Failed to archive journey')
        }
    }

    const filteredJourneys = journeys.filter(journey => {
        const matchesSearch =
            journey.papa?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            journey.delta_oscar?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            journey.cheetah?.call_sign.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesStatus = statusFilter === 'all' || journey.current_status === statusFilter
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
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="first_course">First Course</SelectItem>
                        <SelectItem value="dessert">Dessert</SelectItem>
                        <SelectItem value="cocktail">Cocktail</SelectItem>
                        <SelectItem value="blue_cocktail">Blue Cocktail</SelectItem>
                        <SelectItem value="red_cocktail">Red Cocktail</SelectItem>
                        <SelectItem value="re_order">Re-order</SelectItem>
                        <SelectItem value="chapman">Chapman</SelectItem>
                        <SelectItem value="broken_arrow">Broken Arrow</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Filter Program" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Programs</SelectItem>
                        {programs.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Papa</TableHead>
                            <TableHead>Delta Oscar (DO)</TableHead>
                            <TableHead>Cheetah</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Last Update</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredJourneys.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No active journeys found matching your criteria
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredJourneys.map((journey) => (
                                <TableRow key={journey.id}>
                                    <TableCell>
                                        <div className="font-medium">{journey.papa?.full_name}</div>
                                        <div className="text-xs text-muted-foreground">{journey.papa?.title}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{journey.delta_oscar?.full_name}</div>
                                        <div className="text-xs text-muted-foreground">{journey.delta_oscar?.oscar}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{journey.cheetah?.call_sign}</div>
                                        <div className="text-xs text-muted-foreground">{journey.cheetah?.vehicle_type}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            className={cn(
                                                "text-white whitespace-nowrap",
                                                getCallSignColor(journey.current_status)
                                            )}
                                        >
                                            {getCallSignLabel(journey.current_status)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">
                                            {journey.status_updated_at ? (
                                                formatDistanceToNow(new Date(journey.status_updated_at), { addSuffix: true })
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" title="View Details">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title="Archive"
                                                onClick={() => handleArchive(journey.id)}
                                                className="text-muted-foreground hover:text-destructive"
                                            >
                                                <Archive className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
