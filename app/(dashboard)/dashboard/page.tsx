"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getCallSignLabel, resolveCallSignKey, TNCP_CALL_SIGN_COLORS } from "@/lib/constants/tncpCallSigns"
import {
  Users,
  Car,
  MapPin,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

const DashboardCharts = dynamic(
  () => import("@/components/dashboard/DashboardCharts").then((m) => m.DashboardCharts),
  {
    ssr: false,
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
  const [loading, setLoading] = useState(true)
  const [canInstall, setCanInstall] = useState(false)
  const [installPromptEvent, setInstallPromptEvent] = useState<any | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [installHelpPlatform, setInstallHelpPlatform] = useState<"ios" | "android" | "desktop" | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleBeforeInstall = (event: any) => {
      event.preventDefault()
      setInstallPromptEvent(event)
      setCanInstall(true)
      setInstallHelpPlatform(null)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setCanInstall(false)
      setInstallPromptEvent(null)
      setInstallHelpPlatform(null)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall)
    window.addEventListener("appinstalled", handleAppInstalled)

    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true)
    }

    // Only register the service worker in production builds to avoid
    // interfering with local development and Next.js chunk loading.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Error registering service worker:", error)
      })
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installPromptEvent) {
      if (typeof window !== "undefined") {
        const isStandalone =
          (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
          // @ts-ignore - iOS Safari specific
          (window.navigator as any).standalone === true

        if (isStandalone) {
          toast.success("TCNP Journey is already installed on this device.")
          return
        }

        const ua = window.navigator.userAgent || ""
        let platform: "ios" | "android" | "desktop" = "desktop"
        if (/iphone|ipad|ipod/i.test(ua)) {
          platform = "ios"
        } else if (/android/i.test(ua)) {
          platform = "android"
        }

        setInstallHelpPlatform(platform)

        if (platform === "ios") {
          toast.info("Follow the quick steps above to add TCNP Journey to your home screen.")
        } else if (platform === "android") {
          toast.info("Follow the quick steps above to install TCNP Journey from the Chrome menu.")
        } else {
          toast.info("Follow the quick steps above to install TCNP Journey from your browser.")
        }
      }
      return
    }

    try {
      installPromptEvent.prompt()
      const choice = await installPromptEvent.userChoice

      if (choice && choice.outcome === "accepted") {
        toast.success("Installing TCNP Journey… Check your home screen or app launcher.")
        setIsInstalled(true)
        setCanInstall(false)
      } else {
        toast.info("You can install TCNP Journey later from your browser's menu.")
      }
    } catch (error) {
      console.error("PWA install prompt failed:", error)
      toast.error("We couldn't open the install prompt. Try using your browser's install option.")
    } finally {
      setInstallPromptEvent(null)
    }
  }

  const loadDashboardData = async () => {
    try {
      // Get stats
      const [papasRes, cheetahsRes, journeysRes, incidentsRes] = await Promise.all([
        supabase.from('papas').select('id', { count: 'exact', head: true }),
        supabase.from('cheetahs').select('id', { count: 'exact', head: true }),
        supabase.from('journeys').select('id', { count: 'exact', head: true }).in('status', ['planned', 'in_progress', 'first_course', 'chapman', 'dessert']),
        supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      ])

      setStats({
        totalPapas: papasRes.count || 0,
        totalCheetahs: cheetahsRes.count || 0,
        activeJourneys: journeysRes.count || 0,
        incidents: incidentsRes.count || 0,
      })

      // Get recent journeys
      const { data: journeys } = await supabase
        .from('journeys')
        .select(`
          *,
          papas(full_name, title),
          cheetahs(call_sign, registration_number)
        `)
        .order('created_at', { ascending: false })
        .limit(5)

      setRecentJourneys(journeys || [])
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
      {/* Page Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Overview of TCNP Journey Management System
          </p>
        </div>
        {!isInstalled && canInstall && (
          <Button
            onClick={handleInstallClick}
            className="pwa-banner shadow-lg rounded-full px-5 py-2 text-sm font-medium"
          >
            Download this app
          </Button>
        )}
      </div>

      {installHelpPlatform && (
        <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              Install on{" "}
              {installHelpPlatform === "ios"
                ? "iPhone / iPad (Safari)"
                : installHelpPlatform === "android"
                  ? "Android (Chrome)"
                  : "Desktop browser"}
            </p>
            {installHelpPlatform === "ios" && (
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>Open this page in Safari.</li>
                <li>Tap the Share icon in the toolbar.</li>
                <li>Select "Add to Home Screen", then tap "Add".</li>
              </ol>
            )}
            {installHelpPlatform === "android" && (
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>Open this page in Chrome.</li>
                <li>Tap the three-dot menu and choose "Install app" or "Add to Home screen".</li>
                <li>Confirm the install prompt.</li>
              </ol>
            )}
            {installHelpPlatform === "desktop" && (
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>Open this page in Chrome, Edge, or another modern browser.</li>
                <li>Click the install icon in the address bar or browser menu.</li>
                <li>Choose "Install TCNP Journey" and confirm.</li>
              </ol>
            )}
          </div>
          <button
            type="button"
            onClick={() => setInstallHelpPlatform(null)}
            className="ml-3 text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
      )}

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
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-primary group-hover:to-primary/70 transition-all duration-500 animate-[countUp_0.8s_ease-out]">
              {stats.totalPapas}
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
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-emerald-500 group-hover:to-emerald-600 transition-all duration-500 animate-[countUp_0.8s_ease-out_0.1s_both]">
              {stats.totalCheetahs}
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
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-sky-500 group-hover:to-sky-600 transition-all duration-500 animate-[countUp_0.8s_ease-out_0.2s_both]">
              {stats.activeJourneys}
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
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-amber-500 group-hover:to-amber-600 transition-all duration-500 animate-[countUp_0.8s_ease-out_0.3s_both]">
              {stats.incidents}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Requires attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Charts */}
      <DashboardCharts />

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
              {recentJourneys.map((journey) => (
                <div
                  key={journey.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`h-2 w-2 rounded-full ${getStatusColor(journey.status)}`} />
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
                      {formatDistanceToNow(new Date(journey.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-3">
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
          onClick={() => router.push('/cheetahs')}
        >
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Car className="h-5 w-5" />
              <span>Add Vehicle</span>
            </CardTitle>
            <CardDescription>Register a new Cheetah</CardDescription>
          </CardHeader>
        </Card>

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
