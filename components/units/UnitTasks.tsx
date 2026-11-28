"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, CalendarClock, ClipboardList, MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { UnitProgrammePicker, unitProgrammeTeamKey, useUnitProgrammes, type UnitProgrammeTeamRow } from "@/components/units/UnitProgrammeTeam"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import {
  DEN_MY_TASK_STATUSES,
  DEN_TASK_STATUS_LABEL,
  compareDenTasks,
  fromLocalInputValue,
  isTaskOpen,
  isTaskOverdue,
  toLocalInputValue,
  type DenTask,
  type DenTaskStatus,
} from "@/lib/den-work"
import { notifyError, UserFacingError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import type { UnitSlug } from "@/lib/unit-access"
import { cn } from "@/lib/utils"

// ── Pure helpers (exported for tests/unit-tasks.test.cjs) ──

export type UnitTaskProject = { id: string; title: string; project_type: string; program_id: string | null; status: string }
export type UnitTask = DenTask & { created_by?: string | null; project: UnitTaskProject | null }
export type UnitMemberOption = { user_id: string; full_name: string | null; access_level: string }

export const UNIT_TASKS_KEY = ["unit-tasks"] as const
export const MY_UNIT_TASKS_KEY = ["my-unit-tasks"] as const

const CLOSED_PROJECT_STATUSES = new Set(["completed", "cancelled"])

/** What the signed-in officer may do with one task. Mirrors the RLS and RPC rules. */
export function taskPermissions(
  task: Pick<UnitTask, "assigned_to" | "status">,
  viewer: { userId: string | null; canCoordinate: boolean; isMember: boolean },
): { changeStatus: boolean; edit: boolean; viaRpc: boolean } {
  if (viewer.canCoordinate) return { changeStatus: task.status !== "cancelled", edit: true, viaRpc: false }
  // unit_set_my_task_status: the assignee, while a member of the unit.
  const mine = Boolean(viewer.userId) && task.assigned_to === viewer.userId
  const changeStatus = mine && viewer.isMember && task.status !== "cancelled"
  return { changeStatus, edit: false, viaRpc: changeStatus }
}

/**
 * Who a task may be given to. On a programme's task list: members who lead
 * the unit or are active on that programme (the database refuses anyone
 * else). On an initiative: any member of the unit.
 */
export function assignableMembers(
  members: readonly UnitMemberOption[],
  programmeTeam: readonly Pick<UnitProgrammeTeamRow, "user_id" | "access_level" | "on_programme">[] | null,
): UnitMemberOption[] {
  const list = programmeTeam
    ? members.filter(member => programmeTeam.some(row => row.user_id === member.user_id && (row.on_programme || row.access_level === "head" || row.access_level === "sub_lead")))
    : [...members]
  return list.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
}

export type AssigneeOption = UnitMemberOption & { stale?: boolean }

/**
 * The assignee picker's options when editing: the people who can take the
 * task, plus whoever holds it now even if they no longer qualify (left the
 * programme or the unit), marked so the coordinator can see who has it.
 */
export function assigneeOptions(
  assignable: readonly UnitMemberOption[],
  currentAssignee: string | null,
  currentName: string,
): AssigneeOption[] {
  const list: AssigneeOption[] = [...assignable]
  if (currentAssignee && !assignable.some(member => member.user_id === currentAssignee)) {
    list.unshift({ user_id: currentAssignee, full_name: currentName, access_level: "member", stale: true })
  }
  return list
}

/** The projects a coordinator can add a task to when no programme is chosen. */
export function openProjects(projects: readonly UnitTaskProject[]): UnitTaskProject[] {
  return projects.filter(project => !CLOSED_PROJECT_STATUSES.has(project.status)).sort((a, b) => a.title.localeCompare(b.title))
}

export function taskCounts(tasks: readonly Pick<UnitTask, "status" | "due_at">[], now: Date = new Date()) {
  return {
    open: tasks.filter(isTaskOpen).length,
    done: tasks.filter(task => task.status === "done").length,
    overdue: tasks.filter(task => isTaskOverdue(task, now)).length,
  }
}

// ── The component ──

type Props = {
  unitSlug: UnitSlug
  /** A programme's task list. Leave undefined to let the component offer its own picker; null means all the unit's work. */
  programId?: string | null
  programName?: string | null
  className?: string
}

const UNASSIGNED = "unassigned"
const PROGRAMME_LIST = "programme"
const EMPTY_FORM = { title: "", description: "", assigned_to: UNASSIGNED, due: "", project: PROGRAMME_LIST }
const TASK_COLUMNS = "id, project_id, title, description, assigned_to, due_at, status, completed_at, created_at, created_by, project:unit_projects!inner(id, unit_id, title, project_type, program_id, status)"

/**
 * One unit's tasks. Coordinators (head, sub-leads, platform admins) create,
 * assign, edit and remove; members move their own tasks along; Command reads.
 * With a programme it is that programme's task list (created on first use by
 * unit_ensure_programme_project); without one it is all of the unit's work.
 */
export default function UnitTasks({ unitSlug, programId: controlledProgram, programName: givenProgramName, className }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const access = useUnitAccess(unitSlug)
  const currentUserId = access.currentUser?.id ?? null
  const canRead = access.isMember || access.isCommand || access.isPlatformAdmin
  const canCoordinate = access.canCoordinate

  const [ownProgram, setOwnProgram] = useState<string | null>(null)
  const controlled = controlledProgram !== undefined
  const programId = controlled ? controlledProgram : ownProgram
  const programmes = useUnitProgrammes(canRead && !controlled)
  const programName = givenProgramName ?? programmes.data?.find(program => program.id === programId)?.name ?? null

  const [dialog, setDialog] = useState<{ editing: UnitTask | null } | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const unit = useQuery({
    queryKey: ["unit-by-slug", unitSlug],
    enabled: canRead,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.from("units").select("id, slug, name").eq("slug", unitSlug).maybeSingle()
      if (error) throw error
      if (!data) throw new UserFacingError("This unit is not set up yet.")
      return data as { id: string; slug: string; name: string }
    },
  })
  const unitId = unit.data?.id ?? null

  const tasks = useQuery({
    queryKey: [...UNIT_TASKS_KEY, unitSlug, programId ?? "all"],
    enabled: Boolean(unitId),
    queryFn: async () => {
      let query = db.from("unit_tasks").select(TASK_COLUMNS).eq("project.unit_id", unitId).neq("status", "cancelled")
      if (programId) query = query.eq("project.program_id", programId).eq("project.project_type", "programme_operation")
      const { data, error } = await query
      if (error) throw error
      return ((data ?? []) as UnitTask[]).sort((a, b) => compareDenTasks(a, b))
    },
  })

  // The unit's projects: what a task can belong to when no programme is chosen.
  const projects = useQuery({
    queryKey: ["unit-projects", unitSlug],
    enabled: Boolean(unitId) && canCoordinate && !programId,
    queryFn: async () => {
      const { data, error } = await db.from("unit_projects").select("id, title, project_type, program_id, status").eq("unit_id", unitId)
      if (error) throw error
      return openProjects((data ?? []) as UnitTaskProject[])
    },
  })

  // Members of the unit, for the assignee picker (members and coordinators can read their peers).
  const members = useQuery({
    queryKey: ["unit-members", unitSlug],
    enabled: Boolean(unitId) && canCoordinate,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.from("unit_memberships").select("user_id, access_level, user:users!unit_memberships_user_id_fkey(full_name)").eq("unit_id", unitId).eq("status", "active")
      if (error) throw error
      return ((data ?? []) as { user_id: string; access_level: string; user: { full_name: string | null } | null }[])
        .map(row => ({ user_id: row.user_id, access_level: row.access_level, full_name: row.user?.full_name ?? null }))
    },
  })

  // Which programme the task in the dialog belongs to, if any.
  const dialogProject = form.project === PROGRAMME_LIST ? null : (projects.data ?? []).find(project => project.id === form.project) ?? null
  const dialogProgram = dialog?.editing
    ? (dialog.editing.project?.project_type === "programme_operation" ? dialog.editing.project.program_id : null)
    : programId ?? (dialogProject?.project_type === "programme_operation" ? dialogProject.program_id : null)

  const team = useQuery({
    queryKey: unitProgrammeTeamKey(unitSlug, dialogProgram),
    enabled: Boolean(dialog) && Boolean(dialogProgram) && canCoordinate,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await db.rpc("unit_programme_team", { unit_slug: unitSlug, target_program: dialogProgram })
      if (error) throw error
      return (data ?? []) as UnitProgrammeTeamRow[]
    },
  })

  const assignees = useMemo(
    () => assignableMembers(members.data ?? [], dialogProgram ? (team.data ?? []) : null),
    [members.data, team.data, dialogProgram],
  )

  // Names for the people who own a task, for everyone who can see the list.
  const ownerIds = useMemo(
    () => Array.from(new Set((tasks.data ?? []).map(task => task.assigned_to).filter((id): id is string => Boolean(id)))).sort(),
    [tasks.data],
  )
  const owners = useQuery({
    queryKey: ["unit-task-owners", ownerIds.join(",")],
    enabled: ownerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.from("users").select("id, full_name").in("id", ownerIds)
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string | null }[]
    },
  })
  const nameOf = (userId: string | null) => {
    if (!userId) return "Unassigned"
    if (userId === currentUserId) return "You"
    return owners.data?.find(owner => owner.id === userId)?.full_name
      ?? members.data?.find(member => member.user_id === userId)?.full_name
      ?? "An officer"
  }

  const editingAssignee = dialog?.editing?.assigned_to ?? null
  const options = assigneeOptions(assignees, editingAssignee, editingAssignee ? nameOf(editingAssignee) : "")
  // Only say someone no longer qualifies once the lists that decide it have loaded.
  const optionsSettled = members.isSuccess && (!dialogProgram || team.isSuccess)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: UNIT_TASKS_KEY })
    queryClient.invalidateQueries({ queryKey: MY_UNIT_TASKS_KEY })
    queryClient.invalidateQueries({ queryKey: ["unit-projects", unitSlug] })
    // The Den's own screens read the same tasks.
    if (unitSlug === "november_den") queryClient.invalidateQueries({ queryKey: ["den"] })
  }

  const saveTask = useMutation({
    mutationFn: async () => {
      const values = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_to: form.assigned_to === UNASSIGNED ? null : form.assigned_to,
        due_at: fromLocalInputValue(form.due),
      }
      if (!values.title) throw new UserFacingError("Give the task a name.")
      if (dialog?.editing) {
        const { data, error } = await db.from("unit_tasks").update(values).eq("id", dialog.editing.id).select("id")
        if (error) throw error
        if (!data?.length) throw new UserFacingError("You are not allowed to change this task.")
        return true
      }
      let projectId: string | null = form.project === PROGRAMME_LIST ? null : form.project
      if (!projectId) {
        if (!programId) throw new UserFacingError("Choose what this task belongs to.")
        const { data, error } = await db.rpc("unit_ensure_programme_project", { unit_slug: unitSlug, target_program: programId })
        if (error) throw error
        projectId = data as string
      }
      const { error } = await db.from("unit_tasks").insert([{ ...values, project_id: projectId, status: "todo", created_by: currentUserId }])
      if (error) throw error
      return false
    },
    onSuccess: (wasEdit) => {
      refresh()
      setDialog(null)
      toast.success(wasEdit ? "Task updated" : form.assigned_to === UNASSIGNED ? "Task added" : `Task assigned to ${nameOf(form.assigned_to)}. They have been notified.`)
    },
    onError: (error) => notifyError(error, "Could not save this task"),
  })

  const setStatus = useMutation({
    mutationFn: async ({ task, status }: { task: UnitTask; status: DenTaskStatus }) => {
      const can = taskPermissions(task, { userId: currentUserId, canCoordinate, isMember: access.isMember })
      if (!can.changeStatus && !can.edit) throw new UserFacingError("Only the person the task is assigned to, or the unit's leads, can change it.")
      if (can.viaRpc) {
        const { error } = await db.rpc("unit_set_my_task_status", { task: task.id, new_status: status })
        if (error) throw error
      } else {
        const { data, error } = await db.from("unit_tasks")
          .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
          .eq("id", task.id).select("id")
        if (error) throw error
        if (!data?.length) throw new UserFacingError("You are not allowed to change this task.")
      }
      return status
    },
    onSuccess: (status) => { refresh(); toast.success(status === "done" ? "Task completed" : status === "cancelled" ? "Task removed" : "Task updated") },
    onError: (error) => notifyError(error, "Could not update this task"),
  })

  const openDialog = (task: UnitTask | null) => {
    const firstProject = programId ? PROGRAMME_LIST : (projects.data?.[0]?.id ?? PROGRAMME_LIST)
    setForm(task
      ? { title: task.title, description: task.description ?? "", assigned_to: task.assigned_to ?? UNASSIGNED, due: toLocalInputValue(task.due_at), project: task.project_id }
      : { ...EMPTY_FORM, project: firstProject })
    setDialog({ editing: task })
  }

  const list = tasks.data ?? []
  const counts = taskCounts(list)
  const canAdd = canCoordinate && (Boolean(programId) || (projects.data?.length ?? 0) > 0)

  let body: ReactNode
  if (access.isLoading) {
    body = <Skeleton className="h-32 rounded-xl" />
  } else if (access.loadFailed) {
    body = <ErrorState title="Could not check your unit access" description="Reload the page to try again." />
  } else if (!canRead) {
    body = <EmptyState icon={ClipboardList} title="Members only" description="Only members of this unit can see its tasks." className="py-8" />
  } else if (unit.isError) {
    body = <ErrorState title="Could not load this unit" onRetry={() => unit.refetch()} />
  } else if (unit.isLoading || tasks.isLoading) {
    body = <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)}</div>
  } else if (tasks.isError) {
    body = <ErrorState title="Could not load tasks" onRetry={() => tasks.refetch()} retrying={tasks.isRefetching} />
  } else if (list.length === 0) {
    body = (
      <EmptyState
        icon={ClipboardList}
        title={programId ? "No tasks for this programme yet" : "No tasks yet"}
        description={canCoordinate
          ? programId || canAdd ? "Add the first task and give it an owner and a deadline." : "Choose a programme to start its task list."
          : "Tasks your unit gives you will appear here."}
        className="py-8"
      />
    )
  } else {
    body = (
      <ul className="divide-y rounded-xl border" aria-label="Tasks">
        {list.map(task => {
          const late = isTaskOverdue(task)
          const can = taskPermissions(task, { userId: currentUserId, canCoordinate, isMember: access.isMember })
          return (
            <li key={task.id} className="flex flex-wrap items-start gap-2 p-3 sm:flex-nowrap sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <p className={cn("text-sm font-medium", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{nameOf(task.assigned_to)}</span>
                  {task.due_at && (
                    <span className={cn("inline-flex items-center gap-1", late && "font-medium text-destructive dark:text-red-400")}>
                      {late ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <CalendarClock className="h-3 w-3" aria-hidden="true" />}
                      {late ? "Overdue: " : "Due "}{format(new Date(task.due_at), "EEE d MMM, HH:mm")}
                    </span>
                  )}
                  {!programId && task.project?.title && <span>· {task.project.title}</span>}
                </p>
                {task.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{task.description}</p>}
              </div>
              {can.changeStatus ? (
                <Select value={task.status} disabled={setStatus.isPending} onValueChange={(value) => setStatus.mutate({ task, status: value as DenTaskStatus })}>
                  <SelectTrigger className="h-11 w-[124px] shrink-0 sm:w-[140px]" aria-label={`Status of ${task.title}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEN_MY_TASK_STATUSES.map(status => <SelectItem key={status} value={status}>{DEN_TASK_STATUS_LABEL[status]}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={task.status === "done" ? "secondary" : "outline"} className="shrink-0">{DEN_TASK_STATUS_LABEL[task.status]}</Badge>
              )}
              {can.edit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-label={`More for task ${task.title}`} variant="ghost" size="icon" className="h-11 w-11 shrink-0">
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openDialog(task)}>Edit task</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={async () => { if (await confirm({ title: "Remove task?", message: `Remove the task "${task.title}"?`, confirmText: "Remove", variant: "destructive" })) setStatus.mutate({ task, status: "cancelled" }) }}
                    >
                      Remove task
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
            Tasks
            {programName && <Badge variant="outline">{programName}</Badge>}
            {counts.overdue > 0 && <Badge variant="destructive">{counts.overdue} overdue</Badge>}
          </CardTitle>
          <CardDescription>
            {list.length === 0 ? "Who does what, and by when." : `${counts.open} open, ${counts.done} done.`}
          </CardDescription>
        </div>
        {canAdd && (
          <Button className="h-11 shrink-0" onClick={() => openDialog(null)}>
            <Plus aria-hidden="true" />
            Add task
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!controlled && canRead && (
          programmes.isError
            ? <ErrorState className="py-4" title="Could not load programmes" onRetry={() => programmes.refetch()} />
            : <UnitProgrammePicker id={`unit-tasks-programme-${unitSlug}`} value={programId} onChange={setOwnProgram} programs={programmes.data ?? []} allowAll />
        )}
        {body}
      </CardContent>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open) setDialog(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.editing ? "Edit task" : "Add a task"}</DialogTitle>
            <DialogDescription>
              The officer you assign is notified.{dialogProgram ? " On a programme, only officers active on it (or the unit's leads) can be chosen." : ""}
            </DialogDescription>
          </DialogHeader>
          <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (form.title.trim() && !saveTask.isPending) saveTask.mutate() }}>
            <div className="space-y-2">
              <Label htmlFor={`unit-task-title-${unitSlug}`}>Task *</Label>
              <Input id={`unit-task-title-${unitSlug}`} required maxLength={200} className="h-11" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </div>
            {!dialog?.editing && !programId && (
              <div className="space-y-2">
                <Label htmlFor={`unit-task-project-${unitSlug}`}>Belongs to</Label>
                <Select value={form.project} onValueChange={(value) => setForm({ ...form, project: value, assigned_to: UNASSIGNED })}>
                  <SelectTrigger id={`unit-task-project-${unitSlug}`} className="h-11"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>
                    {(projects.data ?? []).map(project => <SelectItem key={project.id} value={project.id}>{project.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`unit-task-owner-${unitSlug}`}>Assigned to</Label>
                <Select value={form.assigned_to} onValueChange={(value) => setForm({ ...form, assigned_to: value })}>
                  <SelectTrigger id={`unit-task-owner-${unitSlug}`} className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {options.map(member => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name ?? "Officer"}{member.stale && optionsSettled ? (dialogProgram ? " (no longer on the programme)" : " (no longer in the unit)") : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {members.isError && <p className="text-xs text-destructive">Could not load the unit&apos;s members.</p>}
                {dialogProgram && team.isSuccess && members.isSuccess && assignees.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nobody in this unit is active on this programme yet, so the task can only stay unassigned for now.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`unit-task-due-${unitSlug}`}>Deadline</Label>
                <Input id={`unit-task-due-${unitSlug}`} type="datetime-local" className="h-11" value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`unit-task-notes-${unitSlug}`}>Details</Label>
              <Textarea id={`unit-task-notes-${unitSlug}`} rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-11" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" className="h-11" pending={saveTask.isPending} disabled={!form.title.trim()}>{dialog?.editing ? "Save task" : "Add task"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
