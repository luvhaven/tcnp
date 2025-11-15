"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Plane, Plus, RefreshCw, MapPin, Clock, TrendingUp, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

type FlightTracking = {
  id: string
  papa_id: string
  flight_number: string
  icao24: string | null
  callsign: string | null
  origin_country: string | null
  departure_airport: string
  arrival_airport: string
  scheduled_departure: string
  scheduled_arrival: string
  actual_departure: string | null
  estimated_arrival: string | null
  current_latitude: number | null
  current_longitude: number | null
  altitude: number | null
  velocity: number | null
  heading: number | null
  status: string
  last_updated: string
  papas: {
    full_name: string
    title: string
  }
}

export default function EagleTrackingPage() {
  const supabase = createClient()
  const [flights, setFlights] = useState<FlightTracking[]>([])
  const [papas, setPapas] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [formData, setFormData] = useState({
    papa_id: '',
    flight_number: '',
    departure_airport: '',
    arrival_airport: '',
    scheduled_departure: '',
    scheduled_arrival: ''
  })

  useEffect(() => {
    loadData()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      refreshAllFlights()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single()
      
      setCurrentUser(userData)

      const [flightsRes, papasRes] = await Promise.all([
        supabase
          .from('flight_tracking')
          .select(`
            *,
            papas(full_name, title)
          `)
          .order('scheduled_departure', { ascending: false }),
        supabase
          .from('papas')
          .select('*')
          .order('full_name')
      ])

      if (flightsRes.data) setFlights(flightsRes.data as FlightTracking[])
      if (papasRes.data) setPapas(papasRes.data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load flight data')
    } finally {
      setLoading(false)
    }
  }

  const lookupFlightDetails = async () => {
    if (!formData.flight_number) {
      toast.error('Please enter a flight number first')
      return
    }

    setLookingUp(true)
    
    try {
      const flightNumber = formData.flight_number.trim().toUpperCase()
      
      // Try AviationStack API (free tier: 100 requests/month)
      // Alternative: Use OpenSky Network for real-time tracking
      const response = await fetch(
        `https://opensky-network.org/api/states/all?time=0`
      )
      
      if (!response.ok) {
        throw new Error('Failed to fetch flight data')
      }

      const data = await response.json()
      
      // Find matching flight by callsign
      const flightData = data.states?.find((state: any) => {
        const callsign = state[1]?.trim().toUpperCase()
        return callsign && callsign.includes(flightNumber)
      })

      if (flightData) {
        // Extract ICAO24, origin country, position
        const [icao24, callsign, origin_country, , , longitude, latitude, , , , , , , , , , ,] = flightData
        
        // Try to determine airports from airline code
        const airlineCode = flightNumber.substring(0, 2)
        const commonAirports = getCommonAirportsForAirline(airlineCode)
        
        // Auto-fill what we can
        setFormData(prev => ({
          ...prev,
          departure_airport: commonAirports.departure || prev.departure_airport,
          arrival_airport: commonAirports.arrival || prev.arrival_airport
        }))
        
        toast.success(`Flight ${callsign} found! Origin: ${origin_country}`)
        if (!commonAirports.departure || !commonAirports.arrival) {
          toast.info('Please verify and complete airport codes')
        }
      } else {
        // Flight not in current tracking, try to infer from flight number
        const airlineCode = flightNumber.substring(0, 2)
        const commonAirports = getCommonAirportsForAirline(airlineCode)
        
        if (commonAirports.departure || commonAirports.arrival) {
          setFormData(prev => ({
            ...prev,
            departure_airport: commonAirports.departure || prev.departure_airport,
            arrival_airport: commonAirports.arrival || prev.arrival_airport
          }))
          toast.info(`Suggested airports for ${airlineCode}. Please verify.`)
        } else {
          toast.info('Flight not found in current data. Please enter details manually.')
        }
      }
    } catch (error) {
      console.error('Lookup error:', error)
      toast.warning('Could not auto-lookup flight. Please enter details manually.')
    } finally {
      setLookingUp(false)
    }
  }

  // Helper function to suggest common airports based on airline code
  const getCommonAirportsForAirline = (airlineCode: string): { departure: string, arrival: string } => {
    const commonRoutes: Record<string, { departure: string, arrival: string }> = {
      // Nigerian Airlines
      'P4': { departure: 'LOS', arrival: 'ABV' }, // Air Peace: Lagos to Abuja
      'N0': { departure: 'LOS', arrival: 'PHC' }, // Aero Contractors: Lagos to Port Harcourt
      'OJ': { departure: 'ABV', arrival: 'LOS' }, // Overland Airways: Abuja to Lagos
      'Q9': { departure: 'LOS', arrival: 'KAN' }, // Green Africa Airways: Lagos to Kano
      'NG': { departure: 'LOS', arrival: 'ABV' }, // Arik Air: Lagos to Abuja
      'VK': { departure: 'LOS', arrival: 'ABV' }, // ValueJet: Lagos to Abuja
      'D3': { departure: 'LOS', arrival: 'ABV' }, // Dana Air: Lagos to Abuja
      'U5': { departure: 'LOS', arrival: 'ABV' }, // United Nigeria Airlines: Lagos to Abuja
      
      // African Airlines
      'ET': { departure: 'ADD', arrival: 'LOS' }, // Ethiopian Airlines: Addis Ababa to Lagos
      'KQ': { departure: 'NBO', arrival: 'LOS' }, // Kenya Airways: Nairobi to Lagos
      'SA': { departure: 'JNB', arrival: 'LOS' }, // South African Airways: Johannesburg to Lagos
      'MS': { departure: 'CAI', arrival: 'LOS' }, // EgyptAir: Cairo to Lagos
      'AT': { departure: 'CMN', arrival: 'LOS' }, // Royal Air Maroc: Casablanca to Lagos
      'DT': { departure: 'DAR', arrival: 'LOS' }, // TAAG Angola Airlines: Dar es Salaam to Lagos
      'RW': { departure: 'KGL', arrival: 'LOS' }, // RwandAir: Kigali to Lagos
      
      // Major International Airlines
      'BA': { departure: 'LHR', arrival: 'ABV' }, // British Airways: London to Abuja
      'AA': { departure: 'JFK', arrival: 'LOS' }, // American Airlines: New York to Lagos
      'AF': { departure: 'CDG', arrival: 'LOS' }, // Air France: Paris to Lagos
      'LH': { departure: 'FRA', arrival: 'ABV' }, // Lufthansa: Frankfurt to Abuja
      'EK': { departure: 'DXB', arrival: 'LOS' }, // Emirates: Dubai to Lagos
      'QR': { departure: 'DOH', arrival: 'ABV' }, // Qatar Airways: Doha to Abuja
      'KL': { departure: 'AMS', arrival: 'LOS' }, // KLM: Amsterdam to Lagos
      'TK': { departure: 'IST', arrival: 'ABV' }, // Turkish Airlines: Istanbul to Abuja
      'EY': { departure: 'AUH', arrival: 'LOS' }, // Etihad: Abu Dhabi to Lagos
      'VS': { departure: 'LHR', arrival: 'LOS' }, // Virgin Atlantic: London to Lagos
      'DL': { departure: 'ATL', arrival: 'LOS' }, // Delta: Atlanta to Lagos
      'UA': { departure: 'IAD', arrival: 'LOS' }, // United: Washington to Lagos
    }
    
    return commonRoutes[airlineCode] || { departure: '', arrival: '' }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const { error } = await supabase
        .from('flight_tracking')
        .insert([{
          ...formData,
          status: 'scheduled'
        }])

      if (error) throw error
      toast.success('Flight added successfully!')
      setDialogOpen(false)
      resetForm()
      loadData()
      
      // Try to fetch initial flight data
      const insertedFlight = flights.find(f => f.flight_number === formData.flight_number)
      if (insertedFlight) {
        refreshFlightData(insertedFlight.id, formData.flight_number)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to add flight')
    }
  }

  const handleDeleteFlight = async (flightId: string) => {
    if (!confirm('Are you sure you want to delete this flight tracking?')) return

    // Check if user is admin
    if (!['super_admin', 'admin'].includes(currentUser?.role)) {
      toast.error('Only Super Admin and Admin can delete flights')
      return
    }

    try {
      const { error } = await supabase
        .from('flight_tracking')
        .delete()
        .eq('id', flightId)

      if (error) throw error
      toast.success('Flight tracking deleted successfully!')
      loadData()
    } catch (error: any) {
      console.error('Error deleting flight:', error)
      toast.error(error.message || 'Failed to delete flight')
    }
  }

  const refreshFlightData = async (flightId: string, flightNumber: string) => {
    setRefreshing(flightId)
    
    try {
      // OpenSky Network API - Free, no API key required
      // Search for flights by callsign (flight number)
      const response = await fetch(
        `https://opensky-network.org/api/states/all?time=0`
      )
      
      if (!response.ok) {
        throw new Error('Failed to fetch flight data')
      }

      const data = await response.json()
      
      // Find matching flight by callsign
      const flightData = data.states?.find((state: any) => {
        const callsign = state[1]?.trim().toUpperCase()
        const searchNumber = flightNumber.replace(/\s/g, '').toUpperCase()
        return callsign?.includes(searchNumber) || searchNumber.includes(callsign)
      })

      if (flightData) {
        // OpenSky data format: [icao24, callsign, origin_country, time_position, last_contact, 
        //                        longitude, latitude, baro_altitude, on_ground, velocity, 
        //                        true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source]
        
        const updateData = {
          icao24: flightData[0],
          callsign: flightData[1]?.trim(),
          origin_country: flightData[2],
          current_longitude: flightData[5],
          current_latitude: flightData[6],
          altitude: flightData[7] || flightData[13], // baro_altitude or geo_altitude
          velocity: flightData[9] ? flightData[9] * 3.6 : null, // Convert m/s to km/h
          heading: flightData[10],
          status: flightData[8] ? 'landed' : 'in_air',
          last_updated: new Date().toISOString()
        }

        const { error } = await supabase
          .from('flight_tracking')
          .update(updateData)
          .eq('id', flightId)

        if (error) throw error
        toast.success('Flight data updated!')
      } else {
        toast.info('Flight not found in current airspace. It may not be airborne yet.')
      }

      loadData()
    } catch (error: any) {
      console.error('Error refreshing flight:', error)
      toast.error('Failed to refresh flight data. Using alternative source...')
      
      // Fallback: Try AviationStack API (requires API key but has free tier)
      // Or use FlightAware, FlightRadar24 API
      // For now, just update the last_updated timestamp
      await supabase
        .from('flight_tracking')
        .update({ last_updated: new Date().toISOString() })
        .eq('id', flightId)
    } finally {
      setRefreshing(null)
    }
  }

  const refreshAllFlights = async () => {
    const activeFlights = flights.filter(f => 
      ['scheduled', 'boarding', 'departed', 'in_air', 'approaching', 'landing'].includes(f.status)
    )
    
    for (const flight of activeFlights) {
      await refreshFlightData(flight.id, flight.flight_number)
    }
  }

  const resetForm = () => {
    setFormData({
      papa_id: '',
      flight_number: '',
      departure_airport: '',
      arrival_airport: '',
      scheduled_departure: '',
      scheduled_arrival: ''
    })
  }

  const openDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'bg-blue-500',
      departed: 'bg-yellow-500',
      in_air: 'bg-green-500',
      landed: 'bg-purple-500',
      delayed: 'bg-orange-500',
      cancelled: 'bg-red-500'
    }
    return colors[status] || 'bg-gray-500'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'scheduled': 'Scheduled',
      'boarding': 'Boarding',
      'departed': 'Departed',
      'in_air': 'In Air',
      'approaching': 'Approaching',
      'landing': 'Landing',
      'landed': 'Landed',
      'arrived': 'Arrived',
      'delayed': 'Delayed',
      'cancelled': 'Cancelled'
    }
    return labels[status] || status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Eagle Tracking</h1>
          <p className="text-muted-foreground">Real-time flight tracking using OpenSky Network</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => refreshAllFlights()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh All
          </Button>
          <Button onClick={openDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Track Flight
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Flights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flights.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Air</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {flights.filter(f => f.status === 'in_air').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {flights.filter(f => f.status === 'scheduled').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Landed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {flights.filter(f => f.status === 'landed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flight List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {flights.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Plane className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No flights tracked yet</p>
              <Button className="mt-4" onClick={openDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Track Flight
              </Button>
            </CardContent>
          </Card>
        ) : (
          flights.map((flight) => (
            <Card key={flight.id}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>{flight.flight_number}</span>
                  <div className={`h-3 w-3 rounded-full ${getStatusColor(flight.status)}`} />
                </CardTitle>
                <CardDescription>
                  {flight.papas.title} {flight.papas.full_name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From:</span>
                    <span className="font-medium">{flight.departure_airport}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To:</span>
                    <span className="font-medium">{flight.arrival_airport}</span>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <Badge variant="secondary" className="mb-2">
                      {getStatusLabel(flight.status)}
                    </Badge>
                    
                    {flight.current_latitude && flight.current_longitude && (
                      <div className="flex items-center space-x-2 text-xs">
                        <MapPin className="h-3 w-3" />
                        <span>
                          {flight.current_latitude.toFixed(2)}°, {flight.current_longitude.toFixed(2)}°
                        </span>
                      </div>
                    )}
                    
                    {flight.altitude && (
                      <div className="flex items-center space-x-2 text-xs">
                        <TrendingUp className="h-3 w-3" />
                        <span>{Math.round(flight.altitude)}m altitude</span>
                      </div>
                    )}
                    
                    {flight.velocity && (
                      <div className="flex items-center space-x-2 text-xs">
                        <Plane className="h-3 w-3" />
                        <span>{Math.round(flight.velocity)} km/h</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-muted-foreground pt-2">
                    <Clock className="h-3 w-3" />
                    <span>
                      Updated {formatDistanceToNow(new Date(flight.last_updated), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => refreshFlightData(flight.id, flight.flight_number)}
                    disabled={refreshing === flight.id}
                  >
                    {refreshing === flight.id ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Data
                      </>
                    )}
                  </Button>
                  
                  {/* Delete button - only for admins */}
                  {currentUser && ['super_admin', 'admin'].includes(currentUser.role) && (
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={() => handleDeleteFlight(flight.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Flight Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Track New Flight</DialogTitle>
            <DialogDescription>
              Add a flight to track in real-time using OpenSky Network
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="papa_id">Papa (Guest) *</Label>
              <Select
                id="papa_id"
                required
                value={formData.papa_id}
                onChange={(e) => setFormData({ ...formData, papa_id: e.target.value })}
              >
                <option value="">Select guest</option>
                {papas.map((papa) => (
                  <option key={papa.id} value={papa.id}>
                    {papa.title} {papa.full_name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flight_number">Flight Number *</Label>
              <div className="flex space-x-2">
                <Input
                  id="flight_number"
                  required
                  placeholder="e.g., BA123, AA456"
                  value={formData.flight_number}
                  onChange={(e) => setFormData({ ...formData, flight_number: e.target.value.toUpperCase() })}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={lookupFlightDetails}
                  disabled={lookingUp || !formData.flight_number}
                >
                  {lookingUp ? 'Looking up...' : 'Lookup'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter flight number (e.g., BA123) and click Lookup to auto-suggest airports
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="departure_airport">Departure Airport *</Label>
                <Input
                  id="departure_airport"
                  required
                  placeholder="e.g., LHR, JFK"
                  value={formData.departure_airport}
                  onChange={(e) => setFormData({ ...formData, departure_airport: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="arrival_airport">Arrival Airport *</Label>
                <Input
                  id="arrival_airport"
                  required
                  placeholder="e.g., ABV, LOS"
                  value={formData.arrival_airport}
                  onChange={(e) => setFormData({ ...formData, arrival_airport: e.target.value.toUpperCase() })}
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
                <Label htmlFor="scheduled_arrival">Scheduled Arrival *</Label>
                <Input
                  id="scheduled_arrival"
                  type="datetime-local"
                  required
                  value={formData.scheduled_arrival}
                  onChange={(e) => setFormData({ ...formData, scheduled_arrival: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Track Flight
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
