"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
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
import { Armchair, Plus, Pencil, Trash2, CalendarDays, Landmark, ListOrdered, UserPlus, X, TriangleAlert } from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

type SeatRow = { label: string; seats: string[] }

/**
 * A seat occupant held in `seat_assignments` — the relational counterpart to the
 * free-text names inside `layout.rows[].seats`.
 *
 * The layout JSON defines the *shape* of the room (which rows exist, how many
 * seats in each). It also carried the occupant's name as a raw string, which
 * meant a minister already in the database was retyped for every session, with
 * no link back to their record and no way to catch the same person being seated
 * twice. Assignments below supersede that text where they exist; arrangements
 * created before this still render their original names.
 */
type SeatAssignment = {
  id: string
  arrangement_id: string
  row_label: string
  seat_label: string
  senior_minister_id: string | null
  papa_id: string | null
  occupant_name: string | null
  notes: string | null
}

/** Seats are identified within a row by their 1-based position. */
const seatKey = (rowLabel: string, index: number) => `${rowLabel}::${index + 1}`

type SeatArrangement = {
  id: string
  program_id: string
  theatre_id: string | null
  arrangement_date: string
  session_name: string
  session_order: number
  layout: { rows: SeatRow[] }
  notes: string | null
  programs?: { name: string } | null
  theatres?: { name: string } | null
}

type Props = {
  canEdit: boolean
  currentUserId?: string | null
}

/**
 * Text format for the rows editor — one row per line:
 *   "Row A: Prof, Duchess, , Papa Smith"
 * Label before the colon, seats comma-separated ("" = empty seat).
 */
function rowsToText(rows: SeatRow[]): string {
  return rows.map(r => `${r.label}: ${r.seats.join(", ")}`).join("\n")
}

function textToRows(text: string): SeatRow[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const colon = line.indexOf(":")
      if (colon === -1) return { label: `Row ${i + 1}`, seats: line.split(",").map(s => s.trim()) }
      return {
        label: line.slice(0, colon).trim() || `Row ${i + 1}`,
        seats: line.slice(colon + 1).split(",").map(s => s.trim()),
      }
    })
}

export default function SeatArrangements({ canEdit, currentUserId }: Props) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SeatArrangement | null>(null)
  const [filterProgram, setFilterProgram] = useState("all")
  const [seatTarget, setSeatTarget] = useState<
    { arrangementId: string; rowLabel: string; seatLabel: string; fallbackName: string } | null
  >(null)
  const [seatForm, setSeatForm] = useState({
    kind: "minister" as "minister" | "papa" | "other",
    ministerId: "",
    papaId: "",
    occupantName: "",
    notes: "",
  })
  const [filterDate, setFilterDate] = useState("")
  const [form, setForm] = useState({
    program_id: "",
    theatre_id: "",
    arrangement_date: new Date().toISOString().slice(0, 10),
    session_name: "",
    session_order: "1",
    rowsText: "",
    notes: "",
  })

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      return data ?? []
    },
  })

  const { data: theatres = [] } = useQuery({
    queryKey: ["theatres-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("theatres").select("id, name").order("name")
      return data ?? []
    },
  })

  const { data: assignments = [] } = useQuery({
    queryKey: ["seat-assignments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seat_assignments")
        .select("id, arrangement_id, row_label, seat_label, senior_minister_id, papa_id, occupant_name, notes")
      if (error) throw error
      return (data ?? []) as unknown as SeatAssignment[]
    },
  })

  const { data: ministers = [] } = useQuery({
    queryKey: ["senior-ministers-lite"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("senior_ministers").select("id, title, full_name, organization").order("full_name")
      return data ?? []
    },
  })

  const { data: papas = [] } = useQuery({
    queryKey: ["papas-lite-seating"],
    queryFn: async () => {
      const { data } = await supabase.from("papas").select("id, title, full_name").order("full_name")
      return data ?? []
    },
  })

  const { data: arrangements = [], isLoading } = useQuery({
    queryKey: ["seat-arrangements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seat_arrangements")
        .select("*, programs(name), theatres(name)")
        .order("arrangement_date", { ascending: false })
        .order("session_order", { ascending: true })
      if (error) throw error
      return (data ?? []).map((a: any) => ({
        ...a,
        layout: a.layout && Array.isArray(a.layout.rows) ? a.layout : { rows: [] },
      })) as SeatArrangement[]
    },
  })

  const filtered = useMemo(() => arrangements.filter(a => {
    if (filterProgram !== "all" && a.program_id !== filterProgram) return false
    if (filterDate && a.arrangement_date !== filterDate) return false
    return true
  }), [arrangements, filterProgram, filterDate])

  // Group by date, sessions ordered within each date
  const grouped = useMemo(() => {
    const map = new Map<string, SeatArrangement[]>()
    for (const a of filtered) {
      const list = map.get(a.arrangement_date) ?? []
      list.push(a)
      map.set(a.arrangement_date, list)
    }
    return Array.from(map.entries()).map(([date, list]) => ({
      date,
      sessions: list.sort((x, y) => x.session_order - y.session_order),
    }))
  }, [filtered])

  const ministerById = useMemo(
    () => new Map(ministers.map((m: any) => [m.id, m])),
    [ministers]
  )
  const papaById = useMemo(() => new Map(papas.map((p: any) => [p.id, p])), [papas])

  /** Assignments keyed by `arrangementId -> "Row::seatNumber"`. */
  const assignmentsBySeat = useMemo(() => {
    const map = new Map<string, SeatAssignment>()
    for (const a of assignments) map.set(`${a.arrangement_id}::${a.row_label}::${a.seat_label}`, a)
    return map
  }, [assignments])

  const displayName = (assignment: SeatAssignment): string => {
    if (assignment.senior_minister_id) {
      const m: any = ministerById.get(assignment.senior_minister_id)
      return m ? `${m.title ? `${m.title} ` : ""}${m.full_name}` : "Senior minister"
    }
    if (assignment.papa_id) {
      const pp: any = papaById.get(assignment.papa_id)
      return pp ? `${pp.title ? `${pp.title} ` : ""}${pp.full_name}` : "Papa"
    }
    return assignment.occupant_name || "Reserved"
  }

  /**
   * Someone seated in more than one seat of the same arrangement. The unique
   * constraint stops two people sharing a seat; nothing stops one person being
   * put in two, which is the clash a seating plan is meant to surface.
   */
  const doubleBooked = useMemo(() => {
    const seen = new Map<string, number>()
    for (const a of assignments) {
      const who = a.senior_minister_id ?? a.papa_id
      if (!who) continue
      const key = `${a.arrangement_id}::${who}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([key]) => key))
  }, [assignments])

  const isDoubleBooked = (a: SeatAssignment) => {
    const who = a.senior_minister_id ?? a.papa_id
    return !!who && doubleBooked.has(`${a.arrangement_id}::${who}`)
  }

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!seatTarget) throw new Error("No seat selected")
      const base = {
        arrangement_id: seatTarget.arrangementId,
        row_label: seatTarget.rowLabel,
        seat_label: seatTarget.seatLabel,
        senior_minister_id: null as string | null,
        papa_id: null as string | null,
        occupant_name: null as string | null,
        notes: seatForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      // The table enforces exactly one occupant reference
      // (num_nonnulls(senior_minister_id, papa_id, occupant_name) = 1).
      if (seatForm.kind === "minister") {
        if (!seatForm.ministerId) throw new Error("Choose a senior minister")
        base.senior_minister_id = seatForm.ministerId
      } else if (seatForm.kind === "papa") {
        if (!seatForm.papaId) throw new Error("Choose a Papa")
        base.papa_id = seatForm.papaId
      } else {
        if (!seatForm.occupantName.trim()) throw new Error("Enter a name for this seat")
        base.occupant_name = seatForm.occupantName.trim()
      }

      const existing = assignmentsBySeat.get(
        `${seatTarget.arrangementId}::${seatTarget.rowLabel}::${seatTarget.seatLabel}`
      )
      if (existing) {
        const { error } = await (supabase as any).from("seat_assignments").update(base).eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from("seat_assignments")
          .insert({ ...base, created_by: currentUserId ?? null })
        if (error) {
          // seat_assignments_unique_seat — someone claimed this seat first.
          if ((error as any).code === "23505") {
            throw new Error("That seat was just taken. Reload to see who is in it.")
          }
          throw error
        }
      }
    },
    onSuccess: () => {
      toast.success("Seat assigned")
      setSeatTarget(null)
      queryClient.invalidateQueries({ queryKey: ["seat-assignments"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to assign seat"),
  })

  const unassignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("seat_assignments").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Seat cleared")
      setSeatTarget(null)
      queryClient.invalidateQueries({ queryKey: ["seat-assignments"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to clear seat"),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.program_id) throw new Error("Program is required")
      if (!form.session_name.trim()) throw new Error("Session name is required")
      const payload = {
        program_id: form.program_id,
        theatre_id: form.theatre_id || null,
        arrangement_date: form.arrangement_date,
        session_name: form.session_name.trim(),
        session_order: Math.max(1, parseInt(form.session_order, 10) || 1),
        layout: { rows: textToRows(form.rowsText) },
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from("seat_arrangements").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("seat_arrangements").insert({ ...payload, created_by: currentUserId ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Arrangement updated" : "Arrangement created")
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["seat-arrangements"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seat_arrangements").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Arrangement removed")
      queryClient.invalidateQueries({ queryKey: ["seat-arrangements"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  })

  const openSeat = (
    arrangementId: string,
    rowLabel: string,
    seatLabel: string,
    fallbackName: string,
    assignment?: SeatAssignment
  ) => {
    setSeatTarget({ arrangementId, rowLabel, seatLabel, fallbackName })
    if (assignment) {
      setSeatForm({
        kind: assignment.senior_minister_id ? "minister" : assignment.papa_id ? "papa" : "other",
        ministerId: assignment.senior_minister_id ?? "",
        papaId: assignment.papa_id ?? "",
        occupantName: assignment.occupant_name ?? "",
        notes: assignment.notes ?? "",
      })
    } else {
      // Carry the layout's existing free text across as a starting point, so
      // converting an old arrangement to linked people is not retyping.
      setSeatForm({
        kind: fallbackName ? "other" : "minister",
        ministerId: "",
        papaId: "",
        occupantName: fallbackName,
        notes: "",
      })
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      program_id: filterProgram !== "all" ? filterProgram : "",
      theatre_id: "",
      arrangement_date: filterDate || new Date().toISOString().slice(0, 10),
      session_name: "",
      session_order: "1",
      rowsText: "Row A: , , , \nRow B: , , , ",
      notes: "",
    })
    setDialogOpen(true)
  }

  const openEdit = (a: SeatArrangement) => {
    setEditing(a)
    setForm({
      program_id: a.program_id,
      theatre_id: a.theatre_id ?? "",
      arrangement_date: a.arrangement_date,
      session_name: a.session_name,
      session_order: String(a.session_order),
      rowsText: rowsToText(a.layout.rows),
      notes: a.notes ?? "",
    })
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Armchair className="h-6 w-6 text-primary" /> Seat Arrangements
          </h2>
          <p className="text-sm text-muted-foreground">
            Seating of the day per program, ordered by session.
            {canEdit ? " Select a seat to assign who sits in it." : ""}
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" /> New Arrangement
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterProgram} onValueChange={setFilterProgram}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Program" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="h-9 w-[160px]" />
        {filterDate && (
          <Button variant="ghost" size="sm" onClick={() => setFilterDate("")}>Clear date</Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="empty-state rounded-xl border">
          <Armchair className="h-10 w-10" />
          <p className="font-medium">No seat arrangements</p>
          <p className="text-sm text-muted-foreground">
            {canEdit ? "Create the seating of the day for a program session." : "Arrangements appear here once Victor publishes them."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.date}>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-4 w-4" /> {group.date}
              </p>
              <div className="space-y-4">
                <AnimatePresence>
                  {group.sessions.map(a => (
                    <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <Card className="card-hover overflow-hidden">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                                <Badge variant="secondary" className="gap-1 text-[10px] uppercase">
                                  <ListOrdered className="h-3 w-3" /> Session {a.session_order}
                                </Badge>
                                <span>{a.session_name}</span>
                              </CardTitle>
                              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                                {a.programs?.name && <Badge variant="outline" className="text-[10px]">{a.programs.name}</Badge>}
                                {a.theatres?.name && (
                                  <span className="inline-flex items-center gap-1 text-xs">
                                    <Landmark className="h-3 w-3" /> {a.theatres.name}
                                  </span>
                                )}
                              </CardDescription>
                            </div>
                            {canEdit && (
                              <div className="flex shrink-0 gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                                  onClick={async () => {
                                    const ok = await confirm({ title: "Delete arrangement?", message: `${a.session_name} on ${a.arrangement_date} will be removed.` })
                                    if (ok) deleteMutation.mutate(a.id)
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Stage marker */}
                          <div className="mx-auto w-2/3 rounded-t-3xl border border-b-0 border-dashed border-primary/40 py-1 text-center text-[10px] uppercase tracking-[0.3em] text-primary/70">
                            Mount Sinai (Stage)
                          </div>
                          {/* Seat map */}
                          <div className="space-y-2 overflow-x-auto pb-2">
                            {a.layout.rows.length === 0 ? (
                              <p className="text-center text-sm text-muted-foreground">No seat map defined.</p>
                            ) : (
                              a.layout.rows.map((row, ri) => (
                                <div key={ri} className="flex items-center gap-2">
                                  <span className="w-14 shrink-0 text-right text-xs font-semibold text-muted-foreground">{row.label}</span>
                                  <div className="flex gap-1.5">
                                    {row.seats.map((seat, si) => {
                                      const seatLabel = String(si + 1)
                                      const assignment = assignmentsBySeat.get(`${a.id}::${row.label}::${seatLabel}`)
                                      // An assignment supersedes the name typed
                                      // into the layout JSON; arrangements made
                                      // before seat assignments existed still
                                      // show the text they were created with.
                                      const occupant = assignment ? displayName(assignment) : seat
                                      const clash = assignment ? isDoubleBooked(assignment) : false
                                      const label = occupant
                                        ? `${row.label} seat ${seatLabel} — ${occupant}${clash ? " (seated more than once)" : ""}`
                                        : `${row.label} seat ${seatLabel} — empty`
                                      const seatClasses = cn(
                                        "flex h-9 min-w-[64px] max-w-[130px] items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium",
                                        clash
                                          ? "border-destructive/60 bg-destructive/10 text-foreground"
                                          : occupant
                                            ? "border-primary/40 bg-primary/10 text-foreground"
                                            : "border-dashed border-muted-foreground/30 text-muted-foreground/50"
                                      )

                                      if (!canEdit) {
                                        return (
                                          <div key={si} title={label} aria-label={label} className={seatClasses}>
                                            {clash && <TriangleAlert className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />}
                                            <span className="truncate">{occupant || "—"}</span>
                                          </div>
                                        )
                                      }

                                      return (
                                        <button
                                          key={si}
                                          type="button"
                                          title={label}
                                          aria-label={`${label}. Assign occupant.`}
                                          onClick={() => openSeat(a.id, row.label, seatLabel, seat, assignment)}
                                          className={cn(seatClasses, "transition-colors hover:border-primary hover:bg-primary/20")}
                                        >
                                          {clash && <TriangleAlert className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />}
                                          <span className="truncate">{occupant || "—"}</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                          {(() => {
                            const total = a.layout.rows.reduce((sum, r) => sum + r.seats.length, 0)
                            const taken = a.layout.rows.reduce(
                              (sum, r) => sum + r.seats.filter((seat, si) =>
                                assignmentsBySeat.has(`${a.id}::${r.label}::${si + 1}`) || seat
                              ).length,
                              0
                            )
                            const clashes = assignments.filter(x => x.arrangement_id === a.id && isDoubleBooked(x)).length
                            if (total === 0) return null
                            return (
                              <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
                                <span className="tabular-nums">{taken} of {total} seats filled</span>
                                {clashes > 0 && (
                                  <Badge variant="destructive" className="gap-1">
                                    <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                                    {clashes} seated twice
                                  </Badge>
                                )}
                              </div>
                            )
                          })()}
                          {a.notes && <p className="border-t pt-2 text-xs text-muted-foreground">{a.notes}</p>}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Seat assignment dialog */}
      <Dialog open={!!seatTarget} onOpenChange={(open) => !open && setSeatTarget(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {seatTarget ? `${seatTarget.rowLabel} · seat ${seatTarget.seatLabel}` : "Assign seat"}
            </DialogTitle>
            <DialogDescription>
              Pick someone already in the system so the seat links to their record, or type a name for a guest who has none.
            </DialogDescription>
          </DialogHeader>

          {seatTarget && (() => {
            const existing = assignmentsBySeat.get(
              `${seatTarget.arrangementId}::${seatTarget.rowLabel}::${seatTarget.seatLabel}`
            )
            return (
              <form onSubmit={(e) => { e.preventDefault(); assignMutation.mutate() }} className="mt-2 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="seat-occupant-kind">Occupant</Label>
                  <Select
                    value={seatForm.kind}
                    onValueChange={(v) => setSeatForm({ ...seatForm, kind: v as typeof seatForm.kind })}
                  >
                    <SelectTrigger id="seat-occupant-kind"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minister">Senior minister</SelectItem>
                      <SelectItem value="papa">Papa</SelectItem>
                      <SelectItem value="other">Other guest (name only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {seatForm.kind === "minister" && (
                  <div className="space-y-2">
                    <Label htmlFor="seat-minister">Senior minister</Label>
                    <Select value={seatForm.ministerId} onValueChange={(v) => setSeatForm({ ...seatForm, ministerId: v })}>
                      <SelectTrigger id="seat-minister"><SelectValue placeholder="Search the registry…" /></SelectTrigger>
                      <SelectContent>
                        {ministers.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.title ? `${m.title} ` : ""}{m.full_name}{m.organization ? ` · ${m.organization}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {ministers.length === 0 && (
                      <p className="text-xs text-muted-foreground">No senior ministers in the registry yet.</p>
                    )}
                  </div>
                )}

                {seatForm.kind === "papa" && (
                  <div className="space-y-2">
                    <Label htmlFor="seat-papa">Papa</Label>
                    <Select value={seatForm.papaId} onValueChange={(v) => setSeatForm({ ...seatForm, papaId: v })}>
                      <SelectTrigger id="seat-papa"><SelectValue placeholder="Choose a Papa…" /></SelectTrigger>
                      <SelectContent>
                        {papas.map((pp: any) => (
                          <SelectItem key={pp.id} value={pp.id}>
                            {pp.title ? `${pp.title} ` : ""}{pp.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {seatForm.kind === "other" && (
                  <div className="space-y-2">
                    <Label htmlFor="seat-name">Name</Label>
                    <Input
                      id="seat-name"
                      value={seatForm.occupantName}
                      onChange={(e) => setSeatForm({ ...seatForm, occupantName: e.target.value })}
                      placeholder="Name as it should read on the plan"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="seat-notes">Notes</Label>
                  <Input
                    id="seat-notes"
                    value={seatForm.notes}
                    onChange={(e) => setSeatForm({ ...seatForm, notes: e.target.value })}
                    placeholder="Aisle seat, needs assistance…"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setSeatTarget(null)}>
                    Cancel
                  </Button>
                  {existing && (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-1 text-destructive"
                      disabled={unassignMutation.isPending}
                      onClick={() => unassignMutation.mutate(existing.id)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" /> Clear seat
                    </Button>
                  )}
                  <Button type="submit" className="flex-1 gap-1" disabled={assignMutation.isPending}>
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {assignMutation.isPending ? "Saving…" : existing ? "Update" : "Assign"}
                  </Button>
                </div>
              </form>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Arrangement" : "New Seat Arrangement"}</DialogTitle>
            <DialogDescription>
              One line per row — row label before the colon, seats comma-separated. Leave a seat blank to keep it empty.
              Names typed here are plain text; select a seat on the plan afterwards to link it to a senior minister or Papa.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }} className="mt-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Program *</Label>
                <Select value={form.program_id} onValueChange={(v) => setForm({ ...form, program_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Theatre</Label>
                <Select value={form.theatre_id || "none"} onValueChange={(v) => setForm({ ...form, theatre_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {theatres.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.arrangement_date} onChange={(e) => setForm({ ...form, arrangement_date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Session name *</Label>
                <Input value={form.session_name} onChange={(e) => setForm({ ...form, session_name: e.target.value })} placeholder="Morning Session" required />
              </div>
              <div className="space-y-2">
                <Label>Order *</Label>
                <Input type="number" min="1" value={form.session_order} onChange={(e) => setForm({ ...form, session_order: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Seat rows *</Label>
              <Textarea
                rows={6}
                value={form.rowsText}
                onChange={(e) => setForm({ ...form, rowsText: e.target.value })}
                placeholder={"Row A: Prof, Duchess, Papa Smith\nRow B: Pastor A, , Pastor B"}
                className="font-mono text-xs"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Protocol notes for Deltas at this session…" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
