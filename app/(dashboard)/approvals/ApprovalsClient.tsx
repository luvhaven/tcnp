"use client"

import { useState, type FormEvent } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { UserCheck, UserX, RotateCcw, Phone, Mail, Users, ChevronDown } from "lucide-react"
import { notifyError, UserFacingError } from "@/lib/notify"
import {
  normalizeOscarLabel,
  SIGNUP_DECLINE_REASON_MAX,
  SIGNUP_DECLINE_REASON_MIN,
  SIGNUP_DECLINED_WINDOW_DAYS,
} from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
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

type DeclinedSignup = {
  id: string
  full_name: string | null
  email: string
  oscar: string | null
  reason: string | null
  declined_at: string
  declined_by_name: string | null
}

type ApprovalsResponse = {
  pending: PendingSignup[]
  scope: "all" | "unit" | "none"
  canReopen?: boolean
  declined?: DeclinedSignup[] | null
  declinedFailed?: boolean
}

type Decision = "approve" | "decline" | "reopen"

const QUERY_KEY = ["signup-approvals"]

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase()
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

/** A refused decision with its HTTP status (409 = already decided elsewhere). */
class DecisionError extends UserFacingError {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function sendDecision(officerId: string, decision: Decision, reason?: string) {
  const res = await fetch("/api/officers/signup-approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ officerId, decision, ...(reason ? { reason } : {}) }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new DecisionError(body.error || "Couldn't save this decision", res.status)
  return body
}

export default function ApprovalsClient() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [declining, setDeclining] = useState<PendingSignup | null>(null)
  const [reason, setReason] = useState("")
  const [reasonTouched, setReasonTouched] = useState(false)
  // A refused decline keeps the dialog (and the typed reason) open with the
  // server's message, so the head can fix it or retry without retyping.
  const [declineError, setDeclineError] = useState<string | null>(null)

  // `null` means the viewer may not manage signups (403) — e.g. the Head of
  // Command without admin access, who reaches this page for programme
  // additions only. The signups section is then hidden rather than shown as a failure.
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<ApprovalsResponse | null>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/officers/signup-approvals")
      if (res.status === 403) return null
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new UserFacingError(body.error || "Couldn't load pending signups")
      return body
    },
    // Approving on the Officers page changes this list without touching this
    // query, so never show a cached pending list when the page opens.
    staleTime: 0,
    refetchOnMount: "always",
  })
  const signupsHidden = data === null
  const showPending = !signupsHidden && data?.scope !== "none"
  const canReopen = data?.canReopen === true

  // Optimistic: the card leaves the list at once and comes back if the server refuses.
  const removePending = async (id: string) => {
    await queryClient.cancelQueries({ queryKey: QUERY_KEY })
    const previous = queryClient.getQueryData<ApprovalsResponse | null>(QUERY_KEY)
    queryClient.setQueryData<ApprovalsResponse | null>(QUERY_KEY, prev =>
      prev ? { ...prev, pending: prev.pending.filter(p => p.id !== id) } : prev)
    return { previous }
  }
  const restore = (context: { previous?: ApprovalsResponse | null } | undefined) => {
    if (context && context.previous !== undefined) queryClient.setQueryData(QUERY_KEY, context.previous)
  }
  const settle = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ["officers"] })
  }

  const approve = useMutation({
    mutationFn: (applicant: PendingSignup) => sendDecision(applicant.id, "approve"),
    onMutate: applicant => removePending(applicant.id),
    onSuccess: (_, applicant) => toast.success(`${applicant.full_name || applicant.email} can now sign in`),
    onError: (err, _, context) => {
      restore(context)
      notifyError(err, "Couldn't approve this signup")
    },
    onSettled: settle,
  })

  const decline = useMutation({
    mutationFn: ({ applicant, reason }: { applicant: PendingSignup; reason: string }) =>
      sendDecision(applicant.id, "decline", reason),
    onMutate: ({ applicant }) => removePending(applicant.id),
    onSuccess: (_, { applicant }) => toast.success(`${applicant.full_name || applicant.email}'s signup was declined`),
    // The card comes back; the message is shown inside the dialog (submitDecline).
    onError: (_err, _, context) => restore(context),
    onSettled: settle,
  })

  const reopen = useMutation({
    mutationFn: (person: DeclinedSignup) => sendDecision(person.id, "reopen"),
    onMutate: async person => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<ApprovalsResponse | null>(QUERY_KEY)
      queryClient.setQueryData<ApprovalsResponse | null>(QUERY_KEY, prev =>
        prev ? { ...prev, declined: (prev.declined ?? []).filter(p => p.id !== person.id) } : prev)
      return { previous }
    },
    onSuccess: (_, person) => toast.success(`${person.full_name || person.email} is back in the pending list`),
    onError: (err, _, context) => {
      restore(context)
      notifyError(err, "Couldn't reopen this signup")
    },
    onSettled: settle,
  })

  const busy = approve.isPending || decline.isPending
  const trimmedReason = reason.trim()
  const reasonError = trimmedReason.length < SIGNUP_DECLINE_REASON_MIN
    ? `Give a reason of at least ${SIGNUP_DECLINE_REASON_MIN} characters.`
    : trimmedReason.length > SIGNUP_DECLINE_REASON_MAX
      ? `Keep the reason under ${SIGNUP_DECLINE_REASON_MAX} characters.`
      : null

  const openDecline = (applicant: PendingSignup) => {
    setDeclining(applicant)
    setReason("")
    setReasonTouched(false)
    setDeclineError(null)
  }
  // The dialog stays open until the server answers.
  const closeDecline = () => { if (!decline.isPending) setDeclining(null) }
  const submitDecline = (event: FormEvent) => {
    event.preventDefault()
    setReasonTouched(true)
    if (!declining || reasonError || decline.isPending) return
    setDeclineError(null)
    decline.mutate({ applicant: declining, reason: trimmedReason }, {
      onSuccess: () => setDeclining(null),
      onError: err => {
        // Someone else already decided it: nothing left to decline here.
        if (err instanceof DecisionError && err.status === 409) {
          setDeclining(null)
          notifyError(err, "This signup was already decided")
          return
        }
        setDeclineError(err instanceof UserFacingError
        ? err.message
        : "Couldn't decline this signup. Check your connection and try again.")
      },
    })
  }

  const askReopen = async (person: DeclinedSignup) => {
    const ok = await confirm({
      title: "Reopen this signup?",
      message: `${person.full_name || person.email} goes back to the pending list, where their unit head or an admin can approve or decline it again. They still cannot sign in until it is approved.`,
      confirmText: "Reopen",
    })
    if (ok) reopen.mutate(person)
  }

  const pending = data?.pending ?? []
  const declined = data?.declined ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UserCheck}
        title="Approvals"
        badge={data ? (data.scope === "all" ? "All units" : data.scope === "unit" ? "Your unit" : undefined) : undefined}
        description="New signups waiting for access, and officers a unit head wants added to a programme. Decide on each one here."
      />

      <ProgramAdditionApprovals
        emptyFallback={signupsHidden
          ? <EmptyState icon={UserCheck} title="Nothing waiting for you" description="Programme additions that need your decision will appear here." />
          : null}
      />

      {showPending && (
        <section aria-labelledby="signups-heading" className="space-y-3">
          <div>
            <h2 id="signups-heading" className="text-base font-semibold">Signups</h2>
            <p className="text-sm text-muted-foreground">
              {data?.scope === "unit"
                ? "People who signed up into your unit and are waiting for access. Approving lets them sign in; declining keeps them out and records your reason."
                : "People who signed up and are waiting for access. Unit heads can decide for their own unit; you can decide for everyone."}
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
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Pending signups">
              {pending.map(applicant => {
                const name = applicant.full_name || applicant.email
                return (
                  <li key={applicant.id}>
                    <Card className="flex h-full flex-col">
                      <CardContent className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <Avatar>
                            {applicant.photo_url && <AvatarImage src={applicant.photo_url} alt="" />}
                            <AvatarFallback className="bg-orange-500 text-white">{initials(name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{name}</p>
                            <p className="text-xs text-muted-foreground">Signed up {shortDate(applicant.created_at)}</p>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-sm">
                          {applicant.oscar && (
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{normalizeOscarLabel(applicant.oscar)}</Badge>
                              {applicant.team && <Badge variant="outline" className="capitalize"><Users className="mr-1 h-3 w-3" aria-hidden="true" />Team {applicant.team}</Badge>}
                            </div>
                          )}
                          <p className="flex min-w-0 items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{applicant.email}</span></p>
                          {applicant.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{applicant.phone}</p>}
                        </div>

                        <div className="mt-auto grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            className="h-11 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={busy}
                            onClick={() => openDecline(applicant)}
                            aria-label={`Decline ${name}`}
                          >
                            <UserX aria-hidden="true" />
                            Decline
                          </Button>
                          <Button
                            className="h-11 w-full bg-green-600 text-white hover:bg-green-700"
                            disabled={busy}
                            onClick={() => approve.mutate(applicant)}
                            aria-label={`Approve ${name}`}
                          >
                            <UserCheck aria-hidden="true" />
                            Approve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {!signupsHidden && canReopen && (
        <section aria-labelledby="declined-heading">
          <details className="group rounded-xl border bg-card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              <span id="declined-heading" className="text-sm font-semibold">
                Declined (last {SIGNUP_DECLINED_WINDOW_DAYS} days){data?.declined ? ` · ${declined.length}` : ""}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-3 border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Declined accounts are kept for the record and cannot sign in. Reopen one to send it back to the pending list.
              </p>
              {isLoading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : data?.declinedFailed ? (
                <ErrorState
                  className="py-6"
                  title="We couldn't load declined signups"
                  onRetry={() => refetch()}
                  retrying={isRefetching}
                />
              ) : declined.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No signups were declined in the last {SIGNUP_DECLINED_WINDOW_DAYS} days.</p>
              ) : (
                <ul className="divide-y" aria-label="Declined signups">
                  {declined.map(person => {
                    const name = person.full_name || person.email
                    const reopening = reopen.isPending && reopen.variables?.id === person.id
                    return (
                      <li key={person.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1 text-sm">
                          <p className="truncate font-medium">{name}</p>
                          <p className="truncate text-muted-foreground">{person.email}</p>
                          {person.oscar && <Badge variant="outline">{normalizeOscarLabel(person.oscar)}</Badge>}
                          {person.reason && <p className="break-words"><span className="text-muted-foreground">Reason: </span>{person.reason}</p>}
                          <p className="text-xs text-muted-foreground">
                            Declined {shortDate(person.declined_at)}{person.declined_by_name ? ` by ${person.declined_by_name}` : ""}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="h-11 w-full shrink-0 sm:w-auto"
                          pending={reopening}
                          disabled={reopen.isPending}
                          onClick={() => askReopen(person)}
                          aria-label={`Reopen ${name}'s signup`}
                        >
                          {!reopening && <RotateCcw aria-hidden="true" />}
                          Reopen
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </details>
        </section>
      )}

      <Dialog open={declining !== null} onOpenChange={open => { if (!open) closeDecline() }}>
        {declining && (
          <DialogContent className="max-w-md">
            <form onSubmit={submitDecline} className="space-y-4" noValidate>
              <DialogHeader>
                <DialogTitle>Decline {declining.full_name || declining.email}?</DialogTitle>
                <DialogDescription>
                  They will not be able to sign in, and they will see &quot;Your sign-up was not approved. Contact your unit head.&quot; The account is kept, and an admin can reopen it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="decline-reason">Reason (required)</Label>
                <Textarea
                  id="decline-reason"
                  rows={3}
                  value={reason}
                  maxLength={SIGNUP_DECLINE_REASON_MAX}
                  onChange={event => { setReason(event.target.value); setDeclineError(null) }}
                  onBlur={() => setReasonTouched(true)}
                  placeholder="For example: not known to the unit, or a duplicate account"
                  aria-invalid={reasonTouched && reasonError ? true : undefined}
                  aria-describedby={declineError ? "decline-reason-help decline-error" : "decline-reason-help"}
                  readOnly={decline.isPending}
                  required
                />
                <p id="decline-reason-help" className={reasonTouched && reasonError ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
                  {reasonTouched && reasonError ? reasonError : `Recorded with your name. ${trimmedReason.length}/${SIGNUP_DECLINE_REASON_MAX}`}
                </p>
              </div>
              {declineError && (
                <p id="decline-error" role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {declineError}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" className="h-11" onClick={closeDecline} disabled={decline.isPending}>Cancel</Button>
                <Button type="submit" variant="destructive" className="h-11" pending={decline.isPending} disabled={decline.isPending}>
                  {!decline.isPending && <UserX aria-hidden="true" />}
                  {decline.isPending ? "Declining…" : "Decline signup"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
