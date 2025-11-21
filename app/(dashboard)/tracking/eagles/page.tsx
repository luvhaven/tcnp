'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plane, Search, RefreshCw, MapPin, Gauge, TrendingUp, Globe } from 'lucide-react'
import { toast } from 'sonner'
import {
  searchFlightsByCallsign,
  getFlightByIcao24,
  metersPerSecondToKnots,
  metersToFeet,
  formatLastContact,
  storeFlightData,
  type FlightState
} from '@/lib/opensky-api'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'

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

export default function EagleTrackingPage() {
  const supabase = createClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [flights, setFlights] = useState<FlightState[]>([])
  const [selectedFlight, setSelectedFlight] = useState<FlightState | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    if (!autoRefresh || !selectedFlight) return

    const interval = setInterval(() => {
      refreshSelectedFlight()
    }, 10000) // 10 seconds

    return () => clearInterval(interval)
  }, [autoRefresh, selectedFlight])

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast.error('Please enter a flight ID or callsign')
      return
    }

    setLoading(true)
    try {
      console.log('🔍 Searching for flights:', searchTerm)
      
      // Try ICAO24 first
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
        toast.error('No flights found. Check the flight ID and try again.')
        setFlights([])
        setSelectedFlight(null)
        return
      }

      setFlights(results)
      setSelectedFlight(results[0])
      
      // Store all results
      for (const flight of results) {
        await storeFlightData(supabase, flight)
      }
      
      toast.success(`Found ${results.length} flight(s)`)
    } catch (error: any) {
      console.error('❌ Error searching flights:', error)
      toast.error('Failed to search flights. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const refreshSelectedFlight = async () => {
    if (!selectedFlight) return

    try {
      const flight = await getFlightByIcao24(selectedFlight.icao24)
      if (flight) {
        setSelectedFlight(flight)
        setFlights(prev => prev.map(f => f.icao24 === flight.icao24 ? flight : f))
        await storeFlightData(supabase, flight)
        console.log('✅ Flight data refreshed')
      }
    } catch (error) {
      console.error('❌ Error refreshing flight:', error)
    }
  }

  const mapCenter: [number, number] = selectedFlight?.latitude && selectedFlight?.longitude
    ? [selectedFlight.latitude, selectedFlight.longitude]
    : [0, 0]

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Eagle Tracking</h1>
        <p className="text-muted-foreground mt-1">Track flights in real-time using OpenSky Network</p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
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
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {selectedFlight && (
        <>
          {/* Flight Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
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

            <Card>
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

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Speed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold">
                    {metersPerSecondToKnots(selectedFlight.velocity) || 'N/A'} kts
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Origin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-purple-500" />
                  <span className="text-2xl font-bold">
                    {selectedFlight.origin_country}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Flight Details</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedFlight.on_ground ? 'secondary' : 'default'}>
                    {selectedFlight.on_ground ? 'On Ground' : 'In Flight'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={refreshSelectedFlight}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant={autoRefresh ? 'default' : 'outline'}
                    onClick={() => setAutoRefresh(!autoRefresh)}
                  >
                    {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
                  </Button>
                </div>
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
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
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
