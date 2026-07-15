"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Megaphone, Users, Loader2, Search, CheckCircle2, XCircle, CircleDashed, UserCheck, Clock,
} from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

type MissionRequest = {
  id: string
  program_id: string
  title: string
  message: string | null
  deadline: string
  status: string
  created_at: string
}

type RosterResponse = {
  id: string
  user_id: string
  response: "yes" | "no"
  note: string | null
  responded_at: string
  users?: {
    full_name: string | null
    email: string | null
    role: string | null
    oscar: string | null
    team: string | null
    photo_url: string | null
  } | null
}

function initials(name?: string | null) {
  if (!name) return "??"
  const parts = name.trim().split(" ")
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
}

/** Admin: broadcast an availability request for a program */
export function RequestAvailabilityButton({ programId, programName }: { programId: string; programName: string }) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const queryClient = useQueryClient()
  const defaultDeadline = () => {
    const d = new Date(Date.now() + 48 * 60 * 60 * 1000)
    d.setMinutes(0, 0, 0)
    return d.toISOString().slice(0, 16)
  }
  const [form, setForm] = useState({ message: "", deadline: defaultDeadline() })

  const send = async () => {
    setSending(true)
    try {
      const res = await fetch("/api/missions/request-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: programId,
          message: form.message || null,
          deadline: new Date(form.deadline).toISOString(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send")
      toast.success(`Mission request broadcast to ${data.recipients} officers 🎖️`)
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["mission-requests"] })
    } catch (err: any) {
      toast.error(err.message || "Failed to send mission request")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1 border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950" onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4" /> <span className="hidden lg:inline">Request Availability</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-orange-500" /> Mission Request
            </DialogTitle>
            <DialogDescription>
              Every officer receives a high-priority request to confirm availability for <strong>{programName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Message (optional)</Label>
              <Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Brief the team on dates, dress code, reporting time…" />
            </div>
            <div className="space-y-2">
              <Label>Response deadline *</Label>
              <Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} required />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button className="flex-1 gap-2" onClick={send} disabled={sending || !form.deadline}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                {sending ? "Broadcasting…" : "Broadcast"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Admin: live roster of responses with filtering and bulk program assignment */
export function AvailabilityRosterButton({ programId, programName }: { programId: string; programName: string }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<"yes" | "no" | "all">("yes")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const queryClient = useQueryClient()

  const { data: requests = [] } = useQuery({
    queryKey: ["mission-requests", programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_requests")
        .select("*")
        .eq("program_id", programId)
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as MissionRequest[]
    },
    enabled: open,
  })

  const latestRequest = requests[0] ?? null

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ["mission-responses", latestRequest?.id],
    queryFn: async () => {
      if (!latestRequest) return []
      const { data, error } = await supabase
        .from("mission_responses")
        .select("*, users:user_id(full_name, email, role, oscar, team, photo_url)")
        .eq("request_id", latestRequest.id)
        .order("responded_at", { ascending: true })
      if (error) throw error
      return (data ?? []) as RosterResponse[]
    },
    enabled: open && !!latestRequest,
    refetchInterval: open ? 15000 : false,
  })

  const filtered = useMemo(() => responses.filter(r => {
    if (filter !== "all" && r.response !== filter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (r.users?.full_name ?? "").toLowerCase().includes(q) ||
      (r.users?.role ?? "").toLowerCase().includes(q) ||
      (r.users?.oscar ?? "").toLowerCase().includes(q) ||
      (r.users?.team ?? "").toLowerCase().includes(q)
    )
  }), [responses, filter, search])

  const yesCount = responses.filter(r => r.response === "yes").length
  const noCount = responses.filter(r => r.response === "no").length

  const assignSelected = async () => {
    if (selected.length === 0) return
    setAssigning(true)
    try {
      const res = await fetch("/api/admin/bulk-assign-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officer_ids: selected, program_id: programId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Assignment failed")
      toast.success(`${selected.length} officer${selected.length > 1 ? "s" : ""} assigned to ${programName}`)
      setSelected([])
      queryClient.invalidateQueries({ queryKey: ["officers"] })
    } catch (err: any) {
      toast.error(err.message || "Assignment failed")
    } finally {
      setAssigning(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" /> <span className="hidden lg:inline">Roster</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Availability Roster — {programName}
            </DialogTitle>
            <DialogDescription>
              {latestRequest ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{latestRequest.title}</span>
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Clock className="h-3 w-3" /> closes {new Date(latestRequest.deadline).toLocaleString()}
                  </Badge>
                </span>
              ) : (
                "No mission request has been broadcast for this program yet."
              )}
            </DialogDescription>
          </DialogHeader>

          {latestRequest && (
            <div className="space-y-4">
              {/* Stats + filters */}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setFilter("yes")} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", filter === "yes" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "hover:bg-muted")}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Available ({yesCount})
                </button>
                <button onClick={() => setFilter("no")} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", filter === "no" ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400" : "hover:bg-muted")}>
                  <XCircle className="h-3.5 w-3.5" /> Unavailable ({noCount})
                </button>
                <button onClick={() => setFilter("all")} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", filter === "all" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                  <CircleDashed className="h-3.5 w-3.5" /> All ({responses.length})
                </button>
                <div className="relative ml-auto">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, unit, team…" className="h-8 w-52 pl-8 text-xs" />
                </div>
              </div>

              {/* Roster list */}
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {responses.length === 0 ? "No responses yet — the roster fills in live as officers respond." : "No responses match this filter."}
                </p>
              ) : (
                <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                  {filtered.map(r => (
                    <label
                      key={r.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors",
                        selected.includes(r.user_id) ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                        r.response === "no" && "opacity-60"
                      )}
                    >
                      {r.response === "yes" && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-orange-500"
                          checked={selected.includes(r.user_id)}
                          onChange={(e) => setSelected(prev => e.target.checked ? [...prev, r.user_id] : prev.filter(id => id !== r.user_id))}
                        />
                      )}
                      <Avatar className="h-9 w-9">
                        {r.users?.photo_url ? <AvatarImage src={r.users.photo_url} /> : <AvatarFallback className="text-xs">{initials(r.users?.full_name)}</AvatarFallback>}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.users?.full_name ?? r.users?.email ?? "Officer"}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {r.users?.role && <Badge variant="secondary" className="text-[9px] uppercase">{r.users.role.replace(/_/g, " ")}</Badge>}
                          {r.users?.team && <Badge variant="outline" className="text-[9px] uppercase text-primary border-primary/40">{r.users.team}</Badge>}
                        </div>
                        {r.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">“{r.note}”</p>}
                      </div>
                      <Badge className={cn("border-0 text-[10px]", r.response === "yes" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400")}>
                        {r.response === "yes" ? "Available" : "Unavailable"}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}

              {/* Bulk assign action */}
              {selected.length > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm font-medium">{selected.length} selected</p>
                  <Button size="sm" className="gap-1" onClick={assignSelected} disabled={assigning}>
                    {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                    Assign to {programName}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Officer-facing prompt: open mission requests awaiting my response */
export function MissionRequestPrompt({ currentUserId }: { currentUserId: string | null }) {
  const queryClient = useQueryClient()
  const [noteFor, setNoteFor] = useState<MissionRequest | null>(null)
  const [note, setNote] = useState("")
  const [pendingResponse, setPendingResponse] = useState<"yes" | "no">("yes")

  const { data: openRequests = [] } = useQuery({
    queryKey: ["my-mission-requests", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return []
      const nowIso = new Date().toISOString()
      const [{ data: requests, error }, { data: myResponses }] = await Promise.all([
        supabase
          .from("mission_requests")
          .select("*, programs(name)")
          .eq("status", "open")
          .gt("deadline", nowIso)
          .order("deadline", { ascending: true }),
        supabase.from("mission_responses").select("request_id").eq("user_id", currentUserId),
      ])
      if (error) throw error
      const answered = new Set((myResponses ?? []).map((r: any) => r.request_id))
      return ((requests ?? []) as (MissionRequest & { programs?: { name: string } | null })[])
        .filter(r => !answered.has(r.id))
    },
    enabled: !!currentUserId,
    refetchInterval: 60000,
  })

  const respondMutation = useMutation({
    mutationFn: async ({ request, response, note }: { request: MissionRequest; response: "yes" | "no"; note?: string }) => {
      if (!currentUserId) throw new Error("Not signed in")
      const { error } = await supabase.from("mission_responses").insert({
        request_id: request.id,
        user_id: currentUserId,
        response,
        note: note?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      toast.success(vars.response === "yes" ? "You're on the roster — thank you for serving! 🎖️" : "Response recorded. Thank you for the heads-up.")
      setNoteFor(null)
      setNote("")
      queryClient.invalidateQueries({ queryKey: ["my-mission-requests"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to record response"),
  })

  if (!currentUserId || openRequests.length === 0) return null

  return (
    <>
      <div className="space-y-3">
        {openRequests.map(req => (
          <div key={req.id} className="relative overflow-hidden rounded-2xl border border-orange-500/40 bg-gradient-to-r from-orange-500/10 via-transparent to-transparent p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  <Megaphone className="h-4 w-4 shrink-0 text-orange-500" />
                  {req.title}
                </p>
                {req.message && <p className="mt-1 text-sm text-muted-foreground">{req.message}</p>}
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Respond before {new Date(req.deadline).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-emerald-600 hover:bg-emerald-500"
                  onClick={() => { setPendingResponse("yes"); setNoteFor(req) }}
                >
                  <CheckCircle2 className="h-4 w-4" /> Yes, I&apos;ll be available to serve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-red-600 dark:text-red-400"
                  onClick={() => { setPendingResponse("no"); setNoteFor(req) }}
                >
                  <XCircle className="h-4 w-4" /> Not available
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Optional note + confirm */}
      <Dialog open={!!noteFor} onOpenChange={(open) => !open && setNoteFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pendingResponse === "yes" ? "Confirm availability" : "Confirm unavailability"}</DialogTitle>
            <DialogDescription>{noteFor?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={pendingResponse === "yes" ? "e.g. Available all days except Friday evening" : "e.g. Traveling for work that week"} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setNoteFor(null)}>Cancel</Button>
              <Button
                className={cn("flex-1", pendingResponse === "yes" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500")}
                disabled={respondMutation.isPending}
                onClick={() => noteFor && respondMutation.mutate({ request: noteFor, response: pendingResponse, note })}
              >
                {respondMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
