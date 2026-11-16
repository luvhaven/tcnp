"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { UserCheck, Loader2, Phone, Mail, Users } from "lucide-react"
import { notifyError, UserFacingError } from "@/lib/notify"
import { normalizeOscarLabel } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import ProgramAdditionApprovals from "@/components/programs/ProgramAdditionApprovals"

type PendingSignup = {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  oscar: string | null
  team: string | null
  photo_url: string | null
  created_at: string
}

type ApprovalsResponse = { pending: PendingSignup[]; scope: "all" | "unit" }

const QUERY_KEY = ["signup-approvals"]

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase()
}

export default function ApprovalsClient() {
  const queryClient = useQueryClient()
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // `null` means the viewer may not approve signups (403) — e.g. the Head of
  // Command, who reaches this page for programme additions only. The signups
  // section is then hidden rather than shown as a failure.
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<ApprovalsResponse | null>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/officers/signup-approvals")
      if (res.status === 403) return null
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new UserFacingError(body.error || "Couldn't load pending signups")
      return body
    },
  })
  const signupsHidden = data === null

  const approve = useMutation({
    mutationFn: async (applicant: PendingSignup) => {
      setApprovingId(applicant.id)
      const res = await fetch("/api/officers/signup-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officerId: applicant.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new UserFacingError(body.error || "Couldn't approve this signup")
      return applicant
    },
    onSuccess: applicant => {
      queryClient.setQueryData<ApprovalsResponse | null>(QUERY_KEY, prev =>
        prev ? { ...prev, pending: prev.pending.filter(p => p.id !== applicant.id) } : prev)
      queryClient.invalidateQueries({ queryKey: ["officers"] })
      toast.success(`${applicant.full_name || applicant.email} can now sign in`)
    },
    onError: err => {
      notifyError(err, "Couldn't approve this signup")
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onSettled: () => setApprovingId(null),
  })

  const pending = data?.pending ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UserCheck}
        title="Approvals"
        badge={data ? (data.scope === "all" ? "All units" : "Your unit") : undefined}
        description="New signups waiting for access, and officers a unit head wants added to a programme. Decide on each one here."
      />

      <ProgramAdditionApprovals
        emptyFallback={signupsHidden
          ? <EmptyState icon={UserCheck} title="Nothing waiting for you" description="Programme additions that need your decision will appear here." />
          : null}
      />

      {!signupsHidden && (
        <section aria-labelledby="signups-heading" className="space-y-3">
          <div>
            <h2 id="signups-heading" className="text-base font-semibold">Signups</h2>
            <p className="text-sm text-muted-foreground">
              {data?.scope === "unit"
                ? "People who signed up into your unit and are waiting for access. Approving lets them sign in."
                : "People who signed up and are waiting for access. Unit heads can approve their own unit; you can approve everyone."}
            </p>
          </div>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} retrying={isRefetching} />
          ) : pending.length === 0 ? (
            <EmptyState icon={UserCheck} title="No pending signups" description="New signups for your unit will appear here." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pending.map(applicant => {
                const name = applicant.full_name || applicant.email
                const busy = approvingId === applicant.id
                return (
                  <Card key={applicant.id} className="flex flex-col">
                    <CardContent className="flex flex-1 flex-col gap-4 p-5">
                      <div className="flex items-start gap-3">
                        <Avatar>
                          {applicant.photo_url && <AvatarImage src={applicant.photo_url} alt="" />}
                          <AvatarFallback className="bg-orange-500 text-white">{initials(name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            Signed up {new Date(applicant.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-sm">
                        {applicant.oscar && (
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{normalizeOscarLabel(applicant.oscar)}</Badge>
                            {applicant.team && <Badge variant="outline" className="capitalize"><Users className="mr-1 h-3 w-3" aria-hidden="true" />Team {applicant.team}</Badge>}
                          </div>
                        )}
                        <p className="flex items-center gap-2 truncate text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{applicant.email}</p>
                        {applicant.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{applicant.phone}</p>}
                      </div>

                      <Button
                        className="mt-auto w-full bg-green-600 text-white hover:bg-green-700"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(applicant)}
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />}
                        {busy ? "Approving…" : "Approve"}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
