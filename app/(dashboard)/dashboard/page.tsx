"use client"

import { useEffect, useState } from "react"
import { JourneyAlerts } from "@/components/dashboard/JourneyAlerts"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn, isAdmin } from "@/lib/utils"
import { getCallSignLabel, resolveCallSignKey, TNCP_CALL_SIGN_COLORS } from "@/lib/constants/tncpCallSigns"
import {
  Users,
  Car,
  MapPin,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Download,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { usePWAInstall } from "@/hooks/usePWAInstall"
import { PWAInstallModal } from "@/components/pwa/PWAInstallModal"
import { MissionRequestPrompt } from "@/components/missions/MissionAvailability"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { CountUp } from "@/components/ui/count-up"

const DashboardCharts = dynamic(
  () => import("@/components/dashboard/DashboardCharts").then((m) => m.DashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-56 rounded-xl skeleton" />
        <div className="h-56 rounded-xl skeleton" />
        <div className="h-56 rounded-xl skeleton" />
      </div>
    )
  }
)

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState({
    totalPapas: 0,
    totalCheetahs: 0,
    activeJourneys: 0,
    incidents: 0,
  })
  const [recentJourneys, setRecentJourneys] = useState<any[]>([])
  const [activeProgram, setActiveProgram] = useState<{ id: string; name: string } | null>(null)
  const [myAssignment, setMyAssignment] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const { isInstalled, install, platform: pwaplatform } = usePWAInstall()
  const [showInstallModal, setShowInstallModal] = useState(false)
  const { data: currentUser } = useCurrentUser()
  const isAdminUser = isAdmin(currentUser?.role)

  useEffect(() => {
    let mounted = true

    const safeLoad = async () => {
      try {
        if (mounted) {
          await loadDashboardData()
        }
      } catch (error) {
        console.error('Dashboard load failed:', error)
      }
    }

    safeLoad()

    return () => {
      mounted = false
    }
  }, [])

  const handleInstallClick = async () => {
    const result = await install()
    if (result === 'show-instructions') {
      setShowInstallModal(true)
    } else if (result === 'accepted') {
      toast.success('TCNP is now installed. Check your home screen or app launcher.')
    }
  }

  const loadDashboardData = async () => {
    try {
      // Get stats - Querying simplfied status column + legacy call signs for safety until migration is 100%
      const [papasRes, cheetahsRes, journeysRes, incidentsRes, programRes] = await Promise.all([
        supabase.from('papas').select('id', { count: 'exact', head: true }),
        supabase.from('cheetahs').select('id', { count: 'exact', head: true }),
        // Active = anything not finished, matching the Ops Monitor definition
        (supabase as any).from('journeys').select('id', { count: 'exact', head: true })
          .not('status', 'in', '(completed,cancelled)')
          .or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('programs').select('id, name').eq('status', 'active').order('created_at', { ascending: false }).limit(1),
      ])

      setActiveProgram((programRes.data?.[0] as any) ?? null)

      setStats({
        totalPapas: papasRes.count || 0,
        totalCheetahs: cheetahsRes.count || 0,
        activeJourneys: journeysRes.count || 0,
        incidents: incidentsRes.count || 0,
      })

      // Get recent journeys (soft-deleted excluded)
      const { data: journeys } = await (supabase as any)
        .from('journeys')
        .select(`
          *,
          papas(full_name, title),
          cheetahs(call_sign, registration_number)
        `)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('created_at', { ascending: false })
        .limit(5)

      setRecentJourneys(journeys || [])

      // My next assignment — the journey I'm on as a DO, soonest first
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: myDORows } = await (supabase as any)
          .from('journey_duty_officers')
          .select('journey_id')
          .eq('user_id', user.id)
        const doIds: string[] = (myDORows || []).map((r: any) => r.journey_id)

        const orParts = [`assigned_duty_officer_id.eq.${user.id}`]
        if (doIds.length > 0) orParts.push(`id.in.(${doIds.join(',')})`)

        const { data: mine } = await (supabase as any)
          .from('journeys')
          .select('id, status, origin, destination, scheduled_departure, etd, papas(full_name, title)')
          .not('status', 'in', '(completed,cancelled)')
          .or('is_deleted.is.null,is_deleted.eq.false')
          .or(orParts.join(','))
          .order('etd', { ascending: true, nullsFirst: false })
          .limit(1)

        setMyAssignment(mine?.[0] ?? null)
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }


  const FALLBACK_STATUS_COLORS: Record<string, string> = {
    planned: 'bg-blue-500 text-white',
    in_progress: 'bg-yellow-500 text-white',
    completed: 'bg-green-500 text-white',
    cancelled: 'bg-red-500 text-white',
    broken_arrow: 'bg-red-600 text-white',
  }

  const FALLBACK_STATUS_LABELS: Record<string, string> = {
    planned: 'Planned',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    broken_arrow: 'BROKEN ARROW',
  }

  const toTitleCase = (value: string) =>
    value
      .replace(/_/g, ' ')
      .replace(/\b[a-z]/g, (char) => char.toUpperCase())

  const getStatusColor = (status: string) => {
    const key = resolveCallSignKey(status)
    if (key && TNCP_CALL_SIGN_COLORS[key]) {
      return TNCP_CALL_SIGN_COLORS[key]
    }

    return FALLBACK_STATUS_COLORS[status] || 'bg-gray-500 text-white'
  }

  const getStatusIndicatorClass = (status: string) => {
    const classes = getStatusColor(status)
    return classes.split(' ').find((className) => className.startsWith('bg-')) || 'bg-gray-500'
  }

  const getStatusLabel = (status: string) =>
    getCallSignLabel(status) || FALLBACK_STATUS_LABELS[status] || toTitleCase(status)

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="h-8 w-32 rounded-md skeleton" />
            <div className="mt-2 h-4 w-64 rounded-md skeleton" />
          </div>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 rounded-md skeleton" />
                <div className="h-8 w-8 rounded-md skeleton" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 rounded-md skeleton mb-1" />
                <div className="h-3 w-32 rounded-md skeleton" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="h-5 w-32 rounded-md skeleton" />
              <div className="h-4 w-48 rounded-md skeleton mt-2" />
            </CardHeader>
            <CardContent>
              <div className="h-[300px] rounded-md skeleton" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-5 w-32 rounded-md skeleton" />
              <div className="h-4 w-48 rounded-md skeleton mt-2" />
            </CardHeader>
            <CardContent>
              <div className="h-[300px] rounded-md skeleton" />
            </CardContent>
          </Card>
        </div>

        {/* Recent Journeys Skeleton */}
        <Card>
          <CardHeader>
            <div className="h-5 w-32 rounded-md skeleton" />
            <div className="h-4 w-48 rounded-md skeleton mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-48 rounded-md skeleton" />
                    <div className="h-4 w-64 rounded-md skeleton" />
                    <div className="h-3 w-32 rounded-md skeleton" />
                  </div>
                  <div className="h-8 w-20 rounded-md skeleton" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header — contextual hero */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {currentUser?.full_name ? `Welcome back, ${currentUser.full_name.split(' ')[0]}` : 'Dashboard'}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            {activeProgram
              ? <>Active operation: <span className="font-semibold text-foreground">{activeProgram.name}</span></>
              : 'No active program — all quiet on the protocol front.'}
          </p>
        </div>
        {/* Install App button — always visible, works on every device */}
        {!isInstalled ? (
          <Button
            onClick={handleInstallClick}
            variant="outline"
            size="sm"
            className="gap-2 rounded-full shadow-sm"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Install App
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            App Installed
          </span>
        )}
      </div>

      {/* PWA install instructions modal */}
      {showInstallModal && (
        <PWAInstallModal platform={pwaplatform} onClose={() => setShowInstallModal(false)} />
      )}

      {/* Open mission availability requests awaiting my response */}
      <MissionRequestPrompt currentUserId={currentUser?.id ?? null} />

      {/* My active assignment — the DO's fastest route into the field */}
      {myAssignment && (
        <button
          onClick={() => router.push('/my-operations')}
          className="group w-full rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 text-left shadow-sm transition-all hover:border-primary/70 hover:shadow-md"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">My Active Assignment</p>
                <p className="truncate font-semibold">
                  {myAssignment.papas?.title} {myAssignment.papas?.full_name ?? 'Papa'} — {myAssignment.origin} → {myAssignment.destination}
                </p>
                <p className="text-xs text-muted-foreground">
                  <Badge className={`${getStatusColor(myAssignment.status)} mr-2 text-[10px] uppercase`}>{getStatusLabel(myAssignment.status)}</Badge>
                  {myAssignment.etd ? `ETD ${new Date(myAssignment.etd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No ETD set'}
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
              Open My Operations
              <TrendingUp className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </button>
      )}

      {/* Active Alerts */}
      <JourneyAlerts />

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-primary/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Total Papas</CardTitle>
            <div className="p-2 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Users className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="stat-figure text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-primary group-hover:to-primary/70 transition-all duration-500 animate-[countUp_0.8s_ease-out]">
              <CountUp value={stats.totalPapas} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Registered guests
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-emerald-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Fleet Size</CardTitle>
            <div className="p-2 rounded-full bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
              <Car className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="stat-figure text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-emerald-500 group-hover:to-emerald-600 transition-all duration-500 animate-[countUp_0.8s_ease-out_0.1s_both]">
              <CountUp value={stats.totalCheetahs} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active vehicles
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-sky-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Active Journeys</CardTitle>
            <div className="p-2 rounded-full bg-sky-500/10 group-hover:bg-sky-500/20 transition-colors">
              <MapPin className="h-4 w-4 text-sky-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="stat-figure text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-sky-500 group-hover:to-sky-600 transition-all duration-500 animate-[countUp_0.8s_ease-out_0.2s_both]">
              <CountUp value={stats.activeJourneys} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              In progress or planned
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-amber-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
            <div className="p-2 rounded-full bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
              <AlertTriangle className="h-4 w-4 text-amber-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="stat-figure text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-amber-500 group-hover:to-amber-600 transition-all duration-500 animate-[countUp_0.8s_ease-out_0.3s_both]">
              <CountUp value={stats.incidents} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Requires attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Charts - DISABLED on iOS due to Recharts hydration issues */}
      {pwaplatform !== 'ios' && <DashboardCharts />}
      {pwaplatform === 'ios' && (
        <Card className="border-dashed border-muted-foreground/30">
          <CardContent className="py-8 text-center text-muted-foreground">
            <p className="text-sm">Charts available on desktop version</p>
          </CardContent>
        </Card>
      )}

      {/* Recent Journeys */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Journeys</CardTitle>
          <CardDescription>Latest journey activities</CardDescription>
        </CardHeader>
        <CardContent>
          {recentJourneys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">No journeys yet</p>
              <p className="text-xs text-muted-foreground">Create your first journey to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentJourneys.map((journey) => {
                // iOS Saftey: Parse Date safely
                const createdDate = journey.created_at ? new Date(journey.created_at) : null;
                const isValidDate = createdDate && !isNaN(createdDate.getTime());

                return (
                  <div
                    key={journey.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusIndicatorClass(journey.status)}`} />
                      <div>
                        <p className="font-medium">
                          {journey.papas?.title} {journey.papas?.full_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {journey.cheetahs?.call_sign} • {journey.cheetahs?.registration_number}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <Badge
                        variant={journey.status === 'broken_arrow' ? 'destructive' : 'secondary'}
                        className="uppercase tracking-wide text-[11px] px-3 py-1"
                      >
                        {getStatusLabel(journey.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {isValidDate
                          ? formatDistanceToNow(createdDate!, { addSuffix: true })
                          : 'Just now'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => router.push('/journeys')}
                        title="View in Journeys"
                      >
                        <TrendingUp className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions — role-aware: admins get creation flows, officers get field tools */}
      <div className="grid gap-6 md:grid-cols-3">
        {isAdminUser ? (
          <>
            <Card
              className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => router.push('/journeys')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MapPin className="h-5 w-5" />
                  <span>Create Journey</span>
                </CardTitle>
                <CardDescription>Plan a new journey for a Papa</CardDescription>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => router.push('/papas')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Add Papa</span>
                </CardTitle>
                <CardDescription>Register a new guest</CardDescription>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => router.push('/command')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Command Centre</span>
                </CardTitle>
                <CardDescription>Journeys, live tracking and ops monitoring</CardDescription>
              </CardHeader>
            </Card>
          </>
        ) : (
          <>
            <Card
              className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => router.push('/my-operations')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MapPin className="h-5 w-5" />
                  <span>My Operations</span>
                </CardTitle>
                <CardDescription>Your assignments and call-sign controls</CardDescription>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => router.push('/chat')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Team Chat</span>
                </CardTitle>
                <CardDescription>Program rooms and your team channel</CardDescription>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => router.push('/compliance')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Car className="h-5 w-5" />
                  <span>Outfit of the Day</span>
                </CardTitle>
                <CardDescription>Today&apos;s dress code and grooming standard</CardDescription>
              </CardHeader>
            </Card>
          </>
        )}

        {!isInstalled && (
          <Card
            className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5"
            onClick={handleInstallClick}
          >
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <XCircle className="h-5 w-5 rotate-45 text-primary" />
                <span>Download App</span>
              </CardTitle>
              <CardDescription>Install TCNP Journey on this device for faster access</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}
