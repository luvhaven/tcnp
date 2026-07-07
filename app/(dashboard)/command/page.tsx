"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
    description: "Plan and run Papa movements with call-sign workflows.",
    accent: "from-orange-500/15 to-orange-500/0 text-orange-500",
  },
  {
    name: "Live Tracking",
    href: "/tracking/live",
    icon: MapPin,
    description: "Real-time officer and convoy positions on the map.",
    accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-500",
  },
  {
    name: "Ops Monitor",
    href: "/operations-monitor",
    icon: Activity,
    description: "Mission control view of every active operation.",
    accent: "from-sky-500/15 to-sky-500/0 text-sky-500",
  },
  {
    name: "Echo",
    href: "/echo",
    icon: Volume2,
    description: "Equipment, AV briefings and pre-op checklists.",
    accent: "from-purple-500/15 to-purple-500/0 text-purple-500",
  },
]

export default function CommandPage() {
  const [stats, setStats] = useState<CommandStats>({ activeJourneys: 0, onlineOfficers: 0, openIncidents: 0 })

  useEffect(() => {
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
  }, [])

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6 text-white dark:border-border">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Radar className="h-6 w-6 text-orange-400" />
              <h1 className="text-2xl font-bold tracking-tight">Command Centre</h1>
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-300">
              Unified control of journeys, live tracking, operations monitoring and equipment readiness.
            </p>
          </div>
          <ShieldCheck className="hidden h-10 w-10 text-orange-400/60 sm:block" />
        </div>

        {/* Live stats strip */}
        <div className="relative z-10 mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/5 px-4 py-3 backdrop-blur">
            <p className="text-2xl font-bold"><CountUp value={stats.activeJourneys} /></p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Active Journeys</p>
          </div>
          <div className="rounded-xl bg-white/5 px-4 py-3 backdrop-blur">
            <p className="text-2xl font-bold"><CountUp value={stats.onlineOfficers} /></p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Officers Online</p>
          </div>
          <div className="rounded-xl bg-white/5 px-4 py-3 backdrop-blur">
            <p className="text-2xl font-bold"><CountUp value={stats.openIncidents} /></p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Open Incidents</p>
          </div>
        </div>
      </div>

      {/* Module cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {MODULES.map((mod, i) => (
          <motion.div
            key={mod.href}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.25, ease: "easeOut" }}
          >
            <Link href={mod.href} className="block h-full">
              <Card className="card-hover group h-full overflow-hidden">
                <CardContent className="relative flex h-full flex-col gap-3 p-5">
                  <div className={`absolute inset-0 bg-gradient-to-br ${mod.accent.split(" ").slice(0, 2).join(" ")} opacity-60`} />
                  <div className="relative z-10 flex items-center justify-between">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-background shadow-sm ${mod.accent.split(" ").pop()}`}>
                      <mod.icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
                  </div>
                  <div className="relative z-10">
                    <h2 className="font-semibold">{mod.name}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{mod.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Note</Badge>
        Echo is no longer a standalone protocol unit — its equipment tooling now lives here under Command.
      </div>
    </div>
  )
}
