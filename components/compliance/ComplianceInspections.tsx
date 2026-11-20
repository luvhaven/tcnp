"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { format, isValid, parseISO } from "date-fns"
import { CalendarDays, CheckCircle2, ClipboardCheck, Loader2, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react"
import { notifyError, UserFacingError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { useConfirm } from "@/components/providers/ConfirmProvider"
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
import { InspectionDialog } from "@/components/compliance/InspectionDialog"
import { complianceKeys } from "@/components/compliance/compliance-queries"
import {
  DEFAULT_INSPECTION_FILTERS,
  OUTCOME_META,
  complianceWriteMessage,
  failedItemLabels,
  filterInspections,
  formatScore,
  isNotProvisioned,
  summarizeInspections,
  type InspectionFilters,
  type InspectionRow,
} from "@/components/compliance/inspection-logic"

const supabase = createClient()

const INSPECTION_SELECT =
  "*, officer:users!compliance_inspections_officer_id_fkey(full_name), inspector:users!compliance_inspections_inspector_id_fkey(full_name), programs(name)"

type Programme = { id: string; name: string }

function formatDay(value: string | null) {
  if (!value) return ""
  const date = parseISO(value)
  return isValid(date) ? format(date, "EEE d MMM yyyy") : value
}

function NotReady() {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
      <p className="font-medium text-amber-800 dark:text-amber-200">Inspections are being set up</p>
      <p className="mt-1 text-sm text-muted-foreground">Grooming inspections will appear here once the Compliance update is live.</p>
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: InspectionRow["outcome"] }) {
  const meta = OUTCOME_META[outcome] ?? OUTCOME_META.non_compliant
  return <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
}

function InspectionSummaryLine({ row, showOfficer }: { row: InspectionRow; showOfficer: boolean }) {
  const failed = failedItemLabels(row.checklist)
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold tabular-nums">{formatScore(row.score)}</span>
        <OutcomeBadge outcome={row.outcome} />
        {row.programs?.name && <Badge variant="outline" className="max-w-full truncate text-xs">{row.programs.name}</Badge>}
      </div>
      {showOfficer && <p className="truncate font-medium">{row.officer?.full_name || "Officer"}</p>}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden="true" /><time dateTime={row.inspected_on}>{formatDay(row.inspected_on)}</time></span>
        {row.inspector?.full_name && <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" aria-hidden="true" />By {row.inspector.full_name}</span>}
      </p>
      {failed.length > 0 && <p className="text-sm"><span className="font-medium text-rose-700 dark:text-rose-300">To fix:</span> {failed.join(", ")}</p>}
      {row.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{row.notes}</p>}
      {row.follow_up_due && <p className="text-xs text-muted-foreground">Re-check by {formatDay(row.follow_up_due)}</p>}
    </div>
  )
}

/**
 * The Inspections tab. Every officer gets "My compliance" (their own
 * inspections, with Acknowledge). Inspectors (Compliance head / sub-leads,
 * admin and Command) also get the full list, filters and the dialog.
 */
export default function ComplianceInspections({
  canInspect,
  currentUserId,
  userStatus = "loading",
  onRetryUser,
  programs,
}: {
  canInspect: boolean
  currentUserId: string | null | undefined
  /** State of the signed-in profile lookup; until it is ready "My compliance" shows a skeleton, not "No inspections". */
  userStatus?: "loading" | "error" | "ready"
  onRetryUser?: () => void
  programs: readonly Programme[]
}) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InspectionRow | null>(null)
  const [filters, setFilters] = useState<InspectionFilters>(DEFAULT_INSPECTION_FILTERS)
  const [acknowledging, setAcknowledging] = useState<InspectionRow | null>(null)
  const [ackNote, setAckNote] = useState("")

  const mineQuery = useQuery({
    queryKey: complianceKeys.myInspections(currentUserId),
    enabled: Boolean(currentUserId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("compliance_inspections")
        .select(INSPECTION_SELECT)
        .eq("officer_id", currentUserId)
        .order("inspected_on", { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as InspectionRow[]
    },
  })

  const allQuery = useQuery({
    queryKey: [...complianceKeys.inspections, "all"],
    enabled: canInspect,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("compliance_inspections")
        .select(INSPECTION_SELECT)
        .order("inspected_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as InspectionRow[]
    },
  })

  const mine = mineQuery.data ?? []
  const all = useMemo(() => allQuery.data ?? [], [allQuery.data])
  const visible = useMemo(() => filterInspections(all, filters), [all, filters])
  const mySummary = summarizeInspections(mine)
  const teamSummary = summarizeInspections(visible)

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ row, note }: { row: InspectionRow; note: string }) => {
      const { error } = await (supabase as any).rpc("compliance_acknowledge_inspection", {
        target_inspection: row.id,
        note: note.trim() || null,
      })
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not acknowledge the inspection"))
    },
    onSuccess: () => {
      toast.success("Acknowledged")
      setAcknowledging(null)
      setAckNote("")
      queryClient.invalidateQueries({ queryKey: complianceKeys.inspections })
    },
    onError: (error: Error) => notifyError(error, "Could not acknowledge the inspection"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (row: InspectionRow) => {
      const { error } = await (supabase as any).from("compliance_inspections").delete().eq("id", row.id)
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not delete the inspection"))
    },
    onSuccess: () => {
      toast.success("Inspection deleted")
      queryClient.invalidateQueries({ queryKey: complianceKeys.inspections })
    },
    onError: (error: Error) => notifyError(error, "Could not delete the inspection"),
  })

  const openNew = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (row: InspectionRow) => { setEditing(row); setDialogOpen(true) }
  const remove = async (row: InspectionRow) => {
    const ok = await confirm({
      title: "Delete inspection?",
      message: `${row.officer?.full_name || "This officer"}'s inspection on ${formatDay(row.inspected_on)} will be removed.`,
      confirmText: "Delete",
    })
    if (ok) deleteMutation.mutate(row)
  }

  if (mineQuery.isError && isNotProvisioned(mineQuery.error)) return <NotReady />

  return (
    <div className="space-y-6">
      {/* My compliance: every officer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5 text-primary" aria-hidden="true" />My compliance</CardTitle>
          <CardDescription>Your grooming and dress-code checks. Acknowledge any finding once you have read it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!currentUserId && userStatus !== "loading" ? (
            <ErrorState
              title="Could not load your profile"
              description="Your inspections show once we know who you are."
              onRetry={onRetryUser}
            />
          ) : !currentUserId || mineQuery.isPending ? (
            <div className="space-y-2" role="status" aria-label="Loading your inspections">
              <Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" />
            </div>
          ) : mineQuery.isError ? (
            <ErrorState title="Could not load your inspections" onRetry={() => void mineQuery.refetch()} retrying={mineQuery.isRefetching} />
          ) : mine.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No inspections yet" description="When Compliance checks your grooming and dress code, the result shows here." className="py-8" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  [mySummary.average === null ? "—" : `${mySummary.average}%`, "Average"],
                  [String(mySummary.total), "Checks"],
                  [String(mySummary.awaitingAck), "To acknowledge"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                    <p className="text-lg font-semibold tabular-nums">{value}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-2">
                {mine.map((row) => (
                  <li key={row.id} className="rounded-lg border border-border/70 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <InspectionSummaryLine row={row} showOfficer={false} />
                      <div className="shrink-0">
                        {row.acknowledged_at ? (
                          <p className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Acknowledged
                          </p>
                        ) : row.outcome !== "compliant" ? (
                          <Button size="sm" className="w-full sm:w-auto" onClick={() => { setAckNote(""); setAcknowledging(row) }} aria-label={`Acknowledge inspection on ${formatDay(row.inspected_on)}`}>
                            Acknowledge
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {row.officer_comment && <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">Your comment: {row.officer_comment}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* Team inspections: inspectors only */}
      {canInspect && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Team inspections</CardTitle>
                <CardDescription>Checks you and other inspectors have recorded.</CardDescription>
              </div>
              <Button onClick={openNew} className="w-full sm:w-auto"><Plus aria-hidden="true" /> New inspection</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 lg:grid-cols-3">
              <div className="relative min-[400px]:col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Search by officer"
                  aria-label="Search inspections by officer"
                  className="pl-9"
                />
              </div>
              <Select value={filters.programId} onValueChange={(value) => setFilters((current) => ({ ...current, programId: value }))}>
                <SelectTrigger aria-label="Filter by programme"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programmes</SelectItem>
                  <SelectItem value="none">No programme</SelectItem>
                  {programs.map((programme) => <SelectItem key={programme.id} value={programme.id}>{programme.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.outcome} onValueChange={(value) => setFilters((current) => ({ ...current, outcome: value }))}>
                <SelectTrigger aria-label="Filter by outcome"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="open">Needs fixing</SelectItem>
                  <SelectItem value="unacknowledged">Not acknowledged</SelectItem>
                  <SelectItem value="compliant">Compliant</SelectItem>
                  <SelectItem value="minor">Minor issues</SelectItem>
                  <SelectItem value="non_compliant">Action needed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {allQuery.isLoading ? (
              <div className="space-y-2" role="status" aria-label="Loading inspections">
                <Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
              </div>
            ) : allQuery.isError ? (
              isNotProvisioned(allQuery.error) ? <NotReady /> : (
                <ErrorState title="Could not load inspections" onRetry={() => void allQuery.refetch()} retrying={allQuery.isRefetching} />
              )
            ) : all.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No inspections recorded" description="Record the first grooming and dress-code check." action={<Button variant="outline" onClick={openNew}><Plus aria-hidden="true" /> New inspection</Button>} />
            ) : visible.length === 0 ? (
              <EmptyState icon={Search} title="Nothing matches these filters" action={<Button variant="outline" onClick={() => setFilters(DEFAULT_INSPECTION_FILTERS)}>Clear filters</Button>} />
            ) : (
              <>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {teamSummary.total} inspection{teamSummary.total === 1 ? "" : "s"} · average {teamSummary.average === null ? "—" : `${teamSummary.average}%`} · {teamSummary.compliant} compliant · {teamSummary.awaitingAck} awaiting acknowledgement
                </p>
                <ul className="space-y-2">
                  {visible.map((row) => (
                    <li key={row.id} className="rounded-lg border border-border/70 p-3">
                      <div className="flex items-start gap-2">
                        <InspectionSummaryLine row={row} showOfficer />
                        {row.officer_id !== currentUserId && (
                          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                            <Button variant="ghost" size="icon" aria-label={`Edit ${row.officer?.full_name || "officer"}'s inspection`} onClick={() => openEdit(row)}>
                              <Pencil aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" aria-label={`Delete ${row.officer?.full_name || "officer"}'s inspection`} onClick={() => void remove(row)}>
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <p className={cn("mt-2 border-t border-border/60 pt-2 text-xs", row.acknowledged_at ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                        {row.acknowledged_at
                          ? `Acknowledged ${format(new Date(row.acknowledged_at), "d MMM, HH:mm")}${row.officer_comment ? ` — “${row.officer_comment}”` : ""}`
                          : row.outcome === "compliant" ? "Nothing to acknowledge" : "Not acknowledged yet"}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {canInspect && (
        <InspectionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          programs={programs}
          editing={editing}
          currentUserId={currentUserId}
          defaultProgramme={filters.programId !== "all" && filters.programId !== "none" ? filters.programId : ""}
        />
      )}

      <Dialog open={Boolean(acknowledging)} onOpenChange={(open) => { if (!open) setAcknowledging(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Acknowledge inspection</DialogTitle>
            <DialogDescription>
              Confirm you have read the result{acknowledging ? ` from ${formatDay(acknowledging.inspected_on)}` : ""}. Add a short comment if you want Compliance to know something.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (acknowledging) acknowledgeMutation.mutate({ row: acknowledging, note: ackNote })
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="inspection-ack-note">Comment (optional)</Label>
              <Textarea id="inspection-ack-note" rows={3} maxLength={500} value={ackNote} onChange={(event) => setAckNote(event.target.value)} placeholder="e.g. Shoes replaced for tomorrow" />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAcknowledging(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={acknowledgeMutation.isPending}>
                {acknowledgeMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Acknowledge
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
