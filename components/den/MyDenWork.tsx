"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, ArrowRight, CalendarDays, Check, ClipboardList } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import { DEN_ANALYTICS_KEY, type DenAnalytics } from "@/lib/den-analytics"
import { DEN_PLAN_KEY } from "@/lib/den-plan"
import { DEN_MY_WORK_KEY, DEN_WORK_KEY, compareDenTasks, isTaskOverdue, type DenTask } from "@/lib/den-work"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type MyTask = DenTask & { project: { program_id: string | null; program: { name: string } | null } | null }
type MyShift = { id: string; shift: { id: string; title: string; starts_at: string; ends_at: string; program: { name: string } | null } | null }

/**
 * An officer's own Den work, wherever they are in the app: open tasks and
 * upcoming shifts. Renders nothing for officers with neither, so it can sit
 * on the Dashboard and My Operations for everyone without adding noise.
 */
export default function MyDenWork({ currentUserId }: { currentUserId: string | null }) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const denUnit = useUnitAccess("november_den")
  // The people who reorder stock and chase reports see what needs them, here
  // on the home page. Admins are not shown another unit's housekeeping.
  const leadsTheDen = denUnit.isHead || denUnit.isSubLead

  const { data: analytics } = useQuery({
    queryKey: DEN_ANALYTICS_KEY,
    enabled: Boolean(currentUserId) && leadsTheDen,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data: result, error } = await db.rpc("den_analytics")
      // Alerts are a convenience: before the function exists there are simply none.
      return error ? null : (result as DenAnalytics | null)
    },
  })

  const { data } = useQuery({
    queryKey: [...DEN_MY_WORK_KEY, currentUserId],
    enabled: Boolean(currentUserId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [tasks, shifts] = await Promise.all([
        db.from("unit_tasks")
          .select("id, project_id, title, description, assigned_to, due_at, status, completed_at, created_at, project:unit_projects!inner(program_id, project_type, program:programs(name))")
          .eq("assigned_to", currentUserId)
          .eq("project.project_type", "programme_operation")
          .in("status", ["todo", "in_progress", "blocked"]),
        db.from("den_shift_members")
          .select("id, shift:den_shifts!inner(id, title, starts_at, ends_at, program:programs(name))")
          .eq("user_id", currentUserId)
          .gte("shift.ends_at", new Date().toISOString()),
      ])
      // Before the Den tables exist, or for officers outside the Den, there is simply nothing to show.
      return {
        tasks: tasks.error ? [] : ((tasks.data ?? []) as MyTask[]).sort((a, b) => compareDenTasks(a, b)),
        shifts: shifts.error ? [] : ((shifts.data ?? []) as MyShift[])
          .filter(row => row.shift)
          .sort((a, b) => new Date(a.shift!.starts_at).getTime() - new Date(b.shift!.starts_at).getTime()),
      }
    },
  })

  const complete = useMutation({
    mutationFn: async (task: MyTask) => {
      const { error } = await db.rpc("den_set_my_task_status", { target_task: task.id, new_status: "done" })
      if (error) throw error
      return task
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: DEN_MY_WORK_KEY })
      queryClient.invalidateQueries({ queryKey: DEN_WORK_KEY })
      queryClient.invalidateQueries({ queryKey: DEN_PLAN_KEY })
      toast.success(`Done: ${task.title}`)
    },
    onError: (error) => notifyError(error, "Could not complete this task"),
  })

  const tasks = data?.tasks ?? []
  const shifts = data?.shifts ?? []
  const alerts = leadsTheDen && analytics ? denLeadAlerts(analytics) : []
  if (tasks.length === 0 && shifts.length === 0 && alerts.length === 0) return null

  const overdue = tasks.filter(task => isTaskOverdue(task)).length

  return (
    <section aria-labelledby="my-den-work" className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 id="my-den-work" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
          My Den work
          {overdue > 0 && <Badge variant="destructive">{overdue} overdue</Badge>}
        </h2>
        <Link href="/den?tab=work" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Open the Den
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </header>

      {alerts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Needs the Den lead's attention">
          {alerts.map(alert => (
            <li key={alert.tab}>
              <Link
                href={`/den?tab=${alert.tab}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {alert.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <ul className="mt-3 divide-y rounded-xl border">
          {tasks.map(task => {
            const late = isTaskOverdue(task)
            return (
              <li key={task.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className={cn("flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground", late && "font-medium text-destructive dark:text-red-400")}>
                    {late && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                    {task.due_at ? `${late ? "Overdue: " : "Due "}${format(new Date(task.due_at), "EEE d MMM, HH:mm")}` : "No deadline"}
                    {task.project?.program?.name && <span className="font-normal text-muted-foreground">· {task.project.program.name}</span>}
                  </p>
                </div>
                <Button
                  size="sm" variant="outline" className="shrink-0"
                  pending={complete.isPending && complete.variables?.id === task.id}
                  disabled={complete.isPending}
                  onClick={() => complete.mutate(task)}
                >
                  <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                  Done
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {shifts.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {shifts.map(row => (
            <li key={row.id} className="flex items-start gap-2 rounded-xl border p-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.shift!.title}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(row.shift!.starts_at), "EEE d MMM, HH:mm")} to {format(new Date(row.shift!.ends_at), "HH:mm")}
                  {row.shift!.program?.name && ` · ${row.shift!.program.name}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** What the Den head or a sub-lead should act on, most urgent first. */
function denLeadAlerts(analytics: DenAnalytics): { tab: string; label: string }[] {
  const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`
  const alerts: { tab: string; label: string }[] = []
  if (analytics.inventory.out_of_stock > 0) alerts.push({ tab: "inventory", label: `${count(analytics.inventory.out_of_stock, "item", "items")} out of stock` })
  else if (analytics.inventory.low_stock > 0) alerts.push({ tab: "inventory", label: `${count(analytics.inventory.low_stock, "item", "items")} low on stock` })
  if (analytics.operational.overdue_tasks > 0) alerts.push({ tab: "work", label: `${count(analytics.operational.overdue_tasks, "task", "tasks")} overdue` })
  if (analytics.reporting.outstanding.length > 0) alerts.push({ tab: "reports", label: `${count(analytics.reporting.outstanding.length, "report", "reports")} outstanding` })
  return alerts
}
