"use client"

import { useMemo, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Award,
  CalendarRange,
  Check,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock3,
  Loader2,
  PartyPopper,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { cn, isPlatformAdministrator } from "@/lib/utils"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const supabase = createClient()

type Unit = { id: string; slug: string }
type UnitMembership = { unit_id: string; user_id: string; access_level: string; status: string }
type Officer = { id: string; full_name: string | null; email: string | null }
type UnitProject = {
  id: string
  unit_id: string
  project_type: "year_end_party" | "team_bonding" | "awards"
  title: string
  description: string | null
  program_id: string | null
  venue_id: string | null
  starts_at: string | null
  ends_at: string | null
  status: string
  priority: string
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
}
type UnitTask = {
  id: string
  project_id: string
  title: string
  description: string | null
  assigned_to: string | null
  due_at: string | null
  status: string
  completed_at: string | null
  created_by: string | null
}

const PROJECT_TYPES = {
  year_end_party: {
    label: "Year-end party",
    description: "Plan the annual celebration, vendors, programme and guest experience.",
    icon: PartyPopper,
    accent: "text-fuchsia-600 dark:text-fuchsia-300",
    surface: "bg-fuchsia-500/10",
  },
  team_bonding: {
    label: "Team bonding",
    description: "Coordinate meaningful team experiences and participation.",
    icon: UsersRound,
    accent: "text-sky-600 dark:text-sky-300",
    surface: "bg-sky-500/10",
  },
  awards: {
    label: "Awards",
    description: "Manage nominations, decisions, presentation and recognition.",
    icon: Award,
    accent: "text-amber-600 dark:text-amber-300",
    surface: "bg-amber-500/10",
  },
} as const

const MANAGER_ACCESS = new Set(["head", "head_of_unit", "manager", "admin"])

function formatDate(value: string | null) {
  if (!value) return "Not scheduled"
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function toLocalInput(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function statusTone(status: string) {
  if (["completed", "done", "published"].includes(status)) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (["in_progress", "active"].includes(status)) return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300"
  if (["cancelled", "blocked"].includes(status)) return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
  return "border-border bg-muted/60 text-muted-foreground"
}

export default function ComplianceInitiatives() {
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [activeType, setActiveType] = useState("all")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<UnitProject | null>(null)
  const [projectForm, setProjectForm] = useState({
    project_type: "year_end_party" as UnitProject["project_type"],
    title: "",
    description: "",
    starts_at: "",
    ends_at: "",
    status: "planning",
    priority: "normal",
  })
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assigned_to: "", due_at: "" })

  const unitQuery = useQuery({
    queryKey: ["unit-by-slug", "compliance"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("units").select("id, slug").eq("slug", "compliance").maybeSingle()
      if (error) throw error
      return data as Unit | null
    },
  })

  const membershipQuery = useQuery({
    queryKey: ["unit-membership", unitQuery.data?.id, currentUser?.id],
    enabled: Boolean(unitQuery.data?.id && currentUser?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("unit_memberships")
        .select("unit_id, user_id, access_level, status")
        .eq("unit_id", unitQuery.data!.id)
        .eq("user_id", currentUser!.id)
        .eq("status", "active")
        .maybeSingle()
      if (error) throw error
      return data as UnitMembership | null
    },
  })

  const canManage = Boolean(
    isPlatformAdministrator(currentUser?.role) ||
      (membershipQuery.data?.status === "active" && MANAGER_ACCESS.has(membershipQuery.data.access_level)),
  )

  const projectsQuery = useQuery({
    queryKey: ["compliance-unit-projects", unitQuery.data?.id],
    enabled: Boolean(unitQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("unit_projects")
        .select("*")
        .eq("unit_id", unitQuery.data!.id)
        .order("starts_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as UnitProject[]
    },
  })

  const projectIds = useMemo(() => (projectsQuery.data ?? []).map((project) => project.id), [projectsQuery.data])
  const tasksQuery = useQuery({
    queryKey: ["compliance-unit-tasks", projectIds.join(",")],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("unit_tasks")
        .select("*")
        .in("project_id", projectIds)
        .order("due_at", { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as UnitTask[]
    },
  })

  const officersQuery = useQuery({
    queryKey: ["active-officers-lite", "compliance-initiatives"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
      if (error) throw error
      return (data ?? []) as Officer[]
    },
  })

  const projects = projectsQuery.data ?? []
  const tasks = tasksQuery.data ?? []
  const officers = officersQuery.data ?? []
  const filteredProjects = activeType === "all" ? projects : projects.filter((project) => project.project_type === activeType)
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null
  const completedTaskCount = tasks.filter((task) => task.status === "done").length
  const activeProjectCount = projects.filter((project) => ["planning", "approved", "in_progress"].includes(project.status)).length

  const invalidateOperations = () => {
    queryClient.invalidateQueries({ queryKey: ["compliance-unit-projects"] })
    queryClient.invalidateQueries({ queryKey: ["compliance-unit-tasks"] })
  }

  const saveProjectMutation = useMutation({
    mutationFn: async () => {
      if (!unitQuery.data?.id || !currentUser?.id) throw new Error("Compliance unit is not available")
      const payload = {
        unit_id: unitQuery.data.id,
        project_type: projectForm.project_type,
        title: projectForm.title.trim(),
        description: projectForm.description.trim() || null,
        starts_at: projectForm.starts_at ? new Date(projectForm.starts_at).toISOString() : null,
        ends_at: projectForm.ends_at ? new Date(projectForm.ends_at).toISOString() : null,
        status: projectForm.status,
        priority: projectForm.priority,
        metadata: {},
        updated_at: new Date().toISOString(),
      }
      if (editingProject) {
        const { error } = await (supabase as any).from("unit_projects").update(payload).eq("id", editingProject.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from("unit_projects").insert({ ...payload, created_by: currentUser.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editingProject ? "Initiative updated" : "Initiative created")
      setProjectDialogOpen(false)
      setEditingProject(null)
      invalidateOperations()
    },
    onError: (error: Error) => toast.error(error.message || "Could not save initiative"),
  })

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject || !currentUser?.id) throw new Error("Choose an initiative first")
      const { error } = await (supabase as any).from("unit_tasks").insert({
        project_id: selectedProject.id,
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        assigned_to: taskForm.assigned_to || null,
        due_at: taskForm.due_at ? new Date(taskForm.due_at).toISOString() : null,
        status: "todo",
        created_by: currentUser.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Task added")
      setTaskDialogOpen(false)
      setTaskForm({ title: "", description: "", assigned_to: "", due_at: "" })
      invalidateOperations()
    },
    onError: (error: Error) => toast.error(error.message || "Could not add task"),
  })

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: UnitTask) => {
      const complete = task.status !== "done"
      const { error } = await (supabase as any)
        .from("unit_tasks")
        .update({ status: complete ? "done" : "todo", completed_at: complete ? new Date().toISOString() : null })
        .eq("id", task.id)
      if (error) throw error
    },
    onSuccess: invalidateOperations,
    onError: (error: Error) => toast.error(error.message || "Could not update task"),
  })

  const openNewProject = (type: UnitProject["project_type"] = "year_end_party") => {
    setEditingProject(null)
    setProjectForm({ project_type: type, title: "", description: "", starts_at: "", ends_at: "", status: "planning", priority: "normal" })
    setProjectDialogOpen(true)
  }

  const openEditProject = (project: UnitProject) => {
    setEditingProject(project)
    setProjectForm({
      project_type: project.project_type,
      title: project.title,
      description: project.description ?? "",
      starts_at: toLocalInput(project.starts_at),
      ends_at: toLocalInput(project.ends_at),
      status: project.status,
      priority: project.priority,
    })
    setProjectDialogOpen(true)
  }

  const deleteProject = async (project: UnitProject) => {
    const approved = await confirm({
      title: "Archive initiative?",
      message: "The initiative will be cancelled while its task history stays available for review.",
      confirmText: "Archive",
      variant: "destructive",
    })
    if (!approved) return
    const { error } = await (supabase as any).from("unit_projects").update({ status: "cancelled" }).eq("id", project.id)
    if (error) toast.error(error.message || "Could not archive initiative")
    else {
      if (selectedProjectId === project.id) setSelectedProjectId(null)
      toast.success("Initiative archived")
      invalidateOperations()
    }
  }

  const submitProject = (event: FormEvent) => {
    event.preventDefault()
    if (!projectForm.title.trim()) return toast.error("Add an initiative title")
    if (projectForm.starts_at && projectForm.ends_at && new Date(projectForm.ends_at) < new Date(projectForm.starts_at)) {
      return toast.error("End time must be after the start time")
    }
    saveProjectMutation.mutate()
  }

  const submitTask = (event: FormEvent) => {
    event.preventDefault()
    if (!taskForm.title.trim()) return toast.error("Add a task title")
    createTaskMutation.mutate()
  }

  if (unitQuery.isLoading || projectsQuery.isLoading) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-3xl border border-border/70 bg-card/60">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (unitQuery.isError || projectsQuery.isError || !unitQuery.data) {
    return (
      <div className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-6">
        <p className="font-semibold text-amber-800 dark:text-amber-200">Initiatives workspace is being prepared</p>
        <p className="mt-1 text-sm text-muted-foreground">Existing Compliance tools remain available while operational planning is provisioned.</p>
      </div>
    )
  }

  return (
    <section className="space-y-5" aria-labelledby="compliance-initiatives-title">
      <div className="relative overflow-hidden rounded-3xl border border-violet-500/15 bg-[linear-gradient(135deg,hsl(var(--card))_0%,hsl(var(--card))_58%,rgba(124,58,237,0.10)_100%)] p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              <Sparkles className="h-3.5 w-3.5" /> Unit initiatives
            </div>
            <h2 id="compliance-initiatives-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Plan the moments that strengthen the team.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">One accountable workspace for the year-end party, team bonding and awards—from intent to the last completed task.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[340px]">
            {[
              [projects.length, "Initiatives"],
              [activeProjectCount, "In motion"],
              [completedTaskCount, "Tasks done"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-border/70 bg-background/70 px-3 py-3 backdrop-blur">
                <p className="text-xl font-semibold tracking-tight">{value}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs value={activeType} onValueChange={setActiveType} className="space-y-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl p-1 sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="year_end_party">Year-end</TabsTrigger>
            <TabsTrigger value="team_bonding">Bonding</TabsTrigger>
            <TabsTrigger value="awards">Awards</TabsTrigger>
          </TabsList>
          {canManage && (
            <Button onClick={() => openNewProject(activeType === "all" ? "year_end_party" : activeType as UnitProject["project_type"])} className="gap-2">
              <Plus className="h-4 w-4" /> New initiative
            </Button>
          )}
        </div>

        {["all", "year_end_party", "team_bonding", "awards"].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-4">
            {filteredProjects.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
                <Target className="mx-auto h-9 w-9 text-muted-foreground/45" />
                <p className="mt-4 font-semibold">No initiatives here yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Create the first plan and turn it into a clear, assignable task list.</p>
                {canManage && <Button variant="outline" className="mt-5 gap-2" onClick={() => openNewProject(tab === "all" ? "year_end_party" : tab as UnitProject["project_type"])}><Plus className="h-4 w-4" /> Create initiative</Button>}
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredProjects.map((project) => {
                  const config = PROJECT_TYPES[project.project_type]
                  const Icon = config.icon
                  const projectTasks = tasks.filter((task) => task.project_id === project.id)
                  const done = projectTasks.filter((task) => task.status === "done").length
                  const progress = projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0
                  const isSelected = selectedProjectId === project.id
                  return (
                    <article key={project.id} className={cn("group overflow-hidden rounded-3xl border bg-card transition-all", isSelected ? "border-violet-500/40 shadow-md" : "border-border/70 hover:border-border hover:shadow-sm")}>
                      <button type="button" onClick={() => setSelectedProjectId(isSelected ? null : project.id)} className="w-full p-5 text-left sm:p-6" aria-expanded={isSelected}>
                        <div className="flex items-start gap-4">
                          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", config.surface, config.accent)}><Icon className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={statusTone(project.status)}>{project.status.replaceAll("_", " ")}</Badge>
                              <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
                              {project.priority === "high" && <Badge variant="destructive">High priority</Badge>}
                            </div>
                            <h3 className="mt-3 text-lg font-semibold tracking-tight">{project.title}</h3>
                            {project.description && <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{project.description}</p>}
                          </div>
                          <ChevronRight className={cn("mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform", isSelected && "rotate-90")} />
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <div>
                            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground"><span>{done} of {projectTasks.length} tasks complete</span><span>{progress}%</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} /></div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" />{formatDate(project.starts_at)}</div>
                        </div>
                      </button>

                      {isSelected && (
                        <div className="border-t border-border/70 bg-muted/15 px-5 py-5 sm:px-6">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div><p className="text-sm font-semibold">Delivery checklist</p><p className="text-xs text-muted-foreground">Clear ownership, due dates and progress.</p></div>
                            {canManage && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setTaskForm({ title: "", description: "", assigned_to: "", due_at: "" }); setTaskDialogOpen(true) }}><Plus className="h-3.5 w-3.5" /> Task</Button>}
                          </div>
                          <div className="space-y-2">
                            {projectTasks.length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">No tasks have been added.</p> : projectTasks.map((task) => {
                              const assignee = officers.find((officer) => officer.id === task.assigned_to)
                              const completed = task.status === "done"
                              return (
                                <div key={task.id} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/80 p-3.5">
                                  <button type="button" disabled={!canManage || toggleTaskMutation.isPending} onClick={() => toggleTaskMutation.mutate(task)} className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors", completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-border hover:border-violet-400", !canManage && "cursor-default")} aria-label={completed ? "Mark task pending" : "Mark task complete"}>{completed ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}</button>
                                  <div className="min-w-0 flex-1"><p className={cn("text-sm font-medium", completed && "text-muted-foreground line-through")}>{task.title}</p>{task.description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{task.description}</p>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">{assignee && <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{assignee.full_name || assignee.email}</span>}{task.due_at && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDate(task.due_at)}</span>}</div></div>
                                </div>
                              )
                            })}
                          </div>
                          {canManage && <div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="ghost" className="gap-1.5" onClick={() => openEditProject(project)}><Pencil className="h-3.5 w-3.5" /> Edit</Button><Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => deleteProject(project)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button></div>}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingProject ? "Edit initiative" : "Create initiative"}</DialogTitle><DialogDescription>Define the outcome, timing and operating priority.</DialogDescription></DialogHeader>
          <form onSubmit={submitProject} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="initiative-type">Initiative type</Label><Select value={projectForm.project_type} onValueChange={(value: UnitProject["project_type"]) => setProjectForm((current) => ({ ...current, project_type: value }))}><SelectTrigger id="initiative-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROJECT_TYPES).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="initiative-status">Status</Label><Select value={projectForm.status} onValueChange={(value) => setProjectForm((current) => ({ ...current, status: value }))}><SelectTrigger id="initiative-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="idea">Idea</SelectItem><SelectItem value="planning">Planning</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="on_hold">On hold</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label htmlFor="initiative-title">Title</Label><Input id="initiative-title" value={projectForm.title} onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. TCNP year-end celebration 2026" maxLength={160} /></div>
            <div className="space-y-2"><Label htmlFor="initiative-description">Purpose and notes</Label><Textarea id="initiative-description" rows={3} value={projectForm.description} onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))} placeholder="What does a successful outcome look like?" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="initiative-start">Starts</Label><Input id="initiative-start" type="datetime-local" value={projectForm.starts_at} onChange={(event) => setProjectForm((current) => ({ ...current, starts_at: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="initiative-end">Ends</Label><Input id="initiative-end" type="datetime-local" value={projectForm.ends_at} onChange={(event) => setProjectForm((current) => ({ ...current, ends_at: event.target.value }))} /></div></div>
            <div className="space-y-2"><Label htmlFor="initiative-priority">Priority</Label><Select value={projectForm.priority} onValueChange={(value) => setProjectForm((current) => ({ ...current, priority: value }))}><SelectTrigger id="initiative-priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setProjectDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveProjectMutation.isPending}>{saveProjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingProject ? "Save changes" : "Create initiative"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add delivery task</DialogTitle><DialogDescription>{selectedProject?.title}</DialogDescription></DialogHeader>
          <form onSubmit={submitTask} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="initiative-task-title">Task</Label><Input id="initiative-task-title" value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} placeholder="What needs to be done?" maxLength={180} /></div>
            <div className="space-y-2"><Label htmlFor="initiative-task-notes">Notes</Label><Textarea id="initiative-task-notes" rows={3} value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} placeholder="Acceptance notes, dependencies or context" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="initiative-task-owner">Owner</Label><Select value={taskForm.assigned_to || "unassigned"} onValueChange={(value) => setTaskForm((current) => ({ ...current, assigned_to: value === "unassigned" ? "" : value }))}><SelectTrigger id="initiative-task-owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{officers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.full_name || officer.email || "Unnamed officer"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="initiative-task-due">Due</Label><Input id="initiative-task-due" type="datetime-local" value={taskForm.due_at} onChange={(event) => setTaskForm((current) => ({ ...current, due_at: event.target.value }))} /></div></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={createTaskMutation.isPending}>{createTaskMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}Add task</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
