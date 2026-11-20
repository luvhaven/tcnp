"use client"

import { useMemo, useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCheck, Loader2 } from "lucide-react"
import { notifyError, UserFacingError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { OfficerPicker } from "@/components/compliance/OfficerPicker"
import { complianceKeys, useActiveOfficers, useProgrammeOfficerIds } from "@/components/compliance/compliance-queries"
import {
  INSPECTION_ITEMS,
  INSPECTION_VALUES,
  OUTCOME_META,
  allPassChecklist,
  checklistProblem,
  complianceWriteMessage,
  formatScore,
  lagosToday,
  normalizeChecklist,
  orderOfficersForProgramme,
  scoreInspection,
  type InspectionChecklist,
  type InspectionItemKey,
  type InspectionRow,
  type InspectionValue,
} from "@/components/compliance/inspection-logic"

const supabase = createClient()

type Programme = { id: string; name: string }

type Draft = {
  program_id: string
  officer_id: string
  inspected_on: string
  checklist: InspectionChecklist
  notes: string
  follow_up_due: string
}

function draftFrom(row: InspectionRow | null, defaultProgramme: string): Draft {
  if (!row) {
    return { program_id: defaultProgramme, officer_id: "", inspected_on: lagosToday(), checklist: {}, notes: "", follow_up_due: "" }
  }
  return {
    program_id: row.program_id ?? "",
    officer_id: row.officer_id,
    inspected_on: row.inspected_on,
    checklist: normalizeChecklist(row.checklist),
    notes: row.notes ?? "",
    follow_up_due: row.follow_up_due ?? "",
  }
}

const VALUE_TONE: Record<InspectionValue, string> = {
  pass: "border-emerald-500 bg-emerald-500 text-white",
  fail: "border-rose-500 bg-rose-500 text-white",
  na: "border-foreground/40 bg-muted text-foreground",
}

/**
 * New / edit inspection: programme → officer → TCNP.01.02 checklist rows
 * (pass / fail / n/a), notes, live score. The database recomputes the score
 * and outcome; this only previews them.
 */
export function InspectionDialog({
  open,
  onOpenChange,
  programs,
  editing,
  currentUserId,
  defaultProgramme = "",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  programs: readonly Programme[]
  editing: InspectionRow | null
  currentUserId: string | null | undefined
  defaultProgramme?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit inspection" : "New inspection"}</DialogTitle>
          <DialogDescription>Grooming and dress code, SOP TCNP.01.02. The officer is told when something needs fixing.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from a fresh draft. */}
        {open && (
          <InspectionForm
            programs={programs}
            editing={editing}
            currentUserId={currentUserId}
            defaultProgramme={defaultProgramme}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InspectionForm({
  programs,
  editing,
  currentUserId,
  defaultProgramme,
  onDone,
}: {
  programs: readonly Programme[]
  editing: InspectionRow | null
  currentUserId: string | null | undefined
  defaultProgramme: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => draftFrom(editing, defaultProgramme))

  const officersQuery = useActiveOfficers(true)
  const { ids: onProgramme } = useProgrammeOfficerIds(draft.program_id || null)
  const [onlyProgramme, setOnlyProgramme] = useState(true)

  const pickable = useMemo(() => {
    // Nobody inspects themselves (the database refuses it too).
    const everyone = (officersQuery.data ?? []).filter((officer) => officer.id !== currentUserId)
    const ordered = orderOfficersForProgramme(everyone, onProgramme)
    if (draft.program_id && onlyProgramme && onProgramme.size > 0) {
      return ordered.filter((officer) => onProgramme.has(officer.id) || officer.id === draft.officer_id)
    }
    return ordered
  }, [officersQuery.data, currentUserId, onProgramme, draft.program_id, onlyProgramme, draft.officer_id])

  const result = scoreInspection(draft.checklist)
  const problem = checklistProblem(draft.checklist)
  const officerName = editing?.officer?.full_name ?? (officersQuery.data ?? []).find((officer) => officer.id === draft.officer_id)?.full_name

  const setValue = (key: InspectionItemKey, value: InspectionValue) =>
    setDraft((current) => ({ ...current, checklist: { ...current.checklist, [key]: value } }))

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft.officer_id) throw new UserFacingError("Choose the officer you inspected")
      if (problem) throw new UserFacingError(problem)
      if (draft.follow_up_due && draft.follow_up_due < draft.inspected_on) {
        throw new UserFacingError("The follow-up date cannot be before the inspection date")
      }
      const payload = {
        program_id: draft.program_id || null,
        inspected_on: draft.inspected_on || lagosToday(),
        checklist: draft.checklist,
        notes: draft.notes.trim() || null,
        follow_up_due: result.fails > 0 && draft.follow_up_due ? draft.follow_up_due : null,
      }
      const table = (supabase as any).from("compliance_inspections")
      const { error } = editing
        ? await table.update(payload).eq("id", editing.id)
        : await table.insert({ ...payload, officer_id: draft.officer_id })
      if (error) throw new UserFacingError(complianceWriteMessage(error, editing ? "Could not save the inspection" : "Could not record the inspection"))
    },
    onSuccess: () => {
      toast.success(editing ? "Inspection updated" : "Inspection recorded")
      queryClient.invalidateQueries({ queryKey: complianceKeys.inspections })
      onDone()
    },
    onError: (error: Error) => notifyError(error, "Could not save the inspection"),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    saveMutation.mutate()
  }

  const groups = ["Grooming", "Dress code"] as const

  return (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inspection-programme">Programme</Label>
              <Select
                value={draft.program_id || "none"}
                onValueChange={(value) => setDraft((current) => ({ ...current, program_id: value === "none" ? "" : value }))}
              >
                <SelectTrigger id="inspection-programme" aria-label="Programme"><SelectValue placeholder="No programme" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No programme</SelectItem>
                  {programs.map((programme) => <SelectItem key={programme.id} value={programme.id}>{programme.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inspection-date">Date</Label>
              <Input
                id="inspection-date"
                type="date"
                value={draft.inspected_on}
                max={lagosToday()}
                onChange={(event) => setDraft((current) => ({ ...current, inspected_on: event.target.value }))}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Officer</legend>
            {editing ? (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-sm font-medium">{officerName || "Officer"}</p>
            ) : officersQuery.isError ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                Could not load officers.{" "}
                <button type="button" className="font-medium underline" onClick={() => void officersQuery.refetch()}>Try again</button>
              </p>
            ) : officersQuery.isLoading ? (
              <div className="skeleton h-40 rounded-lg" role="status" aria-label="Loading officers" />
            ) : (
              <>
                {draft.program_id && onProgramme.size === 0 && (
                  <p className="text-xs text-muted-foreground">No officer is active on this programme yet, so everyone is listed.</p>
                )}
                {draft.program_id && onProgramme.size > 0 && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={onlyProgramme} onChange={(event) => setOnlyProgramme(event.target.checked)} />
                    Only officers on this programme
                  </label>
                )}
                <OfficerPicker
                  id="inspection-officer"
                  officers={pickable}
                  value={draft.officer_id}
                  onChange={(officerId) => setDraft((current) => ({ ...current, officer_id: officerId }))}
                  onProgramme={onProgramme}
                />
              </>
            )}
          </fieldset>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Checklist</p>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setDraft((current) => ({ ...current, checklist: { ...allPassChecklist(), ...current.checklist } }))}>
                <CheckCheck aria-hidden="true" /> Pass the rest
              </Button>
            </div>
            {groups.map((group) => (
              <div key={group} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                {INSPECTION_ITEMS.filter((item) => item.group === group).map((item) => {
                  const current = draft.checklist[item.key]
                  return (
                    <div key={item.key} className="rounded-lg border border-border/70 p-2.5">
                      <div className="mb-2 min-w-0">
                        <p id={`inspection-item-${item.key}`} className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.hint}</p>
                      </div>
                      <div role="radiogroup" aria-labelledby={`inspection-item-${item.key}`} className="grid grid-cols-3 gap-1.5">
                        {INSPECTION_VALUES.map((option) => {
                          const selected = current === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${item.label}: ${option.label}`}
                              onClick={() => setValue(item.key, option.value)}
                              className={cn(
                                "min-h-11 rounded-md border text-sm font-medium transition-colors",
                                selected ? VALUE_TONE[option.value] : "border-border bg-background hover:bg-muted",
                              )}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inspection-notes">Notes</Label>
            <Textarea
              id="inspection-notes"
              rows={3}
              maxLength={2000}
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="What to fix, and how"
            />
          </div>

          {result.fails > 0 && (
            <div className="space-y-2">
              <Label htmlFor="inspection-follow-up">Re-check by (optional)</Label>
              <Input
                id="inspection-follow-up"
                type="date"
                min={draft.inspected_on}
                value={draft.follow_up_due}
                onChange={(event) => setDraft((current) => ({ ...current, follow_up_due: event.target.value }))}
              />
            </div>
          )}

          <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-border/70 bg-background/95 px-4 pb-1 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex items-center justify-between gap-3" aria-live="polite">
              <div>
                <p className="text-2xl font-semibold tabular-nums">{formatScore(result.score)}</p>
                <p className="text-xs text-muted-foreground">{result.rated} of {result.total} rated · {result.fails} fail{result.fails === 1 ? "" : "s"}</p>
              </div>
              {result.outcome ? (
                <Badge variant="outline" className={OUTCOME_META[result.outcome].tone}>{OUTCOME_META[result.outcome].label}</Badge>
              ) : (
                <Badge variant="outline">Not scored</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onDone}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saveMutation.isPending || Boolean(problem) || !draft.officer_id}>
                {saveMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {editing ? "Save" : "Record"}
              </Button>
            </div>
            {(problem || !draft.officer_id) && (
              <p className="text-center text-xs text-muted-foreground">{!draft.officer_id ? "Choose the officer" : problem}</p>
            )}
          </div>
        </form>
  )
}
