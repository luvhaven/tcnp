"use client"

import { useEffect, useState, useRef } from "react"
import PapaBriefingsSection from "@/components/papas/PapaBriefingsSection"
import AOArrivalTimeline from "@/components/eagles/AOArrivalTimeline"
import FlightSearch from "@/components/eagles/FlightSearch"
import PapaFlightMonitor from "@/components/aviation/PapaFlightMonitor"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plane, Plus, Edit, Trash2, Search, RefreshCw, MapPin, Gauge, TrendingUp, Globe, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import dynamic from 'next/dynamic'
import {
    searchFlightsByCallsign,
    getFlightByIcao24,
    metersPerSecondToKnots,
    metersToFeet,
    formatLastContact,
    storeFlightData,
    type FlightState
} from '@/lib/opensky-api'
import { canManageEagles, effectiveOscarRole } from '@/lib/utils'

// Dynamic imports for Map
const MapContainer = dynamic(
    () => import('react-leaflet').then((mod) => mod.MapContainer),
    { ssr: false }
)
const TileLayer = dynamic(
    () => import('react-leaflet').then((mod) => mod.TileLayer),
    { ssr: false }
)
const Marker = dynamic(
    () => import('react-leaflet').then((mod) => mod.Marker),
    { ssr: false }
)
const Popup = dynamic(
    () => import('react-leaflet').then((mod) => mod.Popup),
    { ssr: false }
)

export default function EaglesPage() {
    const supabase = createClient()
    const [userRole, setUserRole] = useState<string | null>(null)

    useEffect(() => {
        const loadRole = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase.from('users').select('role,oscar').eq('id', user.id).single()
            const resolvedRole = effectiveOscarRole(data?.role, data?.oscar)
            if (resolvedRole) setUserRole(resolvedRole)
        }
        void loadRole()
    }, [])

    return (
        <div className="space-y-6 page-enter">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <Plane className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Alpha</h1>
                            <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                                Eagle Squares & Aviation
                            </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Airport hubs, VIP tarmac reception, and live flight telemetry.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Papa Arrival Briefings + AO Timeline for Alpha Oscar ── */}
            {userRole && ['alpha_oscar', 'head_alpha_oscar'].includes(userRole) && (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="border rounded-xl p-4 bg-muted/30">
                        <PapaBriefingsSection role={userRole} />
                    </div>
                    <AOArrivalTimeline />
                </div>
            )}

            <Tabs defaultValue="squares" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                    <TabsTrigger value="squares">Eagle Squares (Airports)</TabsTrigger>
                    <TabsTrigger value="tracking">Flight Tracking</TabsTrigger>
                </TabsList>

                <TabsContent value="squares" className="space-y-6">
                    <ManageSquares />
                </TabsContent>

                <TabsContent value="tracking" className="space-y-6">
                    <FlightSearch />
                    <PapaFlightMonitor
                        title="Alpha Papa flight watch"
                        description="Exact, itinerary-scoped OpenSky tracking for Papa arrivals. Schedule estimates are never presented as confirmed live positions."
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}

function ManageSquares() {
    const supabase = createClient()
    const confirm = useConfirm()
    const [airports, setAirports] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<any>(null)
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        city: '',
        country: '',
        latitude: '',
        longitude: '',
        contact: '',
        notes: ''
    })

    useEffect(() => {
        loadAirports()
    }, [])

    const loadAirports = async () => {
        try {
            const { data, error } = await supabase
                .from('eagle_squares')
                .select('*')
                .order('name')

            if (error) throw error
            setAirports(data || [])
        } catch (error) {
            console.error('Error loading airports:', error)
            toast.error('Failed to load airports')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        try {
            const data = {
                ...formData,
                latitude: formData.latitude ? parseFloat(formData.latitude) : null,
                longitude: formData.longitude ? parseFloat(formData.longitude) : null,
            }

            if (editing) {
                const { error } = await supabase
                    .from('eagle_squares')
                    .update(data)
                    .eq('id', editing.id)

                if (error) throw error
                toast.success('Airport updated successfully')
            } else {
                const { error } = await supabase
                    .from('eagle_squares')
                    .insert([data])

                if (error) throw error
                toast.success('Airport added successfully')
            }

            setDialogOpen(false)
            setEditing(null)
            resetForm()
            loadAirports()
        } catch (error: any) {
            console.error('Error saving airport:', error)
            toast.error(error.message || 'Failed to save airport')
        }
    }

    const handleDelete = async (id: string) => {
        if (!await confirm({ message: 'Are you sure you want to delete this airport?', variant: 'destructive' })) return

        try {
            const { error } = await supabase
                .from('eagle_squares')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success('Airport deleted successfully')
            loadAirports()
        } catch (error: any) {
            console.error('Error deleting airport:', error)
            toast.error(error.message || 'Failed to delete airport')
        }
    }

    const handleEdit = (airport: any) => {
        setEditing(airport)
        setFormData({
            name: airport.name || '',
            code: airport.code || '',
            city: airport.city || '',
            country: airport.country || '',
            latitude: airport.latitude?.toString() || '',
            longitude: airport.longitude?.toString() || '',
            contact: airport.contact || '',
            notes: airport.notes || ''
        })
        setDialogOpen(true)
    }

    const resetForm = () => {
        setFormData({
            name: '',
            code: '',
            city: '',
            country: '',
            latitude: '',
            longitude: '',
            contact: '',
            notes: ''
        })
    }

    if (loading) {
        return (
            <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Airport Management</h2>
                    <p className="text-sm text-muted-foreground">Manage Eagle Square locations</p>
                </div>
                <Button onClick={() => { resetForm(); setEditing(null); setDialogOpen(true) }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Airport
                </Button>
            </div>

            {airports.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Plane className="h-16 w-16 text-muted-foreground mb-4" />
                        <p className="text-lg font-semibold mb-2">No Airports Yet</p>
                        <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                            Add your first airport to start tracking Eagle operations.
                        </p>
                        <Button onClick={() => { resetForm(); setEditing(null); setDialogOpen(true) }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Airport
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {airports.map((airport) => (
                        <Card key={airport.id} className="group hover:shadow-lg hover:border-primary/40 transition-all duration-300">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <CardTitle className="flex items-center gap-2">
                                            <Plane className="h-5 w-5 text-primary" />
                                            {airport.name}
                                        </CardTitle>
                                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                                            <Badge variant="secondary">{airport.code}</Badge>
                                            <span className="text-sm text-muted-foreground">
                                                {airport.city}, {airport.country}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2 text-sm">
                                    {airport.latitude && airport.longitude && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <MapPin className="h-4 w-4" />
                                            <span className="font-mono text-xs">
                                                {airport.latitude.toFixed(4)}, {airport.longitude.toFixed(4)}
                                            </span>
                                        </div>
                                    )}
                                    {airport.contact && (
                                        <p className="text-muted-foreground">Contact: {airport.contact}</p>
                                    )}
                                    {airport.notes && (
                                        <p className="text-muted-foreground text-xs italic">{airport.notes}</p>
                                    )}
                                </div>
                                <div className="flex gap-2 mt-4">
                                    <Button variant="outline" size="sm" onClick={() => handleEdit(airport)} className="flex-1">
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleDelete(airport.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Airport' : 'Add New Airport'}</DialogTitle>
                        <DialogDescription>
                            {editing ? 'Update airport information' : 'Add a new airport to the system'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">Airport Name *</Label>
                                <Input
                                    id="name"
                                    required
                                    placeholder="e.g., Nnamdi Azikiwe International"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="code">Airport Code *</Label>
                                <Input
                                    id="code"
                                    required
                                    placeholder="e.g., ABV"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="city">City *</Label>
                                <Input
                                    id="city"
                                    required
                                    placeholder="e.g., Abuja"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="country">Country *</Label>
                                <Input
                                    id="country"
                                    required
                                    placeholder="e.g., Nigeria"
                                    value={formData.country}
                                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="latitude">Latitude</Label>
                                <Input
                                    id="latitude"
                                    type="number"
                                    step="any"
                                    placeholder="e.g., 9.0065"
                                    value={formData.latitude}
                                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="longitude">Longitude</Label>
                                <Input
                                    id="longitude"
                                    type="number"
                                    step="any"
                                    placeholder="e.g., 7.2631"
                                    value={formData.longitude}
                                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="contact">Contact</Label>
                            <Input
                                id="contact"
                                placeholder="Contact person or phone number"
                                value={formData.contact}
                                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea
                                id="notes"
                                placeholder="Additional information..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>

                        <div className="flex justify-end space-x-2">
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">
                                {editing ? 'Update' : 'Add'} Airport
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function TrackEagles() {
    const supabase = createClient()
    const [papas, setPapas] = useState<any[]>([])
    const [activeFlights, setActiveFlights] = useState<Record<string, FlightState>>({})
    const [loading, setLoading] = useState(true)
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [currentRole, setCurrentRole] = useState<string | null>(null)
    const [roleChecked, setRoleChecked] = useState(false)
    const [dbStatuses, setDbStatuses] = useState<Record<string, string>>({})

    // Track previous status to trigger alerts
    const prevStatusesRef = useRef<Record<string, string>>({})

    const canManage = currentRole ? canManageEagles(currentRole) : false

    useEffect(() => {
        const loadRole = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data } = await supabase
                        .from('users')
                        .select('role,oscar')
                        .eq('id', user.id)
                        .single()

                    const resolvedRole = effectiveOscarRole(data?.role, data?.oscar)
                    if (resolvedRole) {
                        setCurrentRole(resolvedRole)
                    }
                }
            } catch (error) {
                console.error('Error loading current user:', error)
            } finally {
                setRoleChecked(true)
            }
        }

        loadRole()
    }, [])

    const fetchPapasWithFlights = async () => {
        try {
            const { data, error } = await supabase
                .from('papas')
                .select('id, full_name, title, profile_photo_url, flight_number, airline, flight_departure_time, flight_arrival_time, arrival_city, country')
                .not('flight_number', 'is', null)
                .order('flight_departure_time', { ascending: true })

            if (error) throw error
            setPapas(data || [])
            return data || []
        } catch (error) {
            console.error('Error fetching papas:', error)
            return []
        }
    }

    const refreshFlightData = async (papasData: any[]) => {
        if (!papasData || papasData.length === 0) return

        try {
            // Get all unique callsigns we care about
            const callsigns = papasData
                .map(p => p.flight_number?.trim().toLowerCase())
                .filter(Boolean)

            if (callsigns.length === 0) return

            // Fetch all states from OpenSky to avoid rate limits
            const { getAllFlights, parseFlightState, storeFlightData } = await import('@/lib/opensky-api')
            const response = await getAllFlights()

            if (!response.states) return

            const newActiveFlights: Record<string, FlightState> = {}

            // Find matching flights in OpenSky
            response.states.forEach((rawState: any) => {
                const callsign = rawState[1]?.trim().toLowerCase()
                if (callsign && callsigns.some(c => callsign.includes(c) || c.includes(callsign))) {
                    const flightData = parseFlightState(rawState)
                    // We map it by the original papa flight_number that matched
                    const matchingPapa = papasData.find(p => {
                        const pCall = p.flight_number.trim().toLowerCase()
                        return callsign.includes(pCall) || pCall.includes(callsign)
                    })
                    if (matchingPapa) {
                        newActiveFlights[matchingPapa.id] = flightData
                        // Store to DB (do this asynchronously)
                        storeFlightData(supabase, flightData).catch(console.error)
                    }
                }
            })

            setActiveFlights(newActiveFlights)

            // Also check Database historic flight tracking for statuses we may have lost from OpenSky
            const { data: dbData } = await supabase.from('flight_tracking').select('flight_id, status')
            const newDbStatuses: Record<string, string> = {}
            if (dbData) {
                papasData.forEach(p => {
                    const pCall = p.flight_number?.trim().toLowerCase()
                    if (!pCall) return;

                    const match = dbData.find(d => {
                        const dCall = d.flight_id?.trim().toLowerCase()
                        if (!dCall) return false;
                        return dCall.includes(pCall) || pCall.includes(dCall)
                    })
                    if (match && match.status) {
                        newDbStatuses[p.id] = match.status // 'Landed' or 'In Air'
                    }
                })
            }
            setDbStatuses(newDbStatuses)

        } catch (error) {
            console.error('Error refreshing flights:', error)
        }
    }

    useEffect(() => {
        if (!canManage) return

        const init = async () => {
            setLoading(true)
            const p = await fetchPapasWithFlights()
            await refreshFlightData(p)
            setLoading(false)
        }
        init()
    }, [canManage])

    useEffect(() => {
        if (!autoRefresh || !canManage || papas.length === 0) return

        const interval = setInterval(() => {
            refreshFlightData(papas)
        }, 30000) // 30 seconds

        return () => clearInterval(interval)
    }, [autoRefresh, canManage, papas])

    const getFlightStatus = (papa: any, activeFlight?: FlightState, historicalDbStatus?: string) => {
        if (activeFlight) {
            return activeFlight.on_ground ? 'Landed' : 'In Air'
        }

        if (historicalDbStatus === 'Landed') return 'Landed'
        if (historicalDbStatus === 'In Air') return 'In Air (No Telemetry)'

        const now = new Date()
        const depTime = papa.flight_departure_time ? new Date(papa.flight_departure_time) : null
        const arrTime = papa.flight_arrival_time ? new Date(papa.flight_arrival_time) : null

        if (arrTime && now > arrTime) return 'Landed'
        if (depTime && now < depTime) return 'Pre-Flight'

        // If between dep and arr but no active flight found on OpenSky, it's either out of coverage or delayed
        if (depTime && arrTime && now >= depTime && now <= arrTime) return 'In Air (No Telemetry)'

        return 'Yet to board'
    }

    // Alert system effect
    useEffect(() => {
        if (!papas.length) return

        papas.forEach(papa => {
            const flight = activeFlights[papa.id]
            const dbStatus = dbStatuses[papa.id]
            const newStatus = getFlightStatus(papa, flight, dbStatus)

            const oldStatus = prevStatusesRef.current[papa.id]

            // Only alert if there was a PREVIOUS valid status, and it actively changed to a milestone
            if (oldStatus && oldStatus !== newStatus) {
                if (newStatus === 'In Air' || newStatus === 'In Air (No Telemetry)') {
                    toast.info(`🛫 Flight Alert: ${papa.title || ''} ${papa.full_name} is now in the air!`, {
                        duration: 8000,
                    })
                } else if (newStatus === 'Landed') {
                    toast.success(`🛬 Flight Alert: ${papa.title || ''} ${papa.full_name} has landed!`, {
                        duration: 10000,
                    })
                }
            }

            // Update the ref to track this
            prevStatusesRef.current[papa.id] = newStatus
        })
    }, [activeFlights, dbStatuses, papas])

    if (!roleChecked || loading) {
        return (
            <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
                ))}
            </div>
        )
    }

    if (!canManage) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <Plane className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-semibold mb-2">Access Restricted</p>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Flight tracking is restricted to Alpha Oscars and administrative leadership.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-4 rounded-lg border">
                <div>
                    <h2 className="text-lg font-bold">Papa Flights</h2>
                    <p className="text-sm text-muted-foreground">Real-time tracking of active travel itineraries</p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        setAutoRefresh(!autoRefresh)
                        if (!autoRefresh) {
                            toast.success('Auto-refresh enabled (30s)')
                            refreshFlightData(papas)
                        } else {
                            toast.success('Auto-refresh disabled')
                        }
                    }}
                    className={autoRefresh ? 'border-primary/50 bg-primary/10' : ''}
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${autoRefresh ? 'animate-spin text-primary' : ''}`} />
                    {autoRefresh ? 'Tracking Active' : 'Auto-Refresh Paused'}
                </Button>
            </div>

            {papas.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <Plane className="h-16 w-16 text-muted-foreground mb-4" />
                        <p className="text-xl font-bold mb-2">No Flights Scheduled</p>
                        <p className="text-sm text-muted-foreground text-center max-w-md">
                            Assign flight numbers and departure times to Papas in their profiles to track them automatically.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {papas.map(papa => {
                        const flight = activeFlights[papa.id]
                        const status = getFlightStatus(papa, flight, dbStatuses[papa.id])

                        let statusColor = "bg-gray-500/10 text-gray-400 border-gray-500/20"
                        if (status === 'In Air') statusColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                        if (status === 'Landed') statusColor = "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        if (status === 'Pre-Flight' || status === 'Yet to board') statusColor = "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        if (status === 'In Air (No Telemetry)') statusColor = "bg-orange-500/10 text-orange-400 border-orange-500/20"

                        return (
                            <Card key={papa.id} className="group hover:border-primary/40 transition-all duration-300 overflow-hidden relative bg-card/60 backdrop-blur-sm">
                                <div className="absolute top-0 left-0 w-full h-1" style={{
                                    background: status === 'In Air' ? 'linear-gradient(90deg, #10b981 0%, transparent 100%)' : 'transparent'
                                }} />

                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            {papa.profile_photo_url ? (
                                                <img src={papa.profile_photo_url} alt={papa.full_name} className="w-12 h-12 rounded-full object-cover border border-border/50 shadow-sm" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center border border-border/50 shadow-sm">
                                                    <span className="font-semibold text-muted-foreground">{papa.full_name.charAt(0)}</span>
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-bold text-lg leading-tight mb-1">{papa.full_name}</h3>
                                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{papa.title || 'Papa'}</p>
                                            </div>
                                        </div>
                                        <Badge className={`${statusColor} transition-all duration-500 px-3 py-1 text-xs font-semibold tracking-wide`} variant="outline">
                                            {status}
                                            {status === 'In Air' && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />}
                                        </Badge>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border border-border/50 shadow-inner">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Flight</p>
                                                <p className="font-mono font-bold flex items-center gap-2">
                                                    <Plane className="h-4 w-4 text-primary" />
                                                    {papa.airline ? `${papa.airline} ` : ''}{papa.flight_number}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Destination</p>
                                                <p className="font-semibold flex items-center justify-end gap-1.5 text-sm">
                                                    <MapPin className="h-3.5 w-3.5 text-primary" />
                                                    {papa.arrival_city || papa.country || 'N/A'}
                                                </p>
                                            </div>
                                        </div>

                                        {flight ? (
                                            <div className="grid grid-cols-3 gap-3 text-center pt-2">
                                                <div className="p-3 bg-background/30 border border-border/50 rounded-lg">
                                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Altitude</p>
                                                    <p className="font-mono font-bold text-lg leading-none">
                                                        {metersToFeet(flight.baro_altitude)?.toLocaleString() || '--'}
                                                        <span className="text-[10px] text-muted-foreground font-sans ml-1">ft</span>
                                                    </p>
                                                </div>
                                                <div className="p-3 bg-background/30 border border-border/50 rounded-lg">
                                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Speed</p>
                                                    <p className="font-mono font-bold text-lg leading-none">
                                                        {metersPerSecondToKnots(flight.velocity)?.toFixed(0) || '--'}
                                                        <span className="text-[10px] text-muted-foreground font-sans ml-1">kts</span>
                                                    </p>
                                                </div>
                                                <div className="p-3 bg-background/30 border border-border/50 rounded-lg">
                                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Heading</p>
                                                    <p className="font-mono font-bold text-lg leading-none">
                                                        {flight.true_track?.toFixed(0) || '--'}°
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between px-2 pt-2 relative">
                                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full px-12">
                                                    <div className="h-px w-full border-t border-dashed border-border/60"></div>
                                                </div>
                                                <div className="bg-card z-10 pr-4">
                                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Departure</p>
                                                    <p className="font-mono font-medium text-sm">
                                                        {papa.flight_departure_time ? new Date(papa.flight_departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                    </p>
                                                </div>
                                                <ArrowRight className="h-4 w-4 text-muted-foreground/40 z-10 bg-card" />
                                                <div className="text-right bg-card z-10 pl-4">
                                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Arrival</p>
                                                    <p className="font-mono font-medium text-sm">
                                                        {papa.flight_arrival_time ? new Date(papa.flight_arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
