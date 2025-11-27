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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plane, Plus, Edit, Trash2, Search, RefreshCw, MapPin, Gauge, TrendingUp, Globe } from "lucide-react"
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
import { canManageEagles } from '@/lib/utils'

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
    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Eagle Operations</h1>
                <p className="text-muted-foreground">Manage airports and track flights</p>
            </div>

            <Tabs defaultValue="squares" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                    <TabsTrigger value="squares">Eagle Squares (Airports)</TabsTrigger>
                    <TabsTrigger value="tracking">Flight Tracking</TabsTrigger>
                </TabsList>

                <TabsContent value="squares" className="space-y-6">
                    <ManageSquares />
                </TabsContent>

                <TabsContent value="tracking" className="space-y-6">
                    <TrackEagles />
                </TabsContent>
            </Tabs>
        </div>
    )
}

function ManageSquares() {
    const supabase = createClient()
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
        if (!confirm('Are you sure you want to delete this airport?')) return

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
    const [searchTerm, setSearchTerm] = useState('')
    const [flights, setFlights] = useState<FlightState[]>([])
    const [selectedFlight, setSelectedFlight] = useState<FlightState | null>(null)
    const [loading, setLoading] = useState(false)
    const [autoRefresh, setAutoRefresh] = useState(false)
    const [currentRole, setCurrentRole] = useState<string | null>(null)
    const [roleChecked, setRoleChecked] = useState(false)

    const canManage = currentRole ? canManageEagles(currentRole) : false

    useEffect(() => {
        if (!autoRefresh || !selectedFlight) return

        const interval = setInterval(() => {
            refreshSelectedFlight()
        }, 10000) // 10 seconds

        return () => clearInterval(interval)
    }, [autoRefresh, selectedFlight])

    useEffect(() => {
        const loadRole = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data } = await supabase
                        .from('users')
                        .select('role')
                        .eq('id', user.id)
                        .single()

                    if (data?.role) {
                        setCurrentRole(data.role)
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

    const handleSearch = async () => {
        if (!canManage) {
            toast.error('You are not authorized to track flights')
            return
        }

        if (!searchTerm.trim()) {
            toast.error('Please enter a flight callsign or ICAO24')
            return
        }

        setLoading(true)
        try {
            // Try ICAO24 first (6 character hex)
            if (searchTerm.length === 6) {
                const flight = await getFlightByIcao24(searchTerm.toLowerCase())
                if (flight) {
                    setFlights([flight])
                    setSelectedFlight(flight)
                    await storeFlightData(supabase, flight)
                    toast.success('Flight found!')
                    return
                }
            }

            // Search by callsign
            const results = await searchFlightsByCallsign(searchTerm)

            if (results.length === 0) {
                toast.error('No flights found')
                setFlights([])
                setSelectedFlight(null)
                return
            }

            setFlights(results)
            setSelectedFlight(results[0])

            for (const flight of results) {
                await storeFlightData(supabase, flight)
            }

            toast.success(`Found ${results.length} flight(s)`)
        } catch (error: any) {
            console.error('Error searching flights:', error)
            toast.error('Failed to search flights')
        } finally {
            setLoading(false)
        }
    }

    const refreshSelectedFlight = async () => {
        if (!selectedFlight || !canManage) return

        try {
            const flight = await getFlightByIcao24(selectedFlight.icao24)
            if (flight) {
                setSelectedFlight(flight)
                setFlights(prev => prev.map(f => f.icao24 === flight.icao24 ? flight : f))
                await storeFlightData(supabase, flight)
            }
        } catch (error) {
            console.error('Error refreshing flight:', error)
        }
    }

    const mapCenter: [number, number] = selectedFlight?.latitude && selectedFlight?.longitude
        ? [selectedFlight.latitude, selectedFlight.longitude]
        : [9.0765, 7.3986] // Default to Abuja

    if (!roleChecked) {
        return (
            <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
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
            {/* Search */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-4 md:flex-row">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Enter flight callsign or ICAO24 (e.g., AAL123 or a1b2c3)"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                className="pl-10"
                            />
                        </div>
                        <Button onClick={handleSearch} disabled={loading}>
                            {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Search Flight
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {selectedFlight && (
                <>
                    {/* Flight Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="group hover:-translate-y-1 hover:shadow-lg hover:border-primary/40 transition-all">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Callsign</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2">
                                    <Plane className="h-5 w-5 text-primary" />
                                    <span className="text-2xl font-bold">
                                        {selectedFlight.callsign?.trim() || 'N/A'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="group hover:-translate-y-1 hover:shadow-lg hover:border-primary/40 transition-all">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Altitude</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-blue-500" />
                                    <span className="text-2xl font-bold">
                                        {metersToFeet(selectedFlight.baro_altitude)?.toLocaleString() || 'N/A'} ft
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="group hover:-translate-y-1 hover:shadow-lg hover:border-primary/40 transition-all">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Speed</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2">
                                    <Gauge className="h-5 w-5 text-emerald-500" />
                                    <span className="text-2xl font-bold">
                                        {metersPerSecondToKnots(selectedFlight.velocity)?.toFixed(0) || 'N/A'} kts
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="group hover:-translate-y-1 hover:shadow-lg hover:border-primary/40 transition-all">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Origin</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2">
                                    <Globe className="h-5 w-5 text-amber-500" />
                                    <span className="text-lg font-bold truncate">
                                        {selectedFlight.origin_country || 'N/A'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Flight Details */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Flight Details</CardTitle>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAutoRefresh(!autoRefresh)}
                                >
                                    <RefreshCw className={`mr-2 h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                                    {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">ICAO24</p>
                                    <p className="font-mono font-semibold">{selectedFlight.icao24}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Heading</p>
                                    <p className="font-semibold">{selectedFlight.true_track?.toFixed(0) || 'N/A'}°</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Vertical Rate</p>
                                    <p className="font-semibold">
                                        {selectedFlight.vertical_rate ? `${(selectedFlight.vertical_rate * 196.85).toFixed(0)} ft/min` : 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Latitude</p>
                                    <p className="font-mono text-sm">{selectedFlight.latitude?.toFixed(4) || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Longitude</p>
                                    <p className="font-mono text-sm">{selectedFlight.longitude?.toFixed(4) || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Last Contact</p>
                                    <p className="font-semibold">{formatLastContact(selectedFlight.last_contact)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Map */}
                    {selectedFlight.latitude && selectedFlight.longitude && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Flight Position</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div style={{ height: '500px', width: '100%' }}>
                                    {typeof window !== 'undefined' && (
                                        <MapContainer
                                            center={mapCenter}
                                            zoom={8}
                                            style={{ height: '100%', width: '100%' }}
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <Marker position={mapCenter}>
                                                <Popup>
                                                    <div className="space-y-1">
                                                        <p className="font-semibold">{selectedFlight.callsign?.trim() || 'Unknown'}</p>
                                                        <p className="text-xs">{selectedFlight.origin_country}</p>
                                                        <p className="text-xs">Alt: {metersToFeet(selectedFlight.baro_altitude)} ft</p>
                                                        <p className="text-xs">Speed: {metersPerSecondToKnots(selectedFlight.velocity)} kts</p>
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        </MapContainer>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Other Flights */}
                    {flights.length > 1 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Other Matching Flights ({flights.length - 1})</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {flights.filter(f => f.icao24 !== selectedFlight.icao24).map((flight) => (
                                        <div
                                            key={flight.icao24}
                                            className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => setSelectedFlight(flight)}
                                        >
                                            <div>
                                                <p className="font-semibold">{flight.callsign?.trim() || 'Unknown'}</p>
                                                <p className="text-sm text-muted-foreground">{flight.icao24} • {flight.origin_country}</p>
                                            </div>
                                            <Badge variant={flight.on_ground ? 'secondary' : 'default'}>
                                                {flight.on_ground ? 'On Ground' : 'In Flight'}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* Empty State */}
            {!selectedFlight && !loading && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Plane className="h-16 w-16 text-muted-foreground mb-4" />
                        <p className="text-lg font-semibold mb-2">No Flight Selected</p>
                        <p className="text-sm text-muted-foreground text-center max-w-md">
                            Enter a flight callsign (e.g., AAL123) or ICAO24 address (e.g., a1b2c3) to track a flight in real-time.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
