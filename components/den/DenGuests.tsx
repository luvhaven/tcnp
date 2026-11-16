"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, History, NotebookPen, Trash2, Users, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import ChooseProgramme from "@/components/den/ChooseProgramme"
import { initialsOf } from "@/components/den/DenTeam"
import {
  DEN_GUESTS_KEY,
  DEN_GUEST_NOTE_CATEGORIES,
  DEN_GUEST_NOTE_LABEL,
  DEN_PLAN_KEY,
  hasHospitalityProfile,
  isReturningGuest,
  type DenGuest,
  type DenGuestNoteCategory,
} from "@/lib/den-plan"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"

type Props = {
  selectedProgram: string // 'all' or a program id
  programName: string | null
  currentUserId: string | null
  /** Head or platform admin: may remove anyone's note. */
  canManage: boolean
}

type GuestNote = {
  id: string
  category: DenGuestNoteCategory
  note: string
  program_id: string | null
  created_by: string | null
  created_at: string
  author: { full_name: string | null } | null
  program: { name: string } | null
}

type EarlierRecord = {
  papa_id: string
  program_name: string | null
  start_date: string | null
  note_category: string | null
  note: string | null
  note_author: string | null
  note_created_at: string | null
  dishes: string[] | null
}

type GuestVisit = {
  program_id: string
  program_name: string
  start_date: string | null
  meal_orders: number
  dishes: string[]
  notes: number
}

const guestName = (guest: Pick<DenGuest, "title" | "full_name">) => [guest.title, guest.full_name].filter(Boolean).join(" ")
const day = (value: string | null) => (value ? format(new Date(`${value.slice(0, 10)}T00:00:00`), "d MMM yyyy") : null)

/**
 * The guests the Den is hosting on a programme, and what the Den knows about
 * hosting each one. The profile fields are leadership's (the Papa record) and
 * are read-only here; the Den's own knowledge is kept as notes that stay with
 * the guest for every future visit.
 */
export default function DenGuests({ selectedProgram, programName, currentUserId, canManage }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const scoped = selectedProgram !== "all"
  const [openGuest, setOpenGuest] = useState<DenGuest | null>(null)

  const guests = useQuery({
    queryKey: [...DEN_GUESTS_KEY, selectedProgram],
    enabled: scoped,
    queryFn: async () => {
      const { data, error } = await db.rpc("den_guest_profiles", { target_program: selectedProgram })
      if (error) throw error
      return (data ?? []) as DenGuest[]
    },
  })

  const list = guests.data ?? []
  const profiled = list.filter(hasHospitalityProfile).length

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Users className="h-5 w-5" aria-hidden="true" />
            Guests
            {programName && <Badge variant="outline">{programName}</Badge>}
          </CardTitle>
          <CardDescription>
            {scoped && list.length > 0
              ? `${profiled} of ${list.length} have dietary or preference details. Select a guest for their history and the Den's notes.`
              : "Ministers and special guests the Den is hosting, with what the Den knows about hosting them."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!scoped ? (
            <ChooseProgramme icon={Users} description="Guests are shown one programme at a time." className="py-8" />
          ) : guests.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
            </div>
          ) : guests.isError ? (
            <ErrorState title="Could not load guests" onRetry={() => guests.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No guests to show"
              description="Guests appear here once leadership adds them to this programme, and once you have been added to it yourself."
              className="py-8"
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(guest => (
                <li key={guest.id}>
                  <button
                    type="button"
                    onClick={() => setOpenGuest(guest)}
                    className="flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-elevation-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-3">
                      <Avatar className="h-11 w-11 shrink-0">
                        {guest.profile_photo_url && <AvatarImage src={guest.profile_photo_url} alt="" />}
                        <AvatarFallback>{initialsOf(guest.full_name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{guestName(guest)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[guest.position, guest.organization].filter(Boolean).join(", ") || "Guest"}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge variant={isReturningGuest(guest) ? "secondary" : "outline"}>
                        {isReturningGuest(guest) ? "Returning guest" : "First visit"}
                      </Badge>
                      {guest.entourage > 0 && <Badge variant="outline">Entourage of {guest.entourage}</Badge>}
                      {guest.note_count > 0 && <Badge variant="outline">{guest.note_count} Den {guest.note_count === 1 ? "note" : "notes"}</Badge>}
                    </span>
                    {guest.dietary_restrictions ? (
                      <span className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="line-clamp-2">{guest.dietary_restrictions}</span>
                      </span>
                    ) : !hasHospitalityProfile(guest) ? (
                      <span className="text-sm text-muted-foreground">
                        {guest.water_temperature || guest.special_requirements
                          ? [guest.water_temperature && `Water: ${guest.water_temperature}`, guest.special_requirements].filter(Boolean).join(" · ")
                          : "Nothing recorded about hosting this guest yet."}
                      </span>
                    ) : (
                      <span className="line-clamp-2 text-sm text-muted-foreground">{guest.food_preferences ?? "See the Den's notes."}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <GuestDialog
        guest={openGuest}
        programId={scoped ? selectedProgram : null}
        currentUserId={currentUserId}
        canManage={canManage}
        onClose={() => setOpenGuest(null)}
      />
    </>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm">{value ?? <span className="text-muted-foreground">Not recorded</span>}</dd>
    </div>
  )
}

function GuestDialog({ guest, programId, currentUserId, canManage, onClose }: {
  guest: DenGuest | null
  programId: string | null
  currentUserId: string | null
  canManage: boolean
  onClose: () => void
}) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [category, setCategory] = useState<DenGuestNoteCategory>("preference")
  const [text, setText] = useState("")
  const guestId = guest?.id ?? null

  const history = useQuery({
    queryKey: [...DEN_GUESTS_KEY, "history", guestId],
    enabled: Boolean(guestId),
    queryFn: async () => {
      const { data, error } = await db.rpc("den_guest_history", { target_papa: guestId })
      if (error) throw error
      return (data ?? []) as GuestVisit[]
    },
  })

  const notes = useQuery({
    queryKey: [...DEN_GUESTS_KEY, "notes", guestId],
    enabled: Boolean(guestId),
    queryFn: async () => {
      const { data, error } = await db
        .from("den_guest_notes")
        .select("id, category, note, program_id, created_by, created_at, author:users!den_guest_notes_created_by_fkey(full_name), program:programs(name)")
        .eq("papa_id", guestId)
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as GuestNote[]
    },
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DEN_GUESTS_KEY })
    queryClient.invalidateQueries({ queryKey: DEN_PLAN_KEY })
  }

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("den_guest_notes").insert([{
        papa_id: guestId, program_id: programId, category, note: text.trim(), created_by: currentUserId,
      }])
      if (error) throw error
    },
    onSuccess: () => { refresh(); setText(""); toast.success("Note saved for future visits") },
    onError: (error) => notifyError(error, "Could not save this note"),
  })

  const removeNote = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.from("den_guest_notes").delete().eq("id", id).select("id")
      if (error) throw error
      if (!data?.length) throw new Error("You are not allowed to remove this note.")
    },
    onSuccess: () => { refresh(); toast.success("Note removed") },
    onError: (error) => notifyError(error, "Could not remove this note"),
  })

  const visits = history.data ?? []

  const earlier = useQuery({
    queryKey: [...DEN_GUESTS_KEY, "earlier", guestId],
    enabled: Boolean(guestId),
    queryFn: async () => {
      const { data, error } = await db.rpc("den_guest_earlier_records", { target_papa: guestId })
      // Before this function exists there is simply nothing earlier to show.
      if (error) return [] as EarlierRecord[]
      return (data ?? []) as EarlierRecord[]
    },
  })
  const earlierRows = earlier.data ?? []
  const earlierNotes = earlierRows.filter(row => row.note)
  const earlierProgrammes = [...new Set(earlierRows.map(row => row.program_name).filter(Boolean))]
  const earlierDishes = [...new Set(earlierRows.flatMap(row => row.dishes ?? []))]

  return (
    <Dialog open={Boolean(guest)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {guest && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  {guest.profile_photo_url && <AvatarImage src={guest.profile_photo_url} alt="" />}
                  <AvatarFallback>{initialsOf(guest.full_name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate">{guestName(guest)}</span>
                  <span className="block truncate text-sm font-normal text-muted-foreground">
                    {[guest.position, guest.organization].filter(Boolean).join(", ") || "Guest"}
                  </span>
                </span>
              </DialogTitle>
              <DialogDescription>
                {isReturningGuest(guest, visits.length) ? "Returning guest" : "First visit"}
                {guest.entourage > 0 && ` · entourage of ${guest.entourage}`}
                {guest.arrival_date && ` · ${day(guest.arrival_date)}${guest.departure_date ? ` to ${day(guest.departure_date)}` : ""}`}
              </DialogDescription>
            </DialogHeader>

            <section className="mt-2 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                Hospitality profile
              </h3>
              <dl className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <Field label="Dietary needs" value={guest.dietary_restrictions} />
                <Field label="Food preferences" value={guest.food_preferences} />
                <Field label="Water" value={guest.water_temperature} />
                <Field label="Special requirements" value={guest.special_requirements} />
              </dl>
              <p className="text-xs text-muted-foreground">These details come from the guest&apos;s profile, which leadership maintains. Add what the Den learns as a note below.</p>
            </section>

            {earlierProgrammes.length > 0 && (
              <section className="mt-4 space-y-2 rounded-xl border border-sky-500/40 bg-sky-500/5 p-3">
                <h3 className="text-sm font-semibold">Earlier visits under the same name</h3>
                <p className="text-xs text-muted-foreground">
                  Recorded for a guest named {guest.full_name} at {earlierProgrammes.join(", ")}. Check it is the same person before relying on it.
                </p>
                {earlierDishes.length > 0 && <p className="text-sm">Ordered then: {earlierDishes.join(", ")}</p>}
                {earlierNotes.length > 0 ? (
                  <ul className="space-y-2">
                    {earlierNotes.map((row, index) => (
                      <li key={`${row.papa_id}-${index}`} className="rounded-lg border bg-background p-2">
                        <Badge variant={row.note_category === "allergy" ? "destructive" : "secondary"}>
                          {DEN_GUEST_NOTE_LABEL[row.note_category as DenGuestNoteCategory] ?? row.note_category}
                        </Badge>
                        <p className="mt-1 whitespace-pre-line text-sm">{row.note}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.note_author ?? "A Den officer"}{row.note_created_at && ` · ${format(new Date(row.note_created_at), "d MMM yyyy")}`}{row.program_name && ` · ${row.program_name}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No notes were written then.</p>}
              </section>
            )}

            <section className="mt-4 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4" aria-hidden="true" />
                Visits
              </h3>
              {history.isLoading ? (
                <Skeleton className="h-14 rounded-xl" />
              ) : history.isError ? (
                <ErrorState title="Could not load visits" onRetry={() => history.refetch()} className="py-6" />
              ) : visits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {visits.map(visit => (
                    <li key={visit.program_id} className="p-3">
                      <p className="text-sm font-medium">
                        {visit.program_name}
                        {visit.start_date && <span className="font-normal text-muted-foreground"> · {day(visit.start_date)}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {visit.meal_orders} meal {visit.meal_orders === 1 ? "order" : "orders"} · {visit.notes} {visit.notes === 1 ? "note" : "notes"}
                      </p>
                      {visit.dishes.length > 0 && (
                        <p className="mt-1 text-sm">Ordered: {visit.dishes.join(", ")}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-4 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <NotebookPen className="h-4 w-4" aria-hidden="true" />
                Den notes
              </h3>
              <form
                className="space-y-2 rounded-xl border p-3"
                onSubmit={(event) => { event.preventDefault(); if (text.trim() && !addNote.isPending) addNote.mutate() }}
              >
                <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                  <div className="space-y-1">
                    <Label htmlFor="den-note-category" className="text-xs">Kind</Label>
                    <Select value={category} onValueChange={(value) => setCategory(value as DenGuestNoteCategory)}>
                      <SelectTrigger id="den-note-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEN_GUEST_NOTE_CATEGORIES.map(value => (
                          <SelectItem key={value} value={value}>{DEN_GUEST_NOTE_LABEL[value]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="den-note-text" className="text-xs">What should the next team know?</Label>
                    <Textarea
                      id="den-note-text"
                      rows={2}
                      maxLength={1000}
                      placeholder="e.g., Prefers warm water served before he speaks, not during."
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" pending={addNote.isPending} disabled={!text.trim()}>Save note</Button>
                </div>
              </form>

              {notes.isLoading ? (
                <Skeleton className="h-14 rounded-xl" />
              ) : notes.isError ? (
                <ErrorState title="Could not load notes" onRetry={() => notes.refetch()} className="py-6" />
              ) : (notes.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet. The first one starts this guest&apos;s record with the Den.</p>
              ) : (
                <ul className="space-y-2">
                  {(notes.data ?? []).map(note => (
                    <li key={note.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant={note.category === "allergy" ? "destructive" : "secondary"}>{DEN_GUEST_NOTE_LABEL[note.category] ?? note.category}</Badge>
                        {(canManage || note.created_by === currentUserId) && (
                          <Button
                            aria-label="Remove this note"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            disabled={removeNote.isPending}
                            onClick={async () => {
                              if (await confirm({ message: "Remove this note from the guest's record?", variant: "destructive" })) removeNote.mutate(note.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm">{note.note}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {note.author?.full_name ?? "A Den officer"} · {format(new Date(note.created_at), "d MMM yyyy")}
                        {note.program?.name && ` · ${note.program.name}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
