"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Clock, KeyRound, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import ChooseProgramme from "@/components/den/ChooseProgramme"
import { initialsOf } from "@/components/den/DenTeam"
import { useDenTeam, type DenTeamMember } from "@/hooks/useDenTeam"
import { DEN_FLOOR_GRANTS_KEY, DEN_UNIT_SLUG, describeProgrammeStanding, type DenFloorCandidate } from "@/lib/den"
import { notifyError, UserFacingError } from "@/lib/notify"
import { PROGRAM_ADDITIONS_KEY } from "@/lib/program-additions"
import { createClient } from "@/lib/supabase/client"

type Props = {
  selectedProgram: string // 'all' or a program id
  programName: string | null
  currentUserId: string | null
}

/**
 * The Den's team for one programme, in the order the work happens:
 *   1. an officer is added to the programme — at once if they accepted its
 *      availability request, otherwise after leadership approves;
 *   2. once on the programme, the Den head switches on floor access (publish
 *      menus, take a Papa's order) for the officers who need it.
 * The database enforces both steps; this card only makes them easy to do.
 */
export default function DenFloorAccess({ selectedProgram, programName, currentUserId }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const { data: team } = useDenTeam()
  const scoped = selectedProgram !== "all"
  const programLabel = programName ?? "this programme"

  const [needsReason, setNeedsReason] = useState<DenTeamMember | null>(null)
  const [reason, setReason] = useState("")

  const candidates = useQuery({
    queryKey: [...DEN_FLOOR_GRANTS_KEY, "candidates", selectedProgram],
    enabled: scoped,
    queryFn: async () => {
      const { data, error } = await db.rpc("den_floor_candidates", { target_program: selectedProgram })
      if (error) throw error
      return new Map<string, DenFloorCandidate>((data ?? []).map((row: DenFloorCandidate) => [row.user_id, row]))
    },
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DEN_FLOOR_GRANTS_KEY })
    queryClient.invalidateQueries({ queryKey: PROGRAM_ADDITIONS_KEY })
  }

  const addToProgramme = useMutation({
    mutationFn: async ({ member, why }: { member: DenTeamMember; why?: string }) => {
      const res = await fetch("/api/program-additions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: selectedProgram, user_id: member.id, unit_slug: DEN_UNIT_SLUG, reason: why }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new UserFacingError(body.error || "Could not add this officer to the programme")
      return { member, outcome: body.outcome as "added" | "pending" }
    },
    onSuccess: ({ member, outcome }) => {
      refresh()
      setNeedsReason(null)
      setReason("")
      const name = member.full_name ?? "Officer"
      toast.success(outcome === "added"
        ? `${name} is now on ${programLabel}`
        : `Sent for approval: ${name} will join ${programLabel} once leadership approves`)
    },
    onError: (error) => notifyError(error, "Could not add this officer to the programme"),
  })

  const setGrant = useMutation({
    mutationFn: async ({ userId, grant }: { userId: string; name: string; grant: boolean }) => {
      if (grant) {
        const { error } = await db.from("den_floor_grants").insert([{
          program_id: selectedProgram,
          user_id: userId,
          granted_by: currentUserId,
        }])
        if (error) throw error
      } else {
        const { data, error } = await db.from("den_floor_grants")
          .delete()
          .eq("program_id", selectedProgram)
          .eq("user_id", userId)
          .select("id")
        if (error) throw error
        if (!data?.length) throw new Error("You are not allowed to change this officer's access.")
      }
    },
    onSuccess: (_result, { name, grant }) => {
      refresh()
      toast.success(grant ? `${name} can now do floor work for ${programLabel}` : `Floor access removed for ${name}`)
    },
    onError: (error) => notifyError(error, "Could not change this officer's access"),
  })

  // The head already has full Den access through their role; listing them
  // would only offer controls that change nothing.
  const members = (team?.members ?? []).filter(member => member.level !== "head")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
          Programme team
          {programName && <Badge variant="outline">{programName}</Badge>}
        </CardTitle>
        <CardDescription>
          Being in November (Den) does not put an officer on a programme. Add the officers this programme needs,
          then switch on floor access for those who will publish menus and take guests&apos; meal orders.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!scoped ? (
          <ChooseProgramme icon={KeyRound} description="The team is set one programme at a time." className="py-8" />
        ) : candidates.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-12 rounded-xl" />)}
          </div>
        ) : candidates.isError ? (
          <ErrorState title="Could not load the programme team" onRetry={() => candidates.refetch()} />
        ) : members.length === 0 ? (
          <EmptyState icon={KeyRound} title="No Den officers to add yet" className="py-8" />
        ) : (
          <ul className="divide-y rounded-xl border">
            {members.map(member => {
              const candidate = candidates.data?.get(member.id)
              const standing = describeProgrammeStanding(candidate)
              const granted = Boolean(candidate?.granted)
              const name = member.full_name ?? "Officer"
              const adding = addToProgramme.isPending && addToProgramme.variables?.member.id === member.id
              return (
                <li key={member.id} className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 p-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    {member.photo_url && <AvatarImage src={member.photo_url} alt="" />}
                    <AvatarFallback className="text-xs">{initialsOf(member.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">{standing.label}</p>
                  </div>

                  {standing.state === "on_programme" && (
                    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      Floor access
                      <Switch
                        aria-label={`Floor access for ${name}`}
                        checked={granted}
                        disabled={setGrant.isPending && setGrant.variables?.userId === member.id}
                        onCheckedChange={(next) => setGrant.mutate({ userId: member.id, name, grant: next })}
                      />
                    </label>
                  )}
                  {standing.state === "pending" && (
                    <Badge variant="secondary" className="shrink-0">
                      <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                      Awaiting approval
                    </Badge>
                  )}
                  {standing.state === "available" && (
                    <Button size="sm" className="shrink-0" pending={adding} disabled={addToProgramme.isPending} onClick={() => addToProgramme.mutate({ member })}>
                      {!adding && <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                      Add to programme
                    </Button>
                  )}
                  {standing.state === "not_available" && (
                    <Button size="sm" variant="outline" className="shrink-0" disabled={addToProgramme.isPending} onClick={() => { setNeedsReason(member); setReason("") }}>
                      Request to add
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={Boolean(needsReason)} onOpenChange={(open) => { if (!open) setNeedsReason(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add {needsReason?.full_name ?? "this officer"} to {programLabel}</DialogTitle>
            <DialogDescription>
              They did not indicate availability for this programme, so an executive, an admin or the Head of Command
              must approve. If you are one of them, the officer is added straight away.
            </DialogDescription>
          </DialogHeader>
          <form
            className="mt-2 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (needsReason && reason.trim() && !addToProgramme.isPending) {
                addToProgramme.mutate({ member: needsReason, why: reason.trim() })
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="den-addition-reason">Why are they needed? *</Label>
              <Textarea
                id="den-addition-reason"
                required
                maxLength={500}
                placeholder="e.g., We are two officers short for the Saturday evening service."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNeedsReason(null)}>Cancel</Button>
              <Button type="submit" pending={addToProgramme.isPending} disabled={!reason.trim()}>Send for approval</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
