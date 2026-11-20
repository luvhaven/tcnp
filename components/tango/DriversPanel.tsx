"use client"

import { FormEvent, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit3, IdCard, Loader2, Phone, Plus, Search, ShieldAlert, Trash2, UserRound, UsersRound } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { toast } from "sonner"
import { notifyError, UserFacingError } from "@/lib/notify"

// ─── Pure helpers (mirrored by supabase/migrations/20261116193000_tango_drivers.sql) ───

export type LicenceState = "valid" | "expiring" | "expired" | "missing"
export type DriverStatus = "available" | "off_duty" | "suspended" | "inactive"

/** One row of tango_driver_roster(): licence state, class and expiry, never the number. */
export type RosterDriver = {
  id: string
  full_name: string
  phone: string
  alt_phone: string | null
  partner_id: string | null
  engagement_type: string
  status: DriverStatus | string
  notes: string | null
  licence_class: string | null
  licence_expires_on: string | null
  licence_state: LicenceState | string
  licence_verified: boolean
  updated_at?: string | null
}

/** Days before expiry that a licence counts as "expiring" (SQL tango_licence_state). */
export const LICENCE_EXPIRING_DAYS = 30
export const DRIVER_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  off_duty: "Off duty",
  suspended: "Suspended",
  inactive: "Inactive",
}
export const ENGAGEMENT_LABELS: Record<string, string> = { internal: "Internal", partner: "Partner", contract: "Contract" }
export const ASSIGNMENT_ROLE_LABELS: Record<string, string> = { primary: "Primary", backup: "Backup", utility: "Utility" }
export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  assigned: "Assigned",
  confirmed: "Confirmed",
  released: "Released",
  cancelled: "Cancelled",
}

/** The calendar date in Lagos (YYYY-MM-DD), the operating timezone the database uses. */
export function lagosDate(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

/** YYYY-MM-DD plus `days`, in calendar days. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Client mirror of SQL tango_licence_state(expires_on, today). */
export function licenceState(expiresOn: string | null | undefined, today: string): LicenceState {
  if (!expiresOn) return "missing"
  const expiry = expiresOn.slice(0, 10)
  if (expiry < today) return "expired"
  if (expiry <= addDays(today, LICENCE_EXPIRING_DAYS)) return "expiring"
  return "valid"
}

export function formatDay(isoDate: string | null | undefined): string {
  if (!isoDate) return ""
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date)
}

export function licenceBadge(state: string, expiresOn: string | null | undefined): { label: string; variant: "success" | "warning" | "destructive" | "secondary" } {
  if (state === "valid") return { label: `Licence valid to ${formatDay(expiresOn)}`, variant: "success" }
  if (state === "expiring") return { label: `Licence expires ${formatDay(expiresOn)}`, variant: "warning" }
  if (state === "expired") return { label: `Licence expired ${formatDay(expiresOn)}`, variant: "destructive" }
  return { label: "No licence on record", variant: "secondary" }
}

/**
 * Client mirror of SQL tango_driver_blocker(): why this driver cannot be put
 * to work until `neededUntil` (YYYY-MM-DD, null = today), or null when they
 * can. The database guard is the authority; this only greys out options.
 */
export function driverBlocker(driver: Pick<RosterDriver, "full_name" | "status" | "licence_expires_on"> | null | undefined, neededUntil: string | null, today: string): string | null {
  if (!driver) return "That driver no longer exists."
  if (driver.status === "suspended") return `${driver.full_name} is suspended and cannot be assigned.`
  if (driver.status === "inactive") return `${driver.full_name} is inactive and cannot be assigned.`
  if (!driver.licence_expires_on) return `${driver.full_name} has no driving licence on record.`
  const expiry = driver.licence_expires_on.slice(0, 10)
  if (expiry < today) return `${driver.full_name}'s driving licence expired on ${formatDay(expiry)}.`
  const needed = neededUntil && neededUntil > today ? neededUntil : today
  if (expiry < needed) return `${driver.full_name}'s driving licence expires on ${formatDay(expiry)}, before this assignment ends.`
  return null
}

/** A few words for a greyed-out driver option, or null when the driver can be picked. */
export function driverShortBlocker(driver: Pick<RosterDriver, "full_name" | "status" | "licence_expires_on"> | null | undefined, neededUntil: string | null, today: string): string | null {
  if (!driverBlocker(driver, neededUntil, today)) return null
  if (!driver) return "unavailable"
  if (driver.status === "suspended" || driver.status === "inactive") return DRIVER_STATUS_LABELS[driver.status].toLowerCase()
  if (!driver.licence_expires_on) return "no licence"
  if (driver.licence_expires_on.slice(0, 10) < today) return "licence expired"
  return `licence ends ${formatDay(driver.licence_expires_on)}`
}

/** "Name" or "Name (reason)" for driver pickers. */
export function driverOptionLabel(driver: Pick<RosterDriver, "full_name">, reason: string | null): string {
  return reason ? `${driver.full_name} (${reason})` : driver.full_name
}

/** Last day a programme roster row needs a licence for (SQL guard_tango_driver_assignment). */
export function programmeNeededUntil(program: { start_date?: string | null; end_date?: string | null } | null | undefined, endsAt?: string | null): string | null {
  return lagosDate(endsAt ?? null) ?? program?.end_date?.slice(0, 10) ?? program?.start_date?.slice(0, 10) ?? null
}

/** The day a journey needs its driver licensed for (SQL tango_journey_cheetah_driver). */
export function journeyNeededDate(journey: { scheduled_arrival?: string | null; eta?: string | null; scheduled_departure?: string | null; etd?: string | null } | null | undefined): string | null {
  if (!journey) return null
  return lagosDate(journey.scheduled_arrival || journey.eta || journey.scheduled_departure || journey.etd || null)
}

/** The readable message of a driver-guard refusal from the database, or null for any other error. */
export function guardErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null
  const { hint, message } = error as { hint?: unknown; message?: unknown }
  return hint === "tango_driver_guard" && typeof message === "string" && message ? message : null
}

/** Unique indexes on the driver tables, and what each refusal means. */
const DUPLICATE_MESSAGES: Record<string, string> = {
  idx_tango_driver_licences_number: "Another driver already has this licence number.",
  idx_tango_driver_assignments_one_per_programme: "This driver is already on this programme's roster. Change their existing row instead.",
  idx_tango_driver_assignments_one_primary_per_cheetah: "This Cheetah already has a primary driver for this programme.",
}

/** The rule a 23505 from the driver tables broke, in words, or null for any other error. */
export function duplicateErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null
  const { code, message, details } = error as { code?: unknown; message?: unknown; details?: unknown }
  if (code !== "23505") return null
  const text = `${typeof message === "string" ? message : ""} ${typeof details === "string" ? details : ""}`
  const index = Object.keys(DUPLICATE_MESSAGES).find((name) => text.includes(name))
  return index ? DUPLICATE_MESSAGES[index] : null
}

/** Re-throws a driver-guard refusal or a duplicate as a message the officer can read. */
export function rethrowDriverError(error: unknown): never {
  const readable = guardErrorMessage(error) ?? duplicateErrorMessage(error)
  if (readable) throw new UserFacingError(readable)
  throw error
}

/** Licence number as the unique index compares it (case and spaces ignored). */
export function normaliseLicenceNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\s/g, "").toUpperCase()
}

/** True when the number or expiry differs from the stored licence (a card nobody has verified yet). */
export function licenceIdentityChanged(
  existing: { licence_number?: string | null; expires_on?: string | null } | null | undefined,
  next: { licence_number?: string | null; expires_on?: string | null },
): boolean {
  if (!existing) return true
  return normaliseLicenceNumber(existing.licence_number) !== normaliseLicenceNumber(next.licence_number)
    || (existing.expires_on ?? "").slice(0, 10) !== (next.expires_on ?? "").slice(0, 10)
}

/**
 * verified_at to send with the licence upsert. The database stamps who
 * verified (tango_driver_licence_stamp): the stored value keeps an existing
 * verification, a new one records a fresh one, null removes it.
 */
export function licenceVerifiedAt(
  existing: { licence_number?: string | null; expires_on?: string | null; verified_at?: string | null } | null | undefined,
  next: { licence_number: string; expires_on: string },
  verified: boolean,
  nowIso: string,
): string | null {
  if (!verified) return null
  if (existing?.verified_at && !licenceIdentityChanged(existing, next)) return existing.verified_at
  return nowIso
}

/** Roster statuses that hold a place (the partial unique indexes). */
export const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "confirmed"]

/**
 * Why a programme roster row cannot be put back to Assigned / Confirmed, or
 * null when it can: the driver already has another active row on the
 * programme, or (as primary) the Cheetah already has an active primary.
 */
export function rosterReactivationBlocker(
  row: { id: string; driver_id: string; cheetah_id?: string | null; role: string; status: string },
  programmeRows: Array<{ id: string; driver_id: string; cheetah_id?: string | null; role: string; status: string }>,
): string | null {
  if (ACTIVE_ASSIGNMENT_STATUSES.includes(row.status)) return null
  const others = programmeRows.filter((other) => other.id !== row.id && ACTIVE_ASSIGNMENT_STATUSES.includes(other.status))
  if (others.some((other) => other.driver_id === row.driver_id)) return "already rostered again"
  if (row.role === "primary" && row.cheetah_id && others.some((other) => other.role === "primary" && other.cheetah_id === row.cheetah_id)) {
    return "Cheetah has a primary"
  }
  return null
}

export type DriverForm = {
  full_name: string
  phone: string
  alt_phone: string
  engagement_type: string
  partner_id: string
  status: string
  notes: string
  licence_number: string
  licence_class: string
  issued_on: string
  expires_on: string
  licence_verified: boolean
}

export const emptyDriverForm: DriverForm = {
  full_name: "",
  phone: "",
  alt_phone: "",
  engagement_type: "internal",
  partner_id: "",
  status: "available",
  notes: "",
  licence_number: "",
  licence_class: "",
  issued_on: "",
  expires_on: "",
  licence_verified: false,
}

export type DriverPayload = {
  driver: { full_name: string; phone: string; alt_phone: string | null; engagement_type: string; partner_id: string | null; status: string; notes: string | null }
  /** null = leave the licence alone (field hidden); "clear" = remove it; otherwise upsert. */
  licence: null | "clear" | { licence_number: string; licence_class: string | null; issued_on: string | null; expires_on: string }
}

/** Validates the driver dialog. Licence fields count only when the caller may see licences. */
export function validateDriverForm(form: DriverForm, options: { withLicence: boolean }): { error: string } | DriverPayload {
  const fullName = form.full_name.trim()
  const phone = form.phone.trim()
  if (!fullName) return { error: "Enter the driver's full name." }
  if (!phone) return { error: "Enter the driver's phone number." }
  if (form.engagement_type === "partner" && !form.partner_id) return { error: "Choose the fleet partner this driver comes from." }
  const driver = {
    full_name: fullName,
    phone,
    alt_phone: form.alt_phone.trim() || null,
    engagement_type: form.engagement_type,
    partner_id: form.engagement_type === "internal" ? null : form.partner_id || null,
    status: form.status,
    notes: form.notes.trim() || null,
  }
  if (!options.withLicence) return { driver, licence: null }
  const number = form.licence_number.trim()
  const expires = form.expires_on.trim()
  if (!number && !expires && !form.licence_class.trim() && !form.issued_on.trim()) return { driver, licence: "clear" }
  if (!number) return { error: "Enter the licence number, or clear the licence fields." }
  if (!expires) return { error: "Enter the licence expiry date." }
  const issued = form.issued_on.trim() || null
  if (issued && issued > expires) return { error: "The licence cannot expire before it was issued." }
  return { driver, licence: { licence_number: number, licence_class: form.licence_class.trim() || null, issued_on: issued, expires_on: expires } }
}

// ─── Data ─────────────────────────────────────────────────────────────────

export const tangoDriverRosterKey = ["tango-driver-roster"] as const

/** Drivers with licence state (tango_driver_roster RPC). Tango members, Command and admins only. */
export function useTangoDriverRoster(enabled: boolean) {
  const supabase = createClient()
  return useQuery({
    queryKey: tangoDriverRosterKey,
    queryFn: async (): Promise<RosterDriver[]> => {
      const { data, error } = await (supabase as any).rpc("tango_driver_roster")
      if (error) throw error
      return (data || []) as RosterDriver[]
    },
    enabled,
    staleTime: 60 * 1000,
  })
}

// ─── Component ────────────────────────────────────────────────────────────

type DriversPanelProps = {
  programs: any[]
  cheetahs: any[]
  partners: any[]
  userId: string | null
  /** Read the roster (Tango member, Command, admin). */
  canView: boolean
  /** Add / edit drivers and the programme roster: tango.canCoordinate || tango.isCommand. */
  canEdit: boolean
  /** Licence numbers: tango.canCoordinate only (Command does not see them). */
  canSeeLicences: boolean
  /** Unit access is still loading: show a skeleton rather than "no access". */
  accessLoading?: boolean
  /** The membership read failed: offer a retry rather than "no access". */
  accessFailed?: boolean
  onRetryAccess?: () => void
}

type AssignmentForm = { driver_id: string; cheetah_id: string; role: string; starts_on: string; ends_on: string; notes: string }
const emptyAssignment: AssignmentForm = { driver_id: "", cheetah_id: "", role: "primary", starts_on: "", ends_on: "", notes: "" }

const vehicleLabel = (cheetah: any) => cheetah?.call_sign || cheetah?.registration_number || cheetah?.reg_no || "Cheetah"

export default function DriversPanel({ programs, cheetahs, partners, userId, canView, canEdit, canSeeLicences, accessLoading = false, accessFailed = false, onRetryAccess }: DriversPanelProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const today = lagosDate(new Date()) as string

  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DriverForm>(emptyDriverForm)
  const [programId, setProgramId] = useState<string>("")
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(emptyAssignment)

  const rosterQuery = useTangoDriverRoster(canView)
  const licencesQuery = useQuery({
    queryKey: ["tango-driver-licences"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("tango_driver_licences").select("*")
      if (error) throw error
      return (data || []) as any[]
    },
    enabled: canSeeLicences,
  })
  const assignmentsQuery = useQuery({
    queryKey: ["tango-driver-assignments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tango_driver_assignments")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(500)
      if (error) throw error
      return (data || []) as any[]
    },
    enabled: canView,
  })

  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data])
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data])
  const driverById = useMemo(() => new Map(roster.map((driver) => [driver.id, driver] as [string, RosterDriver])), [roster])
  const licenceByDriver = useMemo(() => new Map((licencesQuery.data ?? []).map((licence: any) => [licence.driver_id, licence] as [string, any])), [licencesQuery.data])
  const partnerById = useMemo(() => new Map(partners.map((partner: any) => [partner.id, partner] as [string, any])), [partners])
  const cheetahById = useMemo(() => new Map(cheetahs.map((cheetah: any) => [cheetah.id, cheetah] as [string, any])), [cheetahs])

  const selectedProgramId = programId || programs[0]?.id || ""
  const selectedProgram = programs.find((program: any) => program.id === selectedProgramId) ?? null
  const programAssignments = assignments.filter((assignment: any) => assignment.program_id === selectedProgramId)
  const programNeeded = programmeNeededUntil(selectedProgram)

  const filtered = roster.filter((driver) => {
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return [driver.full_name, driver.phone, driver.alt_phone, partnerById.get(driver.partner_id ?? "")?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  })
  const licenceIssues = roster.filter((driver) => driver.status !== "inactive" && licenceState(driver.licence_expires_on, today) !== "valid").length

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: tangoDriverRosterKey })
    void queryClient.invalidateQueries({ queryKey: ["tango-driver-licences"] })
    void queryClient.invalidateQueries({ queryKey: ["tango-driver-assignments"] })
    void queryClient.invalidateQueries({ queryKey: ["cheetahs"] })
    void queryClient.invalidateQueries({ queryKey: ["journey-cheetahs"] })
  }

  const saveDriver = useMutation({
    mutationFn: async (): Promise<{ created: boolean }> => {
      if (!userId) throw new UserFacingError("Sign in again before saving a driver")
      const result = validateDriverForm(form, { withLicence: canSeeLicences })
      if ("error" in result) throw new UserFacingError(result.error)
      let driverId = editingId
      const created = !editingId
      if (editingId) {
        const { error } = await (supabase as any).from("tango_drivers").update(result.driver).eq("id", editingId)
        if (error) throw error
      } else {
        const { data, error } = await (supabase as any).from("tango_drivers").insert({ ...result.driver, created_by: userId }).select("id").single()
        if (error) throw error
        driverId = data.id
        // From here on the dialog edits this driver, so a retry after a failed
        // licence write updates them instead of adding a second driver.
        setEditingId(data.id)
      }
      if (!driverId || result.licence === null) return { created }
      const existing = licenceByDriver.get(driverId)
      try {
        if (result.licence === "clear") {
          if (existing) {
            const { error } = await (supabase as any).from("tango_driver_licences").delete().eq("driver_id", driverId)
            if (error) throw error
          }
          return { created }
        }
        // Who verified, and who edited, are stamped by the database.
        const { error } = await (supabase as any).from("tango_driver_licences").upsert({
          driver_id: driverId,
          ...result.licence,
          verified_at: licenceVerifiedAt(existing, result.licence, form.licence_verified, new Date().toISOString()),
        }, { onConflict: "driver_id" })
        if (error) rethrowDriverError(error)
      } catch (error) {
        if (!created) throw error
        const reason = error instanceof UserFacingError ? error.message : "The licence could not be saved."
        throw new UserFacingError(`${reason} The driver was added without a licence; correct it and save again.`)
      }
      return { created }
    },
    onSuccess: ({ created }) => {
      toast.success(created ? "Driver added" : "Driver updated")
      setDialogOpen(false)
      setEditingId(null)
      setForm(emptyDriverForm)
    },
    onError: (error: any) => notifyError(error, "Driver could not be saved"),
    onSettled: () => invalidate(),
  })

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("tango_drivers").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Driver removed")
      invalidate()
    },
    onError: (error: any) => notifyError(error, "Driver could not be removed"),
  })

  const addAssignment = useMutation({
    mutationFn: async () => {
      if (!userId) throw new UserFacingError("Sign in again before assigning a driver")
      if (!selectedProgramId) throw new UserFacingError("Choose a programme first")
      if (!assignmentForm.driver_id) throw new UserFacingError("Choose a driver")
      if (assignmentForm.starts_on && assignmentForm.ends_on && assignmentForm.ends_on < assignmentForm.starts_on) {
        throw new UserFacingError("The end date cannot be before the start date")
      }
      // Lagos is UTC+1 all year.
      const { error } = await (supabase as any).from("tango_driver_assignments").insert({
        program_id: selectedProgramId,
        driver_id: assignmentForm.driver_id,
        cheetah_id: assignmentForm.cheetah_id || null,
        role: assignmentForm.role,
        starts_at: assignmentForm.starts_on ? `${assignmentForm.starts_on}T00:00:00+01:00` : null,
        ends_at: assignmentForm.ends_on ? `${assignmentForm.ends_on}T23:59:59+01:00` : null,
        notes: assignmentForm.notes.trim() || null,
        status: "assigned",
        assigned_by: userId,
      })
      if (error) rethrowDriverError(error)
    },
    onSuccess: () => {
      toast.success("Driver added to the programme roster")
      setAssignmentForm(emptyAssignment)
      void queryClient.invalidateQueries({ queryKey: ["tango-driver-assignments"] })
    },
    onError: (error: any) => notifyError(error, "Driver could not be assigned"),
  })

  const updateAssignment = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("tango_driver_assignments").update({ status }).eq("id", id)
      if (error) rethrowDriverError(error)
    },
    onSuccess: () => {
      toast.success("Roster updated")
      void queryClient.invalidateQueries({ queryKey: ["tango-driver-assignments"] })
    },
    onError: (error: any) => notifyError(error, "Roster could not be updated"),
  })

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("tango_driver_assignments").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Removed from the programme roster")
      void queryClient.invalidateQueries({ queryKey: ["tango-driver-assignments"] })
    },
    onError: (error: any) => notifyError(error, "Roster entry could not be removed"),
  })

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyDriverForm)
    setDialogOpen(true)
  }

  const openEdit = (driver: RosterDriver) => {
    const licence = licenceByDriver.get(driver.id)
    setEditingId(driver.id)
    setForm({
      full_name: driver.full_name || "",
      phone: driver.phone || "",
      alt_phone: driver.alt_phone || "",
      engagement_type: driver.engagement_type || "internal",
      partner_id: driver.partner_id || "",
      status: driver.status || "available",
      notes: driver.notes || "",
      licence_number: licence?.licence_number || "",
      licence_class: licence?.licence_class || "",
      issued_on: licence?.issued_on || "",
      expires_on: licence?.expires_on || "",
      licence_verified: Boolean(licence?.verified_at),
    })
    setDialogOpen(true)
  }

  const handleDriverSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!saveDriver.isPending) saveDriver.mutate()
  }

  const handleAssignmentSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!addAssignment.isPending) addAssignment.mutate()
  }

  if (!canView && accessLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Checking your Tango access">
        {[0, 1].map((key) => <Skeleton key={key} className="h-28 rounded-xl" />)}
      </div>
    )
  }

  if (!canView && accessFailed) {
    return <ErrorState title="Your Tango access could not be checked" onRetry={onRetryAccess} className="rounded-xl border" />
  }

  if (!canView) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <UsersRound className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium">Drivers are visible to Tango members and Command</p>
        <p className="mt-1 text-xs text-muted-foreground">Your assigned journeys still show the driver for each Cheetah.</p>
      </div>
    )
  }

  const assignmentNeeded = programmeNeededUntil(selectedProgram, assignmentForm.ends_on ? `${assignmentForm.ends_on}T23:59:59+01:00` : null)
  const activeProgramAssignments = programAssignments.filter((assignment: any) => ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status))
  const assignedDriverIds = new Set(activeProgramAssignments.map((assignment: any) => assignment.driver_id))
  // Cheetahs that already have an active primary driver on this programme.
  const primaryCheetahIds = new Set(activeProgramAssignments.filter((assignment: any) => assignment.role === "primary" && assignment.cheetah_id).map((assignment: any) => assignment.cheetah_id))
  const existingLicence = editingId ? licenceByDriver.get(editingId) : null
  const setLicenceIdentity = (field: "licence_number" | "expires_on", value: string) => setForm((current) => {
    const next = { ...current, [field]: value }
    // A changed number or date is a card nobody has seen: tick again once seen.
    return existingLicence?.verified_at && licenceIdentityChanged(existingLicence, next) ? { ...next, licence_verified: false } : next
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="col-span-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{roster.length} driver{roster.length === 1 ? "" : "s"}</Badge>
          {licenceIssues > 0 && (
            <Badge variant="warning" className="gap-1"><ShieldAlert className="h-3 w-3" aria-hidden="true" />{licenceIssues} licence issue{licenceIssues === 1 ? "" : "s"}</Badge>
          )}
        </div>
        <div className="relative col-span-2 sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search drivers" placeholder="Search name, phone or partner" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 pl-9 sm:h-9" />
        </div>
        {canEdit && (
          <Button type="button" onClick={openCreate} className="col-span-2 gap-2 sm:col-span-1"><Plus className="h-4 w-4" aria-hidden="true" />Add driver</Button>
        )}
      </div>

      {canEdit && !canSeeLicences && (
        <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Licence numbers are kept by the Tango head and sub-leads. You can see each driver&apos;s licence state here.
        </p>
      )}

      {rosterQuery.isError ? (
        <ErrorState title="Drivers could not be loaded" onRetry={() => void rosterQuery.refetch()} retrying={rosterQuery.isFetching} className="rounded-xl border" />
      ) : rosterQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading drivers">
          {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-28 rounded-xl" />)}
        </div>
      ) : roster.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <UserRound className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No drivers recorded</p>
          <p className="mt-1 text-xs text-muted-foreground">{canEdit ? "Add drivers so they can be rostered and allocated to journeys." : "The Tango head and sub-leads add drivers here."}</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No driver matches &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Drivers">
          {filtered.map((driver) => {
            const state = licenceState(driver.licence_expires_on, today)
            const badge = licenceBadge(state, driver.licence_expires_on)
            const partner = partnerById.get(driver.partner_id ?? "")
            const vehicles = cheetahs.filter((cheetah: any) => cheetah.default_driver_id === driver.id)
            const licence = licenceByDriver.get(driver.id)
            return (
              <li key={driver.id} className="min-w-0 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{driver.full_name}</p>
                    <a href={`tel:${driver.phone}`} className="mt-0.5 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400 sm:min-h-0" aria-label={`Call ${driver.full_name}`}>
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />{driver.phone}
                    </a>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${driver.full_name}`} onClick={() => openEdit(driver)}><Edit3 className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${driver.full_name}`} onClick={async () => {
                        if (await confirm({ message: `Remove ${driver.full_name}? Their programme roster rows go too. Journeys keep the name and phone they were driven with. To keep the record, set the status to Inactive instead.`, variant: "destructive" })) deleteDriver.mutate(driver.id)
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant={badge.variant} className="whitespace-normal">{badge.label}</Badge>
                  <Badge variant={driver.status === "available" ? "outline" : driver.status === "off_duty" ? "secondary" : "destructive"}>{DRIVER_STATUS_LABELS[driver.status] ?? driver.status}</Badge>
                  {driver.licence_class && <Badge variant="outline">Class {driver.licence_class}</Badge>}
                  {driver.licence_verified && <Badge variant="outline" className="gap-1"><IdCard className="h-3 w-3" aria-hidden="true" />Verified</Badge>}
                </div>
                <p className="mt-2 break-words text-xs text-muted-foreground">
                  {[ENGAGEMENT_LABELS[driver.engagement_type] ?? driver.engagement_type, partner?.name, vehicles.length ? `Default for ${vehicles.map(vehicleLabel).join(", ")}` : null].filter(Boolean).join(" · ")}
                </p>
                {canSeeLicences && licence?.licence_number && (
                  <p className="mt-1 text-xs text-muted-foreground">Licence no. <span className="font-mono">{licence.licence_number}</span></p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="text-base">Programme driver roster</CardTitle>
            <CardDescription>Who drives for each programme, and with which Cheetah.</CardDescription>
          </div>
          {programs.length > 0 && (
            <Select value={selectedProgramId} onValueChange={setProgramId}>
              <SelectTrigger aria-label="Programme" className="h-11 sm:h-9 sm:max-w-sm"><SelectValue placeholder="Choose programme" /></SelectTrigger>
              <SelectContent>{programs.map((program: any) => <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {programs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No programme is planned or active.</p>
          ) : (
            <>
              {canEdit && (
                <form onSubmit={handleAssignmentSubmit} className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_.8fr_auto] lg:items-end" aria-label="Add a driver to this programme">
                  <div className="space-y-2">
                    <Label htmlFor="roster-driver">Driver</Label>
                    <Select value={assignmentForm.driver_id || "none"} onValueChange={(value) => setAssignmentForm((current) => ({ ...current, driver_id: value === "none" ? "" : value }))}>
                      <SelectTrigger id="roster-driver" aria-label="Roster driver" className="h-11 sm:h-9"><SelectValue placeholder="Choose driver" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choose driver</SelectItem>
                        {roster.filter((driver) => !assignedDriverIds.has(driver.id)).map((driver) => {
                          const reason = driverShortBlocker(driver, assignmentNeeded, today)
                          return <SelectItem key={driver.id} value={driver.id} disabled={Boolean(reason)}>{driverOptionLabel(driver, reason)}</SelectItem>
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roster-cheetah">Cheetah (optional)</Label>
                    <Select value={assignmentForm.cheetah_id || "none"} onValueChange={(value) => setAssignmentForm((current) => ({ ...current, cheetah_id: value === "none" ? "" : value }))}>
                      <SelectTrigger id="roster-cheetah" aria-label="Roster Cheetah" className="h-11 sm:h-9"><SelectValue placeholder="No vehicle" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No vehicle yet</SelectItem>
                        {cheetahs.filter((cheetah: any) => cheetah.status !== "retired").map((cheetah: any) => {
                          const taken = assignmentForm.role === "primary" && primaryCheetahIds.has(cheetah.id)
                          return <SelectItem key={cheetah.id} value={cheetah.id} disabled={taken}>{taken ? `${vehicleLabel(cheetah)} (has a primary driver)` : vehicleLabel(cheetah)}</SelectItem>
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roster-role">Role</Label>
                    <Select value={assignmentForm.role} onValueChange={(value) => setAssignmentForm((current) => ({
                      ...current,
                      role: value,
                      // A Cheetah that already has a primary cannot take a second one.
                      cheetah_id: value === "primary" && primaryCheetahIds.has(current.cheetah_id) ? "" : current.cheetah_id,
                    }))}>
                      <SelectTrigger id="roster-role" aria-label="Roster role" className="h-11 sm:h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(ASSIGNMENT_ROLE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={addAssignment.isPending} className="gap-2">{addAssignment.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}Add to roster</Button>
                  <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-4 lg:max-w-md">
                    <div className="space-y-2"><Label htmlFor="roster-starts">From (optional)</Label><Input id="roster-starts" type="date" value={assignmentForm.starts_on} onChange={(event) => setAssignmentForm((current) => ({ ...current, starts_on: event.target.value }))} className="h-11 sm:h-9" /></div>
                    <div className="space-y-2"><Label htmlFor="roster-ends">To (optional)</Label><Input id="roster-ends" type="date" value={assignmentForm.ends_on} onChange={(event) => setAssignmentForm((current) => ({ ...current, ends_on: event.target.value }))} className="h-11 sm:h-9" /></div>
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                    Suspended or inactive drivers, and licences that lapse before {assignmentNeeded ? formatDay(assignmentNeeded) : "the programme ends"}, cannot be rostered.
                  </p>
                </form>
              )}

              {assignmentsQuery.isError ? (
                <ErrorState title="The roster could not be loaded" onRetry={() => void assignmentsQuery.refetch()} retrying={assignmentsQuery.isFetching} className="rounded-xl border py-8" />
              ) : assignmentsQuery.isLoading ? (
                <Skeleton className="h-20 rounded-xl" />
              ) : programAssignments.length === 0 ? (
                <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No drivers rostered for {selectedProgram?.name ?? "this programme"} yet.</p>
              ) : (
                <ul className="space-y-2" aria-label="Programme roster">
                  {programAssignments.map((assignment: any) => {
                    const driver = driverById.get(assignment.driver_id)
                    const state = licenceState(driver?.licence_expires_on, today)
                    const needed = programmeNeededUntil(selectedProgram, assignment.ends_at) ?? programNeeded
                    const warning = ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status) ? driverBlocker(driver, needed, today) : null
                    const reactivationBlocker = rosterReactivationBlocker(assignment, programAssignments)
                    return (
                      <li key={assignment.id} className="flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{driver?.full_name ?? "Driver"} · {ASSIGNMENT_ROLE_LABELS[assignment.role] ?? assignment.role}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[assignment.cheetah_id ? vehicleLabel(cheetahById.get(assignment.cheetah_id)) : "No vehicle", assignment.starts_at || assignment.ends_at ? `${formatDay(lagosDate(assignment.starts_at)) || "…"} – ${formatDay(lagosDate(assignment.ends_at)) || "…"}` : null].filter(Boolean).join(" · ")}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge variant={licenceBadge(state, driver?.licence_expires_on).variant} className="whitespace-normal">{licenceBadge(state, driver?.licence_expires_on).label}</Badge>
                            {warning && <Badge variant="destructive" className="whitespace-normal">{warning}</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canEdit ? (
                            <Select value={assignment.status} onValueChange={(status) => updateAssignment.mutate({ id: assignment.id, status })}>
                              <SelectTrigger aria-label={`Roster status for ${driver?.full_name ?? "driver"}`} className="h-11 w-36 sm:h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>{Object.entries(ASSIGNMENT_STATUS_LABELS).map(([value, label]) => {
                                const blocked = Boolean(reactivationBlocker) && ACTIVE_ASSIGNMENT_STATUSES.includes(value)
                                return <SelectItem key={value} value={value} disabled={blocked}>{blocked ? `${label} (${reactivationBlocker})` : label}</SelectItem>
                              })}</SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">{ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}</Badge>
                          )}
                          {canEdit && (
                            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${driver?.full_name ?? "driver"} from the roster`} onClick={async () => {
                              if (await confirm({ message: "Remove this driver from the programme roster?", variant: "destructive" })) removeAssignment.mutate(assignment.id)
                            }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyDriverForm) } }}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit driver" : "Add driver"}</DialogTitle>
            <DialogDescription>Drivers can be rostered for a programme and picked when a Cheetah is allocated to a journey.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDriverSubmit} className="mt-2 space-y-4">
            <div className="space-y-2"><Label htmlFor="driver-name">Full name *</Label><Input id="driver-name" required autoComplete="off" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="driver-phone">Phone *</Label><Input id="driver-phone" type="tel" required inputMode="tel" placeholder="+234…" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="driver-alt-phone">Other phone</Label><Input id="driver-alt-phone" type="tel" inputMode="tel" value={form.alt_phone} onChange={(event) => setForm((current) => ({ ...current, alt_phone: event.target.value }))} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="driver-engagement">Engagement</Label>
                <Select value={form.engagement_type} onValueChange={(value) => setForm((current) => ({ ...current, engagement_type: value }))}>
                  <SelectTrigger id="driver-engagement" aria-label="Engagement"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ENGAGEMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-partner">Fleet partner</Label>
                <Select value={form.partner_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, partner_id: value === "none" ? "" : value }))} disabled={form.engagement_type === "internal"}>
                  <SelectTrigger id="driver-partner" aria-label="Fleet partner"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{partners.map((partner: any) => <SelectItem key={partner.id} value={partner.id}>{partner.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-status">Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                  <SelectTrigger id="driver-status" aria-label="Driver status"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(DRIVER_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="driver-notes">Notes</Label><Textarea id="driver-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Languages, routes they know, availability…" /></div>

            {canSeeLicences ? (
              <fieldset className="space-y-3 rounded-xl border p-3">
                <legend className="px-1 text-sm font-semibold">Driving licence</legend>
                <p className="text-xs text-muted-foreground">Only the Tango head and sub-leads see the licence number. Others see whether it is valid.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="licence-number">Licence number</Label><Input id="licence-number" autoComplete="off" value={form.licence_number} onChange={(event) => setLicenceIdentity("licence_number", event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="licence-class">Class</Label><Input id="licence-class" autoComplete="off" value={form.licence_class} onChange={(event) => setForm((current) => ({ ...current, licence_class: event.target.value }))} placeholder="e.g. E" /></div>
                  <div className="space-y-2"><Label htmlFor="licence-issued">Issued on</Label><Input id="licence-issued" type="date" value={form.issued_on} onChange={(event) => setForm((current) => ({ ...current, issued_on: event.target.value }))} /></div>
                  <div className="space-y-2"><Label htmlFor="licence-expires">Expires on</Label><Input id="licence-expires" type="date" value={form.expires_on} onChange={(event) => setLicenceIdentity("expires_on", event.target.value)} /></div>
                </div>
                <label className="flex min-h-[44px] items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={form.licence_verified} onChange={(event) => setForm((current) => ({ ...current, licence_verified: event.target.checked }))} />
                  I have seen the physical licence
                </label>
                {existingLicence?.verified_at && (
                  <p className="text-xs text-muted-foreground">Changing the number or expiry date clears the verification. Tick it again once you have seen the new card.</p>
                )}
              </fieldset>
            ) : (
              <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">Licence details are added by the Tango head or a sub-lead. Until then the driver shows &ldquo;No licence on record&rdquo; and cannot be assigned.</p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" pending={saveDriver.isPending}>{editingId ? "Save driver" : "Add driver"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
