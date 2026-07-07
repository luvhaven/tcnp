"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { BedDouble, Plus, Pencil, Trash2, MapPin, Route, Clock, KeyRound } from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

type Accommodation = {
  id: string
  program_id: string | null
  papa_id: string
  nest_id: string | null
  hotel_name: string
  location: string | null
  room_info: string | null
  check_in: string | null
  check_out: string | null
  distance_km: number | null
  travel_duration_mins: number | null
  notes: string | null
  papas?: { full_name: string; title: string | null } | null
  programs?: { name: string } | null
  nests?: { name: string } | null
}

type Props = {
  canEdit: boolean
  selectedProgram: string
  currentUserId?: string | null
}

export default function PapaAccommodations({ canEdit, selectedProgram, currentUserId }: Props) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Accommodation | null>(null)
  const [form, setForm] = useState({
    papa_id: "",
    program_id: "",
    nest_id: "",
    hotel_name: "",
    location: "",
    room_info: "",
    check_in: "",
    check_out: "",
    distance_km: "",
    travel_duration_mins: "",
    notes: "",
  })

  const { data: papas = [] } = useQuery({
    queryKey: ["papas-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("papas").select("id, full_name, title, program_id").eq("is_deleted", false).order("full_name")
      return data ?? []
    },
  })

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      return data ?? []
    },
  })

  const { data: nests = [] } = useQuery({
    queryKey: ["nests-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("nests").select("id, name").order("name")
      return data ?? []
    },
  })

  // RLS scopes what each viewer may see (managers see all; a DO sees only their Papa's)
  const { data: accommodations = [], isLoading } = useQuery({
    queryKey: ["papa-accommodations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("papa_accommodations")
        .select("*, papas(full_name, title), programs(name), nests(name)")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Accommodation[]
    },
  })

  const filtered = useMemo(
    () => accommodations.filter(a => selectedProgram === "all" || a.program_id === selectedProgram),
    [accommodations, selectedProgram]
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.papa_id || !form.hotel_name.trim()) throw new Error("Papa and hotel name are required")
      const payload = {
        papa_id: form.papa_id,
        program_id: form.program_id || null,
        nest_id: form.nest_id || null,
        hotel_name: form.hotel_name.trim(),
        location: form.location.trim() || null,
        room_info: form.room_info.trim() || null,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        travel_duration_mins: form.travel_duration_mins ? Number(form.travel_duration_mins) : null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from("papa_accommodations").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("papa_accommodations").insert({ ...payload, created_by: currentUserId ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Accommodation updated" : "Accommodation added")
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["papa-accommodations"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("papa_accommodations").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Accommodation removed")
      queryClient.invalidateQueries({ queryKey: ["papa-accommodations"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({
      papa_id: "", program_id: selectedProgram !== "all" ? selectedProgram : "", nest_id: "",
      hotel_name: "", location: "", room_info: "", check_in: "", check_out: "",
      distance_km: "", travel_duration_mins: "", notes: "",
    })
    setDialogOpen(true)
  }

  const openEdit = (acc: Accommodation) => {
    setEditing(acc)
    setForm({
      papa_id: acc.papa_id,
      program_id: acc.program_id ?? "",
      nest_id: acc.nest_id ?? "",
      hotel_name: acc.hotel_name,
      location: acc.location ?? "",
      room_info: acc.room_info ?? "",
      check_in: acc.check_in ?? "",
      check_out: acc.check_out ?? "",
      distance_km: acc.distance_km?.toString() ?? "",
      travel_duration_mins: acc.travel_duration_mins?.toString() ?? "",
      notes: acc.notes ?? "",
    })
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <BedDouble className="h-5 w-5 text-primary" /> Papa Accommodations
          </h3>
          <p className="text-sm text-muted-foreground">
            Hotel assignments per Papa — location, distance and travel time to the Theatre.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-40 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state rounded-xl border">
          <BedDouble className="h-10 w-10" />
          <p className="font-medium">No accommodations recorded</p>
          <p className="text-sm text-muted-foreground">
            {canEdit ? "Add the first Papa hotel assignment." : "Accommodations you are cleared to view will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AnimatePresence>
            {filtered.map(acc => (
              <motion.div key={acc.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="card-hover h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">
                          {acc.papas?.title ? `${acc.papas.title} ` : ""}{acc.papas?.full_name ?? "Unknown Papa"}
                        </CardTitle>
                        <CardDescription className="mt-1 flex flex-wrap items-center gap-1">
                          <Badge variant="secondary" className="text-[10px]">{acc.hotel_name}</Badge>
                          {acc.programs?.name && <Badge variant="outline" className="text-[10px]">{acc.programs.name}</Badge>}
                          {acc.nests?.name && <Badge variant="outline" className="text-[10px]">Nest: {acc.nests.name}</Badge>}
                        </CardDescription>
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(acc)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                            onClick={async () => {
                              const ok = await confirm({ title: "Remove accommodation?", message: `${acc.hotel_name} for ${acc.papas?.full_name ?? "this Papa"}.` })
                              if (ok) deleteMutation.mutate(acc.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 text-sm">
                    {acc.location && (
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {acc.location}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {acc.distance_km != null && (
                        <span className="inline-flex items-center gap-1"><Route className="h-3.5 w-3.5" /> {acc.distance_km} km to Theatre</span>
                      )}
                      {acc.travel_duration_mins != null && (
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{acc.travel_duration_mins} min drive</span>
                      )}
                      {acc.room_info && (
                        <span className="inline-flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> {acc.room_info}</span>
                      )}
                    </div>
                    {(acc.check_in || acc.check_out) && (
                      <p className="text-xs text-muted-foreground">
                        {acc.check_in && <>Check-in <span className="font-medium text-foreground">{acc.check_in}</span></>}
                        {acc.check_in && acc.check_out && " · "}
                        {acc.check_out && <>Check-out <span className="font-medium text-foreground">{acc.check_out}</span></>}
                      </p>
                    )}
                    {acc.notes && <p className="border-t pt-2 text-xs text-muted-foreground">{acc.notes}</p>}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Accommodation" : "Add Accommodation"}</DialogTitle>
            <DialogDescription>Duty officers only see accommodations for their own Papa.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }} className="mt-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Papa *</Label>
                <Select value={form.papa_id} onValueChange={(v) => setForm({ ...form, papa_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Papa…" /></SelectTrigger>
                  <SelectContent>
                    {papas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Program</Label>
                <Select value={form.program_id || "none"} onValueChange={(v) => setForm({ ...form, program_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Hotel name *</Label>
              <Input value={form.hotel_name} onChange={(e) => setForm({ ...form, hotel_name: e.target.value })} placeholder="e.g. Eko Hotel & Suites" required />
            </div>
            <div className="space-y-2">
              <Label>Location / address</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Adetokunbo Ademola St, Victoria Island" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Linked Nest</Label>
                <Select value={form.nest_id || "none"} onValueChange={(v) => setForm({ ...form, nest_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {nests.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Room info</Label>
                <Input value={form.room_info} onChange={(e) => setForm({ ...form, room_info: e.target.value })} placeholder="Suite 1204 (Cave)" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Check-in</Label>
                <Input type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Check-out</Label>
                <Input type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Distance to Theatre (km)</Label>
                <Input type="number" step="0.1" min="0" value={form.distance_km} onChange={(e) => setForm({ ...form, distance_km: e.target.value })} placeholder="4.5" />
              </div>
              <div className="space-y-2">
                <Label>Drive time (mins)</Label>
                <Input type="number" min="0" value={form.travel_duration_mins} onChange={(e) => setForm({ ...form, travel_duration_mins: e.target.value })} placeholder="15" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Security notes, preferences honoured…" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
