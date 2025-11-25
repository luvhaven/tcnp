'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MapPin, Users, Car, Navigation, Search } from 'lucide-react'
import { cn, getCallSignColor } from '@/lib/utils'
import { CallSignKey, getCallSignLabel, resolveCallSignKey, TNCP_JOURNEY_PHASE_KEYS } from '@/lib/constants/tncpCallSigns'

type UserLocation = {
  user_id: string
  full_name: string
  oscar: string
  role: string
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  heading: number | null
  battery_level: number | null
  updated_at: string
}

type LiveTrackingLeafletProps = {
  center: [number, number]
  locations: UserLocation[]
  getUserStatus: (updatedAt: string) => { label: string; color: string }
  getRoleDisplay: (role?: string | null) => { label: string; color: string }
}

const LiveTrackingLeaflet = dynamic<LiveTrackingLeafletProps>(
  () => import('./LiveTrackingLeaflet'),
  { ssr: false }
)

type Journey = {
  id: string
  status: string
  papas: { full_name: string } | null
  cheetah: { call_sign: string } | null
  callSignKey?: CallSignKey | null
}

type StatusCategory = 'active' | 'stale' | 'offline'
type StatusFilter = 'all' | StatusCategory

const STATUS_METADATA: Record<StatusCategory, { label: string; colorClass: string }> = {
  active: { label: 'Active', colorClass: 'bg-green-500' },
  stale: { label: 'Stale', colorClass: 'bg-orange-500' },
  offline: { label: 'Offline', colorClass: 'bg-gray-500' }
}

const getStatusCategory = (updatedAt: string): StatusCategory => {
  const now = new Date()
  const updated = new Date(updatedAt)
  const minutesAgo = (now.getTime() - updated.getTime()) / 1000 / 60

  if (minutesAgo < 2) return 'active'
  if (minutesAgo < 10) return 'stale'
  return 'offline'
}

const JOURNEY_PHASE_SET = new Set<string>(TNCP_JOURNEY_PHASE_KEYS)

const ROLE_METADATA: Record<string, { label: string; color: string }> = {
  delta_oscar: { label: 'Delta Oscar', color: '#2563EB' },
  tango_oscar: { label: 'Tango Oscar', color: '#059669' },
  alpha_oscar: { label: 'Alpha Oscar', color: '#6D28D9' },
  victor_oscar: { label: 'Victor Oscar', color: '#D97706' },
  november_oscar: { label: 'November Oscar', color: '#4338CA' },
  captain: { label: 'Captain', color: '#16A34A' },
  vice_captain: { label: 'Vice Captain', color: '#22C55E' },
  head_tango_oscar: { label: 'Head, Tango Oscar', color: '#0EA5E9' },
  head_of_operations: { label: 'Head of Operations', color: '#DB2777' },
  head_of_command: { label: 'Head of Command', color: '#0F172A' },
  command: { label: 'Command', color: '#1D4ED8' },
  admin: { label: 'Admin', color: '#1F2937' },
  super_admin: { label: 'Super Admin', color: '#111827' },
  prof: { label: 'Prof', color: '#7C3AED' },
  duchess: { label: 'Duchess', color: '#DB2777' },
  viewer: { label: 'Viewer', color: '#6B7280' },
}

const toTitleCase = (value: string) =>
  value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

const formatRole = (role?: string | null) => {
  if (!role || role === 'unassigned') return 'Unassigned'
  return ROLE_METADATA[role]?.label ?? toTitleCase(role)
}

const getRoleColor = (role?: string | null) => {
  if (!role || role === 'unassigned') return '#4B5563'
  return ROLE_METADATA[role]?.color ?? '#4B5563'
}

const getRoleDisplayMeta = (role?: string | null) => ({
  label: formatRole(role),
  color: getRoleColor(role)
})

const getCallSignBackgroundClass = (value: string): string => {
  const classes = getCallSignColor(value)
  const background = classes.split(' ').find((className) => className.startsWith('bg-'))
  return background ?? 'bg-muted'
}

const getJourneyCallSignLabel = (status: string): string => getCallSignLabel(status) ?? status

export default function LiveTrackingMap() {
  const supabase = createClient()
  const [userLocations, setUserLocations] = useState<UserLocation[]>([])
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [mapCenter, setMapCenter] = useState<[number, number]>([6.5244, 3.3792]) // Lagos, Nigeria
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    loadData()
    
    // Subscribe to real-time location updates
    const locationChannel = supabase
      .channel('user-locations-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_locations'
      }, () => {
        console.log('📍 Location update received')
        loadUserLocations()
      })
      .subscribe()

    // Subscribe to journey updates
    const journeyChannel = supabase
      .channel('journeys-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'journeys'
      }, () => {
        console.log('🚗 Journey update received')
        loadJourneys()
      })
      .subscribe()

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadUserLocations()
    }, 30000)

    return () => {
      supabase.removeChannel(locationChannel)
      supabase.removeChannel(journeyChannel)
      clearInterval(interval)
    }
  }, [])

  const loadData = async () => {
    setLoading(true)
    await Promise.all([loadUserLocations(), loadJourneys()])
    setLoading(false)
  }

  const loadUserLocations = async () => {
    try {
      const { data, error } = await (supabase as any).rpc('get_active_user_locations')
      
      if (error) throw error
      
      console.log('✅ Loaded user locations:', data)
      setUserLocations(data || [])
    } catch (error) {
      console.error('❌ Error loading user locations:', error)
    }
  }

  const loadJourneys = async () => {
    try {
      const { data, error } = await supabase
        .from('journeys')
        .select(`
          id,
          status,
          papas:papa_id (full_name),
          cheetah:assigned_cheetah_id (call_sign)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      console.log('✅ Loaded journeys:', data)
      const normalizedJourneys = (data ?? []).map((journey) => {
        const callSignKey = resolveCallSignKey(journey.status) ?? null
        return {
          ...journey,
          callSignKey
        } as Journey
      })

      setJourneys(normalizedJourneys)
    } catch (error) {
      console.error('❌ Error loading journeys:', (error as any)?.message || error)
    }
  }

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    userLocations.forEach((loc) => {
      const key = loc.role ?? 'unassigned'
      counts[key] = (counts[key] ?? 0) + 1
    })
    return counts
  }, [userLocations])

  const roleEntries = useMemo(() => {
    return Object.entries(roleCounts).sort((a, b) => b[1] - a[1])
  }, [roleCounts])

  useEffect(() => {
    if (roleFilter === 'all') return
    if (!roleEntries.some(([role]) => role === roleFilter)) {
      setRoleFilter('all')
    }
  }, [roleEntries, roleFilter])

  const roleOptions = useMemo(() => roleEntries.map(([role]) => role), [roleEntries])

  const journeyCallSignList = useMemo(() => {
    return journeys.filter((journey) => {
      const key = journey.callSignKey ?? resolveCallSignKey(journey.status)
      return key ? JOURNEY_PHASE_SET.has(key) : false
    })
  }, [journeys])

  const journeyPhaseCounts = useMemo(() => {
    const counts = TNCP_JOURNEY_PHASE_KEYS.reduce((acc, key) => {
      acc[key] = 0
      return acc
    }, {} as Record<CallSignKey, number>)

    journeyCallSignList.forEach((journey) => {
      const key = (journey.callSignKey ?? resolveCallSignKey(journey.status)) as CallSignKey | undefined
      if (key && JOURNEY_PHASE_SET.has(key)) {
        counts[key] = (counts[key] ?? 0) + 1
      }
    })

    return counts
  }, [journeyCallSignList])

  const filteredLocations = useMemo<UserLocation[]>(() => {
    const searchValue = searchTerm.toLowerCase()
    return userLocations.filter((loc) => {
      const roleLabel = formatRole(loc.role)
      const matchesSearch =
        loc.full_name.toLowerCase().includes(searchValue) ||
        loc.oscar?.toLowerCase().includes(searchValue) ||
        roleLabel.toLowerCase().includes(searchValue)
      const normalizedRole = loc.role ?? 'unassigned'
      const matchesRole = roleFilter === 'all' || normalizedRole === roleFilter
      const matchesStatus =
        statusFilter === 'all' || getStatusCategory(loc.updated_at) === statusFilter
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [userLocations, searchTerm, roleFilter, statusFilter])

  const getUserStatus = (updatedAt: string) => {
    const category = getStatusCategory(updatedAt)
    const meta = STATUS_METADATA[category]
    return { label: meta.label, color: meta.colorClass }
  }

  const statusCounts = useMemo<Record<StatusCategory, number>>(() => {
    return userLocations.reduce(
      (acc, loc) => {
        const category = getStatusCategory(loc.updated_at)
        acc[category] = (acc[category] ?? 0) + 1
        return acc
      },
      { active: 0, stale: 0, offline: 0 }
    )
  }, [userLocations])

  const statusOptions = useMemo(
    () => [
      { key: 'all' as StatusFilter, label: 'All statuses', count: userLocations.length },
      { key: 'active' as StatusFilter, label: 'Active (<2m)', count: statusCounts.active },
      { key: 'stale' as StatusFilter, label: 'Stale (<10m)', count: statusCounts.stale },
      { key: 'offline' as StatusFilter, label: 'Offline (10m+)', count: statusCounts.offline }
    ],
    [statusCounts, userLocations.length]
  )

  const stats = useMemo(() => {
    const active = userLocations.filter(loc => {
      const minutesAgo = (new Date().getTime() - new Date(loc.updated_at).getTime()) / 1000 / 60
      return minutesAgo < 2
    }).length

    return {
      journeys: journeyCallSignList.length,
      vehicles: journeyCallSignList.length,
      users: userLocations.length,
      active
    }
  }, [userLocations, journeyCallSignList])

  const recentLocations = useMemo(() => {
    if (filteredLocations.length === 0) return []
    return [...filteredLocations]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 6)
  }, [filteredLocations])

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <div className="h-7 w-56 rounded-md skeleton" />
          <div className="mt-2 h-4 w-80 rounded-md skeleton" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-3 w-20 rounded-md skeleton" />
                    <div className="mt-2 h-6 w-10 rounded-md skeleton" />
                  </div>
                  <div className="h-8 w-8 rounded-full skeleton" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="h-[400px] w-full rounded-lg skeleton" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Map Tracking</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Track journeys, vehicles, and team members in real-time
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Journeys</p>
                <p className="text-2xl font-bold text-yellow-500">{stats.journeys}</p>
              </div>
              <Navigation className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vehicles</p>
                <p className="text-2xl font-bold text-blue-500">{stats.vehicles}</p>
              </div>
              <Car className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Users</p>
                <p className="text-2xl font-bold text-purple-500">{stats.users}</p>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-500">{stats.active}</p>
              </div>
              <MapPin className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="all">All Roles</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {formatRole(role)}
                    {roleCounts[role] ? ` (${roleCounts[role]})` : ''}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    variant={statusFilter === option.key ? 'default' : 'outline'}
                    size="sm"
                    className="flex items-center gap-2 whitespace-nowrap"
                    onClick={() => setStatusFilter(option.key)}
                  >
                    <span>{option.label}</span>
                    <Badge
                      variant="secondary"
                      className="bg-muted text-muted-foreground"
                    >
                      {option.count}
                    </Badge>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Team Activity Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matching locations yet. Encourage your team to enable location services to appear here.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recentLocations.map((loc) => {
                const category = getStatusCategory(loc.updated_at)
                const meta = STATUS_METADATA[category]
                const accuracy = Number.isFinite(loc.accuracy)
                  ? `±${Math.round(loc.accuracy)}m`
                  : 'Accuracy unavailable'

                return (
                  <div
                    key={loc.user_id}
                    className="rounded-lg border border-border/70 bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{loc.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRole(loc.role)}{loc.oscar ? ` • ${loc.oscar}` : ''}
                        </p>
                      </div>
                      <Badge className={`${meta.colorClass} text-white`}>{meta.label}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Updated {formatDistanceToNow(new Date(loc.updated_at), { addSuffix: true })}{' '}
                      • {accuracy}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <div style={{ height: '600px', width: '100%' }}>
            {isClient && (
              <LiveTrackingLeaflet
                center={mapCenter}
                locations={filteredLocations}
                getUserStatus={getUserStatus}
                getRoleDisplay={getRoleDisplayMeta}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Journey Call Signs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {TNCP_JOURNEY_PHASE_KEYS.map((key) => {
              const label = getJourneyCallSignLabel(key)
              const background = getCallSignBackgroundClass(key)
              const count = journeyPhaseCounts[key] ?? 0
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className={cn('w-4 h-4 rounded-full', background)} />
                  <span className="text-sm">
                    {label}
                    {count > 0 ? ` (${count})` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {roleEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active Team Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {roleEntries.map(([role, count]) => {
                const display = getRoleDisplayMeta(role === 'unassigned' ? null : role)
                return (
                  <span
                    key={role}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-sm"
                    style={{ backgroundColor: display.color }}
                  >
                    <span>{display.label}</span>
                    <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-medium">
                      {count}
                    </span>
                  </span>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">User Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500" />
              <span className="text-sm">Active (&lt;2m)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-orange-500" />
              <span className="text-sm">Stale (&lt;10m)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-500" />
              <span className="text-sm">Offline (&gt;10m)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
