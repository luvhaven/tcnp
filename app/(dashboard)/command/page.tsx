"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { CountUp } from "@/components/ui/count-up"
import {
  Radar,
  Route,
  MapPin,
  Activity,
  Volume2,
  ArrowRight,
  ShieldCheck,
  Radio,
  AlertTriangle,
  Plus,
} from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

type CommandStats = {
  activeJourneys: number
  onlineOfficers: number
  openIncidents: number
}

const MODULES = [
  {
    name: "Journeys",
    href: "/journeys",
    icon: Route,
    tag: "Convoy Ops",
    description: "Plan and coordinate Papa movements with real-time call-sign progress.",
    accent: "from-orange-500/20 via-orange-500/10 to-transparent text-orange-500 border-orange-500/20 hover:border-orange-500/40",
    iconBg: "bg-orange-500/10 text-orange-500",
  },
  {
    name: "Live Tracking",
    href: "/tracking/live",
    icon: MapPin,
    tag: "GPS Map",
    description: "Real-time officer positions, convoy movements, and arrival telemetry.",
    accent: "from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-500 border-emerald-500/20 hover:border-emerald-500/40",
    iconBg: "bg-emerald-500/10 text-emerald-500",
  },
  {
    name: "Operations Monitor",
    href: "/operations-monitor",
    icon: Activity,
    tag: "Mission Control",
    description: "Full situational overview of active operations, convoys, and assignments.",
    accent: "from-sky-500/20 via-sky-500/10 to-transparent text-sky-500 border-sky-500/20 hover:border-sky-500/40",
    iconBg: "bg-sky-500/10 text-sky-500",
  },
  {
    name: "Echo & Equipment",
    href: "/echo",
    icon: Volume2,
    tag: "Readiness",
    description: "Equipment logistics, AV readiness briefings, and pre-op equipment checklists.",
    accent: "from-purple-500/20 via-purple-500/10 to-transparent text-purple-500 border-purple-500/20 hover:border-purple-500/40",
    iconBg: "bg-purple-500/10 text-purple-500",
  },
]

import { isAdmin, effectiveOscarRole } from "@/lib/utils"
import { useCurrentUser } from "@/hooks/useCurrentUser"

export default function CommandPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const hasAccess = Boolean(currentUser && (isAdmin(currentUser.role) || isAdmin(effectiveOscarRole(currentUser.role, currentUser.oscar))))
  const [stats, setStats] = useState<CommandStats>({ activeJourneys: 0, onlineOfficers: 0, openIncidents: 0 })

  useEffect(() => {
    if (!hasAccess) return
    const load = async () => {
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const [journeys, officers, incidents] = await Promise.all([
          supabase.from("journeys").select("id", { count: "exact", head: true }).eq("status", "active").eq("is_deleted", false),
          supabase.from("users").select("id", { count: "exact", head: true }).gte("last_seen", fiveMinAgo),
          supabase.from("incidents").select("id", { count: "exact", head: true }).neq("status", "resolved"),
        ])
        setStats({
          activeJourneys: journeys.count ?? 0,
          onlineOfficers: officers.count ?? 0,
          openIncidents: incidents.count ?? 0,
        })
      } catch (err) {
        console.warn("Command stats load failed:", err)
      }
    }
    void load()
  }, [hasAccess])

  if (userLoading) {
    return (
      <div className="space-y-6 page-enter">
        <div className="h-44 rounded-2xl skeleton" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-40 rounded-2xl skeleton" />
          <div className="h-40 rounded-2xl skeleton" />
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Command Clearance Required</h2>
        <p className="mt-2 max-w-md text-muted-foreground text-sm">
          Access to the Command Centre is restricted to Admin, Active Command, Captain, Vice Captain, and Operations Leadership.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header with Glassmorphism & Live Pulse */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card/95 to-background p-6 shadow-sm">
        <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                <Radar className="h-5 w-5 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">Command Centre</h1>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE OPS
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Central mission control for convoys, telemetry, operational monitoring, and field safety.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Link href="/journeys">
              <Button size="sm" className="gap-1.5 text-xs font-semibold shadow-sm">
                <Plus className="h-3.5 w-3.5" />
                Plan Journey
              </Button>
            </Link>
            <Link href="/tracking/live">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs font-medium">
                <Radio className="h-3.5 w-3.5 text-emerald-500" />
                Live Map
              </Button>
            </Link>
            <Link href="/incidents">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                <AlertTriangle className="h-3.5 w-3.5" />
                Incidents
              </Button>
            </Link>
          </div>
        </div>

        {/* Live telemetry stat cards */}
        <div className="relative z-10 mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center justify-between rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 px-4 py-3.5 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Journeys</p>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
                <CountUp value={stats.activeJourneys} />
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
              <Route className="h-5 w-5" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 px-4 py-3.5 shadow-sm">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Officers Online</p>
              </div>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-0.5">
                <CountUp value={stats.onlineOfficers} />
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 px-4 py-3.5 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Open Incidents</p>
              <p className={`text-2xl font-bold tracking-tight mt-0.5 ${stats.openIncidents > 0 ? "text-amber-500" : "text-foreground"}`}>
                <CountUp value={stats.openIncidents} />
              </p>
            </div>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stats.openIncidents > 0 ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground"}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Module grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {MODULES.map((mod, i) => (
          <motion.div
            key={mod.href}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25, ease: "easeOut" }}
          >
            <Link href={mod.href} className="block h-full group focus-visible:outline-none">
              <Card className={`h-full overflow-hidden border transition-all duration-200 hover:shadow-elevation-md hover:-translate-y-0.5 ${mod.accent}`}>
                <div className="relative flex h-full flex-col justify-between gap-4 p-5 sm:p-6">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3.5">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-xs ${mod.iconBg}`}>
                        <mod.icon className="h-5 w-5" />
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider bg-background/80">
                        {mod.tag}
                      </Badge>
                    </div>
                    <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {mod.name}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {mod.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/40 text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                    <span>Open Module</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-xl bg-muted/40 p-3 border border-border/40">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide bg-background">Note</Badge>
        <span>Echo is integrated under Command for pre-op equipment logistics and AV readiness checklists.</span>
      </div>
    </div>
  )
}
