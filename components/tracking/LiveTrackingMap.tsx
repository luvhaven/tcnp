'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MapPin, Users, Car, Navigation, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CallSignKey, getCallSignLabel, getCallSignColor, CALL_SIGNS } from '@/lib/constants/call-signs'

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

// Journey phase keys from call-signs
const JOURNEY_PHASE_SET = new Set<string>(CALL_SIGNS.filter(cs => cs.category === 'movement').map(cs => cs.key))

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
  dev_admin: { label: 'Dev Admin', color: '#111827' },
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
  const [sidebarOpen, setSidebarOpen] = useState(true)

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

      if (error) {
        console.error('❌ Error loading user locations (Supabase RPC get_active_user_locations):', {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
        })
        // Keep UI functional even if RPC fails
        return
      }

      console.log('✅ Loaded user locations:', data)
      setUserLocations(data || [])
    } catch (error) {
      console.error('❌ Error loading user locations (unexpected):', error)
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
      const journeysData = (data ?? []) as Journey[]
      const normalizedJourneys: Journey[] = journeysData.map((journey) => {
        const callSignKey = journey.status as CallSignKey | null
        return {
          ...journey,
          callSignKey
        }
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
      const key = journey.callSignKey ?? journey.status
      return key ? JOURNEY_PHASE_SET.has(key) : false
    })
  }, [journeys])

  const journeyPhaseCounts = useMemo(() => {
    const counts = CALL_SIGNS.filter(cs => cs.category === 'movement').reduce((acc, cs) => {
      acc[cs.key] = 0
      return acc
    }, {} as Record<CallSignKey, number>)

    journeyCallSignList.forEach((journey) => {
      const key = (journey.callSignKey ?? journey.status) as CallSignKey | undefined
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
      <div className="flex h-[calc(100vh-6rem)] flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-40 rounded-md skeleton" />
            <div className="h-4 w-64 rounded-md skeleton" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 lg:flex-row">
          <div className="flex-[0.72] min-w-0">
            <Card className="h-full">
              <CardContent className="h-full p-0">
                <div className="h-full w-full rounded-lg skeleton" />
              </CardContent>
            </Card>
          </div>
          <div className="flex-[0.28] min-w-[260px] space-y-3">
            {[...Array(3)].map((_, index) => (
              <Card key={index}>
                <CardContent className="space-y-2 pt-4">
                  <div className="h-4 w-32 rounded-md skeleton" />
                  <div className="h-3 w-48 rounded-md skeleton" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3 animate-fade-in">
      {/* Compact header with inline stats and sidebar toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Live Tracking</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
            Track journeys, vehicles, and team members in real time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Navigation className="h-3 w-3 text-yellow-500" />
              <span className="font-medium">Journeys:</span>
              <span className="font-semibold text-yellow-600">{stats.journeys}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Car className="h-3 w-3 text-blue-500" />
              <span className="font-medium">Vehicles:</span>
              <span className="font-semibold text-blue-600">{stats.vehicles}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Users className="h-3 w-3 text-purple-500" />
              <span className="font-medium">Users:</span>
              <span className="font-semibold text-purple-600">{stats.users}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <MapPin className="h-3 w-3 text-green-500" />
              <span className="font-medium">Active:</span>
              <span className="font-semibold text-green-600">{stats.active}</span>
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="ml-1 h-8 w-8 rounded-full shadow-sm"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Hide details panel' : 'Show details panel'}
          >
            {sidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Main content: wide map + right sidebar */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 lg:flex-row">
        {/* Map column (dominant) */}
        <div
          className={cn(
            'min-w-0 transition-all duration-300 ease-in-out',
            sidebarOpen ? 'lg:flex-[0.76] flex-1' : 'flex-1'
          )}
        >
          <Card className="h-full overflow-hidden shadow-lg border border-border/80">
            <CardHeader className="px-4 py-2 sm:px-5 sm:py-3">
              <CardTitle className="text-sm font-medium">Live Map</CardTitle>
            </CardHeader>
            <CardContent className="h-full p-0">
              <div className="h-full w-full min-h-[360px]">
                {isClient && (
                  <LiveTrackingLeaflet
                    center={mapCenter}
                    locations={filteredLocations}
                    getUserStatus={getUserStatus}
                    getRoleDisplay={getRoleDisplayMeta}
                  />
                )}
              </div>
              {filteredLocations.length === 0 && (
                <div className="px-4 py-3 border-t text-xs text-muted-foreground bg-muted/40">
                  No active locations yet. Ask your team to enable location services on their devices to appear on the map.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar column (narrow) */}
        <div
          className={cn(
            'lg:flex-[0.24] w-full lg:w-auto min-w-[220px] space-y-4 overflow-y-auto pb-2 transition-all duration-300 ease-in-out',
            sidebarOpen
              ? 'opacity-100 translate-x-0'
              : 'pointer-events-none opacity-0 translate-x-4 lg:max-w-0 lg:min-w-0'
          )}
        >
          {/* Filters */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter by name, OSCAR, or role"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 text-sm"
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
                        <span className="text-xs sm:text-sm">{option.label}</span>
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Team Activity Snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              {recentLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No matching locations yet. Encourage your team to enable location services to appear here.
                </p>
              ) : (
                <div className="grid gap-3">
                  {recentLocations.map((loc) => {
                    const category = getStatusCategory(loc.updated_at)
                    const meta = STATUS_METADATA[category]
                    const accuracy = Number.isFinite(loc.accuracy)
                      ? `±${Math.round(loc.accuracy)}m`
                      : 'Accuracy unavailable'

                    return (
                      <div
                        key={loc.user_id}
                        className="rounded-lg border border-border/70 bg-card p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold truncate">{loc.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatRole(loc.role)}{loc.oscar ? ` • ${loc.oscar}` : ''}
                            </p>
                          </div>
                          <Badge className={`${meta.colorClass} text-white`}>{meta.label}</Badge>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
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

          {/* Legend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Journey Call Signs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {CALL_SIGNS.filter(cs => cs.category === 'movement').map((cs) => {
                  const label = getCallSignLabel(cs.key)
                  const background = getCallSignColor(cs.key)
                  const count = journeyPhaseCounts[cs.key] ?? 0
                  return (
                    <div key={cs.key} className="flex items-center gap-2">
                      <div className={cn('w-3 h-3 rounded-full', background)} />
                      <span className="text-xs sm:text-sm">
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
              <CardHeader className="pb-2">
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">User Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-xs sm:text-sm">Active (&lt;2m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-xs sm:text-sm">Stale (&lt;10m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-500" />
                  <span className="text-xs sm:text-sm">Offline (&gt;10m)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
