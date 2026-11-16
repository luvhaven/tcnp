"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, CalendarDays, Plus, Trash2, UserPlus, X } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import ChooseProgramme from "@/components/den/ChooseProgramme"
import { initialsOf } from "@/components/den/DenTeam"
import { useDenProgrammeTeam } from "@/hooks/useDenProgrammeTeam"
import { DEN_PLAN_KEY } from "@/lib/den-plan"
import {
  DEN_MY_WORK_KEY,
  ATTENDANCE_LABEL,
  DEN_ROSTER_KEY,
  attendanceState,
  findShiftClashes,
  fromLocalInputValue,
  shiftGap,
  toLocalInputValue,
  type DenShift,
} from "@/lib/den-work"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Props = {
  selectedProgram: string // 'all' or a program id
  programName: string | null
  dens: any[]
  /** Head, sub-lead or platform admin. */
  canCoordinate: boolean
  currentUserId: string | null
}

type ShiftMember = { id: string; shift_id: string; user_id: string; checked_in_at?: string | null; checked_out_at?: string | null }
type ShiftWithMembers = DenShift & { members: ShiftMember[] }

const NO_LOCATION = "none"
const EMPTY_SHIFT = { title: "", starts: "", ends: "", nest_id: NO_LOCATION, officers_needed: "2", notes: "" }

/**
 * The shift roster for one programme. Each shift says how many officers it
 * needs, so a gap is visible the moment it exists — and an officer placed on
 * two shifts at the same time is flagged before the day.
 */
export default function DenRoster({ selectedProgram, programName, dens, canCoordinate, currentUserId }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const scoped = selectedProgram !== "all"
  const programId = scoped ? selectedProgram : null
  const team = useDenProgrammeTeam(programId)

  const [dialog, setDialog] = useState<{ editing: DenShift | null } | null>(null)
  const [form, setForm] = useState(EMPTY_SHIFT)
  const [adding, setAdding] = useState<Record<string, string>>({})

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DEN_ROSTER_KEY })
    queryClient.invalidateQueries({ queryKey: DEN_PLAN_KEY })
    queryClient.invalidateQueries({ queryKey: DEN_MY_WORK_KEY })
  }

  const shifts = useQuery({
    queryKey: [...DEN_ROSTER_KEY, programId],
    enabled: scoped,
    queryFn: async () => {
      const { data, error } = await db
        .from("den_shifts")
        .select("id, program_id, title, starts_at, ends_at, nest_id, officers_needed, notes, members:den_shift_members(*)")
        .eq("program_id", programId)
        .order("starts_at")
      if (error) throw error
      return (data ?? []) as ShiftWithMembers[]
    },
  })

  const saveShift = useMutation({
    mutationFn: async () => {
      const starts = fromLocalInputValue(form.starts)
      const ends = fromLocalInputValue(form.ends)
      if (!starts || !ends) throw new Error("Give the shift a start and an end time.")
      if (new Date(ends) <= new Date(starts)) throw new Error("The shift must end after it starts.")
      const values = {
        title: form.title.trim(),
        starts_at: starts,
        ends_at: ends,
        nest_id: form.nest_id === NO_LOCATION ? null : form.nest_id,
        officers_needed: Math.min(100, Math.max(1, parseInt(form.officers_needed, 10) || 1)),
        notes: form.notes.trim() || null,
      }
      if (dialog?.editing) {
        const { data, error } = await db.from("den_shifts").update(values).eq("id", dialog.editing.id).select("id")
        if (error) throw error
        if (!data?.length) throw new Error("You are not allowed to change this shift.")
      } else {
        const { error } = await db.from("den_shifts").insert([{ ...values, program_id: programId, created_by: currentUserId }])
        if (error) throw error
      }
    },
    onSuccess: () => { refresh(); setDialog(null); toast.success("Shift saved") },
    onError: (error) => notifyError(error, "Could not save this shift"),
  })

  const deleteShift = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.from("den_shifts").delete().eq("id", id).select("id")
      if (error) throw error
      if (!data?.length) throw new Error("You are not allowed to delete this shift.")
    },
    onSuccess: () => { refresh(); toast.success("Shift deleted") },
    onError: (error) => notifyError(error, "Could not delete this shift"),
  })

  const addMember = useMutation({
    mutationFn: async ({ shiftId, userId }: { shiftId: string; userId: string }) => {
      const { error } = await db.from("den_shift_members").insert([{ shift_id: shiftId, user_id: userId, assigned_by: currentUserId }])
      if (error) throw error
      return shiftId
    },
    onSuccess: (shiftId) => { refresh(); setAdding(current => ({ ...current, [shiftId]: "" })); toast.success("Officer added to the shift") },
    onError: (error) => notifyError(error, "Could not add this officer to the shift"),
  })

  const attend = useMutation({
    mutationFn: async ({ memberId, action }: { memberId: string; action: "in" | "out" | "clear" }) => {
      const { error } = await db.rpc("den_shift_attendance", { target_member: memberId, action })
      if (error) throw error
      return action
    },
    onSuccess: (action) => { refresh(); toast.success(action === "in" ? "Checked in" : action === "out" ? "Checked out" : "Attendance cleared") },
    onError: (error) => notifyError(error, "Could not update attendance"),
  })

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.from("den_shift_members").delete().eq("id", id).select("id")
      if (error) throw error
      if (!data?.length) throw new Error("You are not allowed to change this shift.")
    },
    onSuccess: () => { refresh(); toast.success("Officer taken off the shift") },
    onError: (error) => notifyError(error, "Could not take this officer off the shift"),
  })

  const openShift = (shift: DenShift | null) => {
    setForm(shift
      ? {
        title: shift.title, starts: toLocalInputValue(shift.starts_at), ends: toLocalInputValue(shift.ends_at),
        nest_id: shift.nest_id ?? NO_LOCATION, officers_needed: String(shift.officers_needed), notes: shift.notes ?? "",
      }
      : EMPTY_SHIFT)
    setDialog({ editing: shift })
  }

  const list = shifts.data ?? []
  const teamById = new Map((team.data ?? []).map(member => [member.user_id, member]))
  const clashes = findShiftClashes(list, list.flatMap(shift => shift.members))
  const clashing = new Set(clashes.flatMap(clash => clash.shift_ids.map(shiftId => `${shiftId}:${clash.user_id}`)))
  const gaps = list.filter(shift => shiftGap(shift, shift.members.length) > 0).length
  const locations = dens.filter(den => den.type === "den" && (!den.program_id || den.program_id === programId))

  if (!scoped) {
    return (
      <Card>
        <CardContent>
          <ChooseProgramme icon={CalendarDays} description="The roster is built one programme at a time." />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
              Roster
              {programName && <Badge variant="outline">{programName}</Badge>}
              {gaps > 0 && <Badge variant="destructive">{gaps} {gaps === 1 ? "shift" : "shifts"} short</Badge>}
              {clashes.length > 0 && <Badge variant="destructive">{clashes.length} double-booked</Badge>}
            </CardTitle>
            <CardDescription>
              {list.length === 0 ? "Who is on duty, where and when." : gaps === 0 && clashes.length === 0 ? "Every shift is covered." : "Fill the gaps before the day."}
            </CardDescription>
          </div>
          {canCoordinate && (
            <Button size="sm" className="shrink-0" onClick={() => openShift(null)}>
              <Plus aria-hidden="true" />
              Add shift
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {shifts.isLoading ? (
            <div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-40 rounded-xl" />)}</div>
          ) : shifts.isError ? (
            <ErrorState title="Could not load the roster" onRetry={() => shifts.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No shifts for this programme yet" description={canCoordinate ? "Add the first shift, then put officers on it." : undefined} className="py-8" />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map(shift => {
                const gap = shiftGap(shift, shift.members.length)
                const mine = shift.members.some(member => member.user_id === currentUserId)
                const assignedIds = new Set(shift.members.map(member => member.user_id))
                const available = (team.data ?? []).filter(member => !assignedIds.has(member.user_id))
                const location = dens.find(den => den.id === shift.nest_id)?.name
                return (
                  <section key={shift.id} className={cn("rounded-xl border p-3", mine && "border-primary/50 bg-primary/5")}>
                    <header className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{shift.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(shift.starts_at), "EEE d MMM, HH:mm")} to {format(new Date(shift.ends_at), "HH:mm")}
                          {location && ` · ${location}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {mine && <Badge>Your shift</Badge>}
                        {canCoordinate && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openShift(shift)}>Edit</Button>
                            <Button
                              aria-label={`Delete shift ${shift.title}`}
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={async () => { if (await confirm({ message: `Delete the shift "${shift.title}"?`, variant: "destructive" })) deleteShift.mutate(shift.id) }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </header>

                    <p className={cn("mt-2 flex items-center gap-1.5 text-xs font-medium", gap > 0 ? "text-destructive dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                      {gap > 0 && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                      {shift.members.length} of {shift.officers_needed} {shift.officers_needed === 1 ? "officer" : "officers"}
                      {gap > 0 ? ` · ${gap} more needed` : " · covered"}
                    </p>
                    {shift.notes && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{shift.notes}</p>}

                    <ul className="mt-3 flex flex-wrap gap-2">
                      {shift.members.map(member => {
                        const officer = teamById.get(member.user_id)
                        const clash = clashing.has(`${shift.id}:${member.user_id}`)
                        const name = member.user_id === currentUserId ? "You" : officer?.full_name ?? "A Den officer"
                        const attendance = attendanceState(shift, member)
                        const self = member.user_id === currentUserId
                        // Officers check themselves in; a coordinator can record it for anyone.
                        const canAttend = attendance !== "checked_out" && (self ? attendance === "open" || attendance === "checked_in" : canCoordinate)
                        return (
                          <li key={member.id} className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs", clash && "border-destructive text-destructive dark:border-red-400 dark:text-red-400")}>
                            <Avatar className="h-6 w-6">
                              {officer?.photo_url && <AvatarImage src={officer.photo_url} alt="" />}
                              <AvatarFallback className="text-[10px]">{initialsOf(officer?.full_name)}</AvatarFallback>
                            </Avatar>
                            <span>
                              {name}{clash && " · on another shift at this time"}
                              {attendance !== "upcoming" && (
                                <span className={cn(
                                  "ml-1",
                                  attendance === "checked_in" ? "font-medium text-emerald-600 dark:text-emerald-400"
                                    : attendance === "missed" ? "text-destructive dark:text-red-400" : "text-muted-foreground",
                                )}>
                                  · {ATTENDANCE_LABEL[attendance]}
                                </span>
                              )}
                            </span>
                            {canAttend && (
                              <button
                                type="button"
                                disabled={attend.isPending}
                                onClick={() => attend.mutate({ memberId: member.id, action: attendance === "checked_in" ? "out" : "in" })}
                                className="ml-1 rounded-full border px-2 py-1 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                              >
                                {attendance === "checked_in" ? "Check out" : self ? "Check in" : "Mark present"}
                              </button>
                            )}
                            {canCoordinate && (
                              <button
                                type="button"
                                aria-label={`Take ${name} off ${shift.title}`}
                                className="-mr-1 rounded-full p-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => removeMember.mutate(member.id)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </li>
                        )
                      })}
                      {shift.members.length === 0 && <li className="text-xs text-muted-foreground">Nobody on this shift yet.</li>}
                    </ul>

                    {canCoordinate && (
                      <form
                        className="mt-3 flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const userId = adding[shift.id]
                          if (userId && !addMember.isPending) addMember.mutate({ shiftId: shift.id, userId })
                        }}
                      >
                        <Select value={adding[shift.id] ?? ""} onValueChange={(value) => setAdding(current => ({ ...current, [shift.id]: value }))}>
                          <SelectTrigger className="h-9 min-w-0" aria-label={`Choose an officer for ${shift.title}`}>
                            <SelectValue placeholder={available.length ? "Choose an officer" : "No one else on this programme"} />
                          </SelectTrigger>
                          <SelectContent>
                            {available.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Add more officers to the programme from the Overview tab.</p>}
                            {available.map(member => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name ?? "Officer"}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button type="submit" size="sm" variant="outline" className="shrink-0" disabled={!adding[shift.id]} pending={addMember.isPending && addMember.variables?.shiftId === shift.id}>
                          <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />
                          Add
                        </Button>
                      </form>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open) setDialog(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.editing ? "Edit shift" : "Add a shift"}</DialogTitle>
            <DialogDescription>For {programName ?? "this programme"}. Times are in your device&apos;s time zone.</DialogDescription>
          </DialogHeader>
          <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (form.title.trim() && !saveShift.isPending) saveShift.mutate() }}>
            <div className="space-y-2">
              <Label htmlFor="den-shift-title">Shift *</Label>
              <Input id="den-shift-title" required maxLength={150} placeholder="e.g., Saturday evening service" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="den-shift-start">Starts *</Label>
                <Input id="den-shift-start" type="datetime-local" required value={form.starts} onChange={(event) => setForm({ ...form, starts: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-shift-end">Ends *</Label>
                <Input id="den-shift-end" type="datetime-local" required min={form.starts || undefined} value={form.ends} onChange={(event) => setForm({ ...form, ends: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="den-shift-location">Den location</Label>
                <Select value={form.nest_id} onValueChange={(value) => setForm({ ...form, nest_id: value })}>
                  <SelectTrigger id="den-shift-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LOCATION}>Not set</SelectItem>
                    {locations.map(den => <SelectItem key={den.id} value={den.id}>{den.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-shift-needed">Officers needed *</Label>
                <Input id="den-shift-needed" type="number" min="1" max="100" inputMode="numeric" required value={form.officers_needed} onChange={(event) => setForm({ ...form, officers_needed: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="den-shift-notes">Notes</Label>
              <Textarea id="den-shift-notes" rows={2} maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" pending={saveShift.isPending} disabled={!form.title.trim()}>{dialog?.editing ? "Save shift" : "Add shift"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
