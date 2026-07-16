"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { isAdmin } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import {
  GraduationCap, Plus, Pencil, Trash2, MapPin, Clock, Users, BookOpen, ArrowRight, CalendarDays, FileText, Shield
} from "lucide-react"

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
  created_at: string
}

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
  { id: "hospitality_oscar", name: "Hospitality Oscar" },
  { id: "november_oscar", name: "November Oscar" },
  { id: "serial_oscar", name: "Serial Oscar" },
  { id: "tango_oscar", name: "Tango Oscar" },
  { id: "victor_oscar", name: "Victor Oscar" },
  { id: "welfare_oscar", name: "Welfare Oscar" },
  { id: "all", name: "All Units (Global)" }
]

function fmtTime(t: string | null) {
  if (!t) return null
  return t.slice(0, 5)
}

export default function TrainingPage() {
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const canEdit = isAdmin(currentUser?.role)

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

  const { data: sessions = [], isLoading } = useQuery({
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

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["oscar-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oscar_documents")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as OscarDoc[]
    },
    enabled: canEdit, // Only load these on training page if they can edit (admins)
  })

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = useMemo(() => sessions.filter(s => s.session_date >= today), [sessions, today])
  const past = useMemo(() => sessions.filter(s => s.session_date < today).reverse(), [sessions, today])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.topic.trim()) throw new Error("Topic is required")
      const payload = {
        topic: form.topic.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        session_date: form.session_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        speakers: form.speakersText.split(",").map(s => s.trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from("training_schedules").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("training_schedules").insert({ ...payload, created_by: currentUser?.id ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Session updated" : "Training scheduled")
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["training-schedules"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_schedules").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Session removed")
      queryClient.invalidateQueries({ queryKey: ["training-schedules"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ topic: "", description: "", location: "", session_date: today, start_time: "", end_time: "", speakersText: "" })
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
    })
    setDialogOpen(true)
  }

  // Document Mutations & Handlers
  const saveDocMutation = useMutation({
    mutationFn: async () => {
      if (!docForm.title.trim()) throw new Error("Title is required")
      if (!docForm.content.trim()) throw new Error("Content is required")
      const payload = { ...docForm }
      if (editingDoc) {
        const { error } = await supabase.from("oscar_documents").update(payload).eq("id", editingDoc.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("oscar_documents").insert({ ...payload, created_by: currentUser?.id ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editingDoc ? "Document updated" : "Document created")
      setDocDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ["oscar-documents"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  })

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("oscar_documents").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Document deleted")
      queryClient.invalidateQueries({ queryKey: ["oscar-documents"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  })

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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button
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
      <div className="relative overflow-hidden rounded-2xl border bg-card p-6">
        <div className="absolute -left-10 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Training</h1>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              The SOP manual and every scheduled training session — topics, venues, times and speakers.
            </p>
          </div>
          {canEdit && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Schedule Training
            </Button>
          )}
        </div>
      </div>

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
          <div className="grid gap-4 md:grid-cols-2">
            {past.slice(0, 6).map(s => <SessionCard key={s.id} s={s} muted />)}
          </div>
        </div>
      )}

      {/* Unit Documents (SOPs & Code of Conduct) */}
      {canEdit && (
        <div className="mt-12 space-y-4 border-t pt-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Unit Documents</h2>
              <p className="text-sm text-muted-foreground mt-1">Manage SOPs and Code of Conduct documents specific to each Oscar.</p>
            </div>
            <Button onClick={openDocCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Add Document
            </Button>
          </div>

          {docsLoading ? (
            <div className="skeleton h-24 rounded-xl" />
          ) : documents.length === 0 ? (
            <div className="empty-state rounded-xl border">
              <FileText className="h-8 w-8" />
              <p className="font-medium">No documents yet</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {documents.map(d => (
                <Card key={d.id} className="card-hover">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${d.doc_type === 'sop' ? 'bg-blue-500/10 text-blue-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {d.doc_type === 'sop' ? <BookOpen className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </div>
                      <div>
                        <h4 className="font-medium flex gap-2 items-center">
                          {d.title}
                          <Badge variant="secondary" className="text-[10px] capitalize font-medium">{d.doc_type === 'sop' ? 'SOP' : 'Code of Conduct'}</Badge>
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{TARGET_OSCARS.find(o => o.id === d.oscar)?.name || d.oscar}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <Button variant="ghost" size="sm" onClick={() => openDocEdit(d)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={async () => {
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

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Session" : "Schedule Training"}</DialogTitle>
            <DialogDescription>Visible to every protocol officer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }} className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label>Topic *</Label>
              <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Advanced Convoy Protocol" required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. The Den, Iganmu" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End time</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Speakers (comma separated)</Label>
              <Input value={form.speakersText} onChange={(e) => setForm({ ...form, speakersText: e.target.value })} placeholder="Capt. A. Doe, Head of Command" />
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
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Edit Unit Document" : "Add Unit Document"}</DialogTitle>
            <DialogDescription>Assign a specialized SOP or Code of Conduct to an Oscar.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveDocMutation.mutate() }} className="mt-2 space-y-4 overflow-y-auto pr-2 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Target Oscar Unit</Label>
                <Select value={docForm.oscar} onValueChange={(val) => setDocForm({ ...docForm, oscar: val })}>
                  <SelectTrigger><SelectValue placeholder="Select Unit..." /></SelectTrigger>
                  <SelectContent>
                    {TARGET_OSCARS.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={docForm.doc_type} onValueChange={(val: any) => setDocForm({ ...docForm, doc_type: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sop">SOP Fragment</SelectItem>
                    <SelectItem value="code_of_conduct">Code of Conduct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} placeholder="e.g. Serial Oscar Dress Protocol" required />
            </div>
            <div className="space-y-2 flex-1 flex flex-col">
              <Label>Content (Markdown supported)</Label>
              <Textarea
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
