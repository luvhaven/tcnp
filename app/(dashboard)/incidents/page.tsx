'use client'

import { useReloadOnDeletion } from "@/hooks/useDashboardDeletions"
import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle,
  Plus,
  Radio,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  Download
} from 'lucide-react'
import { isAdmin, effectiveOscarRole, cn } from '@/lib/utils'
import { toast } from 'sonner'
import { notifyError, UserFacingError } from '@/lib/notify'
import { format } from 'date-fns'

type Severity = 'low' | 'medium' | 'high' | 'critical'
type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

type Incident = {
  id: string
  journey_id: string | null
  type: string
  severity: Severity
  description: string
  status: IncidentStatus
  latitude: number | null
  longitude: number | null
  reported_by: string
  created_at: string
  resolved_at: string | null
  journeys?: {
    origin: string | null
    destination: string | null
    papas: { full_name: string; title: string } | null
    cheetahs: {
      call_sign: string | null
      driver_name: string | null
      registration_number: string | null
    } | null
  } | null
  reporter?: {
    full_name: string
    oscar: string
  } | null
}

const SEVERITY_CONFIG = {
  low: { label: 'LOW', color: 'bg-gray-500', textColor: 'text-gray-700', bgLight: 'bg-gray-50' },
  medium: { label: 'MEDIUM', color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
  high: { label: 'HIGH', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
  critical: { label: 'CRITICAL', color: 'bg-red-600', textColor: 'text-red-800', bgLight: 'bg-red-100' }
}

const STATUS_CONFIG = {
  open: { label: 'Open', className: 'bg-amber-500/15 text-amber-600 border border-amber-500/30', icon: Clock },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/15 text-blue-600 border border-blue-500/30', icon: Radio },
  resolved: { label: 'Resolved', className: 'bg-gray-500/15 text-gray-500 border border-gray-500/30', icon: CheckCircle2 },
  closed: { label: 'Closed', className: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30', icon: CheckCircle2 }
}

const INCIDENT_TYPES = [
  'BROKEN ARROW',
  'TRAFFIC DELAY',
  'VEHICLE ISSUE',
  'MEDICAL EMERGENCY',
  'SECURITY BREACH',
  'WEATHER DELAY',
  'ROUTE CHANGE',
  'COMMUNICATION FAILURE',
  'OTHER'
]

// ─── URL filters ──────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'open' | 'resolved'
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]
const isClosedStatus = (status: string) => status === 'resolved' || status === 'closed'
const isSeverity = (value: string | null): value is Severity => !!value && Object.prototype.hasOwnProperty.call(SEVERITY_CONFIG, value)

export default function IncidentsPage() {
  // useSearchParams needs a Suspense boundary so the page can still prerender.
  return (
    <Suspense fallback={<IncidentsSkeleton />}>
      <IncidentsContent />
    </Suspense>
  )
}

function IncidentsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading incidents">
      <div>
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-5 w-20 shrink-0" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function IncidentsContent() {
  const supabase = createClient()
  const confirm = useConfirm()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [journeys, setJourneys] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Incident | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [typeError, setTypeError] = useState(false)
  const typeTriggerRef = useRef<HTMLButtonElement>(null)
  const loadSeq = useRef(0)
  const [formData, setFormData] = useState<{
    journey_id: string
    type: string
    severity: Severity
    description: string
    status: IncidentStatus
  }>({
    journey_id: '',
    type: '',
    severity: 'medium',
    description: '',
    status: 'open'
  })

  const statusParam = searchParams.get('status')
  const statusFilter: StatusFilter = statusParam === 'open' || statusParam === 'resolved' ? statusParam : 'all'
  const severityParam = searchParams.get('severity')
  const severityFilter: Severity | 'all' = isSeverity(severityParam) ? severityParam : 'all'

  const setFilter = (key: 'status' | 'severity', value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete(key)
    else params.set(key, value)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  /**
   * `background` reloads (realtime, after a save, rollbacks) keep the list on
   * screen. Only the first load shows the skeleton — re-showing it on every
   * realtime event made the page flash whenever anyone touched an incident.
   */
  const loadData = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    const seq = ++loadSeq.current
    try {
      if (!background) setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      const { data: userData } = await (supabase as any)
        .from('users')
        .select('*')
        .eq('id', user?.id ?? '')
        .single()

      const { data: incidentsData, error } = await supabase
        .from('incidents')
        .select(`
          *,
          journeys:journey_id (
            origin, destination,
            papas:papa_id (full_name, title),
            cheetahs:assigned_cheetah_id (call_sign, driver_name, registration_number)
          ),
          reporter:reported_by (full_name, oscar)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      const { data: journeysData } = await supabase
        .from('journeys')
        .select(`
          id,
          papas:papa_id (full_name, title),
          cheetahs:assigned_cheetah_id (call_sign)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (seq !== loadSeq.current) return // a newer load is in flight

      setCurrentUser(userData)
      setCanManage(Boolean(userData && (isAdmin(userData.role, userData.has_admin_access) || isAdmin(effectiveOscarRole(userData.role, userData.oscar)))))
      setIncidents((incidentsData || []) as unknown as Incident[])
      setJourneys(journeysData || [])
      setLoadError(false)
    } catch (error) {
      console.error('❌ Error loading incidents:', error)
      if (seq !== loadSeq.current) return
      setLoadError(true)
      // The first load shows an ErrorState; a failed background refresh keeps
      // the last list and says so once.
      if (background) toast.error('Could not refresh incidents. Showing the last loaded list.', { id: 'incidents-refresh-failed' })
    } finally {
      // The newest load ends the skeleton, background or not: a background
      // refresh that supersedes the first load must not leave it spinning.
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [supabase])

  const reloadInBackground = useCallback(() => { void loadData({ background: true }) }, [loadData])

  useEffect(() => {
    void loadData()
    const channel = supabase
      // Unique channel per tab to avoid multi-tab conflicts
      .channel(`incidents-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        reloadInBackground
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadData, reloadInBackground, supabase])

  useReloadOnDeletion(['incidents', 'journeys', 'papas', 'cheetahs', 'users'], reloadInBackground)

  const createAuditLog = useCallback(
    async (action: string, targetType: string, targetId: string | null, changes: Record<string, unknown>) => {
      try {
        await (supabase as any)
          .from('audit_logs')
          .insert([{ user_id: currentUser?.id ?? null, action, target_type: targetType, target_id: targetId, changes }])
      } catch (error) {
        console.error('❌ Error creating audit log entry:', error)
      }
    },
    [supabase, currentUser?.id]
  )

  const handleDelete = useCallback(
    async (incident: Incident) => {
      if (!canManage) {
        toast.error('You do not have permission to delete incidents')
        return
      }

      if (!await confirm({ message: `Delete incident "${incident.type}"?`, variant: 'destructive' })) {
        return
      }

      // Optimistic removal — item disappears immediately
      setIncidents(prev => prev.filter(i => i.id !== incident.id))
      if (editing?.id === incident.id) {
        setDialogOpen(false)
        setEditing(null)
      }

      try {
        const { error, count } = await supabase
          .from('incidents')
          .delete({ count: 'exact' })
          .eq('id', incident.id)

        if (error) throw error
        if (count === 0) {
          throw new UserFacingError('Deletion failed: You may lack permissions or the incident was already removed.')
        }

        await createAuditLog('delete_incident', 'incident', incident.id, {
          type: incident.type,
          severity: incident.severity,
          journey_id: incident.journey_id
        })

        toast.success('Incident deleted successfully')
      } catch (error: any) {
        console.error('Error deleting incident:', error)
        notifyError(error, 'Failed to delete incident')
        // Rollback — reload to restore if delete failed
        await loadData({ background: true })
      }
    },
    [canManage, confirm, supabase, createAuditLog, editing?.id, loadData]
  )


  const handleQuickResolve = useCallback(async (incident: Incident) => {
    if (isClosedStatus(incident.status)) return
    const confirmed = await confirm({
      title: 'Resolve this incident?',
      message: `Mark "${incident.type}"${incident.journeys?.papas?.full_name ? ` for ${incident.journeys.papas.full_name}` : ''} as resolved? It moves out of the open list for everyone.`,
      confirmText: 'Resolve',
    })
    if (!confirmed) return
    const resolvedAt = new Date().toISOString()
    // Optimistic update
    setIncidents(prev => prev.map(i => i.id === incident.id
      ? { ...i, status: 'resolved', resolved_at: resolvedAt }
      : i
    ))
    try {
      const { data: updated, error } = await (supabase as any)
        .from('incidents')
        .update({ status: 'resolved', resolved_at: resolvedAt })
        .eq('id', incident.id)
        .select('id')
      if (error) throw error
      // Row-level security refuses an update silently (no error, no rows).
      if (!updated || updated.length === 0) {
        throw new UserFacingError('This incident was not resolved. You may not have permission to change it.')
      }
      toast.success('Incident marked as resolved')
      await createAuditLog('resolve_incident', 'incident', incident.id, { previous_status: incident.status })
    } catch (err: any) {
      notifyError(err, 'Failed to resolve incident')
      await loadData({ background: true }) // rollback
    }
  }, [confirm, supabase, createAuditLog, loadData])

  const visibleIncidents = incidents.filter(incident =>
    (statusFilter === 'all' || (statusFilter === 'resolved') === isClosedStatus(incident.status)) &&
    (severityFilter === 'all' || incident.severity === severityFilter)
  )
  const filtersActive = statusFilter !== 'all' || severityFilter !== 'all'

  const handleExportCSV = useCallback(() => {
    const headers = ['Type', 'Severity', 'Status', 'Papa', 'Cheetah', 'Reporter', 'Created', 'Resolved']
    const rows = visibleIncidents.map(i => [
      i.type,
      i.severity,
      i.status,
      i.journeys?.papas?.full_name ?? '',
      i.journeys?.cheetahs?.call_sign ?? '',
      i.reporter?.full_name ?? '',
      format(new Date(i.created_at), 'dd/MM/yyyy HH:mm'),
      i.resolved_at ? format(new Date(i.resolved_at), 'dd/MM/yyyy HH:mm') : '',
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${visibleIncidents.length} incident${visibleIncidents.length !== 1 ? 's' : ''}`)
  }, [visibleIncidents])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (saving) return
    // The Select can't use the native `required`, so enforce it here.
    if (!formData.type) {
      setTypeError(true)
      typeTriggerRef.current?.focus()
      toast.error('Choose an incident type')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        // Keep the original resolution time when an already-resolved incident
        // is edited; only a change into resolved/closed stamps "now".
        const nowClosed = isClosedStatus(formData.status)
        const resolvedAt = nowClosed
          ? (isClosedStatus(editing.status) && editing.resolved_at ? editing.resolved_at : new Date().toISOString())
          : null
        const { data: updated, error } = await (supabase as any)
          .from('incidents')
          .update({
            journey_id: formData.journey_id || null,
            type: formData.type,
            severity: formData.severity,
            description: formData.description,
            status: formData.status,
            resolved_at: resolvedAt
          })
          .eq('id', editing.id)
          .select('id')

        if (error) throw error
        if (!updated || updated.length === 0) {
          throw new UserFacingError('This incident was not updated. You may not have permission to change it.')
        }
        toast.success('Incident updated successfully!')
      } else {
        const { error } = await (supabase as any)
          .from('incidents')
          .insert([{
            journey_id: formData.journey_id || null,
            type: formData.type,
            severity: formData.severity,
            description: formData.description,
            status: 'open',
            reported_by: currentUser?.id,
            created_by: currentUser?.id
          }])

        if (error) throw error
        toast.success('Incident reported successfully!')
      }

      setDialogOpen(false)
      setEditing(null)
      resetForm()
      void loadData({ background: true })
    } catch (error: any) {
      console.error('❌ Error saving incident:', error)
      notifyError(error, 'Failed to save incident')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setTypeError(false)
    setFormData({
      journey_id: '',
      type: '',
      severity: 'medium',
      description: '',
      status: 'open'
    })
  }

  const openDialog = (incident?: Incident) => {
    if (incident) {
      setEditing(incident)
      setTypeError(false)
      setFormData({
        journey_id: incident.journey_id || '',
        type: incident.type,
        severity: incident.severity,
        description: incident.description,
        status: incident.status
      })
    } else {
      setEditing(null)
      resetForm()
    }
    setDialogOpen(true)
  }

  if (loading) return <IncidentsSkeleton />

  const renderList = () => {
    if (incidents.length === 0 && loadError) {
      return (
        <ErrorState
          title="We couldn't load incidents"
          retrying={retrying}
          onRetry={() => {
            setRetrying(true)
            void loadData({ background: true }).finally(() => setRetrying(false))
          }}
        />
      )
    }
    if (incidents.length === 0) {
      return <EmptyState icon={AlertTriangle} title="No incidents reported" />
    }
    if (visibleIncidents.length === 0) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="No incidents match these filters"
          action={
            <Button variant="outline" className="h-9" onClick={() => router.replace(pathname, { scroll: false })}>
              Show all incidents
            </Button>
          }
        />
      )
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Papa</th>
              <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Reporter</th>
              <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Cheetah</th>
              <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Location</th>
              <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Type / Severity</th>
              <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Status</th>
              <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Time</th>
              <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleIncidents.map((incident) => {
              const severityConfig = SEVERITY_CONFIG[incident.severity] ?? SEVERITY_CONFIG.medium
              const statusConfig = STATUS_CONFIG[incident.status] ?? STATUS_CONFIG.open
              const StatusIcon = statusConfig.icon
              const isBrokenArrow = incident.type === 'BROKEN ARROW'

              return (
                <tr
                  key={incident.id}
                  className={`border-b cursor-pointer transition-colors ${isBrokenArrow
                    ? 'bg-destructive/5 hover:bg-destructive/10'
                    : 'hover:bg-muted/50'
                    }`}
                  onClick={() => openDialog(incident)}
                >
                  {/* Papa */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-semibold">
                        {incident.journeys?.papas?.full_name ?? '—'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {incident.journeys?.papas?.title ?? ''}
                      </span>
                    </div>
                  </td>

                  {/* DO / Reporter */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {incident.reporter?.full_name ?? '—'}
                      </span>
                      {incident.reporter?.oscar && (
                        <span className="text-xs text-muted-foreground uppercase">
                          {incident.reporter.oscar}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Cheetah & Driver */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-medium flex items-center gap-1">
                        <Radio className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        {incident.journeys?.cheetahs?.call_sign ?? '—'}
                      </span>
                      {incident.journeys?.cheetahs?.driver_name && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" aria-hidden="true" />
                          {incident.journeys.cheetahs.driver_name}
                        </span>
                      )}
                      {incident.journeys?.cheetahs?.registration_number && (
                        <span className="text-xs text-muted-foreground">
                          {incident.journeys.cheetahs.registration_number}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Location */}
                  <td className="py-4 px-4">
                    {incident.journeys?.origin || incident.journeys?.destination ? (
                      <div className="flex flex-col text-xs text-muted-foreground">
                        {incident.journeys?.origin && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                            From: {incident.journeys.origin}
                          </span>
                        )}
                        {incident.journeys?.destination && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 flex-shrink-0 text-primary" aria-hidden="true" />
                            To: {incident.journeys.destination}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>

                  {/* Type / Severity */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col gap-1">
                      <span className={`font-semibold text-sm ${isBrokenArrow ? 'text-destructive' : ''
                        }`}>
                        {isBrokenArrow && '🚨 '}{incident.type}
                      </span>
                      <Badge className={`${severityConfig.color} text-white text-xs w-fit`}>
                        {severityConfig.label}
                      </Badge>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${statusConfig.className}`}>
                      <StatusIcon className="h-3 w-3" aria-hidden="true" />
                      {statusConfig.label}
                    </span>
                    {incident.resolved_at && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(incident.resolved_at), 'dd/MM HH:mm')}
                      </div>
                    )}
                  </td>

                  {/* Time */}
                  <td className="py-4 px-4 text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(incident.created_at), 'dd/MM/yy, HH:mm')}
                  </td>

                  {/* Actions */}
                  <td className="py-4 px-4">
                    <div className="flex justify-end gap-1.5">
                      {!isClosedStatus(incident.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs text-emerald-600 border-emerald-400/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          aria-label={`Resolve incident ${incident.type}`}
                          onClick={(e) => { e.stopPropagation(); void handleQuickResolve(incident) }}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />
                          Resolve
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs"
                          aria-label={`Delete incident ${incident.type}`}
                          onClick={(e) => { e.stopPropagation(); void handleDelete(incident) }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <PageHeader
        icon={AlertTriangle}
        tone="destructive"
        title="Incident Management"
        badge="Safety & Distress"
        description="Real-time distress signals, vehicle delays, route alerts, and resolution audit tracking."
        actions={
          <>
            <Button variant="outline" onClick={handleExportCSV} disabled={visibleIncidents.length === 0}>
              <Download aria-hidden="true" />
              Export CSV
            </Button>
            <Button variant="destructive" onClick={() => openDialog()}>
              <Plus aria-hidden="true" />
              Report Incident
            </Button>
          </>
        }
      />

      {/* Incidents Table */}
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <CardTitle>
            {statusFilter === 'open' ? 'Open Incidents' : statusFilter === 'resolved' ? 'Resolved Incidents' : 'All Incidents'}
          </CardTitle>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div role="group" aria-label="Filter by status" className="inline-flex w-full rounded-md border p-0.5 sm:w-auto">
              {STATUS_FILTERS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={statusFilter === option.value}
                  onClick={() => setFilter('status', option.value)}
                  className={cn(
                    'h-9 flex-1 rounded px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none',
                    statusFilter === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Select value={severityFilter} onValueChange={(value) => setFilter('severity', value)}>
              <SelectTrigger className="h-9 w-full sm:w-[180px]" aria-label="Filter by severity">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {renderList()}
          {filtersActive && incidents.length > 0 && visibleIncidents.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {visibleIncidents.length} of {incidents.length} incidents
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Update Incident' : 'Report New Incident'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="incident-journey">Journey (Optional)</Label>
                <Select
                  value={formData.journey_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, journey_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger id="incident-journey">
                    <SelectValue placeholder="Select journey" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {journeys.map((journey) => (
                      <SelectItem key={journey.id} value={journey.id}>
                        {journey.papas?.full_name || 'Unknown'} - {journey.cheetahs?.call_sign || 'No call sign'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => {
                    setTypeError(false)
                    setFormData({ ...formData, type: value })
                  }}
                >
                  <SelectTrigger
                    id="incident-type"
                    ref={typeTriggerRef}
                    aria-required="true"
                    aria-invalid={typeError || undefined}
                    aria-describedby={typeError ? 'incident-type-error' : undefined}
                    className={cn(typeError && 'border-destructive')}
                  >
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeError && (
                  <p id="incident-type-error" className="text-xs text-destructive">Choose an incident type.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="incident-severity">Severity *</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(value) => setFormData({ ...formData, severity: value as Severity })}
                >
                  <SelectTrigger id="incident-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editing && (
                <div className="space-y-2">
                  <Label htmlFor="incident-status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as IncidentStatus })}
                  >
                    <SelectTrigger id="incident-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="incident-description">Description *</Label>
              <Textarea
                id="incident-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the incident in detail..."
                rows={4}
                required
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-4">
              {editing && canManage && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => editing && handleDelete(editing)}
                >
                  Delete Incident
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90" pending={saving}>
                {editing ? 'Update Incident' : 'Report Incident'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
