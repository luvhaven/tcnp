"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, CalendarClock, ClipboardList, ListChecks, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import ChooseProgramme from "@/components/den/ChooseProgramme"
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
import { useDenProgrammeTeam } from "@/hooks/useDenProgrammeTeam"
import { DEN_PLAN_KEY } from "@/lib/den-plan"
import {
  DEN_MY_TASK_STATUSES,
  DEN_MY_WORK_KEY,
  DEN_TASK_STATUS_LABEL,
  DEN_WORK_KEY,
  checklistProgress,
  compareDenTasks,
  fromLocalInputValue,
  isTaskOpen,
  isTaskOverdue,
  parseChecklistItems,
  toLocalInputValue,
  type DenTask,
  type DenTaskStatus,
} from "@/lib/den-work"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Props = {
  selectedProgram: string // 'all' or a program id
  programName: string | null
  /** Head, sub-lead or platform admin. */
  canCoordinate: boolean
  /** Head or platform admin: owns the checklist templates. */
  canManage: boolean
  currentUserId: string | null
}

type Template = { id: string; title: string; description: string | null; items: string[]; is_active: boolean }
type ChecklistItem = { id: string; label: string; position: number; done_at: string | null; done_by: string | null }
type Checklist = { id: string; title: string; template_id: string | null; created_at: string; items: ChecklistItem[] }

const UNASSIGNED = "unassigned"
const EMPTY_TASK = { title: "", description: "", assigned_to: UNASSIGNED, due: "" }

/**
 * A programme's work: tasks with an owner and a deadline, and checklists run
 * from the Team Lead's templates. Assignment is offered only to officers who
 * are on the programme, and the database refuses anyone else.
 */
export default function DenWork({ selectedProgram, programName, canCoordinate, canManage, currentUserId }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const scoped = selectedProgram !== "all"
  const programId = scoped ? selectedProgram : null
  const team = useDenProgrammeTeam(programId)

  const [taskDialog, setTaskDialog] = useState<{ editing: DenTask | null } | null>(null)
  const [taskForm, setTaskForm] = useState(EMPTY_TASK)
  const [startOpen, setStartOpen] = useState(false)
  const [startForm, setStartForm] = useState({ template: "blank", title: "" })
  const [templateDialog, setTemplateDialog] = useState<{ editing: Template | null } | null>(null)
  const [templateForm, setTemplateForm] = useState({ title: "", description: "", items: "" })
  const [newItem, setNewItem] = useState<Record<string, string>>({})

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DEN_WORK_KEY })
    queryClient.invalidateQueries({ queryKey: DEN_PLAN_KEY })
    queryClient.invalidateQueries({ queryKey: DEN_MY_WORK_KEY })
  }

  const tasks = useQuery({
    queryKey: [...DEN_WORK_KEY, "tasks", programId],
    enabled: scoped,
    queryFn: async () => {
      const { data, error } = await db
        .from("unit_tasks")
        .select("id, project_id, title, description, assigned_to, due_at, status, completed_at, created_at, project:unit_projects!inner(program_id, project_type)")
        .eq("project.program_id", programId)
        .eq("project.project_type", "programme_operation")
        .neq("status", "cancelled")
      if (error) throw error
      return ((data ?? []) as DenTask[]).sort((a, b) => compareDenTasks(a, b))
    },
  })

  const checklists = useQuery({
    queryKey: [...DEN_WORK_KEY, "checklists", programId],
    enabled: scoped,
    queryFn: async () => {
      const { data, error } = await db
        .from("den_checklists")
        .select("id, title, template_id, created_at, items:den_checklist_items(id, label, position, done_at, done_by)")
        .eq("program_id", programId)
        .order("created_at")
      if (error) throw error
      return ((data ?? []) as Checklist[]).map(list => ({ ...list, items: [...list.items].sort((a, b) => a.position - b.position) }))
    },
  })

  const templates = useQuery({
    queryKey: [...DEN_WORK_KEY, "templates"],
    queryFn: async () => {
      const { data, error } = await db.from("den_checklist_templates").select("id, title, description, items, is_active").order("title")
      if (error) throw error
      return (data ?? []) as Template[]
    },
  })

  const nameOf = (userId: string | null) => {
    if (!userId) return "Unassigned"
    if (userId === currentUserId) return "You"
    return team.data?.find(member => member.user_id === userId)?.full_name ?? "A Den officer"
  }

  const saveTask = useMutation({
    mutationFn: async () => {
      const values = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        assigned_to: taskForm.assigned_to === UNASSIGNED ? null : taskForm.assigned_to,
        due_at: fromLocalInputValue(taskForm.due),
      }
      if (taskDialog?.editing) {
        const { data, error } = await db.from("unit_tasks").update(values).eq("id", taskDialog.editing.id).select("id")
        if (error) throw error
        if (!data?.length) throw new Error("You are not allowed to change this task.")
        return true
      }
      const { data: projectId, error: projectError } = await db.rpc("den_ensure_programme_project", { target_program: programId })
      if (projectError) throw projectError
      const { error } = await db.from("unit_tasks").insert([{ ...values, project_id: projectId, status: "todo", created_by: currentUserId }])
      if (error) throw error
      return false
    },
    onSuccess: (wasEdit) => {
      refresh()
      setTaskDialog(null)
      toast.success(wasEdit ? "Task updated" : taskForm.assigned_to === UNASSIGNED ? "Task added" : `Task assigned to ${nameOf(taskForm.assigned_to)}`)
    },
    onError: (error) => notifyError(error, "Could not save this task"),
  })

  const setStatus = useMutation({
    mutationFn: async ({ task, status }: { task: DenTask; status: DenTaskStatus }) => {
      if (canCoordinate) {
        const { data, error } = await db.from("unit_tasks")
          .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
          .eq("id", task.id).select("id")
        if (error) throw error
        if (!data?.length) throw new Error("You are not allowed to change this task.")
      } else {
        const { error } = await db.rpc("den_set_my_task_status", { target_task: task.id, new_status: status })
        if (error) throw error
      }
      return status
    },
    onSuccess: (status) => { refresh(); toast.success(status === "done" ? "Task completed" : status === "cancelled" ? "Task removed" : "Task updated") },
    onError: (error) => notifyError(error, "Could not update this task"),
  })

  const startChecklist = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("den_start_checklist", {
        target_program: programId,
        target_template: startForm.template === "blank" ? null : startForm.template,
        checklist_title: startForm.title.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => { refresh(); setStartOpen(false); toast.success("Checklist started") },
    onError: (error) => notifyError(error, "Could not start this checklist"),
  })

  const tick = useMutation({
    mutationFn: async ({ item, done }: { item: ChecklistItem; done: boolean }) => {
      const { error } = await db.rpc("den_tick_checklist_item", { target_item: item.id, is_done: done })
      if (error) throw error
    },
    // Optimistic: a tick should feel instant on the floor, and is rolled back if refused.
    onMutate: async ({ item, done }) => {
      const key = [...DEN_WORK_KEY, "checklists", programId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Checklist[]>(key)
      queryClient.setQueryData<Checklist[]>(key, lists => lists?.map(list => ({
        ...list,
        items: list.items.map(entry => entry.id === item.id ? { ...entry, done_at: done ? new Date().toISOString() : null, done_by: done ? currentUserId : null } : entry),
      })))
      return { previous, key }
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous)
      notifyError(error, "Could not update this item")
    },
    onSettled: refresh,
  })

  const addItem = useMutation({
    mutationFn: async ({ checklist, label }: { checklist: Checklist; label: string }) => {
      const position = checklist.items.reduce((max, item) => Math.max(max, item.position), 0) + 1
      const { error } = await db.from("den_checklist_items").insert([{ checklist_id: checklist.id, label, position }])
      if (error) throw error
      return checklist.id
    },
    onSuccess: (checklistId) => { refresh(); setNewItem(current => ({ ...current, [checklistId]: "" })) },
    onError: (error) => notifyError(error, "Could not add this item"),
  })

  const removeRow = useMutation({
    mutationFn: async ({ table, id }: { table: "den_checklists" | "den_checklist_items" | "den_checklist_templates"; id: string }) => {
      const { data, error } = await db.from(table).delete().eq("id", id).select("id")
      if (error) throw error
      if (!data?.length) throw new Error("You are not allowed to remove this.")
    },
    onSuccess: () => { refresh(); toast.success("Removed") },
    onError: (error) => notifyError(error, "Could not remove this"),
  })

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const values = {
        title: templateForm.title.trim(),
        description: templateForm.description.trim() || null,
        items: parseChecklistItems(templateForm.items),
      }
      if (values.items.length === 0) throw new Error("Add at least one item, one per line.")
      if (templateDialog?.editing) {
        const { data, error } = await db.from("den_checklist_templates").update(values).eq("id", templateDialog.editing.id).select("id")
        if (error) throw error
        if (!data?.length) throw new Error("You are not allowed to change this template.")
      } else {
        const { error } = await db.from("den_checklist_templates").insert([{ ...values, created_by: currentUserId }])
        if (error) throw error
      }
    },
    onSuccess: () => { refresh(); setTemplateDialog(null); toast.success("Template saved") },
    onError: (error) => notifyError(error, "Could not save this template"),
  })

  const openTask = (task: DenTask | null) => {
    setTaskForm(task
      ? { title: task.title, description: task.description ?? "", assigned_to: task.assigned_to ?? UNASSIGNED, due: toLocalInputValue(task.due_at) }
      : EMPTY_TASK)
    setTaskDialog({ editing: task })
  }
  const openTemplate = (template: Template | null) => {
    setTemplateForm(template
      ? { title: template.title, description: template.description ?? "", items: template.items.join("\n") }
      : { title: "", description: "", items: "" })
    setTemplateDialog({ editing: template })
  }

  const taskList = tasks.data ?? []
  const openTasks = taskList.filter(isTaskOpen)
  const overdue = taskList.filter(task => isTaskOverdue(task)).length
  const activeTemplates = (templates.data ?? []).filter(template => template.is_active)

  if (!scoped) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent>
            <ChooseProgramme icon={ClipboardList} description="Tasks and checklists belong to a programme." />
          </CardContent>
        </Card>
        {templateSection()}
        {templateDialogNode()}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
              Tasks
              {programName && <Badge variant="outline">{programName}</Badge>}
              {overdue > 0 && <Badge variant="destructive">{overdue} overdue</Badge>}
            </CardTitle>
            <CardDescription>
              {taskList.length === 0 ? "Who does what, and by when." : `${openTasks.length} open, ${taskList.length - openTasks.length} done.`}
            </CardDescription>
          </div>
          {canCoordinate && (
            <Button size="sm" className="shrink-0" onClick={() => openTask(null)}>
              <Plus aria-hidden="true" />
              Add task
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {tasks.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}</div>
          ) : tasks.isError ? (
            <ErrorState title="Could not load tasks" onRetry={() => tasks.refetch()} />
          ) : taskList.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No tasks for this programme yet" description={canCoordinate ? "Add the first task and give it an owner and a deadline." : undefined} className="py-8" />
          ) : (
            <ul className="divide-y rounded-xl border">
              {taskList.map(task => {
                const late = isTaskOverdue(task)
                const mine = task.assigned_to === currentUserId
                const editable = canCoordinate || mine
                return (
                  <li key={task.id} className="flex items-start gap-2 p-3 sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{nameOf(task.assigned_to)}</span>
                        {task.due_at && (
                          <span className={cn("inline-flex items-center gap-1", late && "font-medium text-destructive dark:text-red-400")}>
                            {late ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <CalendarClock className="h-3 w-3" aria-hidden="true" />}
                            {late ? "Overdue: " : "Due "}{format(new Date(task.due_at), "EEE d MMM, HH:mm")}
                          </span>
                        )}
                      </p>
                      {task.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{task.description}</p>}
                    </div>
                    {editable ? (
                      <Select value={task.status} disabled={setStatus.isPending} onValueChange={(value) => setStatus.mutate({ task, status: value as DenTaskStatus })}>
                        <SelectTrigger className="h-9 w-[124px] shrink-0 sm:w-[140px]" aria-label={`Status of ${task.title}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DEN_MY_TASK_STATUSES.map(status => <SelectItem key={status} value={status}>{DEN_TASK_STATUS_LABEL[status]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={task.status === "done" ? "secondary" : "outline"} className="shrink-0">{DEN_TASK_STATUS_LABEL[task.status]}</Badge>
                    )}
                    {canCoordinate && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-label={`More for task ${task.title}`} variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openTask(task)}>Edit task</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={async () => { if (await confirm({ message: `Remove the task "${task.title}"?`, variant: "destructive" })) setStatus.mutate({ task, status: "cancelled" }) }}
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-5 w-5" aria-hidden="true" />
              Checklists
            </CardTitle>
            <CardDescription>Run the same steps the same way every time. Any officer on the programme can tick an item.</CardDescription>
          </div>
          {canCoordinate && (
            <Button size="sm" className="shrink-0" onClick={() => { setStartForm({ template: activeTemplates[0]?.id ?? "blank", title: "" }); setStartOpen(true) }}>
              <Plus aria-hidden="true" />
              Start checklist
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {checklists.isLoading ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : checklists.isError ? (
            <ErrorState title="Could not load checklists" onRetry={() => checklists.refetch()} />
          ) : (checklists.data ?? []).length === 0 ? (
            <EmptyState icon={ListChecks} title="No checklists running for this programme" description={canCoordinate ? "Start one from a template, or blank." : undefined} className="py-8" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {(checklists.data ?? []).map(list => {
                const progress = checklistProgress(list.items)
                return (
                  <section key={list.id} className="rounded-xl border p-3">
                    <header className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{list.title}</h3>
                        <p className="text-xs text-muted-foreground">{progress.done} of {progress.total} done</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {progress.complete && <Badge variant="secondary">Complete</Badge>}
                        {canCoordinate && (
                          <Button
                            aria-label={`Delete checklist ${list.title}`}
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={async () => { if (await confirm({ message: `Delete the checklist "${list.title}" and its ticks?`, variant: "destructive" })) removeRow.mutate({ table: "den_checklists", id: list.id }) }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </header>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                    </div>
                    <ul className="mt-3 space-y-1">
                      {list.items.map(item => (
                        <li key={item.id} className="flex items-center gap-2">
                          <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                            <input
                              type="checkbox"
                              className="h-5 w-5 shrink-0 accent-primary"
                              checked={Boolean(item.done_at)}
                              onChange={(event) => tick.mutate({ item, done: event.target.checked })}
                            />
                            <span className={cn("min-w-0", item.done_at && "text-muted-foreground line-through")}>{item.label}</span>
                          </label>
                          {canCoordinate && (
                            <Button aria-label={`Remove item ${item.label}`} variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeRow.mutate({ table: "den_checklist_items", id: item.id })}>
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {canCoordinate && (
                      <form
                        className="mt-2 flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const label = (newItem[list.id] ?? "").trim()
                          if (label && !addItem.isPending) addItem.mutate({ checklist: list, label })
                        }}
                      >
                        <Input
                          aria-label={`Add an item to ${list.title}`}
                          placeholder="Add an item"
                          className="h-8"
                          value={newItem[list.id] ?? ""}
                          onChange={(event) => setNewItem(current => ({ ...current, [list.id]: event.target.value }))}
                        />
                        <Button type="submit" size="sm" variant="outline" disabled={!(newItem[list.id] ?? "").trim()}>Add</Button>
                      </form>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {templateSection()}

      <Dialog open={Boolean(taskDialog)} onOpenChange={(open) => { if (!open) setTaskDialog(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{taskDialog?.editing ? "Edit task" : "Add a task"}</DialogTitle>
            <DialogDescription>The officer you assign is notified. Only officers on this programme can be chosen.</DialogDescription>
          </DialogHeader>
          <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (taskForm.title.trim() && !saveTask.isPending) saveTask.mutate() }}>
            <div className="space-y-2">
              <Label htmlFor="den-task-title">Task *</Label>
              <Input id="den-task-title" required maxLength={200} placeholder="e.g., Confirm the caterer's delivery time" value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="den-task-owner">Assigned to</Label>
                <Select value={taskForm.assigned_to} onValueChange={(value) => setTaskForm({ ...taskForm, assigned_to: value })}>
                  <SelectTrigger id="den-task-owner"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {(team.data ?? []).map(member => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name ?? "Officer"}</SelectItem>)}
                  </SelectContent>
                </Select>
                {team.data?.length === 0 && <p className="text-xs text-muted-foreground">No Den officer is on this programme yet. Add officers from the Overview tab.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-task-due">Deadline</Label>
                <Input id="den-task-due" type="datetime-local" value={taskForm.due} onChange={(event) => setTaskForm({ ...taskForm, due: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="den-task-notes">Details</Label>
              <Textarea id="den-task-notes" rows={3} maxLength={2000} value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTaskDialog(null)}>Cancel</Button>
              <Button type="submit" pending={saveTask.isPending} disabled={!taskForm.title.trim()}>{taskDialog?.editing ? "Save task" : "Add task"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a checklist</DialogTitle>
            <DialogDescription>For {programName ?? "this programme"}. A template brings its items with it.</DialogDescription>
          </DialogHeader>
          <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (!startChecklist.isPending) startChecklist.mutate() }}>
            <div className="space-y-2">
              <Label htmlFor="den-checklist-template">Template</Label>
              <Select value={startForm.template} onValueChange={(value) => setStartForm({ ...startForm, template: value })}>
                <SelectTrigger id="den-checklist-template"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeTemplates.map(template => <SelectItem key={template.id} value={template.id}>{template.title} ({template.items.length})</SelectItem>)}
                  <SelectItem value="blank">Blank checklist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="den-checklist-title">Title{startForm.template === "blank" ? " *" : ""}</Label>
              <Input id="den-checklist-title" required={startForm.template === "blank"} maxLength={150} placeholder={startForm.template === "blank" ? "e.g., Saturday evening set-up" : "Leave blank to use the template's title"} value={startForm.title} onChange={(event) => setStartForm({ ...startForm, title: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
              <Button type="submit" pending={startChecklist.isPending} disabled={startForm.template === "blank" && !startForm.title.trim()}>Start checklist</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {templateDialogNode()}
    </div>
  )

  function templateSection() {
    const list = templates.data ?? []
    if (!canManage && list.length === 0) return null
    return (
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Checklist templates</CardTitle>
            <CardDescription>The Den&apos;s standard ways of working, reused on every programme.</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => openTemplate(null)}>
              <Plus aria-hidden="true" />
              New template
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {templates.isError ? (
            <ErrorState title="Could not load templates" onRetry={() => templates.refetch()} className="py-6" />
          ) : list.length === 0 ? (
            <EmptyState icon={ListChecks} title="No templates yet" description="Write down a routine once, such as Den set-up or close-down, and reuse it." className="py-6" />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(template => (
                <li key={template.id} className="flex items-start justify-between gap-2 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{template.title}</p>
                    <p className="text-xs text-muted-foreground">{template.items.length} {template.items.length === 1 ? "item" : "items"}</p>
                    {template.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openTemplate(template)}>Edit</Button>
                      <Button
                        aria-label={`Delete template ${template.title}`}
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={async () => { if (await confirm({ message: `Delete the template "${template.title}"? Checklists already started from it are kept.`, variant: "destructive" })) removeRow.mutate({ table: "den_checklist_templates", id: template.id }) }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  function templateDialogNode() {
    return (
      <Dialog open={Boolean(templateDialog)} onOpenChange={(open) => { if (!open) setTemplateDialog(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{templateDialog?.editing ? "Edit template" : "New checklist template"}</DialogTitle>
            <DialogDescription>One item per line. Changing a template does not change checklists already started from it.</DialogDescription>
          </DialogHeader>
          <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (templateForm.title.trim() && !saveTemplate.isPending) saveTemplate.mutate() }}>
            <div className="space-y-2">
              <Label htmlFor="den-template-title">Name *</Label>
              <Input id="den-template-title" required maxLength={150} placeholder="e.g., Den set-up before service" value={templateForm.title} onChange={(event) => setTemplateForm({ ...templateForm, title: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="den-template-description">When to use it</Label>
              <Input id="den-template-description" maxLength={300} value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="den-template-items">Items * ({parseChecklistItems(templateForm.items).length})</Label>
              <Textarea id="den-template-items" required rows={8} placeholder={"Water and glasses set out\nFace towels folded\nMenu cards on the table"} value={templateForm.items} onChange={(event) => setTemplateForm({ ...templateForm, items: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTemplateDialog(null)}>Cancel</Button>
              <Button type="submit" pending={saveTemplate.isPending} disabled={!templateForm.title.trim() || parseChecklistItems(templateForm.items).length === 0}>Save template</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    )
  }
}
