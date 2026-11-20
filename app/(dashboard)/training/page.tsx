"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { notifyError, UserFacingError } from '@/lib/notify'
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import { canManageTraining } from "@/lib/site-unit-permissions"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import TrainingOperations from "@/components/training/TrainingOperations"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import UnitTasks from "@/components/units/UnitTasks"
import UnitProgrammeTeam from "@/components/units/UnitProgrammeTeam"
import { canSeeUnitWork, useAddressTab } from "@/components/units/unit-work-tabs"
import {
  GraduationCap, Plus, Pencil, Trash2, MapPin, Clock, Users, BookOpen, ArrowRight, CalendarDays, FileText, Shield, X, ClipboardList, UsersRound
} from "lucide-react"

import { ErrorState } from "@/components/ui/error-state"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ─── Singleton client ───
const supabase = createClient()

type Training = {
  id: string
  topic: string
  description: string | null
  location: string | null
  session_date: string
  start_time: string | null
  end_time: string | null
  speakers: string[]
  visibility: string
  target_unit_id: string | null
  session_type: string
  created_at: string
}

type TrainingUnit = { id: string; name: string; slug: string }

type OscarDoc = {
  id: string
  oscar: string
  doc_type: "sop" | "code_of_conduct"
  title: string
  content: string
  created_at: string
}

const TARGET_OSCARS = [
  { id: "alpha_oscar", name: "Alpha Oscar" },
  { id: "compliance_oscar", name: "Compliance Oscar" },
  { id: "delta_oscar", name: "Delta Oscar" },
  { id: "echo_oscar", name: "Echo Oscar" },
  { id: "november_oscar", name: "November Oscar" },
  { id: "serial_oscar", name: "Serial Oscar" },
  { id: "tango_oscar", name: "Tango Oscar" },
  { id: "training_oscar", name: "Training Oscar" },
  { id: "victor_oscar", name: "Victor Oscar" },
  { id: "welfare_oscar", name: "Welfare Oscar" },
  { id: "all", name: "All Units (Global)" }
]

function fmtTime(t: string | null) {
  if (!t) return null
  return t.slice(0, 5)
}

export default function TrainingPage() {
  // useSearchParams (?tab=) needs a Suspense boundary so the page can still prerender.
  return (
    <Suspense fallback={<TrainingSkeleton />}>
      <TrainingContent />
    </Suspense>
  )
}

function TrainingSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading Training">
      <Skeleton className="h-8 w-48 max-w-full" />
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

function TrainingContent() {
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  // Every Training write (schedules, Training-managed documents) is
  // can_manage_unit('training'): the Training head and platform admins.
  const training = useUnitAccess("training")
  const canEdit = canManageTraining(training)
  // Tasks and Programme team: Training members and Command (the components decide who edits).
  const canSeeWork = canSeeUnitWork(training)
  const [pageTab, selectPageTab] = useAddressTab(canSeeWork ? ["training", "tasks", "team"] : ["training"])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Training | null>(null)
  const [form, setForm] = useState({
    topic: "",
    description: "",
    location: "",
    session_date: new Date().toISOString().slice(0, 10),
    start_time: "",
    end_time: "",
    speakersText: "",
    visibility: "all_members",
    target_unit_id: "",
    session_type: "training",
  })

  // Oscar Doc states
  const [docDialogOpen, setDocDialogOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<OscarDoc | null>(null)
  const [docForm, setDocForm] = useState<{ oscar: string; doc_type: "sop" | "code_of_conduct"; title: string; content: string }>({
    oscar: "all",
    doc_type: "sop",
    title: "",
    content: ""
  })

  const { data: sessions = [], isLoading, isError: listFailed, refetch: refetchList, isRefetching: listRetrying } = useQuery({
    queryKey: ["training-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_schedules")
        .select("*")
        .order("session_date", { ascending: true })
      if (error) throw error
      return (data ?? []).map((s: any) => ({
        ...s,
        speakers: Array.isArray(s.speakers) ? s.speakers : [],
      })) as Training[]
    },
  })

  const { data: units = [] } = useQuery({
    queryKey: ["units-lite", "training-schedules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("units").select("id, name, slug").eq("is_active", true).order("name")
      if (error) throw error
      return (data ?? []) as TrainingUnit[]
    },
  })

  const { data: documents = [], isLoading: docsLoading, isError: docsFailed, refetch: refetchDocs, isRefetching: docsRetrying } = useQuery({
    queryKey: ["oscar-documents"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oscar_documents")
        .select("*")
        .eq("managed_by_training", true)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as OscarDoc[]
    },
    enabled: canEdit, // Only load these on training page if they can edit (admins)
  })

  const [showAllPast, setShowAllPast] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = useMemo(() => sessions.filter(s => s.session_date >= today), [sessions, today])
  const past = useMemo(() => sessions.filter(s => s.session_date < today).reverse(), [sessions, today])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.topic.trim()) throw new UserFacingError("Topic is required")
      const payload = {
        topic: form.topic.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        session_date: form.session_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        speakers: form.speakersText.split(",").map(s => s.trim()).filter(Boolean),
        visibility: form.visibility,
        target_unit_id: form.visibility === "target_unit" ? form.target_unit_id || null : null,
        session_type: form.session_type,
        updated_at: new Date().toISOString(),
      }
      if (form.visibility === "target_unit" && !form.target_unit_id) throw new UserFacingError("Choose the unit this session is for")
      if (editing) {
        const { error } = await (supabase as any).from("training_schedules").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from("training_schedules").insert({ ...payload, created_by: currentUser?.id ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      clearDeleteErrors()
      toast.success(editing ? "Session updated" : "Training scheduled")
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["training-schedules"] })
    },
    onError: (err: any) => notifyError(err, "Failed to save"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_schedules").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      deleteDocMutation.reset()
      toast.success("Session removed")
      queryClient.invalidateQueries({ queryKey: ["training-schedules"] })
    },
    onError: (err: any) => notifyError(err, "Failed to delete"),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ topic: "", description: "", location: "", session_date: today, start_time: "", end_time: "", speakersText: "", visibility: "all_members", target_unit_id: "", session_type: "training" })
    setDialogOpen(true)
  }

  const openEdit = (s: Training) => {
    setEditing(s)
    setForm({
      topic: s.topic,
      description: s.description ?? "",
      location: s.location ?? "",
      session_date: s.session_date,
      start_time: s.start_time?.slice(0, 5) ?? "",
      end_time: s.end_time?.slice(0, 5) ?? "",
      speakersText: s.speakers.join(", "),
      visibility: s.visibility || "all_members",
      target_unit_id: s.target_unit_id || "",
      session_type: s.session_type || "training",
    })
    setDialogOpen(true)
  }

  // Document Mutations & Handlers
  const saveDocMutation = useMutation({
    mutationFn: async () => {
      if (!docForm.title.trim()) throw new UserFacingError("Title is required")
      if (!docForm.content.trim()) throw new UserFacingError("Content is required")
      const payload = { ...docForm, managed_by_training: true }
      if (editingDoc) {
        const { error } = await (supabase as any).from("oscar_documents").update(payload).eq("id", editingDoc.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from("oscar_documents").insert({ ...payload, created_by: currentUser?.id ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      clearDeleteErrors()
      toast.success(editingDoc ? "Document updated" : "Document created")
      setDocDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ["oscar-documents"] })
    },
    onError: (err: any) => notifyError(err, "Failed to save"),
  })

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("oscar_documents").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      deleteMutation.reset()
      toast.success("Document deleted")
      queryClient.invalidateQueries({ queryKey: ["oscar-documents"] })
    },
    onError: (err: any) => notifyError(err, "Failed to delete"),
  })

  // The delete-failure banner clears on dismiss or on the next successful save/delete.
  function clearDeleteErrors() {
    deleteMutation.reset()
    deleteDocMutation.reset()
  }
  const deleteFailed = deleteMutation.isError || deleteDocMutation.isError

  const openDocCreate = () => {
    setEditingDoc(null)
    setDocForm({ oscar: "all", doc_type: "sop", title: "", content: "" })
    setDocDialogOpen(true)
  }

  const openDocEdit = (d: OscarDoc) => {
    setEditingDoc(d)
    setDocForm({ oscar: d.oscar, doc_type: d.doc_type, title: d.title, content: d.content })
    setDocDialogOpen(true)
  }

  const SessionCard = ({ s, muted = false }: { s: Training; muted?: boolean }) => (
    <Card className={`card-hover h-full ${muted ? "opacity-70" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{s.topic}</CardTitle>
            <div className="mt-1 flex flex-wrap gap-1.5"><Badge variant="outline" className="text-[11px] capitalize">{(s.session_type || "training").replaceAll("_", " ")}</Badge>{(s.visibility || "all_members") !== "all_members" && <Badge variant="secondary" className="text-[11px]">{s.visibility === "training_unit" ? "Training Unit only" : units.find((unit) => unit.id === s.target_unit_id)?.name || "Target unit"}</Badge>}</div>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {s.session_date}</span>
              {(s.start_time || s.end_time) && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {fmtTime(s.start_time)}{s.end_time ? ` – ${fmtTime(s.end_time)}` : ""}
                </span>
              )}
              {s.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.location}</span>}
            </CardDescription>
          </div>
          {canEdit && (
            <div className="flex shrink-0 gap-1">
              <Button aria-label="Edit training session" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button aria-label="Delete training session"
                variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                onClick={async () => {
                  const ok = await confirm({ title: "Delete training session?", message: `"${s.topic}" will be removed from the schedule.` })
                  if (ok) deleteMutation.mutate(s.id)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
        {s.speakers.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {s.speakers.join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <PageHeader
        icon={GraduationCap}
        title="Training"
        description="The SOP manual and every scheduled training session — topics, venues, times and speakers."
        actions={canEdit && (
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" /> Schedule Training
          </Button>
        )}
      />

      {/* Covers TrainingOperations below too: it reads the same unit-access
          query, so its edit controls are hidden for the same reason. */}
      {training.loadFailed && (
        <ErrorState
          title="Could not check your unit access"
          description="Training controls stay hidden until your membership loads."
          onRetry={() => { void queryClient.invalidateQueries({ queryKey: ["unit-access"] }) }}
          className="rounded-2xl border"
        />
      )}

      {deleteFailed && (
        <div role="alert" className="flex min-w-0 items-start gap-3 rounded-lg border border-destructive/30 p-4 text-sm">
          <p className="min-w-0 flex-1">The record could not be deleted. It has not been removed from this view. Refresh and try again, or contact an administrator.</p>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Dismiss delete error" onClick={clearDeleteErrors}><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      )}

      <Tabs value={pageTab} onValueChange={selectPageTab} className="space-y-6">
        {canSeeWork && (
          <TabsList className="grid h-auto w-full max-w-xl grid-cols-3 gap-1 p-1">
            <TabsTrigger value="training" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Training</TabsTrigger>
            <TabsTrigger value="tasks" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Tasks</TabsTrigger>
            <TabsTrigger value="team" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Programme team</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="training" className="space-y-6">
      <TrainingOperations />

      {/* SOP manual entry */}
      <Link href="/sop" className="block">
        <Card className="card-hover group border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">TCNP SOP Manual</p>
              <p className="text-sm text-muted-foreground">Call signs, prerequisites, responsibilities and full operating procedures.</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" />
          </CardContent>
        </Card>
      </Link>

      {/* Upcoming */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Sessions</p>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-36 rounded-xl" />)}
          </div>
        ) : listFailed ? (
        <ErrorState onRetry={() => { void refetchList() }} retrying={listRetrying} />
      ) : upcoming.length === 0 ? (
          <div className="empty-state rounded-xl border">
            <GraduationCap className="h-10 w-10" />
            <p className="font-medium">No upcoming training</p>
            <p className="text-sm text-muted-foreground">New sessions appear here as soon as they are scheduled.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {upcoming.map(s => (
                <motion.div key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <SessionCard s={s} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past Sessions</p>
          <div id="training-past-sessions" className="grid gap-4 md:grid-cols-2">
            {(showAllPast ? past : past.slice(0, 6)).map(s => <SessionCard key={s.id} s={s} muted />)}
          </div>
          {past.length > 6 && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full sm:w-auto"
              aria-expanded={showAllPast}
              aria-controls="training-past-sessions"
              onClick={() => setShowAllPast(v => !v)}
            >
              {showAllPast ? "Show fewer past sessions" : `Show all past sessions (${past.length})`}
            </Button>
          )}
        </div>
      )}

      {/* Unit Documents (SOPs & Code of Conduct) */}
      {canEdit && (
        <div className="mt-12 space-y-4 border-t pt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight">Unit Documents</h2>
              <p className="text-sm text-muted-foreground mt-1">Manage SOPs and Code of Conduct documents specific to each Oscar.</p>
            </div>
            <Button onClick={openDocCreate} className="gap-2 self-start shrink-0">
              <Plus className="h-4 w-4" /> Add Document
            </Button>
          </div>

          {docsLoading ? (
            <div className="skeleton h-24 rounded-xl" />
          ) : docsFailed ? (
            <ErrorState title="Could not load unit documents" className="rounded-xl border" onRetry={() => { void refetchDocs() }} retrying={docsRetrying} />
          ) : documents.length === 0 ? (
            <div className="empty-state rounded-xl border">
              <FileText className="h-8 w-8" />
              <p className="font-medium">No documents yet</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {documents.map(d => (
                <Card key={d.id} className="card-hover">
                  <div className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${d.doc_type === 'sop' ? 'bg-blue-500/10 text-blue-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {d.doc_type === 'sop' ? <BookOpen className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <h4 className="min-w-0 max-w-full truncate font-medium" title={d.title}>{d.title}</h4>
                          <Badge variant="secondary" className="shrink-0 text-xs capitalize font-medium">{d.doc_type === 'sop' ? 'SOP' : 'Code of Conduct'}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 capitalize truncate">{TARGET_OSCARS.find(o => o.id === d.oscar)?.name || d.oscar}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                      <Button variant="ghost" size="sm" aria-label={`Edit ${d.title}`} onClick={() => openDocEdit(d)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-red-500" aria-label={`Delete ${d.title}`} onClick={async () => {
                        const ok = await confirm({ title: "Delete document?", message: `"${d.title}" will be permanently removed.` })
                        if (ok) deleteDocMutation.mutate(d.id)
                      }}>Delete</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
        </TabsContent>

        {canSeeWork && (
          <>
            <TabsContent value="tasks" className="space-y-6">
              <UnitTasks unitSlug="training" />
            </TabsContent>
            <TabsContent value="team" className="space-y-6">
              <UnitProgrammeTeam unitSlug="training" />
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Session" : "Schedule Training"}</DialogTitle>
            <DialogDescription>Set the session type, audience, timing and speakers.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }} className="mt-2 space-y-4">
            {saveMutation.isError && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">Could not save this session. Your entries are retained. {(saveMutation.error as Error)?.message}</p>}
            <div className="space-y-2">
              <Label htmlFor="training-field-1">Topic *</Label>
              <Input id="training-field-1" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Advanced Convoy Protocol" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-field-2">Description</Label>
              <Textarea id="training-field-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label id="training-field-3-label">Session type</Label>
                <Select value={form.session_type} onValueChange={(session_type) => setForm({ ...form, session_type })}>
                  <SelectTrigger aria-labelledby="training-field-3-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="recruitment">Recruitment</SelectItem>
                    <SelectItem value="orientation">Orientation</SelectItem>
                    <SelectItem value="evaluation">Evaluation</SelectItem>
                    <SelectItem value="briefing">Briefing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label id="training-field-4-label">Visibility</Label>
                <Select value={form.visibility} onValueChange={(visibility) => setForm({ ...form, visibility, target_unit_id: visibility === "target_unit" ? form.target_unit_id : "" })}>
                  <SelectTrigger aria-labelledby="training-field-4-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_members">All members</SelectItem>
                    <SelectItem value="training_unit">Training Unit only</SelectItem>
                    <SelectItem value="target_unit">Specific unit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.visibility === "target_unit" && (
              <div className="space-y-2">
                <Label id="training-field-5-label">Target unit</Label>
                <Select value={form.target_unit_id} onValueChange={(target_unit_id) => setForm({ ...form, target_unit_id })}>
                  <SelectTrigger aria-labelledby="training-field-5-label"><SelectValue placeholder="Choose a unit" /></SelectTrigger>
                  <SelectContent>{units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="training-field-6">Date *</Label>
                <Input id="training-field-6" type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="training-field-7">Location</Label>
                <Input id="training-field-7" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. The Den, Iganmu" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="training-field-8">Start time</Label>
                <Input id="training-field-8" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="training-field-9">End time</Label>
                <Input id="training-field-9" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-field-10">Speakers (comma separated)</Label>
              <Input id="training-field-10" value={form.speakersText} onChange={(e) => setForm({ ...form, speakersText: e.target.value })} placeholder="Capt. A. Doe, Head of Command" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Schedule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Doc Create / Edit Dialog */}
      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
          {saveDocMutation.isError && <p role="alert" className="rounded-lg border p-3 text-sm">Document not saved. Your entries are retained. {(saveDocMutation.error as Error)?.message}</p>}
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Edit Unit Document" : "Add Unit Document"}</DialogTitle>
            <DialogDescription>Assign a specialized SOP or Code of Conduct to an Oscar.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveDocMutation.mutate() }} className="mt-2 space-y-4 overflow-y-auto pr-2 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label id="training-field-11-label">Target Oscar Unit</Label>
                <Select value={docForm.oscar} onValueChange={(val) => setDocForm({ ...docForm, oscar: val })}>
                  <SelectTrigger aria-labelledby="training-field-11-label"><SelectValue placeholder="Select Unit..." /></SelectTrigger>
                  <SelectContent>
                    {TARGET_OSCARS.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label id="training-field-12-label">Document Type</Label>
                <Select value={docForm.doc_type} onValueChange={(val: any) => setDocForm({ ...docForm, doc_type: val })}>
                  <SelectTrigger aria-labelledby="training-field-12-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sop">SOP Fragment</SelectItem>
                    <SelectItem value="code_of_conduct">Code of Conduct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-field-13">Title</Label>
              <Input id="training-field-13" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} placeholder="e.g. Serial Oscar Dress Protocol" required />
            </div>
            <div className="space-y-2 flex-1 flex flex-col">
              <Label htmlFor="training-field-14">Content (Markdown supported)</Label>
              <Textarea id="training-field-14"
                className="min-h-[250px] font-mono text-sm leading-relaxed whitespace-pre-wrap resize-y"
                value={docForm.content}
                onChange={(e) => setDocForm({ ...docForm, content: e.target.value })}
                placeholder="Enter document text or markdown here..."
                required
              />
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDocDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saveDocMutation.isPending}>
                {saveDocMutation.isPending ? "Saving…" : editingDoc ? "Save Changes" : "Create Document"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
