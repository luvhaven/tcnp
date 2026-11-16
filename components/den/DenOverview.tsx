"use client"

import { useQuery } from "@tanstack/react-query"
import { ClipboardList, Home, Store, Users, UtensilsCrossed } from "lucide-react"
import { CountUp } from "@/components/ui/count-up"
import { StatCard } from "@/components/ui/stat-card"
import DenFloorAccess from "@/components/den/DenFloorAccess"
import DenTeam from "@/components/den/DenTeam"
import { useDenTeam, type DenTeamMember } from "@/hooks/useDenTeam"
import type { DenTab } from "@/lib/den"
import { createClient } from "@/lib/supabase/client"

type Props = {
  dens: any[]
  selectedProgram: string // 'all' or a program id
  programName: string | null
  canManageTeam: boolean
  onNavigate: (tab: DenTab) => void
  onOpenProfile: (member: DenTeamMember) => void
  currentUserId: string | null
}

async function countRows(build: () => PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await build()
  if (error) throw error
  return count ?? 0
}

/**
 * Where the Den stands right now. Each tile opens the tab behind its number.
 * The count keys start with the same prefix the owning tab invalidates
 * ("program-menus", "papa-meal-orders", "vendors"), so a change made in a tab
 * refreshes its tile without any wiring between the two.
 */
export default function DenOverview({ dens, selectedProgram, programName, canManageTeam, onNavigate, onOpenProfile, currentUserId }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const today = new Date().toISOString().slice(0, 10)
  const scoped = selectedProgram !== "all"
  const { data: team } = useDenTeam()

  const menusToday = useQuery({
    queryKey: ["program-menus", "den-count", selectedProgram, today],
    queryFn: () => countRows(() => {
      const query = db.from("program_menus").select("id", { count: "exact", head: true }).eq("menu_date", today)
      return scoped ? query.eq("program_id", selectedProgram) : query
    }),
  })

  const openOrders = useQuery({
    queryKey: ["papa-meal-orders", "den-count", selectedProgram, today],
    queryFn: () => countRows(() => {
      const query = db.from("papa_meal_orders").select("id", { count: "exact", head: true })
        .eq("order_date", today)
        .in("status", ["draft", "submitted"])
      return scoped ? query.eq("program_id", selectedProgram) : query
    }),
  })

  const activeVendors = useQuery({
    queryKey: ["vendors", "den-count"],
    queryFn: () => countRows(() => db.from("vendors").select("id", { count: "exact", head: true }).eq("is_active", true)),
  })

  const locationCount = dens
    .filter(den => den.type === "den")
    .filter(den => !scoped || den.program_id === selectedProgram)
    .length
  const members = team?.members ?? []
  const leads = members.filter(member => member.level !== "member").length

  const figure = (query: { data?: number; isError: boolean }) =>
    query.isError ? "—" : <CountUp value={query.data ?? 0} />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Team"
          value={<CountUp value={members.length} />}
          hint={members.length ? `${leads} leading` : "No officers yet"}
          icon={Users}
          tone="primary"
        />
        <StatCard
          label="Menus today"
          value={figure(menusToday)}
          hint={menusToday.isError ? "Could not check" : programName ?? "All programmes"}
          icon={UtensilsCrossed}
          tone="info"
          onClick={() => onNavigate("service")}
        />
        <StatCard
          label="Open meal orders"
          value={figure(openOrders)}
          hint={openOrders.isError ? "Could not check" : "Today, not yet served"}
          icon={ClipboardList}
          tone={openOrders.data ? "warning" : "neutral"}
          onClick={() => onNavigate("service")}
        />
        <StatCard
          label="Active vendors"
          value={figure(activeVendors)}
          hint={activeVendors.isError ? "Could not check" : "Caterers on file"}
          icon={Store}
          tone="success"
          onClick={() => onNavigate("vendors")}
        />
        <StatCard
          label="Den locations"
          value={<CountUp value={locationCount} />}
          hint={programName ?? "All programmes"}
          icon={Home}
          onClick={() => onNavigate("locations")}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <DenTeam canManage={canManageTeam} onOpenProfile={onOpenProfile} />

      {canManageTeam && (
        <DenFloorAccess selectedProgram={selectedProgram} programName={programName} currentUserId={currentUserId} />
      )}
    </div>
  )
}
