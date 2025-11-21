'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, RefreshCw, Users, Battery, Signal } from 'lucide-react'
import { toast } from 'sonner'

// Dynamically import map component to avoid SSR issues
const OfficerMap = dynamic(() => import('@/components/tracking/OfficerMap'), {
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

type OfficerLocation = {
  id: string
  user_id: string
  latitude: number
  longitude: number
  accuracy: number
  altitude: number
  heading: number
  speed: number
  battery_level: number
  is_online: boolean
  timestamp: string
  users: {
    full_name: string
    oscar: string
    role: string
  }
}

export default function LiveTrackingMap() {
  const supabase = createClient()
  const [locations, setLocations] = useState<OfficerLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState(false)
  const [watchId, setWatchId] = useState<number | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    loadCurrentUser()
    loadLocations()
    
    // Subscribe to real-time location updates
    const subscription = supabase
      .channel('protocol_officer_locations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'protocol_officer_locations'
        },
        () => {
          loadLocations()
        }
      )
      .subscribe()

    // Refresh every 30 seconds
    const interval = setInterval(loadLocations, 30000)

    return () => {
      subscription.unsubscribe()
      clearInterval(interval)
      if (watchId) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [])

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
      setCurrentUser(data)
    }
  }

  const loadLocations = async () => {
    try {
      // Get latest location for each officer (within last 5 minutes)
      const { data, error } = await supabase
        .from('protocol_officer_locations')
        .select(`
          *,
          users(full_name, oscar, role)
        `)
        .gte('timestamp', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: false })

      if (error) throw error

      // Get only the latest location per user
      const latestLocations = data?.reduce((acc: OfficerLocation[], loc) => {
        if (!acc.find(l => l.user_id === loc.user_id)) {
          acc.push(loc as OfficerLocation)
        }
        return acc
      }, [])

      setLocations(latestLocations || [])
    } catch (error) {
      console.error('Error loading locations:', error)
    } finally {
      setLoading(false)
    }
  }

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser')
      return
    }

    setTracking(true)
    toast.success('Location tracking started')

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return

          // Get battery level if available
          let batteryLevel = null
          if ('getBattery' in navigator) {
            const battery = await (navigator as any).getBattery()
            batteryLevel = Math.round(battery.level * 100)
          }

          const { error } = await supabase
            .from('protocol_officer_locations')
            .insert([{
              user_id: user.id,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude || 0,
              heading: position.coords.heading || 0,
              speed: position.coords.speed || 0,
              battery_level: batteryLevel,
              is_online: true,
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
        setTracking(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )

    setWatchId(id)
  }, [supabase])

  const stopTracking = useCallback(() => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId)
      setWatchId(null)
    }
    setTracking(false)
    toast.info('Location tracking stopped')
  }, [watchId])

  const isProtocolOfficer = currentUser?.role && [
    'delta_oscar',
    'tango_oscar',
    'head_tango_oscar',
    'alpha_oscar',
    'november_oscar',
    'victor_oscar'
  ].includes(currentUser.role)

  const isAdmin = currentUser?.role && ['super_admin', 'admin'].includes(currentUser.role)

  const getStatusColor = (isOnline: boolean) => {
    return isOnline ? 'bg-green-500' : 'bg-gray-400'
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    return `${diffHours}h ago`
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Live Tracking</h1>
          <p className="text-muted-foreground">
            Real-time location tracking of Protocol Officers
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLocations}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {isProtocolOfficer && (
            <Button
              variant={tracking ? 'destructive' : 'default'}
              size="sm"
              onClick={tracking ? stopTracking : startTracking}
            >
              <MapPin className="mr-2 h-4 w-4" />
              {tracking ? 'Stop Tracking' : 'Start Tracking'}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{locations.length}</div>
            <p className="text-xs text-muted-foreground">
              Currently tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Signal className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {locations.filter(l => l.is_online).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Active now
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Status</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tracking ? 'Tracking' : 'Inactive'}
            </div>
            <p className="text-xs text-muted-foreground">
              {tracking ? 'Location being shared' : 'Not sharing location'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live Map */}
      {locations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Live Map</CardTitle>
            <CardDescription>
              Real-time positions of all Protocol Officers • {locations.filter(l => l.is_online).length} online
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OfficerMap locations={locations} height="600px" />
          </CardContent>
        </Card>
      )}

      {/* Officers List */}
      <Card>
        <CardHeader>
          <CardTitle>Protocol Officers</CardTitle>
          <CardDescription>
            {locations.length} officer{locations.length !== 1 ? 's' : ''} tracked
          </CardDescription>
        </CardHeader>
        <CardContent>
          {locations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No officers currently being tracked</p>
              <p className="text-sm mt-2">Officers need to enable tracking in their app</p>
            </div>
          ) : (
            <div className="space-y-3">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`h-3 w-3 rounded-full ${getStatusColor(location.is_online)}`} />
                    <div>
                      <p className="font-medium">
                        {location.users.full_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {location.users.oscar} • {location.users.role.replace('_', ' ').toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    {location.battery_level && (
                      <div className="flex items-center space-x-1">
                        <Battery className="h-4 w-4" />
                        <span>{location.battery_level}%</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <MapPin className="h-4 w-4" />
                      <span>
                        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                      </span>
                    </div>
                    <Badge variant={location.is_online ? 'default' : 'secondary'}>
                      {formatTimestamp(location.timestamp)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
