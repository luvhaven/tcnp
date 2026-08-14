"use client"

import { useEffect, useState, useCallback } from "react"
import { JourneyAlerts } from "@/components/dashboard/JourneyAlerts"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn, isAdmin } from "@/lib/utils"
import { getCallSignLabel, resolveCallSignKey, TNCP_CALL_SIGN_COLORS } from "@/lib/constants/tncpCallSigns"
import {
  Users, Car, MapPin, AlertTriangle, TrendingUp, Clock,
  CheckCircle, Download, ChevronRight, ArrowRight, Radio,
  MessageSquare, Zap, Shield,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { usePWAInstall } from "@/hooks/usePWAInstall"
import { PWAInstallModal } from "@/components/pwa/PWAInstallModal"
import { MissionRequestPrompt } from "@/components/missions/MissionAvailability"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { CountUp } from "@/components/ui/count-up"

// ─── Lazy-loaded charts ────────────────────────────────────────────────────────

const DashboardCharts = dynamic(
  () => import("@/components/dashboard/DashboardCharts").then((m) => m.DashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-56 rounded-2xl skeleton" />
        <div className="h-56 rounded-2xl skeleton" />
        <div className="h-56 rounded-2xl skeleton" />
      </div>
    ),
  }
)

// ─── Static data ──────────────────────────────────────────────────────────────

const STAT_DEFINITIONS = [
  {
    key: "totalPapas",
    label: "Total Papas",
    sub: "Registered guests",
    Icon: Users,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    ring: "ring-violet-500/20",
    glow: "from-violet-500/8",
  },
  {
    key: "totalCheetahs",
    label: "Fleet Size",
    sub: "Active vehicles",
    Icon: Car,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/20",
    glow: "from-emerald-500/8",
  },
  {
    key: "activeJourneys",
    label: "Active Journeys",
    sub: "In progress or planned",
    Icon: MapPin,
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/20",
    glow: "from-sky-500/8",
  },
  {
    key: "incidents",
    label: "Open Incidents",
    sub: "Requires attention",
    Icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
    glow: "from-amber-500/8",
  },
] as const

const ADMIN_ACTIONS = [
  { href: "/journeys", label: "Create Journey", sub: "Plan a new Papa movement", Icon: MapPin, color: "text-violet-500", bg: "bg-violet-500/10" },
  { href: "/papas", label: "Add Papa", sub: "Register a new guest", Icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { href: "/command", label: "Command Centre", sub: "Live ops & tracking", Icon: Radio, color: "text-sky-500", bg: "bg-sky-500/10" },
]

const OFFICER_ACTIONS = [
  { href: "/my-operations", label: "My Operations", sub: "Your assignments & call-sign", Icon: Zap, color: "text-orange-500", bg: "bg-orange-500/10" },
  { href: "/chat", label: "Team Chat", sub: "Program rooms & your channel", Icon: MessageSquare, color: "text-sky-500", bg: "bg-sky-500/10" },
  { href: "/compliance", label: "Outfit of the Day", sub: "Today's dress code", Icon: Shield, color: "text-violet-500", bg: "bg-violet-500/10" },
]

const FALLBACK_STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-500 text-white",
  in_progress: "bg-yellow-500 text-white",
  completed: "bg-green-500 text-white",
  cancelled: "bg-red-500 text-white",
  broken_arrow: "bg-red-600 text-white",
}

const FALLBACK_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  broken_arrow: "BROKEN ARROW",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toTitleCase = (v: string) =>
  v.replace(/_/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase())

const getStatusColor = (status: string) => {
  const key = resolveCallSignKey(status)
  if (key && TNCP_CALL_SIGN_COLORS[key]) return TNCP_CALL_SIGN_COLORS[key]
  return FALLBACK_STATUS_COLORS[status] || "bg-gray-500 text-white"
}

const getStatusIndicatorClass = (status: string) =>
  getStatusColor(status).split(" ").find((c) => c.startsWith("bg-")) || "bg-gray-500"

const getStatusLabel = (status: string) =>
  getCallSignLabel(status) || FALLBACK_STATUS_LABELS[status] || toTitleCase(status)

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 page-enter">
      <div className="space-y-1.5">
        <div className="h-3.5 w-32 rounded skeleton" />
        <div className="h-8 w-56 rounded skeleton" />
        <div className="h-4 w-72 rounded skeleton" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 rounded skeleton" />
              <div className="h-9 w-9 rounded-xl skeleton" />
            </div>
            <div className="h-9 w-14 rounded skeleton" />
            <div className="h-3 w-28 rounded skeleton" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-card p-5 space-y-3">
        <div className="h-5 w-36 rounded skeleton" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl skeleton" />
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState({ totalPapas: 0, totalCheetahs: 0, activeJourneys: 0, incidents: 0 })
  const [recentJourneys, setRecentJourneys] = useState<any[]>([])
  const [activeProgram, setActiveProgram] = useState<{ id: string; name: string } | null>(null)
  const [myAssignment, setMyAssignment] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const { isInstalled, install, platform: pwaplatform } = usePWAInstall()
  const [showInstallModal, setShowInstallModal] = useState(false)
  const { data: currentUser } = useCurrentUser()
  const isAdminUser = isAdmin(currentUser?.role)
  const quickActions = isAdminUser ? ADMIN_ACTIONS : OFFICER_ACTIONS

  const handleInstallClick = async () => {
    const result = await install()
    if (result === "show-instructions") setShowInstallModal(true)
    else if (result === "accepted") toast.success("TCNP is now installed. Check your home screen.")
  }

  const loadDashboardData = useCallback(async () => {
    try {
      const [papasRes, cheetahsRes, journeysRes, incidentsRes, programRes] = await Promise.all([
        supabase.from("papas").select("id", { count: "exact", head: true }),
        supabase.from("cheetahs").select("id", { count: "exact", head: true }),
        (supabase as any).from("journeys").select("id", { count: "exact", head: true })
          .not("status", "in", "(completed,cancelled)")
          .or("is_deleted.is.null,is_deleted.eq.false"),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("programs").select("id, name").eq("status", "active").order("created_at", { ascending: false }).limit(1),
      ])

      setActiveProgram((programRes.data?.[0] as any) ?? null)
      setStats({
        totalPapas: papasRes.count || 0,
        totalCheetahs: cheetahsRes.count || 0,
        activeJourneys: journeysRes.count || 0,
        incidents: incidentsRes.count || 0,
      })

      const { data: journeys } = await (supabase as any)
        .from("journeys")
        .select("*, papas(full_name, title), cheetahs(call_sign, registration_number)")
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("created_at", { ascending: false })
        .limit(5)

      setRecentJourneys(journeys || [])

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: myDORows } = await (supabase as any)
          .from("journey_duty_officers").select("journey_id").eq("user_id", user.id)
        const doIds: string[] = (myDORows || []).map((r: any) => r.journey_id)
        const orParts = [`assigned_duty_officer_id.eq.${user.id}`]
        if (doIds.length > 0) orParts.push(`id.in.(${doIds.join(",")})`)

        const { data: mine } = await (supabase as any)
          .from("journeys")
          .select("id, status, origin, destination, scheduled_departure, etd, papas(full_name, title)")
          .not("status", "in", "(completed,cancelled)")
          .or("is_deleted.is.null,is_deleted.eq.false")
          .or(orParts.join(","))
          .order("etd", { ascending: true, nullsFirst: false })
          .limit(1)

        setMyAssignment(mine?.[0] ?? null)
      }
    } catch (err) {
      console.error("Dashboard load failed:", err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadDashboardData()
  }, [loadDashboardData])

  if (loading) return <DashboardSkeleton />

  const firstName = currentUser?.full_name?.split(" ")[0]

  return (
    <div className="space-y-6 page-enter">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card/95 to-background p-6 shadow-xs">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Executive Overview</span>
              {activeProgram && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {activeProgram.name}
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {firstName ? `Welcome back, ${firstName}` : "Command Dashboard"}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {activeProgram ? (
                <>Active operational protocol is currently engaged for <span className="font-semibold text-foreground">{activeProgram.name}</span>.</>
              ) : (
                "All systems nominal — stand by for program assignments and journey dispatch."
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {!isInstalled ? (
              <Button onClick={handleInstallClick} variant="outline" size="sm" className="gap-2 rounded-xl self-start shrink-0 text-xs font-medium bg-background/80 shadow-xs">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Install App
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-xl bg-background/80 border border-border/60 shadow-xs">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                App Installed
              </span>
            )}
          </div>
        </div>
      </div>

      {showInstallModal && (
        <PWAInstallModal platform={pwaplatform} onClose={() => setShowInstallModal(false)} />
      )}

      {/* ── Mission prompt ────────────────────────────────────────────────── */}
      <MissionRequestPrompt currentUserId={currentUser?.id ?? null} />

      {/* ── My active assignment banner ──────────────────────────────────── */}
      {myAssignment && (
        <button
          onClick={() => router.push("/my-operations")}
          className="group w-full rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-4 text-left transition-all hover:border-primary/60 hover:from-primary/12 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Open My Operations"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">My Active Assignment</p>
                <p className="truncate font-semibold text-sm mt-0.5">
                  {myAssignment.papas?.title} {myAssignment.papas?.full_name ?? "Papa"} — {myAssignment.origin} → {myAssignment.destination}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`${getStatusColor(myAssignment.status)} text-[10px] uppercase px-2 py-0`}>
                    {getStatusLabel(myAssignment.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {myAssignment.etd
                      ? `ETD ${new Date(myAssignment.etd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "No ETD set"}
                  </span>
                </div>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-gap group-hover:gap-1.5">
              Open My Operations
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </button>
      )}

      {/* ── Live alerts ───────────────────────────────────────────────────── */}
      <JourneyAlerts />

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 nav:grid-cols-4">
        {STAT_DEFINITIONS.map(({ key, label, sub, Icon, color, bg, ring, glow }, idx) => (
          <div
            key={key}
            className={cn(
              "relative overflow-hidden rounded-2xl border bg-card p-5",
              "transition-all duration-200 hover:shadow-elevation-lg hover:-translate-y-0.5",
              `ring-1 ${ring}`
            )}
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            {/* Background glow (static, no JS) */}
            <div className={`absolute inset-0 bg-gradient-to-br ${glow} to-transparent pointer-events-none`} aria-hidden="true" />

            <div className="relative flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className={`stat-figure mt-2 text-3xl font-bold tracking-tight`}>
                  <CountUp value={stats[key]} />
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
              </div>
              <div className={`shrink-0 rounded-xl ${bg} p-2.5`}>
                <Icon className={`h-4.5 w-4.5 ${color}`} aria-hidden="true" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Analytics Charts ──────────────────────────────────────────────── */}
      <ErrorBoundary>
        <DashboardCharts />
      </ErrorBoundary>

      {/* ── Recent Journeys ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-sm font-semibold">Recent Journeys</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Latest journey activities</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => router.push("/journeys")}
          >
            View all <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>

        {recentJourneys.length === 0 ? (
          <div className="empty-state py-12">
            <MapPin className="h-10 w-10" aria-hidden="true" />
            <p className="font-medium text-sm">No journeys yet</p>
            <p className="text-xs text-muted-foreground">Create your first journey to see it here</p>
            {isAdminUser && (
              <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => router.push("/journeys")}>
                <ArrowRight className="h-3.5 w-3.5" /> Create Journey
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {recentJourneys.map((journey) => {
              const createdDate = journey.created_at ? new Date(journey.created_at) : null
              const isValidDate = createdDate && !isNaN(createdDate.getTime())

              return (
                <li key={journey.id}>
                  <button
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/50"
                    onClick={() => router.push("/journeys")}
                  >
                    {/* Status dot */}
                    <div
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${getStatusIndicatorClass(journey.status)}`}
                      aria-hidden="true"
                    />

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {journey.papas?.title} {journey.papas?.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {[journey.cheetahs?.call_sign, journey.cheetahs?.registration_number].filter(Boolean).join(" · ")}
                      </p>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge
                        variant={journey.status === "broken_arrow" ? "destructive" : "secondary"}
                        className="uppercase tracking-wide text-[10px] px-2 py-0 hidden sm:flex"
                      >
                        {getStatusLabel(journey.status)}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {isValidDate ? formatDistanceToNow(createdDate!, { addSuffix: true }) : "Just now"}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-3">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map(({ href, label, sub, Icon, color, bg }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className="group flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-all duration-200 hover:shadow-elevation-md hover:-translate-y-0.5 hover:border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <div className={`shrink-0 rounded-xl ${bg} p-2.5 transition-transform group-hover:scale-110`}>
                <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 shrink-0" aria-hidden="true" />
            </button>
          ))}

          {/* PWA install quick action */}
          {!isInstalled && (
            <button
              onClick={handleInstallClick}
              className="group flex items-center gap-4 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-left transition-all duration-200 hover:bg-card hover:shadow-elevation-sm hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 transition-transform group-hover:scale-110">
                <Download className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Install App</p>
                <p className="text-xs text-muted-foreground mt-0.5">Faster access on this device</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
