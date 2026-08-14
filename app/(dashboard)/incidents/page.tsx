'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertTriangle,
  Plus,
  Radio,
  CheckCircle,
  CheckCircle2,
  Clock,
  XCircle,
  MapPin,
  User,
  Download
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

type Incident = {
  id: string
  journey_id: string | null
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
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

export default function IncidentsPage() {
  const supabase = createClient()
  const confirm = useConfirm()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [journeys, setJourneys] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Incident | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [formData, setFormData] = useState<{
    journey_id: string
    type: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    description: string
    status: 'open' | 'in_progress' | 'resolved' | 'closed'
  }>({
    journey_id: '',
    type: '',
    severity: 'medium',
    description: '',
    status: 'open'
  })

  useEffect(() => {
    loadData()
    const channel = subscribeToIncidents()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      const { data: userData } = await (supabase as any)
        .from('users')
        .select('*')
        .eq('id', user?.id ?? '')
        .single()

      setCurrentUser(userData)

      const canManageIncidents = ['super_admin', 'dev_admin', 'admin'].includes(userData?.role)
      setCanManage(Boolean(canManageIncidents))

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

      setIncidents((incidentsData || []) as unknown as Incident[])

      const { data: journeysData } = await supabase
        .from('journeys')
        .select(`
          id,
          papas:papa_id (full_name, title),
          cheetahs:assigned_cheetah_id (call_sign)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      setJourneys(journeysData || [])
    } catch (error) {
      console.error('❌ Error loading incidents:', error)
      toast.error('Failed to load incidents')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const subscribeToIncidents = () => {
    const channel = supabase
      // Unique channel per tab to avoid multi-tab conflicts
      .channel(`incidents-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => { loadData() }
      )
      .subscribe()
    return channel
  }

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
          throw new Error('Deletion failed: You may lack permissions or the incident was already removed.')
        }

        await createAuditLog('delete_incident', 'incident', incident.id, {
          type: incident.type,
          severity: incident.severity,
          journey_id: incident.journey_id
        })

        toast.success('Incident deleted successfully')
      } catch (error: any) {
        console.error('Error deleting incident:', error)
        toast.error(error.message || 'Failed to delete incident')
        // Rollback — reload to restore if delete failed
        await loadData()
      }
    },
    [canManage, supabase, createAuditLog, editing?.id, loadData]
  )


  const handleQuickResolve = useCallback(async (incident: Incident) => {
    if (incident.status === 'resolved' || incident.status === 'closed') return
    // Optimistic update
    setIncidents(prev => prev.map(i => i.id === incident.id
      ? { ...i, status: 'resolved', resolved_at: new Date().toISOString() }
      : i
    ))
    try {
      const { error } = await (supabase as any)
        .from('incidents')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', incident.id)
      if (error) throw error
      toast.success('Incident marked as resolved')
      await createAuditLog('resolve_incident', 'incident', incident.id, { previous_status: incident.status })
    } catch (err: any) {
      toast.error(err.message || 'Failed to resolve incident')
      await loadData() // rollback
    }
  }, [supabase, createAuditLog, loadData])

  const handleExportCSV = useCallback(() => {
    const headers = ['Type', 'Severity', 'Status', 'Papa', 'Cheetah', 'Reporter', 'Created', 'Resolved']
    const rows = incidents.map(i => [
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
    toast.success(`Exported ${incidents.length} incident${incidents.length !== 1 ? 's' : ''}`)
  }, [incidents])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from('incidents')
          .update({
            journey_id: formData.journey_id || null,
            type: formData.type,
            severity: formData.severity,
            description: formData.description,
            status: formData.status,
            resolved_at: (formData.status === 'resolved' || formData.status === 'closed') ? new Date().toISOString() : null
          })
          .eq('id', editing.id)

        if (error) throw error
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
      loadData()
    } catch (error: any) {
      console.error('❌ Error saving incident:', error)
      toast.error(error.message || 'Failed to save incident')
    }
  }

  const resetForm = () => {
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

  const getCallSign = (incident: Incident) => {
    if (incident.journeys?.cheetahs?.call_sign) {
      return incident.journeys.cheetahs.call_sign
    }
    return 'General Incident'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-64 rounded-md skeleton" />
          <div className="mt-2 h-4 w-80 rounded-md skeleton" />
        </div>

        <Card>
          <CardHeader>
            <div className="h-5 w-40 rounded-md skeleton" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0"
                >
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded-md skeleton" />
                    <div className="h-3 w-72 rounded-md skeleton" />
                  </div>
                  <div className="h-5 w-20 rounded-md skeleton" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Incident Management</h1>
              <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider bg-destructive/10 text-destructive border-destructive/20">
                Safety & Distress
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Real-time distress signals, vehicle delays, route alerts, and resolution audit tracking.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={incidents.length === 0} className="h-9 text-xs font-medium gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button onClick={() => openDialog()} size="sm" className="h-9 gap-1.5 text-xs font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm">
            <Plus className="h-3.5 w-3.5" />
            Report Incident
          </Button>
        </div>
      </div>

      {/* Incidents Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Papa</th>
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Reporter</th>
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Cheetah</th>
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Type / Severity</th>
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Time</th>
                  <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="text-center py-12 text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No incidents reported</p>
                    </td>
                  </tr>
                ) : (
                  incidents.map((incident) => {
                    const severityConfig = SEVERITY_CONFIG[incident.severity]
                    const statusConfig = STATUS_CONFIG[incident.status]
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
                              <Radio className="h-3 w-3 text-muted-foreground" />
                              {incident.journeys?.cheetahs?.call_sign ?? '—'}
                            </span>
                            {(incident.journeys?.cheetahs as any)?.driver_name && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {(incident.journeys?.cheetahs as any).driver_name}
                              </span>
                            )}
                            {(incident.journeys?.cheetahs as any)?.registration_number && (
                              <span className="text-xs text-muted-foreground">
                                {(incident.journeys?.cheetahs as any).registration_number}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Location */}
                        <td className="py-4 px-4">
                          {(incident.journeys as any)?.origin || (incident.journeys as any)?.destination ? (
                            <div className="flex flex-col text-xs text-muted-foreground">
                              {(incident.journeys as any)?.origin && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 flex-shrink-0" />
                                  From: {(incident.journeys as any).origin}
                                </span>
                              )}
                              {(incident.journeys as any)?.destination && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 flex-shrink-0 text-primary" />
                                  To: {(incident.journeys as any).destination}
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
                            <Badge className={`${severityConfig.color} text-white text-[10px] w-fit`}>
                              {severityConfig.label}
                            </Badge>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${statusConfig.className}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.label}
                          </span>
                          {incident.resolved_at && (
                            <div className="text-[10px] text-muted-foreground mt-1">
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
                            {incident.status !== 'resolved' && incident.status !== 'closed' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-emerald-600 border-emerald-400/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                onClick={(e) => { e.stopPropagation(); handleQuickResolve(incident) }}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => { e.stopPropagation(); handleDelete(incident) }}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Update Incident' : 'Report New Incident'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Journey (Optional)</Label>
                <Select
                  value={formData.journey_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, journey_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
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
                <Label>Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Severity *</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(value) => setFormData({ ...formData, severity: value as any })}
                >
                  <SelectTrigger>
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
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as any })}
                  >
                    <SelectTrigger>
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
              <Label>Description *</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the incident in detail..."
                rows={4}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
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
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                {editing ? 'Update Incident' : 'Report Incident'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
