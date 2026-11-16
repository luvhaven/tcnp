"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, CheckCircle2, CircleDashed, ClipboardCheck, Users } from "lucide-react"
import { toast } from "sonner"
import ChooseProgramme from "@/components/den/ChooseProgramme"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/ui/stat-card"
import { Textarea } from "@/components/ui/textarea"
import type { DenTab } from "@/lib/den"
import {
  DEN_PLAN_KEY,
  DEN_PLAN_STATUS_LABEL,
  denPlanStatusOptions,
  readinessChecks,
  readinessScore,
  readinessTone,
  type DenPlanStatus,
  type DenProgrammeSummary,
} from "@/lib/den-plan"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Props = {
  selectedProgram: string // 'all' or a program id
  programName: string | null
  /** Head, sub-lead or platform admin: may open and edit the plan. */
  canCoordinate: boolean
  /** Head or platform admin: may archive it. */
  canArchive: boolean
  currentUserId: string | null
  onNavigate: (tab: DenTab) => void
}

const RING_TONE = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive dark:text-red-400",
} as const

function ReadinessRing({ score }: { score: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  return (
    <div className={cn("relative h-32 w-32 shrink-0", RING_TONE[readinessTone(score)])} role="img" aria-label={`Readiness ${score} percent`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60" cy="60" r={radius} fill="none" strokeWidth="10" strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="stat-figure text-3xl font-bold">{score}%</span>
        <span className="text-xs text-muted-foreground">ready</span>
      </div>
    </div>
  )
}

/**
 * The Den's plan for one programme: how ready the Den is and exactly what is
 * still missing. Every line of the score is a real record elsewhere on the
 * page, so the way to raise it is to do the work, not to tick a box.
 */
export default function DenPlan({ selectedProgram, programName, canCoordinate, canArchive, currentUserId, onNavigate }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const scoped = selectedProgram !== "all"

  const summary = useQuery({
    queryKey: [...DEN_PLAN_KEY, selectedProgram],
    enabled: scoped,
    // The score is built from records edited in the other tabs, so it is
    // re-read every time this tab is opened.
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await db.rpc("den_programme_summary", { target_program: selectedProgram })
      if (error) throw error
      if (!data) throw new Error("You do not have access to this programme's Den plan.")
      return data as DenProgrammeSummary
    },
  })

  const plan = summary.data?.plan ?? null
  // Form state follows the saved plan until the user starts typing.
  const [draft, setDraft] = useState<{ for: string; status: DenPlanStatus; expected: string; notes: string } | null>(null)
  const planStamp = `${selectedProgram}:${plan?.updated_at ?? "none"}`
  const form = draft && draft.for === planStamp
    ? draft
    : { for: planStamp, status: plan?.status ?? "planning", expected: plan?.expected_guests?.toString() ?? "", notes: plan?.service_notes ?? "" }

  const savePlan = useMutation({
    mutationFn: async () => {
      const expected = form.expected.trim() === "" ? null : Math.max(0, parseInt(form.expected, 10) || 0)
      const values = { status: form.status, expected_guests: expected, service_notes: form.notes.trim() || null, updated_by: currentUserId }
      if (plan) {
        const { data, error } = await db.from("den_operations").update(values).eq("id", plan.id).select("id")
        if (error) throw error
        if (!data?.length) throw new Error("You are not allowed to change this Den plan.")
      } else {
        const { error } = await db.from("den_operations").insert([{ ...values, program_id: selectedProgram, created_by: currentUserId }])
        if (error) throw error
      }
      return Boolean(plan)
    },
    onSuccess: (existed) => {
      queryClient.invalidateQueries({ queryKey: DEN_PLAN_KEY })
      setDraft(null)
      toast.success(existed ? "Den plan saved" : `Den plan opened for ${programName ?? "this programme"}`)
    },
    onError: (error) => notifyError(error, "Could not save the Den plan"),
  })

  if (!scoped) {
    return (
      <Card>
        <CardContent>
          <ChooseProgramme icon={ClipboardCheck} description="Each programme has its own Den plan and readiness score." />
        </CardContent>
      </Card>
    )
  }
  if (summary.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (summary.isError || !summary.data) {
    return <Card><CardContent><ErrorState title="Could not load the Den plan" onRetry={() => summary.refetch()} /></CardContent></Card>
  }

  const checks = readinessChecks(summary.data)
  const score = readinessScore(checks)
  const outstanding = checks.filter(check => check.progress < 1).length
  const dirty = Boolean(draft && draft.for === planStamp)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
              Readiness
              {programName && <Badge variant="outline">{programName}</Badge>}
              {plan && <Badge variant="secondary">{DEN_PLAN_STATUS_LABEL[plan.status]}</Badge>}
            </CardTitle>
            <CardDescription>
              {outstanding === 0
                ? "Everything the Den needs for this programme is in place."
                : `${outstanding} ${outstanding === 1 ? "thing is" : "things are"} still to do. Select one to go where it is fixed.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <ReadinessRing score={score} />
            <ul className="min-w-0 flex-1 space-y-1">
              {checks.map(check => {
                const done = check.progress >= 1
                return (
                  <li key={check.key}>
                    <button
                      type="button"
                      onClick={() => onNavigate(check.tab)}
                      className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {done
                        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        : <CircleDashed className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{check.label}</span>
                        <span className="block text-xs text-muted-foreground">{check.detail}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 content-start gap-3 lg:grid-cols-1">
          <StatCard
            label="Guests"
            value={summary.data.guests}
            hint={summary.data.entourage > 0 ? `plus ${summary.data.entourage} in their entourage` : "Ministers and special guests"}
            icon={Users}
            tone="primary"
            onClick={() => onNavigate("guests")}
          />
          <StatCard
            label="Den officers on programme"
            value={summary.data.team_on_programme}
            hint={summary.data.pending_additions > 0 ? `${summary.data.pending_additions} awaiting approval` : `${summary.data.floor_access} with floor access`}
            icon={ClipboardCheck}
            tone="info"
            onClick={() => onNavigate("overview")}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{plan ? "Plan details" : "Open the Den plan"}</CardTitle>
          <CardDescription>
            {plan
              ? "Keep the plan's stage and service notes current so the whole team works from the same page."
              : canCoordinate
                ? "Opening the plan starts the Den's preparation for this programme."
                : "The head of November (Den) or a Sub-Team Lead opens the plan for a programme."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!plan && !canCoordinate ? (
            <EmptyState icon={ClipboardCheck} title="No Den plan for this programme yet" className="py-6" />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => { event.preventDefault(); if (canCoordinate && !savePlan.isPending) savePlan.mutate() }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="den-plan-status">Stage</Label>
                  <Select
                    value={form.status}
                    disabled={!canCoordinate}
                    onValueChange={(value) => setDraft({ ...form, status: value as DenPlanStatus })}
                  >
                    <SelectTrigger id="den-plan-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {denPlanStatusOptions(canArchive, plan?.status).map(status => (
                        <SelectItem key={status} value={status} disabled={status === "archived" && !canArchive}>
                          {DEN_PLAN_STATUS_LABEL[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="den-plan-expected">Guests expected in the Den</Label>
                  <Input
                    id="den-plan-expected"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder={`${summary.data.guests + summary.data.entourage} from guest profiles`}
                    value={form.expected}
                    disabled={!canCoordinate}
                    onChange={(event) => setDraft({ ...form, expected: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-plan-notes">Service notes</Label>
                <Textarea
                  id="den-plan-notes"
                  rows={4}
                  maxLength={4000}
                  placeholder="How the Den will run for this programme: service times, set-up, who covers what."
                  value={form.notes}
                  disabled={!canCoordinate}
                  onChange={(event) => setDraft({ ...form, notes: event.target.value })}
                />
              </div>
              {canCoordinate && (
                <div className="flex justify-end gap-2">
                  {dirty && <Button type="button" variant="outline" onClick={() => setDraft(null)}>Discard changes</Button>}
                  <Button type="submit" pending={savePlan.isPending} disabled={Boolean(plan) && !dirty}>
                    {plan ? "Save plan" : "Open Den plan"}
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
