"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, ArrowRight, Check, ClipboardList } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { compareDenTasks, isTaskOverdue, type DenTask } from "@/lib/den-work"
import { unitWorkRoute } from "@/lib/notification-route"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// ── Pure helpers (exported for tests/unit-tasks.test.cjs) ──

export type MyUnitTask = DenTask & {
  project: {
    title: string
    program_id: string | null
    unit: { slug: string; name: string } | null
    program: { name: string } | null
  } | null
}

export type MyUnitTaskGroup = { slug: string; name: string; route: string; tasks: MyUnitTask[]; overdue: number }

export const MY_UNIT_TASKS_KEY = ["my-unit-tasks"] as const

/**
 * My open tasks, one group per unit, most pressing unit first (the one with
 * the most overdue work, then the one whose first task is most urgent).
 */
export function groupMyTasks(tasks: readonly MyUnitTask[], options: { excludeUnits?: readonly string[]; now?: Date } = {}): MyUnitTaskGroup[] {
  const now = options.now ?? new Date()
  const excluded = new Set(options.excludeUnits ?? [])
  const groups = new Map<string, MyUnitTaskGroup>()
  for (const task of tasks) {
    const unit = task.project?.unit
    if (!unit || excluded.has(unit.slug)) continue
    const group = groups.get(unit.slug) ?? { slug: unit.slug, name: unit.name, route: unitWorkRoute(unit.slug, "tasks") ?? "/my-operations", tasks: [], overdue: 0 }
    group.tasks.push(task)
    if (isTaskOverdue(task, now)) group.overdue += 1
    groups.set(unit.slug, group)
  }
  const list = [...groups.values()]
  for (const group of list) group.tasks.sort((a, b) => compareDenTasks(a, b, now))
  return list.sort((a, b) => b.overdue - a.overdue || compareDenTasks(a.tasks[0], b.tasks[0], now) || a.name.localeCompare(b.name))
}

type Props = {
  /** Defaults to the signed-in officer. */
  currentUserId?: string | null
  /** Units already shown elsewhere on the page (e.g. ['november_den'] beside MyDenWork). */
  excludeUnits?: string[]
  className?: string
}

/**
 * Every open task assigned to me, across all my units, with a one-tap Done.
 * Renders nothing when there is nothing to do, so it can sit on the Dashboard
 * or My Operations for everyone without adding noise.
 */
export default function MyUnitTasksCard({ currentUserId: givenUserId, excludeUnits, className }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const userId = givenUserId === undefined ? currentUser?.id ?? null : givenUserId

  const tasks = useQuery({
    queryKey: [...MY_UNIT_TASKS_KEY, userId],
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from("unit_tasks")
        .select("id, project_id, title, description, assigned_to, due_at, status, completed_at, created_at, project:unit_projects!inner(title, program_id, unit:units(slug, name), program:programs(name))")
        .eq("assigned_to", userId)
        .in("status", ["todo", "in_progress", "blocked"])
      if (error) throw error
      return (data ?? []) as MyUnitTask[]
    },
  })

  const complete = useMutation({
    mutationFn: async (task: MyUnitTask) => {
      const { error } = await db.rpc("unit_set_my_task_status", { task: task.id, new_status: "done" })
      if (error) throw error
      return task
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: MY_UNIT_TASKS_KEY })
      queryClient.invalidateQueries({ queryKey: ["unit-tasks"] })
      if (task.project?.unit?.slug === "november_den") queryClient.invalidateQueries({ queryKey: ["den"] })
      toast.success(`Done: ${task.title}`)
    },
    onError: (error) => notifyError(error, "Could not complete this task"),
  })

  if (!userId) return null
  if (tasks.isError && !tasks.data) {
    return (
      <section aria-labelledby="my-unit-tasks" className={cn("rounded-2xl border bg-card p-4 shadow-xs", className)}>
        <h2 id="my-unit-tasks" className="text-sm font-semibold">My tasks</h2>
        <ErrorState className="py-6" title="Could not load your tasks" onRetry={() => tasks.refetch()} retrying={tasks.isRefetching} />
      </section>
    )
  }

  const groups = groupMyTasks(tasks.data ?? [], { excludeUnits })
  if (groups.length === 0) return null
  const overdue = groups.reduce((sum, group) => sum + group.overdue, 0)

  return (
    <section aria-labelledby="my-unit-tasks" className={cn("rounded-2xl border bg-card p-4 shadow-xs sm:p-5", className)}>
      <h2 id="my-unit-tasks" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
        My tasks
        {overdue > 0 && <Badge variant="destructive">{overdue} overdue</Badge>}
      </h2>

      <div className="mt-3 space-y-4">
        {groups.map(group => (
          <div key={group.slug}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.name}</h3>
              <Link
                href={group.route}
                className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${group.name} tasks`}
              >
                Open
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
            <ul className="divide-y rounded-xl border">
              {group.tasks.map(task => {
                const late = isTaskOverdue(task)
                return (
                  <li key={task.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className={cn("flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground", late && "font-medium text-destructive dark:text-red-400")}>
                        {late && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                        {task.due_at ? `${late ? "Overdue: " : "Due "}${format(new Date(task.due_at), "EEE d MMM, HH:mm")}` : "No deadline"}
                        {task.status === "blocked" && <span className="font-normal">· Blocked</span>}
                        {task.project?.program?.name && <span className="font-normal text-muted-foreground">· {task.project.program.name}</span>}
                      </p>
                    </div>
                    <Button
                      variant="outline" className="h-11 shrink-0"
                      aria-label={`Mark ${task.title} done`}
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
          </div>
        ))}
      </div>
    </section>
  )
}
