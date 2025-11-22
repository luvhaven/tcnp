"use client"

import { useEffect, useState } from "react"
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

  useEffect(() => {
    loadDashboardData()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleBeforeInstall = (event: any) => {
      event.preventDefault()
      setInstallPromptEvent(event)
      setCanInstall(true)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setCanInstall(false)
      setInstallPromptEvent(null)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall)
    window.addEventListener("appinstalled", handleAppInstalled)

    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true)
    }

    if ("serviceWorker" in navigator) {
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
      toast.info("Use your browser's 'Install app' option to add TCNP Journey to your device.")
      return
    }

    installPromptEvent.prompt()
    try {
      await installPromptEvent.userChoice
    } catch (error) {
      console.error("PWA install prompt failed:", error)
    }
    setInstallPromptEvent(null)
    setCanInstall(false)
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
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of TCNP Journey Management System
          </p>
        </div>
        {!isInstalled && canInstall && (
          <Button onClick={handleInstallClick} className="pwa-banner shadow-lg">
            Download this app
          </Button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Papas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPapas}</div>
            <p className="text-xs text-muted-foreground">
              Registered guests
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fleet Size</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCheetahs}</div>
            <p className="text-xs text-muted-foreground">
              Active vehicles
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Journeys</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeJourneys}</div>
            <p className="text-xs text-muted-foreground">
              In progress or planned
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.incidents}</div>
            <p className="text-xs text-muted-foreground">
              Requires attention
            </p>
          </CardContent>
        </Card>
      </div>

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
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent"
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
                    <Badge variant={journey.status === 'broken_arrow' ? 'destructive' : 'secondary'}>
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
          className="cursor-pointer transition-colors hover:bg-accent hover:shadow-lg"
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
          className="cursor-pointer transition-colors hover:bg-accent hover:shadow-lg"
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
          className="cursor-pointer transition-colors hover:bg-accent hover:shadow-lg"
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
            className="cursor-pointer transition-colors hover:bg-accent hover:shadow-lg"
            onClick={handleInstallClick}
          >
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <XCircle className="h-5 w-5 rotate-45 text-primary" />
                <span>Download App (PWA)</span>
              </CardTitle>
              <CardDescription>Install TCNP Journey on this device for faster access</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}
