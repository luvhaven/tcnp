"use client"

import { useState, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Info, ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import type { UnitSlug } from "@/lib/unit-access"
import { cn } from "@/lib/utils"

// ── Pure helpers (exported for tests/unit-tasks.test.cjs) ──

export type ProgrammeChoice = { id: string; name: string; status: string | null }

/** One row of public.unit_programme_team(unit_slug, target_program). */
export type UnitProgrammeTeamRow = {
  user_id: string
  full_name: string | null
  photo_url: string | null
  access_level: "head" | "sub_lead" | "member" | string
  on_programme: boolean
  granted: boolean
  grant_id: string | null
  can_work: boolean
}

export type ProgrammeWorkState = "working" | "lead_not_active" | "granted_not_active" | "active_needs_grant" | "not_active"

const OPEN_PROGRAMME_STATUSES = new Set(["planning", "active"])

/** Programmes being planned or running first, then the rest, each by name. */
export function sortProgrammes<T extends ProgrammeChoice>(programs: readonly T[]): T[] {
  return [...programs].sort((a, b) =>
    Number(OPEN_PROGRAMME_STATUSES.has(b.status ?? "")) - Number(OPEN_PROGRAMME_STATUSES.has(a.status ?? ""))
    || a.name.localeCompare(b.name))
}

export function isUnitLead(row: Pick<UnitProgrammeTeamRow, "access_level">): boolean {
  return row.access_level === "head" || row.access_level === "sub_lead"
}

/**
 * Where one member stands on one programme. Mirrors can_work_unit_programme:
 * active on the programme AND (leads the unit OR holds a grant).
 */
export function programmeWorkState(row: Pick<UnitProgrammeTeamRow, "access_level" | "on_programme" | "granted">): ProgrammeWorkState {
  const lead = isUnitLead(row)
  if (row.on_programme && (lead || row.granted)) return "working"
  if (lead) return "lead_not_active"
  if (row.granted) return "granted_not_active"
  if (row.on_programme) return "active_needs_grant"
  return "not_active"
}

export const PROGRAMME_WORK_LABEL: Record<ProgrammeWorkState, string> = {
  working: "On the team",
  lead_not_active: "Leads the unit. Not active on this programme yet",
  granted_not_active: "Granted. Starts once they are active on the programme",
  active_needs_grant: "Active on the programme. Not on the team",
  not_active: "Not active on this programme",
}

export function summariseProgrammeTeam(rows: readonly Pick<UnitProgrammeTeamRow, "access_level" | "on_programme" | "granted">[]) {
  return {
    members: rows.length,
    active: rows.filter(row => row.on_programme).length,
    working: rows.filter(row => programmeWorkState(row) === "working").length,
    granted: rows.filter(row => row.granted).length,
  }
}

/** A head-issued grant is offered to plain members; leads work by right. */
export function canOfferGrant(row: Pick<UnitProgrammeTeamRow, "access_level">): boolean {
  return !isUnitLead(row)
}

export type GrantAction = "add" | "remove" | "den_floor" | null

/**
 * What the head can do for one row. Only a unit_programme_grants row (grant_id)
 * can be removed here; a Den floor grant (granted without a grant_id) is
 * managed on the Den's own floor-grant panel, so this panel only labels it.
 */
export function grantAction(row: Pick<UnitProgrammeTeamRow, "access_level" | "granted" | "grant_id">): GrantAction {
  if (!canOfferGrant(row)) return null
  if (row.grant_id) return "remove"
  if (row.granted) return "den_floor"
  return "add"
}

const LEVEL_LABEL: Record<string, string> = { head: "Head", sub_lead: "Sub-lead", member: "Member" }

export const unitProgrammeTeamKey = (unitSlug: string, programId: string | null) => ["unit-programme-team", unitSlug, programId] as const
export const UNIT_PROGRAMMES_KEY = ["unit-programmes"] as const

// ── Shared programme list and picker ──

/** Every programme an officer can see, open ones first. */
export function useUnitProgrammes(enabled = true) {
  const supabase = createClient()
  return useQuery({
    queryKey: UNIT_PROGRAMMES_KEY,
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("programs").select("id, name, status").order("name")
      if (error) throw error
      return sortProgrammes((data ?? []) as ProgrammeChoice[])
    },
  })
}

export function UnitProgrammePicker({
  id, value, onChange, programs, allowAll = false, className,
}: {
  id: string
  value: string | null
  onChange: (programId: string | null) => void
  programs: readonly ProgrammeChoice[]
  /** Offer "All work" (no programme) as the first choice. */
  allowAll?: boolean
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>Programme</Label>
      <Select value={value ?? (allowAll ? "all" : "")} onValueChange={(next) => onChange(next === "all" ? null : next)}>
        <SelectTrigger id={id} aria-label="Choose a programme" className="h-11 w-full sm:w-72">
          <SelectValue placeholder="Choose a programme" />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value="all">All work</SelectItem>}
          {programs.map(program => (
            <SelectItem key={program.id} value={program.id}>
              {program.name}{program.status && !OPEN_PROGRAMME_STATUSES.has(program.status) ? ` (${program.status})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── The panel ──

type Props = {
  unitSlug: UnitSlug
  /** Controlled programme. Leave undefined to let the panel offer its own picker. */
  programId?: string | null
  onProgramChange?: (programId: string | null) => void
  className?: string
}

/**
 * Who works a programme for this unit. Lists the unit's members, shows who is
 * active on the programme, and lets the unit head (or Command) grant or revoke
 * "can work this programme". Everyone else in the unit sees who is on the team.
 * The database (unit_set_programme_grant, can_work_unit_programme) has the
 * final say; this panel only explains it.
 */
export default function UnitProgrammeTeam({ unitSlug, programId: controlledProgram, onProgramChange, className }: Props) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const access = useUnitAccess(unitSlug)
  // undefined until the officer picks one; until then ?programme= (a
  // programme-team notification) opens that programme when they can see it.
  const [ownProgram, setOwnProgram] = useState<string | null | undefined>(undefined)
  const addressProgramme = useSearchParams()?.get("programme") ?? null
  const controlled = controlledProgram !== undefined
  const choose = (next: string | null) => { if (!controlled) setOwnProgram(next); onProgramChange?.(next) }

  const canView = access.isMember || access.isCommand || access.isPlatformAdmin
  // SQL: is_admin() OR can_manage_unit(slug). isCommand mirrors is_admin().
  const canGrant = access.canManage || access.isCommand
  const currentUserId = access.currentUser?.id ?? null

  const programmes = useUnitProgrammes(canView && (!controlled || Boolean(onProgramChange)))
  const addressPick = addressProgramme && programmes.data?.some(program => program.id === addressProgramme) ? addressProgramme : null
  const programId = controlled ? controlledProgram : ownProgram !== undefined ? ownProgram : addressPick
  const team = useQuery({
    queryKey: unitProgrammeTeamKey(unitSlug, programId),
    enabled: canView && Boolean(programId),
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("unit_programme_team", { unit_slug: unitSlug, target_program: programId })
      if (error) throw error
      return (data ?? []) as UnitProgrammeTeamRow[]
    },
  })

  const setGrant = useMutation({
    mutationFn: async ({ row, granted }: { row: UnitProgrammeTeamRow; granted: boolean }) => {
      const { error } = await (supabase as any).rpc("unit_set_programme_grant", {
        unit_slug: unitSlug, target_program: programId, target_user: row.user_id, granted,
      })
      if (error) throw error
      return { row, granted }
    },
    onSuccess: ({ row, granted }) => {
      queryClient.invalidateQueries({ queryKey: ["unit-programme-team", unitSlug] })
      // The officer's own can_work_unit_programme answer is cached under 'unit-access'.
      queryClient.invalidateQueries({ queryKey: ["unit-access"] })
      const name = row.full_name ?? "The officer"
      toast.success(granted
        ? row.on_programme ? `${name} can now work this programme` : `${name} is on the team. They can start once they are active on the programme.`
        : `${name} no longer works this programme`)
    },
    onError: (error) => notifyError(error, "Could not change the programme team"),
  })

  const programName = programmes.data?.find(program => program.id === programId)?.name ?? null
  const rows = team.data ?? []
  const summary = summariseProgrammeTeam(rows)

  const picker = (!controlled || onProgramChange) && (
    programmes.isLoading ? <Skeleton className="h-11 w-full rounded-md sm:w-72" />
      : programmes.isError ? <ErrorState className="py-4" title="Could not load programmes" onRetry={() => programmes.refetch()} />
      : <UnitProgrammePicker id={`programme-team-${unitSlug}`} value={programId} onChange={choose} programs={programmes.data ?? []} />
  )

  let body: ReactNode
  if (access.isLoading) {
    body = <Skeleton className="h-32 rounded-xl" />
  } else if (access.loadFailed) {
    body = <ErrorState title="Could not check your unit access" description="Reload the page to try again." />
  } else if (!canView) {
    body = <EmptyState icon={Users} title="Members only" description="Only members of this unit can see who works its programmes." className="py-8" />
  } else if (!programId) {
    body = <EmptyState icon={Users} title="Choose a programme" description="Pick a programme to see who works it for this unit." className="py-8" />
  } else if (team.isLoading) {
    body = <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)}</div>
  } else if (team.isError) {
    body = <ErrorState title="Could not load the programme team" onRetry={() => team.refetch()} retrying={team.isRefetching} />
  } else if (rows.length === 0) {
    body = <EmptyState icon={Users} title="This unit has no members yet" description="Members appear here once they are added to the unit." className="py-8" />
  } else {
    body = (
      <div className="space-y-3">
        {summary.active === 0 && (
          <div role="note" className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Nobody in this unit is active on {programName ?? "this programme"} yet. Officers become active when they accept
              the programme&apos;s availability request or are given a title on it. Until then its work stays with the unit
              head, sub-leads and Command{canGrant ? ". You can still add members to the team now, and they can start once they are active." : "."}
            </p>
          </div>
        )}
        <ul className="divide-y rounded-xl border" aria-label={`Programme team${programName ? ` for ${programName}` : ""}`}>
          {rows.map(row => {
            const state = programmeWorkState(row)
            const isSelf = row.user_id === currentUserId
            const busy = setGrant.isPending && setGrant.variables?.row.user_id === row.user_id
            const action = grantAction(row)
            return (
              <li key={row.user_id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="truncate">{row.full_name ?? "Officer"}{isSelf ? " (you)" : ""}</span>
                    {isUnitLead(row) && <Badge variant="outline">{LEVEL_LABEL[row.access_level] ?? row.access_level}</Badge>}
                    {state === "working" && (
                      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        On the team
                      </Badge>
                    )}
                  </p>
                  {state !== "working" && <p className="text-xs text-muted-foreground">{PROGRAMME_WORK_LABEL[state]}</p>}
                </div>
                {canGrant && action === "den_floor" && (
                  <p className="shrink-0 text-xs text-muted-foreground">Granted on the Den floor. Change it in Floor access.</p>
                )}
                {canGrant && (action === "add" || action === "remove") && (
                  action === "remove" ? (
                    <Button
                      variant="outline" className="h-11 shrink-0"
                      aria-label={`Remove ${row.full_name ?? "this officer"} from the programme team`}
                      pending={busy} disabled={setGrant.isPending}
                      onClick={async () => {
                        if (await confirm({ title: "Remove from the team?", message: `${row.full_name ?? "This officer"} will no longer be able to work ${programName ?? "this programme"} for the unit.`, confirmText: "Remove", variant: "destructive" })) {
                          setGrant.mutate({ row, granted: false })
                        }
                      }}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      className="h-11 shrink-0"
                      aria-label={`Add ${row.full_name ?? "this officer"} to the programme team`}
                      pending={busy} disabled={setGrant.isPending}
                      onClick={() => setGrant.mutate({ row, granted: true })}
                    >
                      Add to team
                    </Button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="space-y-3">
        <div className="space-y-1.5">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Users className="h-5 w-5" aria-hidden="true" />
            Programme team
            {programId && team.isSuccess && <Badge variant="secondary">{summary.working} on the team</Badge>}
          </CardTitle>
          <CardDescription>
            {canGrant
              ? "Choose who does this unit's work on a programme. They must also be active on the programme."
              : "Who does this unit's work on a programme. The unit head decides."}
          </CardDescription>
        </div>
        {canView && picker}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
