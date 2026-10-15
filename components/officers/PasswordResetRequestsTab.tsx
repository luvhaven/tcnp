"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { formatDistanceToNow } from "date-fns"
import { Check, X, KeyRound, Clock, Search, RefreshCw, AlertCircle, ShieldAlert, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import type { PasswordResetRequest } from "@/types/database.types"

export function PasswordResetRequestsTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [rejectDialogItem, setRejectDialogItem] = useState<PasswordResetRequest | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  // Fetch password reset requests
  const { data: requests = [], isLoading, isFetching, refetch } = useQuery<PasswordResetRequest[]>({
    queryKey: ['admin-password-resets'],
    queryFn: async () => {
      const res = await fetch('/api/admin/password-resets')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load password reset requests')
      }
      const data = await res.json()
      return data.requests || []
    },
    staleTime: 10_000,
  })

  // Real-time subscription to password_reset_requests and broadcast channel
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    const channel = supabase
      .channel('admin-password-resets-listener')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'password_reset_requests',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-password-resets'] })
        }
      )
      .on(
        'broadcast',
        { event: 'new_request' },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['admin-password-resets'] })
          toast.info('New Password Reset Request', {
            description: `${payload.payload?.email || 'A user'} requested a password reset.`,
          })
        }
      )
      .on(
        'broadcast',
        { event: 'request_updated' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-password-resets'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch('/api/admin/password-resets/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to approve request')
      return data
    },
    onSuccess: (data, requestId) => {
      queryClient.setQueryData<PasswordResetRequest[]>(['admin-password-resets'], (old) => {
        if (!old) return old
        return old.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r))
      })
      queryClient.invalidateQueries({ queryKey: ['admin-password-resets'] })
      toast.success('Reset request approved. The user can now set their new password.')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to approve request')
    },
  })

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason?: string }) => {
      const res = await fetch('/api/admin/password-resets/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reject request')
      return data
    },
    onSuccess: (data, { requestId }) => {
      queryClient.setQueryData<PasswordResetRequest[]>(['admin-password-resets'], (old) => {
        if (!old) return old
        return old.map((r) => (r.id === requestId ? { ...r, status: 'rejected' } : r))
      })
      queryClient.invalidateQueries({ queryKey: ['admin-password-resets'] })
      toast.success('Reset request rejected.')
      setRejectDialogItem(null)
      setRejectReason("")
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reject request')
    },
  })

  // Filter requests
  const filtered = requests.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (!search) return true
    const term = search.toLowerCase()
    const nameMatch = r.user?.full_name?.toLowerCase().includes(term)
    const emailMatch = r.email?.toLowerCase().includes(term)
    const oscarMatch = r.user?.oscar?.toLowerCase().includes(term)
    return Boolean(nameMatch || emailMatch || oscarMatch)
  })

  const pendingCount = requests.filter((r) => r.status === 'pending').length

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 gap-1 animate-pulse">
            <Clock className="h-3 w-3" />
            Pending Approval
          </Badge>
        )
      case 'approved':
        return (
          <Badge className="bg-sky-500/15 text-sky-400 border border-sky-500/30 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Approved (Awaiting User)
          </Badge>
        )
      case 'completed':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-1">
            <Check className="h-3 w-3" />
            Completed
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="destructive" className="bg-rose-500/15 text-rose-400 border border-rose-500/30 gap-1">
            <X className="h-3 w-3" />
            Rejected
          </Badge>
        )
      case 'expired':
        return (
          <Badge variant="secondary" className="gap-1 opacity-70">
            <AlertCircle className="h-3 w-3" />
            Expired
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or Oscar..."
            className="pl-9 h-9 bg-card border-border/60"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/60 p-0.5 bg-card/60 text-xs">
            {['all', 'pending', 'approved', 'completed', 'rejected'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                  filterStatus === s
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'pending' && pendingCount > 0 ? (
                  <span className="flex items-center gap-1.5">
                    Pending
                    <span className="h-4 w-4 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                      {pendingCount}
                    </span>
                  </span>
                ) : (
                  s
                )}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-2.5 shrink-0"
            title="Refresh requests"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="w-[30%]">User / Officer</TableHead>
              <TableHead className="w-[20%]">Unit / Oscar</TableHead>
              <TableHead className="w-[20%]">Status</TableHead>
              <TableHead className="w-[15%]">Requested</TableHead>
              <TableHead className="w-[15%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading password reset requests…</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-36 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <KeyRound className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No password reset requests found</p>
                    <p className="text-xs text-muted-foreground/80">
                      {filterStatus === 'pending'
                        ? 'There are no reset requests waiting for your approval.'
                        : 'Any future requests submitted from the login page will appear here.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((req) => {
                const isPending = req.status === 'pending'
                const isApproving = approveMutation.isPending && approveMutation.variables === req.id
                const isRejecting = rejectMutation.isPending && rejectMutation.variables?.requestId === req.id

                return (
                  <TableRow key={req.id} className="border-border/60 hover:bg-muted/40 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/60">
                          <AvatarImage src={req.user?.photo_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                            {(req.user?.full_name || req.email || "U").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {req.user?.full_name || "Protocol Officer"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{req.email}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-foreground">
                          {req.user?.oscar || req.user?.unit || "Command Protocol"}
                        </span>
                        <span className="text-[11px] text-muted-foreground capitalize">
                          {req.user?.role?.replace(/_/g, ' ') || "Viewer"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {getStatusBadge(req.status)}
                        {req.rejection_reason && (
                          <span className="text-[11px] text-rose-400 line-clamp-1" title={req.rejection_reason}>
                            Reason: {req.rejection_reason}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-muted-foreground" title={req.requested_at}>
                        {req.requested_at
                          ? formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })
                          : "Unknown"}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      {isPending ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => approveMutation.mutate(req.id)}
                            disabled={isApproving || isRejecting}
                            className="h-8 px-2.5 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{isApproving ? "Approving…" : "Approve"}</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRejectDialogItem(req)
                              setRejectReason("")
                            }}
                            disabled={isApproving || isRejecting}
                            className="h-8 px-2.5 gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/70 italic pr-2">
                          {req.status === 'approved'
                            ? 'Approved'
                            : req.status === 'completed'
                            ? 'Completed'
                            : req.status === 'rejected'
                            ? 'Declined'
                            : 'Closed'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Reject Confirmation Dialog */}
      <Dialog open={Boolean(rejectDialogItem)} onOpenChange={(open) => !open && setRejectDialogItem(null)}>
        <DialogContent className="max-w-md bg-zinc-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="h-5 w-5" />
              Reject Password Reset Request
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to decline the password reset request for{" "}
              <strong className="text-white font-medium">{rejectDialogItem?.email}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label htmlFor="reject-reason" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Reason (Optional)
            </label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Identity not confirmed, contact command"
              className="bg-white/5 border-white/10 text-white placeholder-zinc-500"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRejectDialogItem(null)}
              className="border-white/10 text-zinc-300 hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectDialogItem) {
                  rejectMutation.mutate({
                    requestId: rejectDialogItem.id,
                    reason: rejectReason.trim() || undefined,
                  })
                }
              }}
              disabled={rejectMutation.isPending}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {rejectMutation.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
