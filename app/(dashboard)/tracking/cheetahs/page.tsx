"use client"

import { useEffect, useState, useRef } from "react"
import dynamic from 'next/dynamic'
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Navigation, MapPin, Clock, Activity } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

// Dynamically import map component to avoid SSR issues
const CheetahMap = dynamic(() => import('@/components/tracking/CheetahMap'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    </div>
  ),
})

type VehicleLocation = {
  id: string
  cheetah_id: string
  latitude: number
  longitude: number
  accuracy: number
  speed: number
  heading: number
  timestamp: string
  cheetahs: {
    call_sign: string
    registration_number: string
    make: string
    model: string
  }
  users: {
    full_name: string
    oscar: string
  } | null
}

export default function CheetahTrackingPage() {
  const supabase = createClient()
  const [locations, setLocations] = useState<VehicleLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [selectedCheetah, setSelectedCheetah] = useState<string | null>(null)
  const [canTrack, setCanTrack] = useState(false)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    loadData()
    const channel = subscribeToLocationUpdates()
    
    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single()
      
      setCurrentUser(userData)
      
      // Check if user can track (exclude Super Admin and Admin)
      const isAdmin = userData?.email === 'doriazowan@gmail.com' || 
                      userData?.email === 'tcnpjourney@outlook.com' ||
                      userData?.role === 'super_admin' ||
                      userData?.role === 'admin'
      setCanTrack(!isAdmin)

      // Load latest locations for all vehicles
      const { data, error } = await supabase
        .from('vehicle_locations')
        .select(`
          *,
          cheetahs(call_sign, registration_number, make, model),
          users(full_name, oscar)
        `)
        .order('timestamp', { ascending: false })

      if (error) throw error

      // Get only the latest location for each vehicle
      const latestLocations = data?.reduce((acc: VehicleLocation[], curr) => {
        if (!acc.find(loc => loc.cheetah_id === curr.cheetah_id)) {
          acc.push(curr as VehicleLocation)
        }
        return acc
      }, [])

      setLocations(latestLocations || [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load vehicle locations')
    } finally {
      setLoading(false)
    }
  }

  const subscribeToLocationUpdates = () => {
    const channel = supabase
      .channel('vehicle-locations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicle_locations'
        },
        () => {
          loadData()
        }
      )
      .subscribe()
    
    return channel
  }

  const startTracking = async (cheetahId: string) => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser')
      return
    }

    setTracking(true)
    setSelectedCheetah(cheetahId)

    // Request high accuracy location
    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          const { error } = await supabase
            .from('vehicle_locations')
            .insert([{
              cheetah_id: cheetahId,
              user_id: currentUser?.id,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              speed: position.coords.speed || 0,
              heading: position.coords.heading || 0,
              altitude: position.coords.altitude || 0,
              timestamp: new Date().toISOString()
            }])

          if (error) throw error
        } catch (error) {
          console.error('Error saving location:', error)
        }
      },
      (error) => {
        console.error('Geolocation error:', error)
        toast.error('Failed to get location. Please enable location services.')
      },
      options
    )

    toast.success('Location tracking started')
  }

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setTracking(false)
    setSelectedCheetah(null)
    toast.info('Location tracking stopped')
  }

  const openInMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-56 rounded-md skeleton" />
          <div className="mt-2 h-4 w-80 rounded-md skeleton" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="h-4 w-32 rounded-md skeleton" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-4 w-40 rounded-md skeleton" />
                <div className="h-3 w-24 rounded-md skeleton" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="h-5 w-40 rounded-md skeleton" />
            <div className="mt-2 h-4 w-60 rounded-md skeleton" />
          </CardHeader>
          <CardContent>
            <div className="aspect-video w-full rounded-lg skeleton" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cheetah Tracking</h1>
        <p className="text-sm text-muted-foreground max-w-xl">Real-time location tracking for all Cheetahs</p>
      </div>

      {/* Instructions */}
      {canTrack && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="text-sm">How to Track Cheetahs</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>1. Select a Cheetah you're currently driving</p>
            <p>2. Click "Start Tracking" to begin sending your location</p>
            <p>3. Keep this page open while driving</p>
            <p>4. Your location will update automatically every few seconds</p>
            <p>5. Click "Stop Tracking" when you're done</p>
          </CardContent>
        </Card>
      )}
      
      {!canTrack && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950">
          <CardHeader>
            <CardTitle className="text-sm">Viewing Mode</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>You are viewing Cheetah locations in real-time. GPS tracking is handled by field officers.</p>
          </CardContent>
        </Card>
      )}

      {/* Active Tracking Status */}
      {tracking && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Activity className="h-5 w-5 text-green-600 animate-pulse" />
                <div>
                  <p className="font-medium">Tracking Active</p>
                  <p className="text-sm text-muted-foreground">
                    Your location is being shared
                  </p>
                </div>
              </div>
              <Button variant="destructive" onClick={stopTracking}>
                Stop Tracking
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vehicle List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {locations.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Navigation className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No vehicle locations yet</p>
              <p className="text-xs text-muted-foreground">Start tracking to see vehicles on the map</p>
            </CardContent>
          </Card>
        ) : (
          locations.map((location) => (
            <Card
              key={location.id}
              className={`transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 ${
                tracking && selectedCheetah === location.cheetah_id ? 'border-green-500' : ''
              }`}
            >
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>{location.cheetahs.call_sign}</span>
                  <Badge variant={tracking && selectedCheetah === location.cheetah_id ? 'success' : 'secondary'}>
                    {tracking && selectedCheetah === location.cheetah_id ? 'Tracking' : 'Idle'}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {location.cheetahs.make} {location.cheetahs.model} • {location.cheetahs.registration_number}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </span>
                  </div>
                  
                  {location.speed > 0 && (
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">{Math.round(location.speed)} km/h</span>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">
                      {formatDistanceToNow(new Date(location.timestamp), { addSuffix: true })}
                    </span>
                  </div>

                  {location.users && (
                    <div className="text-xs text-muted-foreground">
                      Tracked by: {location.users.full_name} ({location.users.oscar})
                    </div>
                  )}
                </div>

                <div className="flex space-x-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => openInMaps(location.latitude, location.longitude)}
                  >
                    <MapPin className="h-4 w-4 mr-1" />
                    View on Map
                  </Button>
                  
                  {!tracking && canTrack && (
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={() => startTracking(location.cheetah_id)}
                    >
                      <Navigation className="h-4 w-4 mr-1" />
                      Track This
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Live Map - For all users */}
      {locations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Live Map View</CardTitle>
            <CardDescription>
              Real-time Cheetah positions • {locations.length} vehicle{locations.length !== 1 ? 's' : ''} tracked
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CheetahMap locations={locations} height="600px" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
