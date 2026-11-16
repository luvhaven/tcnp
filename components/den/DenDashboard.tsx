"use client"

import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, BarChart3, Boxes, CheckCircle2, ClipboardList, FileText, FolderOpen, TrendingDown, TrendingUp, Users } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/ui/stat-card"
import type { DenTab } from "@/lib/den"
import { DEN_ANALYTICS_KEY, percentLabel, teamWorkload, usageSeries, usageTrend, type DenAnalytics } from "@/lib/den-analytics"
import { formatQuantity } from "@/lib/den-inventory"
import { DEN_PLAN_STATUS_LABEL, readinessChecks, readinessScore, readinessTone, type DenPlanStatus } from "@/lib/den-plan"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Props = { onNavigate: (tab: DenTab) => void }

const TONE_BAR = { success: "bg-emerald-500", warning: "bg-amber-500", destructive: "bg-destructive" } as const
const CHART = { done: "#10b981", open: "#94a3b8", used: "#f97316" }
const tooltipStyle = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))", fontSize: 12 }

function Section({ icon: Icon, title, description, children }: { icon: typeof Users; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5" aria-hidden="true" />{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

/**
 * The Den at a glance, for the team and for Protocol Leadership: how
 * operations, the team, stock and reporting stand right now. Everything here
 * is read from live records in one request; nothing on this tab changes data.
 */
export default function DenDashboard({ onNavigate }: Props) {
  const supabase = createClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: DEN_ANALYTICS_KEY,
    // Built from records edited in the other tabs, so re-read whenever the tab is opened.
    refetchOnMount: "always",
    queryFn: async () => {
      const { data: result, error } = await (supabase as any).rpc("den_analytics")
      if (error) throw error
      if (!result) throw new Error("The Den dashboard is not available to you.")
      return result as DenAnalytics
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (isError || !data) return <Card><CardContent><ErrorState title="Could not load the Den dashboard" onRetry={() => refetch()} /></CardContent></Card>

  const { operational, team, inventory, reporting } = data
  const workload = teamWorkload(team.officers)
  const usage = usageSeries(inventory.weekly_usage)
  const trend = usageTrend(inventory.weekly_usage)
  const anyUsage = usage.some(point => point.used > 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active programmes" value={operational.programmes_active} hint={`${operational.programmes_completed} completed`} icon={BarChart3} tone="primary" onClick={() => onNavigate("plan")} />
        <StatCard label="Open tasks" value={operational.open_tasks} hint={`${operational.tasks_done} done`} icon={ClipboardList} tone="info" onClick={() => onNavigate("work")} />
        <StatCard label="Overdue tasks" value={operational.overdue_tasks} hint={operational.overdue_tasks ? "Past their deadline" : "None"} icon={AlertTriangle} tone={operational.overdue_tasks ? "destructive" : "neutral"} onClick={() => onNavigate("work")} />
        <StatCard label="Reports outstanding" value={reporting.outstanding.length} hint={reporting.outstanding.length ? "Programmes ended, not reported" : "None"} icon={FileText} tone={reporting.outstanding.length ? "warning" : "neutral"} onClick={() => onNavigate("reports")} />
      </div>

      <Section icon={BarChart3} title="Operations" description="Every programme the Den has a plan for, and how ready each one is.">
        {operational.programmes.length === 0 ? (
          <EmptyState icon={BarChart3} title="No Den plans yet" description="Open a plan for a programme on the Programme plan tab and it will appear here." className="py-8" />
        ) : (
          <ul className="divide-y rounded-xl border">
            {operational.programmes.map(programme => {
              const score = programme.summary ? readinessScore(readinessChecks(programme.summary)) : 0
              const overdue = programme.summary?.tasks_overdue ?? 0
              return (
                <li key={programme.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate text-sm font-medium">{programme.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {programme.start_date ? format(new Date(`${programme.start_date}T00:00:00`), "d MMM yyyy") : "No date"}
                      {programme.summary && ` · ${programme.summary.guests} guests · ${programme.summary.team_on_programme} officers`}
                      {overdue > 0 && <span className="font-medium text-destructive dark:text-red-400"> · {overdue} overdue</span>}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{DEN_PLAN_STATUS_LABEL[programme.plan_status as DenPlanStatus] ?? programme.plan_status}</Badge>
                  <div className="flex w-40 shrink-0 items-center gap-2" role="img" aria-label={`${score} percent ready`}>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full transition-[width] duration-500", TONE_BAR[readinessTone(score)])} style={{ width: `${score}%` }} />
                    </div>
                    <span className="w-10 text-right text-sm font-semibold tabular-nums">{score}%</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section icon={Users} title="Team" description="Who is carrying the work. Participation counts officers added to at least one Den programme.">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Officers" value={team.members} icon={Users} />
          <StatCard label="Participation" value={percentLabel(team.participating, team.members)} hint={`${team.participating} of ${team.members} on a programme`} tone="info" />
          <StatCard label="Tasks completed" value={percentLabel(operational.tasks_done, operational.tasks_done + operational.open_tasks)} hint={`${operational.tasks_done} of ${operational.tasks_done + operational.open_tasks}`} icon={CheckCircle2} tone="success" />
        </div>
        {workload.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks or shifts have been given to anyone yet.</p>
        ) : (
          <>
            <div className="h-64 w-full" role="img" aria-label="Tasks done and open for each officer">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workload.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="done" name="Done" stackId="tasks" fill={CHART.done} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="open" name="Open" stackId="tasks" fill={CHART.open} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* The same figures as a table, for screen readers and for anyone who wants the numbers. */}
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr><th className="p-2 font-medium">Officer</th><th className="p-2 text-right font-medium">Done</th><th className="p-2 text-right font-medium">Open</th><th className="p-2 text-right font-medium">Overdue</th><th className="p-2 text-right font-medium">Shifts</th></tr>
                </thead>
                <tbody className="divide-y">
                  {workload.map(row => (
                    <tr key={row.name}>
                      <td className="p-2">{row.name}</td>
                      <td className="p-2 text-right tabular-nums">{row.done}</td>
                      <td className="p-2 text-right tabular-nums">{row.open}</td>
                      <td className={cn("p-2 text-right tabular-nums", row.overdue > 0 && "font-medium text-destructive dark:text-red-400")}>{row.overdue}</td>
                      <td className="p-2 text-right tabular-nums">{row.shifts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <Section icon={Boxes} title="Inventory" description="Stock levels, what needs reordering, and how fast stock is being used.">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Items" value={inventory.items} icon={Boxes} onClick={() => onNavigate("inventory")} />
          <StatCard label="Low stock" value={inventory.low_stock} tone={inventory.low_stock ? "warning" : "neutral"} onClick={() => onNavigate("inventory")} />
          <StatCard label="Out of stock" value={inventory.out_of_stock} tone={inventory.out_of_stock ? "destructive" : "neutral"} onClick={() => onNavigate("inventory")} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
              Used per week
              {trend && trend.direction !== "flat" && (
                <Badge variant="outline" className="font-normal">
                  {trend.direction === "up" ? <TrendingUp className="mr-1 h-3 w-3" aria-hidden="true" /> : <TrendingDown className="mr-1 h-3 w-3" aria-hidden="true" />}
                  {trend.change == null ? "Usage has started" : `${Math.abs(trend.change)}% ${trend.direction === "up" ? "more" : "less"} than the four weeks before`}
                </Badge>
              )}
            </h3>
            {!anyUsage ? (
              <p className="text-sm text-muted-foreground">No usage recorded in the last eight weeks.</p>
            ) : (
              <div className="h-52 w-full" role="img" aria-label={`Stock used per week: ${usage.map(point => `${point.label} ${formatQuantity(point.used)}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usage} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                    <Bar dataKey="used" name="Units used" fill={CHART.used} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {inventory.top_used.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Most used in 30 days: {inventory.top_used.map(row => `${row.name} (${formatQuantity(row.used)} ${row.unit})`).join(", ")}
              </p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">To reorder</h3>
            {inventory.reorder.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is at or below its reorder level.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {inventory.reorder.map(row => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span className={cn("shrink-0 tabular-nums", Number(row.quantity) <= 0 ? "font-medium text-destructive dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
                      {formatQuantity(row.quantity)} {row.unit}
                      {Number(row.reorder_level) > 0 && <span className="text-muted-foreground"> / reorder at {formatQuantity(row.reorder_level)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section icon={FileText} title="Reporting and knowledge" description="What has been written down so the next team does not start from scratch.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Programmes reported" value={reporting.programmes_reported} icon={FileText} tone="success" onClick={() => onNavigate("reports")} />
          <StatCard label="Field reports" value={reporting.field_reports} onClick={() => onNavigate("reports")} />
          <StatCard label="Lessons logged" value={reporting.lessons_logged} hint="In reports and guest notes" tone="info" />
          <StatCard label="In the repository" value={reporting.repository_items} icon={FolderOpen} onClick={() => onNavigate("repository")} />
        </div>
        {reporting.outstanding.length > 0 && (
          <ul className="divide-y rounded-xl border border-amber-500/40">
            {reporting.outstanding.map(row => (
              <li key={row.program_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{row.program_name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {row.end_date ? `Ended ${format(new Date(`${row.end_date}T00:00:00`), "d MMM yyyy")}` : "Ended"} · {row.has_draft ? "draft started" : "not started"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-right text-xs text-muted-foreground">As at {format(new Date(data.generated_at), "d MMM yyyy, HH:mm")}</p>
    </div>
  )
}
