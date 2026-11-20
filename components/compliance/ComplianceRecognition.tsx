"use client"

import { useMemo, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { format, isValid, parseISO } from "date-fns"
import { Award, Eye, EyeOff, Loader2, Medal, Plus, Sparkles, Star, Trash2, TrendingUp, Trophy } from "lucide-react"
import { notifyError, UserFacingError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { OfficerPicker } from "@/components/compliance/OfficerPicker"
import ComplianceAwards from "@/components/compliance/ComplianceAwards"
import { complianceKeys, useActiveOfficers } from "@/components/compliance/compliance-queries"
import {
  AWARD_TYPES,
  awardTypeLabel,
  complianceWriteMessage,
  recognitionTitleProblem,
  isNotProvisioned,
  lagosToday,
  type AwardType,
} from "@/components/compliance/inspection-logic"

const supabase = createClient()

type Programme = { id: string; name: string }
type RecognitionRow = {
  id: string
  officer_id: string
  program_id: string | null
  award_type: AwardType
  title: string
  citation: string | null
  awarded_on: string
  awarded_by: string | null
  visibility: "public" | "private"
  created_at: string
  officer?: { full_name: string | null; photo_url: string | null } | null
  programs?: { name: string } | null
}

const AWARD_ICONS: Record<AwardType, typeof Award> = {
  best_dressed: Sparkles,
  most_improved: TrendingUp,
  excellence: Trophy,
  commendation: Medal,
  other: Star,
}

function formatDay(value: string) {
  const date = parseISO(value)
  return isValid(date) ? format(date, "d MMM yyyy") : value
}

function initials(name: string | null | undefined) {
  return (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"
}

/**
 * Recognition wall (public awards for every active officer; private ones only
 * for the officer, coordinators and admin/Command, as RLS decides), the
 * "Give recognition" dialog for Compliance coordinators, and the formal award
 * categories below it.
 */
export default function ComplianceRecognition({
  canRecognise,
  canManageAwards,
  isUnitMember,
  currentUserId,
  programs,
}: {
  canRecognise: boolean
  canManageAwards: boolean
  isUnitMember: boolean
  currentUserId: string | null | undefined
  programs: readonly Programme[]
}) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [scope, setScope] = useState<"all" | "mine">("all")
  const [dialogOpen, setDialogOpen] = useState(false)

  const wallQuery = useQuery({
    queryKey: complianceKeys.recognitions,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("compliance_recognitions")
        .select("*, officer:users!compliance_recognitions_officer_id_fkey(full_name, photo_url), programs(name)")
        .order("awarded_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(120)
      if (error) throw error
      return (data ?? []) as RecognitionRow[]
    },
  })

  const rows = useMemo(() => wallQuery.data ?? [], [wallQuery.data])
  const visible = scope === "mine" ? rows.filter((row) => row.officer_id === currentUserId) : rows

  const visibilityMutation = useMutation({
    mutationFn: async (row: RecognitionRow) => {
      const next = row.visibility === "public" ? "private" : "public"
      const { error } = await (supabase as any).from("compliance_recognitions").update({ visibility: next }).eq("id", row.id)
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not change who sees this"))
      return next
    },
    onSuccess: (next) => {
      toast.success(next === "public" ? "Now on the wall for everyone" : "Now private")
      queryClient.invalidateQueries({ queryKey: complianceKeys.recognitions })
    },
    onError: (error: Error) => notifyError(error, "Could not change who sees this"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (row: RecognitionRow) => {
      const { error } = await (supabase as any).from("compliance_recognitions").delete().eq("id", row.id)
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not remove the recognition"))
    },
    onSuccess: () => {
      toast.success("Recognition removed")
      queryClient.invalidateQueries({ queryKey: complianceKeys.recognitions })
    },
    onError: (error: Error) => notifyError(error, "Could not remove the recognition"),
  })

  const notReady = wallQuery.isError && isNotProvisioned(wallQuery.error)

  return (
    <div className="space-y-6">
      <section aria-labelledby="recognition-wall-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="recognition-wall-title" className="flex items-center gap-2 text-lg font-semibold"><Trophy className="h-5 w-5 text-amber-500" aria-hidden="true" />Recognition wall</h2>
            <p className="text-sm text-muted-foreground">Officers who set the standard.</p>
          </div>
          <div className="flex gap-2">
            <div className="grid flex-1 grid-cols-2 rounded-lg border border-border/70 p-1 sm:flex-none" role="radiogroup" aria-label="Show recognitions">
              {(["all", "mine"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scope === value}
                  onClick={() => setScope(value)}
                  className={cn("min-h-10 rounded-md px-3 text-sm font-medium", scope === value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {value === "all" ? "Everyone" : "Mine"}
                </button>
              ))}
            </div>
            {canRecognise && !notReady && (
              <Button onClick={() => setDialogOpen(true)}><Plus aria-hidden="true" /> Recognise</Button>
            )}
          </div>
        </div>

        {wallQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading recognitions">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-36 w-full rounded-xl" />)}
          </div>
        ) : notReady ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
            <p className="font-medium text-amber-800 dark:text-amber-200">Recognitions are being set up</p>
            <p className="mt-1 text-sm text-muted-foreground">The wall will appear here once the Compliance update is live.</p>
          </div>
        ) : wallQuery.isError ? (
          <ErrorState title="Could not load recognitions" onRetry={() => void wallQuery.refetch()} retrying={wallQuery.isRefetching} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Award}
            title={scope === "mine" ? "No recognitions for you yet" : "No recognitions yet"}
            description={scope === "mine" ? "Keep setting the standard." : "Compliance recognises officers for outstanding grooming and conduct."}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((row) => {
              const Icon = AWARD_ICONS[row.award_type] ?? Star
              const isMine = row.officer_id === currentUserId
              return (
                <li key={row.id} className="flex flex-col rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card p-4">
                  <div className="flex items-start gap-3">
                    {row.officer?.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.officer.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-semibold text-amber-800 dark:text-amber-200" aria-hidden="true">
                        {initials(row.officer?.full_name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{row.officer?.full_name || "Officer"}{isMine && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}</p>
                      <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{awardTypeLabel(row.award_type)}</p>
                    </div>
                    {row.visibility === "private" && <Badge variant="outline" className="shrink-0 text-[10px]">Private</Badge>}
                  </div>
                  <p className="mt-3 break-words font-medium">{row.title}</p>
                  {row.citation && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{row.citation}</p>}
                  <p className="mt-3 text-xs text-muted-foreground">
                    <time dateTime={row.awarded_on}>{formatDay(row.awarded_on)}</time>{row.programs?.name ? ` · ${row.programs.name}` : ""}
                  </p>
                  {canRecognise && !isMine && (
                    <div className="mt-2 flex justify-end gap-1 border-t border-border/60 pt-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={row.visibility === "public" ? `Make ${row.title} private` : `Show ${row.title} on the wall`}
                        title={row.visibility === "public" ? "Make private" : "Show on the wall"}
                        disabled={visibilityMutation.isPending}
                        onClick={() => visibilityMutation.mutate(row)}
                      >
                        {row.visibility === "public" ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        aria-label={`Remove recognition: ${row.title}`}
                        onClick={async () => {
                          const ok = await confirm({ title: "Remove recognition?", message: `"${row.title}" for ${row.officer?.full_name || "this officer"} will be removed.`, confirmText: "Remove" })
                          if (ok) deleteMutation.mutate(row)
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ComplianceAwards canManage={canManageAwards} isUnitMember={isUnitMember} />

      {canRecognise && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Recognise an officer</DialogTitle>
              <DialogDescription>The officer is notified. Public recognitions appear on the wall for every officer.</DialogDescription>
            </DialogHeader>
            {dialogOpen && (
              <RecognitionForm programs={programs} currentUserId={currentUserId} onDone={() => setDialogOpen(false)} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function RecognitionForm({
  programs,
  currentUserId,
  onDone,
}: {
  programs: readonly Programme[]
  currentUserId: string | null | undefined
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const officersQuery = useActiveOfficers(true)
  const officers = useMemo(() => (officersQuery.data ?? []).filter((officer) => officer.id !== currentUserId), [officersQuery.data, currentUserId])
  const [form, setForm] = useState({
    officer_id: "",
    award_type: "best_dressed" as AwardType,
    title: "",
    citation: "",
    program_id: "",
    awarded_on: lagosToday(),
    isPublic: true,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.officer_id) throw new UserFacingError("Choose the officer")
      const problem = recognitionTitleProblem(form.title)
      if (problem) throw new UserFacingError(problem)
      const title = form.title.trim() || awardTypeLabel(form.award_type)
      const { error } = await (supabase as any).from("compliance_recognitions").insert({
        officer_id: form.officer_id,
        award_type: form.award_type,
        title,
        citation: form.citation.trim() || null,
        program_id: form.program_id || null,
        awarded_on: form.awarded_on || lagosToday(),
        visibility: form.isPublic ? "public" : "private",
      })
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not save the recognition"))
    },
    onSuccess: () => {
      toast.success("Recognition saved")
      queryClient.invalidateQueries({ queryKey: complianceKeys.recognitions })
      onDone()
    },
    onError: (error: Error) => notifyError(error, "Could not save the recognition"),
  })

  const titleProblem = recognitionTitleProblem(form.title)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (titleProblem) return
    saveMutation.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Officer</legend>
        {officersQuery.isError ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            Could not load officers.{" "}
            <button type="button" className="font-medium underline" onClick={() => void officersQuery.refetch()}>Try again</button>
          </p>
        ) : officersQuery.isLoading ? (
          <div className="skeleton h-40 rounded-lg" role="status" aria-label="Loading officers" />
        ) : (
          <OfficerPicker id="recognition-officer" officers={officers} value={form.officer_id} onChange={(officerId) => setForm((current) => ({ ...current, officer_id: officerId }))} />
        )}
      </fieldset>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="recognition-type">Award</Label>
          <Select value={form.award_type} onValueChange={(value) => setForm((current) => ({ ...current, award_type: value as AwardType }))}>
            <SelectTrigger id="recognition-type" aria-label="Award"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AWARD_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="recognition-date">Date</Label>
          <Input id="recognition-date" type="date" value={form.awarded_on} onChange={(event) => setForm((current) => ({ ...current, awarded_on: event.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="recognition-title">Title</Label>
        <Input
          id="recognition-title"
          maxLength={120}
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          placeholder={awardTypeLabel(form.award_type)}
          aria-invalid={titleProblem ? true : undefined}
          aria-describedby={titleProblem ? "recognition-title-problem" : undefined}
        />
        {titleProblem && <p id="recognition-title-problem" className="text-xs text-destructive">{titleProblem}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="recognition-citation">Citation</Label>
        <Textarea id="recognition-citation" rows={3} maxLength={1000} value={form.citation} onChange={(event) => setForm((current) => ({ ...current, citation: event.target.value }))} placeholder="What did they do well?" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="recognition-programme">Programme</Label>
        <Select value={form.program_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, program_id: value === "none" ? "" : value }))}>
          <SelectTrigger id="recognition-programme" aria-label="Programme"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No programme</SelectItem>
            {programs.map((programme) => <SelectItem key={programme.id} value={programme.id}>{programme.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <label htmlFor="recognition-public" className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
        <span>
          <span className="block text-sm font-medium">Show on the wall</span>
          <span className="block text-xs text-muted-foreground">Off: only the officer, Compliance leads and Command see it.</span>
        </span>
        <Switch id="recognition-public" checked={form.isPublic} onCheckedChange={(checked) => setForm((current) => ({ ...current, isPublic: checked }))} />
      </label>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onDone}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={saveMutation.isPending || !form.officer_id || Boolean(titleProblem)}>
          {saveMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Save
        </Button>
      </div>
    </form>
  )
}
