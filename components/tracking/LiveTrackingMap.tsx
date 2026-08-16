'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { formatDistanceToNow } from 'date-fns'
import 'leaflet/dist/leaflet.css'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  MapPin, Users, Navigation, Search, ChevronLeft, ChevronRight,
  Wifi, WifiOff, Radio, Battery, Gauge, Signal, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CallSignKey, getCallSignLabel, getCallSignColor, CALL_SIGNS } from '@/lib/constants/call-signs'
import { useLocationTracking } from '@/hooks/useLocationTracking'

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
  papa_name?: string | null
}

type LiveTrackingLeafletProps = {
  center: [number, number]
  locations: UserLocation[]
  trails?: Record<string, [number, number][]>
  getUserStatus: (updatedAt: string) => { label: string; color: string }
  getRoleDisplay: (role?: string | null) => { label: string; color: string }
  showTraffic?: boolean
  tomtomKey?: string
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
  offline: { label: 'Offline', colorClass: 'bg-gray-400' }
}

const getStatusCategory = (updatedAt: string): StatusCategory => {
  const minutesAgo = (Date.now() - new Date(updatedAt).getTime()) / 1000 / 60
  if (minutesAgo < 2) return 'active'
  if (minutesAgo < 10) return 'stale'
  return 'offline'
}

const JOURNEY_PHASE_SET = new Set<string>(
  CALL_SIGNS.filter(cs => cs.category === 'movement').map(cs => cs.key)
)

const ROLE_METADATA: Record<string, { label: string; color: string }> = {
  delta_oscar: { label: 'Delta Oscar', color: '#2563EB' },
  tango_oscar: { label: 'Tango Oscar', color: '#059669' },
  alpha_oscar: { label: 'Alpha Oscar', color: '#6D28D9' },
  victor_oscar: { label: 'Victor Oscar', color: '#D97706' },
  november_oscar: { label: 'November Oscar', color: '#4338CA' },
  noscar_den: { label: 'November (Theatre)', color: '#4338CA' },
  head_noscar_den: { label: 'Head, November (Theatre)', color: '#3730A3' },
  noscar_nest: { label: 'November (Nest)', color: '#4F46E5' },
  head_noscar_nest: { label: 'Head, November (Nest)', color: '#4338CA' },
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
  value.split('_').filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')

const formatRole = (role?: string | null) => {
  if (!role || role === 'unassigned') return 'Unassigned'
  return ROLE_METADATA[role]?.label ?? toTitleCase(role)
}

const getRoleColor = (role?: string | null) =>
  ROLE_METADATA[role ?? '']?.color ?? '#4B5563'

const getRoleDisplayMeta = (role?: string | null) => ({
  label: formatRole(role),
  color: getRoleColor(role)
})

const getCallSignBackgroundClass = (value: string): string => {
  const classes = getCallSignColor(value)
  return classes.split(' ').find(c => c.startsWith('bg-')) ?? 'bg-muted'
}

/** Collapsible accordion section used in the sidebar */
function SidebarSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
      >
        <span>{title}</span>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export default function LiveTrackingMap() {
  const supabase = createClient()
  const [userLocations, setUserLocations] = useState<UserLocation[]>([])
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [mapCenter] = useState<[number, number]>([6.5244, 3.3792])
  const [isClient, setIsClient] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showTraffic, setShowTraffic] = useState(false)
  const tomtomKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY ?? ''
  const locationTrailsRef = useRef<Record<string, [number, number][]>>({})
  const [locationTrails, setLocationTrails] = useState<Record<string, [number, number][]>>({})

  const { permissionStatus, requestPermission, isTracking, startTracking } =
    useLocationTracking({ enableTracking: true, updateInterval: 10000, highAccuracy: true })

  useEffect(() => { setIsClient(true) }, [])

  const handleEnableLocation = async () => {
    const granted = await requestPermission()
    if (granted) {
      startTracking()
      toast.success('Location sharing enabled — you are now visible on the map.')
    } else {
      toast.error('Location access denied. Please allow location in your browser settings and refresh.')
    }
  }

  useEffect(() => {
    loadData()
    const locationChannel = supabase
      .channel('user-locations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_locations' }, () => loadUserLocations())
      .subscribe()
    const journeyChannel = supabase
      .channel('journeys-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, () => loadJourneys())
      .subscribe()
    const interval = setInterval(() => loadUserLocations(), 30000)
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

  const handleManualRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadUserLocations(), loadJourneys()])
    setRefreshing(false)
    toast.success('Map refreshed')
  }

  const loadUserLocations = async () => {
    try {
      const { data, error } = await (supabase as any).rpc('get_active_user_locations')
      if (error) { console.error('❌ Error loading user locations:', error); return }

      const { data: activeJourneys } = await supabase
        .from('journeys')
        .select('assigned_duty_officer_id, assigned_do_id, papas:papa_id (full_name)')
        .not('status', 'in', '(completed,cancelled,broken_arrow)')

      const userToPapaMap = new Map<string, string>()
      activeJourneys?.forEach((j: any) => {
        const doId = j.assigned_duty_officer_id || j.assigned_do_id
        if (doId && j.papas?.full_name) userToPapaMap.set(doId, j.papas.full_name)
      })

      const enrichedData = (data || []).map((loc: UserLocation) => ({
        ...loc,
        papa_name: (loc.role === 'delta_oscar' || loc.oscar?.toLowerCase().includes('do'))
          ? (userToPapaMap.get(loc.user_id) || null)
          : null
      }))

      const trails = locationTrailsRef.current
      enrichedData.forEach((loc: UserLocation) => {
        const point: [number, number] = [loc.latitude, loc.longitude]
        const existing = trails[loc.user_id] ?? []
        const last = existing[existing.length - 1]
        if (!last || Math.abs(last[0] - point[0]) > 0.00005 || Math.abs(last[1] - point[1]) > 0.00005) {
          trails[loc.user_id] = [...existing, point].slice(-10)
        }
      })
      setLocationTrails({ ...trails })
      setUserLocations(enrichedData)
    } catch (err) {
      console.error('❌ Error loading user locations:', err)
    }
  }

  const loadJourneys = async () => {
    try {
      const { data, error } = await supabase
        .from('journeys')
        .select('id, status, papas:papa_id (full_name), cheetah:assigned_cheetah_id (call_sign)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setJourneys((data ?? []).map((j: any) => ({ ...j, callSignKey: j.status as CallSignKey | null })))
    } catch (err) {
      console.error('❌ Error loading journeys:', (err as any)?.message || err)
    }
  }

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    userLocations.forEach(loc => { const k = loc.role ?? 'unassigned'; counts[k] = (counts[k] ?? 0) + 1 })
    return counts
  }, [userLocations])

  const roleEntries = useMemo(() => Object.entries(roleCounts).sort((a, b) => b[1] - a[1]), [roleCounts])

  useEffect(() => {
    if (roleFilter === 'all') return
    if (!roleEntries.some(([r]) => r === roleFilter)) setRoleFilter('all')
  }, [roleEntries, roleFilter])

  const roleOptions = useMemo(() => roleEntries.map(([r]) => r), [roleEntries])

  const journeyCallSignList = useMemo(() =>
    journeys.filter(j => JOURNEY_PHASE_SET.has((j.callSignKey ?? j.status) as string)),
    [journeys]
  )

  const journeyPhaseCounts = useMemo(() => {
    const counts = CALL_SIGNS.filter(cs => cs.category === 'movement').reduce((acc, cs) => {
      acc[cs.key] = 0; return acc
    }, {} as Record<CallSignKey, number>)
    journeyCallSignList.forEach(j => {
      const key = (j.callSignKey ?? j.status) as CallSignKey
      if (JOURNEY_PHASE_SET.has(key)) counts[key] = (counts[key] ?? 0) + 1
    })
    return counts
  }, [journeyCallSignList])

  const filteredLocations = useMemo<UserLocation[]>(() => {
    const s = searchTerm.toLowerCase()
    return userLocations.filter(loc => {
      const matchesSearch = loc.full_name.toLowerCase().includes(s) ||
        loc.oscar?.toLowerCase().includes(s) ||
        formatRole(loc.role).toLowerCase().includes(s)
      const matchesRole = roleFilter === 'all' || (loc.role ?? 'unassigned') === roleFilter
      const matchesStatus = statusFilter === 'all' || getStatusCategory(loc.updated_at) === statusFilter
      const hasCoords = loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0)
      return matchesSearch && matchesRole && matchesStatus && hasCoords
    })
  }, [userLocations, searchTerm, roleFilter, statusFilter])

  const getUserStatus = (updatedAt: string) => {
    const cat = getStatusCategory(updatedAt)
    return { label: STATUS_METADATA[cat].label, color: STATUS_METADATA[cat].colorClass }
  }

  const statusCounts = useMemo<Record<StatusCategory, number>>(() =>
    userLocations.reduce((acc, loc) => {
      const cat = getStatusCategory(loc.updated_at); acc[cat] = (acc[cat] ?? 0) + 1; return acc
    }, { active: 0, stale: 0, offline: 0 }),
    [userLocations]
  )

  const stats = useMemo(() => ({
    journeys: journeyCallSignList.length,
    users: userLocations.length,
    active: statusCounts.active
  }), [statusCounts, userLocations, journeyCallSignList])

  const recentLocations = useMemo(() =>
    [...filteredLocations].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8),
    [filteredLocations]
  )

  // ─── Loading skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[calc(100vh-6rem)] flex-col gap-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-5 w-36 rounded-lg bg-muted" />
            <div className="h-3 w-52 rounded-lg bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-24 rounded-full bg-muted" />
            <div className="h-7 w-7 rounded-full bg-muted" />
          </div>
        </div>
        <div className="flex flex-1 min-h-0 gap-3">
          <div className="flex-1 rounded-xl bg-muted" />
          <div className="hidden lg:flex lg:w-64 flex-col gap-3">
            <div className="h-36 rounded-xl bg-muted" />
            <div className="h-52 rounded-xl bg-muted" />
            <div className="h-28 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3 animate-fade-in">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Live Tracking</h1>
          <p className="text-[11px] text-muted-foreground">Journeys, vehicles, and team members in real time.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Location sharing indicator */}
          {isTracking ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 select-none">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Broadcasting location
            </span>
          ) : permissionStatus === 'denied' ? (
            <button
              onClick={handleEnableLocation}
              className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/30 px-3 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
            >
              <WifiOff className="h-3 w-3" />
              Location blocked — tap to fix
            </button>
          ) : (
            <button
              onClick={handleEnableLocation}
              className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-[11px] font-medium text-orange-700 dark:text-orange-400 hover:bg-orange-500/20 transition-colors"
            >
              <Wifi className="h-3 w-3" />
              Enable sharing
            </button>
          )}

          {/* Stat pills */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="font-semibold text-green-600 dark:text-green-400">{stats.active}</span>
              <span className="text-muted-foreground">active</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Navigation className="h-3 w-3 text-yellow-500" />
              <span className="font-semibold text-yellow-600 dark:text-yellow-400">{stats.journeys}</span>
              <span className="text-muted-foreground">journeys</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Users className="h-3 w-3 text-purple-500" />
              <span className="font-semibold text-purple-600 dark:text-purple-400">{stats.users}</span>
              <span className="text-muted-foreground">tracked</span>
            </span>
          </div>

          {/* Traffic toggle */}
          <Button
            type="button"
            variant={showTraffic ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              if (!tomtomKey) { toast.error('Traffic overlay needs a TomTom API key.'); return }
              setShowTraffic(v => !v)
            }}
          >
            <Radio className="h-3.5 w-3.5" />
            Traffic
          </Button>

          {/* Refresh */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={handleManualRefresh}
            aria-label="Refresh map"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </Button>

          {/* Sidebar toggle */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label={sidebarOpen ? 'Collapse panel' : 'Expand panel'}
          >
            {sidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ── Map + sidebar layout ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 lg:flex-row">

        {/* Map column */}
        <div className={cn(
          'min-w-0 transition-all duration-300 ease-in-out',
          sidebarOpen ? 'lg:flex-[0.74] flex-1' : 'flex-1'
        )}>
          <Card className="flex flex-col h-full overflow-hidden shadow-lg border border-border/70">
            <CardContent className="flex-1 p-0 relative min-h-[360px]">
              <div className="absolute inset-0">
                {isClient && (
                  <LiveTrackingLeaflet
                    center={mapCenter}
                    locations={filteredLocations}
                    trails={locationTrails}
                    getUserStatus={getUserStatus}
                    getRoleDisplay={getRoleDisplayMeta}
                    showTraffic={showTraffic}
                    tomtomKey={tomtomKey}
                  />
                )}
              </div>

              {/* Empty state */}
              {filteredLocations.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm z-[1000] gap-3 pointer-events-none">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted shadow-sm">
                    <MapPin className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div className="text-center px-6">
                    <p className="text-sm font-semibold">No active locations</p>
                    <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                      Ask your team to enable location sharing on their devices. Active officers will appear here automatically.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar column */}
        <div
          className={cn(
            'lg:flex-[0.26] w-full lg:w-auto flex flex-col gap-3 overflow-y-auto pb-2 transition-all duration-300 ease-in-out',
            sidebarOpen ? 'min-w-[240px] opacity-100' : 'pointer-events-none opacity-0 lg:max-w-0 lg:min-w-0 lg:overflow-hidden'
          )}
          style={{ willChange: 'opacity, max-width' }}
        >

          {/* Filters */}
          <SidebarSection title="Filters" defaultOpen>
            <div className="flex flex-col gap-3 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Name, OSCAR, or role…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roleOptions.map(role => (
                    <SelectItem key={role} value={role}>
                      {formatRole(role)}{roleCounts[role] ? ` (${roleCounts[role]})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status pills */}
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'active', 'stale', 'offline'] as StatusFilter[]).map(key => {
                  const count = key === 'all' ? userLocations.length : statusCounts[key as StatusCategory]
                  const dot = key !== 'all' ? STATUS_METADATA[key as StatusCategory].colorClass : null
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatusFilter(key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                        statusFilter === key
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                      )}
                    >
                      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
                      {key === 'all' ? 'All' : STATUS_METADATA[key as StatusCategory].label}
                      <span className="rounded-full bg-black/10 dark:bg-white/10 px-1 py-0.5 text-[9px] font-semibold">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </SidebarSection>

          {/* Team Snapshot */}
          <SidebarSection title={`Team Snapshot (${recentLocations.length})`} defaultOpen>
            {recentLocations.length === 0 ? (
              <p className="text-xs text-muted-foreground pt-1">No matching officers yet.</p>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                {recentLocations.map(loc => {
                  const cat = getStatusCategory(loc.updated_at)
                  const meta = STATUS_METADATA[cat]
                  const roleColor = getRoleColor(loc.role)
                  const speedKmh = loc.speed != null && loc.speed > 0 ? `${Math.round(loc.speed * 3.6)} km/h` : null
                  const accuracy = Number.isFinite(loc.accuracy) ? `±${Math.round(loc.accuracy)}m` : null
                  const battery = loc.battery_level != null ? `${Math.round(loc.battery_level)}%` : null

                  return (
                    <div key={loc.user_id} className="relative rounded-lg border border-border/60 bg-card p-3 shadow-sm overflow-hidden">
                      <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-lg', meta.colorClass)} />
                      <div className="pl-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{loc.full_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {formatRole(loc.role)}{loc.oscar ? ` · ${loc.oscar}` : ''}
                            </p>
                            {loc.papa_name && (
                              <p className="text-[10px] mt-0.5 text-blue-600 dark:text-blue-400 font-medium">📋 {loc.papa_name}</p>
                            )}
                          </div>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                            style={{ backgroundColor: roleColor }}
                          >
                            {meta.label}
                          </span>
                        </div>

                        {(speedKmh || accuracy || battery) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            {speedKmh && <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{speedKmh}</span>}
                            {accuracy && <span className="flex items-center gap-1"><Signal className="h-3 w-3" />{accuracy}</span>}
                            {battery && <span className="flex items-center gap-1"><Battery className="h-3 w-3" />{battery}</span>}
                          </div>
                        )}

                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(loc.updated_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SidebarSection>

          {/* Active Roles */}
          {roleEntries.length > 0 && (
            <SidebarSection title="Active Roles" defaultOpen={false}>
              <div className="flex flex-wrap gap-2 pt-1">
                {roleEntries.map(([role, count]) => {
                  const display = getRoleDisplayMeta(role === 'unassigned' ? null : role)
                  return (
                    <span
                      key={role}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm"
                      style={{ backgroundColor: display.color }}
                    >
                      {display.label}
                      <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px]">{count}</span>
                    </span>
                  )
                })}
              </div>
            </SidebarSection>
          )}

          {/* Journey Call Signs */}
          <SidebarSection title="Journey Call Signs" defaultOpen={false}>
            <div className="flex flex-wrap gap-2 pt-1">
              {CALL_SIGNS.filter(cs => cs.category === 'movement').map(cs => {
                const label = getCallSignLabel(cs.key)
                const bgClass = getCallSignBackgroundClass(cs.key)
                const count = journeyPhaseCounts[cs.key] ?? 0
                return (
                  <div key={cs.key} className="flex items-center gap-1.5">
                    <div className={cn('w-2.5 h-2.5 rounded-full', bgClass)} />
                    <span className="text-xs text-muted-foreground">{label}{count > 0 ? ` (${count})` : ''}</span>
                  </div>
                )
              })}
            </div>
          </SidebarSection>

          {/* Status Legend */}
          <SidebarSection title="Status Legend" defaultOpen={false}>
            <div className="flex flex-col gap-2 pt-1">
              {Object.entries(STATUS_METADATA).map(([key, meta]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2.5 h-2.5 rounded-full', meta.colorClass)} />
                    <span className="text-xs font-medium">{meta.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {key === 'active' ? '< 2 min' : key === 'stale' ? '2–10 min' : '> 10 min'}
                  </span>
                </div>
              ))}
            </div>
          </SidebarSection>

          {/* Traffic legend */}
          {showTraffic && (
            <SidebarSection title="Traffic Conditions" defaultOpen>
              <div className="flex flex-col gap-2 pt-1">
                {[
                  { color: '#00b200', label: 'Free flow', desc: 'Road clear' },
                  { color: '#92b300', label: 'Mostly free', desc: 'Minor slowdowns' },
                  { color: '#ffd700', label: 'Moderate', desc: 'Noticeable delay' },
                  { color: '#ff8c00', label: 'Heavy', desc: 'Significant congestion' },
                  { color: '#cc0000', label: 'Very heavy', desc: 'Severe slowdown' },
                  { color: '#4a0000', label: 'Standstill', desc: 'Near-stationary' },
                ].map(({ color, label, desc }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <div className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="text-xs font-semibold">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{desc}</span>
                  </div>
                ))}
                <p className="mt-1 text-[10px] text-muted-foreground border-t pt-1.5">Powered by TomTom</p>
              </div>
            </SidebarSection>
          )}

        </div>
      </div>
    </div>
  )
}
