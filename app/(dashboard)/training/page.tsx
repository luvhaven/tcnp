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
  GraduationCap, Plus, Pencil, Trash2, MapPin, Clock, Users, BookOpen, ArrowRight, CalendarDays,
} from "lucide-react"

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
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 p-6 text-white">
        <div className="absolute -left-10 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-indigo-300" />
              <h1 className="text-2xl font-bold tracking-tight">Training</h1>
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-300">
              The SOP manual and every scheduled training session — topics, venues, times and speakers.
            </p>
          </div>
          {canEdit && (
            <Button onClick={openCreate} className="gap-2 bg-indigo-600 hover:bg-indigo-500">
              <Plus className="h-4 w-4" /> Schedule Training
            </Button>
          )}
        </div>
      </div>

      {/* SOP manual entry */}
      <Link href="/sop" className="block">
        <Card className="card-hover group border-indigo-500/30 bg-gradient-to-r from-indigo-500/5 to-transparent">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
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
    </div>
  )
}
