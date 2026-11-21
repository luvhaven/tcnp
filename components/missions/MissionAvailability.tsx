"use client"

import { useId, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { format } from "date-fns"
import { notifyError, UserFacingError } from '@/lib/notify'
import { bulkAssignToasts } from "@/lib/chat-room-restore"
import { createClient } from "@/lib/supabase/client"
import { isMissionAudience, MISSION_AUDIENCES, type MissionAudience } from "@/lib/mission-audiences"
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
  audience: string | null
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

/**
 * Optional control over the dialog, so a page can open it from somewhere other
 * than the built-in trigger (for example a phone overflow menu) while keeping
 * one dialog per program. `triggerClassName` lets that page hide the trigger
 * at sizes where the menu takes over.
 */
type DialogControlProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerClassName?: string
}

function useDialogState(open: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const value = isControlled ? open : internalOpen
  const setValue = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }
  return [value, setValue] as const
}

/** Males / Females requests filter on users.gender, so officers without one are skipped. */
export function isGenderAudience(audience: string): boolean {
  return audience === "male" || audience === "female"
}

/**
 * How many active officers get_mission_audience_gaps reports with no gender.
 * Accepts the bare count or a row (or one-row set) carrying it; anything
 * else counts as none, so an unexpected reply never blocks sending.
 */
export function parseAudienceGapCount(data: unknown): number {
  const row = Array.isArray(data) ? data[0] : data
  const value = typeof row === "object" && row !== null
    ? (row as Record<string, unknown>).no_gender ?? (row as Record<string, unknown>).missing_gender ?? (row as Record<string, unknown>).count
    : row
  const count = typeof value === "string" ? Number(value) : value
  return typeof count === "number" && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

// A datetime-local input takes local wall-clock time. Building this from
// toISOString() gave a UTC time, so the default was off by the officer's
// UTC offset (an hour in Lagos).
function defaultDeadline() {
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

/** Admin: broadcast an availability request for a program */
export function RequestAvailabilityButton({
  programId, programName, open: openProp, onOpenChange, triggerClassName,
}: { programId: string; programName: string } & DialogControlProps) {
  const [open, setOpen] = useDialogState(openProp, onOpenChange)
  const [sending, setSending] = useState(false)
  const [audience, setAudience] = useState<MissionAudience>("all")
  const [includeUnsetGender, setIncludeUnsetGender] = useState(false)
  const audienceId = useId()
  const includeUnsetId = useId()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => ({ message: "", deadline: defaultDeadline() }))

  // A Males / Females request only reaches officers whose gender is set.
  // Ask how many active officers have none, so the sender can include them.
  // If the database cannot answer (function not deployed yet), say nothing.
  const genderAudience = isGenderAudience(audience)
  const { data: unsetGenderCount = 0 } = useQuery({
    queryKey: ["mission-audience-gaps", programId, audience],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_mission_audience_gaps", {
        program: programId,
        audience,
      })
      if (error) throw error
      return parseAudienceGapCount(data)
    },
    enabled: open && genderAudience,
    retry: false,
    staleTime: 60_000,
  })
  const showUnsetGender = genderAudience && unsetGenderCount > 0

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
          audience,
          include_unset_gender: showUnsetGender && includeUnsetGender,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new UserFacingError(data.error || "Failed to send")
      toast.success(`Mission request broadcast to ${data.recipients} officers 🎖️`)
      setOpen(false)
      setAudience("all")
      setIncludeUnsetGender(false)
      queryClient.invalidateQueries({ queryKey: ["mission-requests"] })
      queryClient.invalidateQueries({ queryKey: ["my-mission-requests"] })
    } catch (err: any) {
      notifyError(err, "Failed to send mission request")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("h-9 gap-1 border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950", triggerClassName)}
        onClick={() => setOpen(true)}
        aria-label={`Request availability for ${programName}`}
      >
        <Megaphone className="h-4 w-4" aria-hidden="true" /> <span className="hidden lg:inline">Request Availability</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-orange-500" /> Mission Request
            </DialogTitle>
            <DialogDescription>
              Ask the selected officers to confirm their availability for <strong>{programName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={audienceId}>Send to</Label>
              <Select value={audience} onValueChange={value => { if (isMissionAudience(value)) setAudience(value) }} disabled={sending}>
                <SelectTrigger id={audienceId}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MISSION_AUDIENCES.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showUnsetGender && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <p>
                    {unsetGenderCount === 1 ? "1 active officer has" : `${unsetGenderCount} active officers have`} no gender
                    on their profile and will not be asked unless you include them.
                  </p>
                  <label htmlFor={includeUnsetId} className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 font-medium sm:min-h-0">
                    <input
                      id={includeUnsetId}
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={includeUnsetGender}
                      onChange={e => setIncludeUnsetGender(e.target.checked)}
                      disabled={sending}
                    />
                    Include officers with no gender set
                  </label>
                </div>
              )}
            </div>
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
/** `canAssign` (platform administrators) enables bulk-assigning confirmed officers. */
export function AvailabilityRosterButton({
  programId, programName, canAssign = false, open: openProp, onOpenChange, triggerClassName,
}: { programId: string; programName: string; canAssign?: boolean } & DialogControlProps) {
  const [open, setOpen] = useDialogState(openProp, onOpenChange)
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

  const {
    data: assignedUserIds = [],
    isLoading: isLoadingAssignments,
    isError: assignmentsFailed,
  } = useQuery({
    queryKey: ["program-assignments", programId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("current_title_assignments")
        .select("user_id")
        .eq("program_id", programId)
        .eq("is_active", true)
      if (error) throw error
      return (data ?? []).map((assignment: { user_id: string }) => assignment.user_id)
    },
    enabled: open,
    refetchInterval: open ? 15000 : false,
  })
  const assignedUserIdSet = useMemo(() => new Set(assignedUserIds), [assignedUserIds])

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

  // Ask officers a still-open request missed: anyone who now matches its
  // audience (for example an officer who set their gender after it was sent)
  // and, for Males / Females, optionally officers with no gender set.
  const [addingRecipients, setAddingRecipients] = useState(false)
  const [addUnsetGender, setAddUnsetGender] = useState(false)
  const addUnsetId = useId()
  const requestStillOpen = Boolean(
    latestRequest && latestRequest.status === "open" && latestRequest.audience && new Date(latestRequest.deadline).getTime() > Date.now()
  )
  const addRecipients = async () => {
    if (!latestRequest) return
    setAddingRecipients(true)
    try {
      const { data, error } = await (supabase as any).rpc("add_mission_request_recipients", {
        target_request_id: latestRequest.id,
        include_unset_gender: isGenderAudience(latestRequest.audience ?? "") && addUnsetGender,
      })
      if (error) throw error
      const added = typeof data === "number" ? data : 0
      if (added > 0) toast.success(`Asked ${added} more officer${added === 1 ? "" : "s"}`)
      else toast.info("Everyone this request should reach has already been asked.")
      setAddUnsetGender(false)
    } catch (err: any) {
      notifyError(err, "Could not ask more officers")
    } finally {
      setAddingRecipients(false)
    }
  }

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
      if (!res.ok) throw new UserFacingError(data.error || "Assignment failed")
      const confirmedAssignedIds = [...(data.assigned_ids ?? []), ...(data.already_assigned_ids ?? [])]
      if (confirmedAssignedIds.length > 0) {
        queryClient.setQueryData<string[]>(["program-assignments", programId], previous =>
          Array.from(new Set([...(previous ?? []), ...confirmedAssignedIds]))
        )
      }
      // Officers already on the programme are told so, and are put back in the
      // programme chat if an admin had removed them from it.
      for (const notice of bulkAssignToasts(data, programName)) toast[notice.kind](notice.message)
      if (data.inactive_count > 0) {
        toast.warning(`${data.inactive_count} deactivated officer${data.inactive_count === 1 ? " was" : "s were"} skipped. Reactivate them first.`)
      }
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} officer${data.failed_count === 1 ? " was" : "s were"} not assigned. You can retry the failed assignments.`)
      }
      setSelected(Array.isArray(data.failed_ids) ? data.failed_ids : [])
      queryClient.invalidateQueries({ queryKey: ["officers"] })
      queryClient.invalidateQueries({ queryKey: ["program-assignments", programId] })
      queryClient.invalidateQueries({ queryKey: ["mission-responses", latestRequest?.id] })
    } catch (err: any) {
      notifyError(err, "Assignment failed")
    } finally {
      setAssigning(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("h-9 gap-1", triggerClassName)}
        onClick={() => setOpen(true)}
        aria-label={`Availability roster for ${programName}`}
      >
        <Users className="h-4 w-4" aria-hidden="true" /> <span className="hidden lg:inline">Roster</span>
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
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Clock className="h-3 w-3" /> closes {new Date(latestRequest.deadline).toLocaleString()}
                  </Badge>
                </span>
              ) : (
                "No mission request has been broadcast for this program yet."
              )}
            </DialogDescription>
          </DialogHeader>

          {latestRequest && requestStillOpen && (
            <div className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-muted-foreground">Officers who joined or updated their profile since this was sent can be asked too.</p>
                {isGenderAudience(latestRequest.audience ?? "") && (
                  <label htmlFor={addUnsetId} className="flex min-h-[44px] cursor-pointer items-center gap-2 sm:min-h-0">
                    <input
                      id={addUnsetId}
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={addUnsetGender}
                      onChange={e => setAddUnsetGender(e.target.checked)}
                      disabled={addingRecipients}
                    />
                    Include officers with no gender set
                  </label>
                )}
              </div>
              <Button size="sm" variant="outline" className="h-11 shrink-0 gap-1.5 sm:h-9" onClick={addRecipients} disabled={addingRecipients}>
                {addingRecipients ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Megaphone className="h-4 w-4" aria-hidden="true" />}
                Ask officers who were missed
              </Button>
            </div>
          )}

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
                  {filtered.map(r => {
                    const alreadyAssigned = assignedUserIdSet.has(r.user_id)
                    const canSelect = r.response === "yes" && !alreadyAssigned && !isLoadingAssignments && !assignmentsFailed
                    return (
                      <label
                      key={r.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                        canSelect && "cursor-pointer",
                        selected.includes(r.user_id) ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                        r.response === "no" && "opacity-60"
                      )}
                    >
                      {canSelect && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-orange-500"
                          checked={selected.includes(r.user_id)}
                          onChange={(e) => setSelected(prev => e.target.checked ? [...prev, r.user_id] : prev.filter(id => id !== r.user_id))}
                        />
                      )}
                      {r.response === "yes" && alreadyAssigned && (
                        <Badge variant="outline" className="shrink-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">Already assigned</Badge>
                      )}
                      {r.response === "yes" && !alreadyAssigned && isLoadingAssignments && (
                        <span className="shrink-0 text-xs text-muted-foreground">Checking assignment…</span>
                      )}
                      {r.response === "yes" && !alreadyAssigned && assignmentsFailed && (
                        <span className="shrink-0 text-xs text-destructive">Assignment check failed</span>
                      )}
                      <Avatar className="h-9 w-9">
                        {r.users?.photo_url ? <AvatarImage src={r.users.photo_url} /> : <AvatarFallback className="text-xs">{initials(r.users?.full_name)}</AvatarFallback>}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.users?.full_name ?? r.users?.email ?? "Officer"}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {r.users?.role && <Badge variant="secondary" className="text-[11px] uppercase">{r.users.role.replace(/_/g, " ")}</Badge>}
                          {r.users?.team && <Badge variant="outline" className="text-[11px] uppercase text-primary border-primary/40">{r.users.team}</Badge>}
                        </div>
                        {r.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">“{r.note}”</p>}
                      </div>
                      <Badge className={cn("border-0 text-xs", r.response === "yes" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400")}>
                        {r.response === "yes" ? "Available" : "Unavailable"}
                      </Badge>
                      </label>
                    )
                  })}
                </div>
              )}

              {/* Bulk assign action */}
              {canAssign && selected.length > 0 && (
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
          .select("*, mission_request_recipients(user_id)")
          .eq("status", "open")
          .gt("deadline", nowIso)
          .order("deadline", { ascending: true }),
        supabase.from("mission_responses").select("request_id").eq("user_id", currentUserId),
      ])
      if (error) throw error
      const answered = new Set((myResponses ?? []).map((r: any) => r.request_id))
      return (requests ?? []).filter(r =>
        !answered.has(r.id) && (r.audience === null || r.mission_request_recipients.length > 0)
      )
    },
    enabled: !!currentUserId,
    refetchInterval: 60000,
  })

  const respondMutation = useMutation({
    mutationFn: async ({ request, response, note }: { request: MissionRequest; response: "yes" | "no"; note?: string }) => {
      if (!currentUserId) throw new UserFacingError("Not signed in")
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
    onError: (err: any) => notifyError(err, "Failed to record response"),
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
