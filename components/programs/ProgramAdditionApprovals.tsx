"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarPlus, Check, X } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { notifyError, UserFacingError } from "@/lib/notify"
import { PROGRAM_ADDITIONS_KEY, type PendingAddition } from "@/lib/program-additions"

type Response = { pending: PendingAddition[]; canDecide: boolean }

function initials(name: string | null) {
  return (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase()
}

/**
 * Officers a unit head wants on a programme although they had not indicated
 * availability. Executives, admins and the Head of Command decide; the unit
 * head sees the same list without the buttons. Renders nothing when there is
 * nothing waiting, so it can sit on any page.
 */
export default function ProgramAdditionApprovals() {
  const queryClient = useQueryClient()

  const { data } = useQuery<Response>({
    queryKey: [...PROGRAM_ADDITIONS_KEY, "pending"],
    queryFn: async () => {
      const res = await fetch("/api/program-additions")
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new UserFacingError(body.error || "Could not load pending additions")
      return body
    },
  })

  const decide = useMutation({
    mutationFn: async ({ addition, decision }: { addition: PendingAddition; decision: "approve" | "reject" }) => {
      const res = await fetch("/api/program-additions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: addition.id, decision }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new UserFacingError(body.error || "Could not update this request")
      return { addition, decision }
    },
    onSuccess: ({ addition, decision }) => {
      const name = addition.officer.full_name ?? "Officer"
      toast.success(decision === "approve" ? `${name} is now on ${addition.program.name}` : `${name} was not added to ${addition.program.name}`)
    },
    onError: (error) => notifyError(error, "Could not update this request"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROGRAM_ADDITIONS_KEY })
      queryClient.invalidateQueries({ queryKey: ["den", "floor-grants"] })
    },
  })

  const pending = data?.pending ?? []
  if (pending.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarPlus className="h-5 w-5" aria-hidden="true" />
          Programme additions
          <Badge variant="secondary">{pending.length}</Badge>
        </CardTitle>
        <CardDescription>
          {data?.canDecide
            ? "A unit head wants these officers on a programme although they had not indicated availability."
            : "Waiting for an executive, an admin or the Head of Command to decide."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-xl border">
          {pending.map(addition => {
            const busy = decide.isPending && decide.variables?.addition.id === addition.id
            return (
              <li key={addition.id} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar className="h-9 w-9 shrink-0">
                  {addition.officer.photo_url && <AvatarImage src={addition.officer.photo_url} alt="" />}
                  <AvatarFallback className="text-xs">{initials(addition.officer.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm font-medium">
                    {addition.officer.full_name ?? "Officer"}
                    <span className="font-normal text-muted-foreground"> to {addition.program.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {addition.unit_label}
                    {addition.requested_by_name && ` · asked by ${addition.requested_by_name}`}
                  </p>
                  {addition.reason && <p className="mt-1 text-sm">{addition.reason}</p>}
                </div>
                {data?.canDecide && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ addition, decision: "reject" })}>
                      <X className="mr-1 h-4 w-4" aria-hidden="true" />
                      Decline
                    </Button>
                    <Button size="sm" pending={busy && decide.variables?.decision === "approve"} disabled={decide.isPending} onClick={() => decide.mutate({ addition, decision: "approve" })}>
                      <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                      Approve
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
