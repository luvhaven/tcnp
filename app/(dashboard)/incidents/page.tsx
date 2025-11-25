'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { 
  AlertTriangle, 
  Plus, 
  Radio,
  CheckCircle,
  Clock,
  XCircle,
  MapPin,
  User
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
    papas: { full_name: string; title: string }
    cheetahs: { call_sign: string }
  } | null
  reporter?: {
    full_name: string
    oscar: string
  }
}

const SEVERITY_CONFIG = {
  low: { label: 'LOW', color: 'bg-gray-500', textColor: 'text-gray-700', bgLight: 'bg-gray-50' },
  medium: { label: 'MEDIUM', color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
  high: { label: 'HIGH', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
  critical: { label: 'CRITICAL', color: 'bg-red-600', textColor: 'text-red-800', bgLight: 'bg-red-100' }
}

const STATUS_CONFIG = {
  open: { label: 'OPEN', color: 'bg-yellow-500', icon: Clock },
  in_progress: { label: 'IN PROGRESS', color: 'bg-blue-500', icon: Radio },
  resolved: { label: 'RESOLVED', color: 'bg-gray-500', icon: CheckCircle },
  closed: { label: 'CLOSED', color: 'bg-green-500', icon: CheckCircle }
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

  const loadData = async () => {
    try {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single()
      
      setCurrentUser(userData)

      const canManageIncidents = ['super_admin', 'admin'].includes(userData?.role)
      setCanManage(Boolean(canManageIncidents))

      const { data: incidentsData, error } = await supabase
        .from('incidents')
        .select(`
          *,
          journeys:journey_id (
            papas:papa_id (full_name, title),
            cheetahs:assigned_cheetah_id (call_sign)
          ),
          reporter:reported_by (full_name, oscar)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      console.log('✅ Loaded incidents:', incidentsData)
      setIncidents(incidentsData || [])

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
  }

  const subscribeToIncidents = () => {
    const channel = supabase
      .channel('incidents-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        (payload) => {
          console.log('📡 Incident update:', payload)
          loadData()
        }
      )
      .subscribe()
    
    return channel
  }

  const createAuditLog = useCallback(
    async (action: string, targetType: string, targetId: string | null, changes: Record<string, unknown>) => {
      try {
        await supabase
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

      if (!confirm(`Delete incident "${incident.type}"?`)) {
        return
      }

      try {
        const { error } = await supabase
          .from('incidents')
          .delete()
          .eq('id', incident.id)

        if (error) throw error

        await createAuditLog('delete_incident', 'incident', incident.id, {
          type: incident.type,
          severity: incident.severity,
          journey_id: incident.journey_id
        })

        toast.success('Incident deleted successfully')
        if (editing?.id === incident.id) {
          setDialogOpen(false)
          setEditing(null)
        }
        await loadData()
      } catch (error: any) {
        console.error('❌ Error deleting incident:', error)
        toast.error(error.message || 'Failed to delete incident')
      }
    },
    [canManage, supabase, createAuditLog, editing?.id, loadData]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      if (editing) {
        const { error } = await supabase
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
        const { error } = await supabase
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incident Management</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">Track and resolve journey incidents</p>
        </div>
        <Button onClick={() => openDialog()} className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">
          <Plus className="h-4 w-4 mr-2" />
          Report Incident
        </Button>
      </div>

      {/* Incidents Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Call Sign</th>
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Severity</th>
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Description</th>
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Reported</th>
                  {canManage && (
                    <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="text-center py-12 text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No incidents reported</p>
                    </td>
                  </tr>
                ) : (
                  incidents.map((incident) => {
                    const severityConfig = SEVERITY_CONFIG[incident.severity]
                    const statusConfig = STATUS_CONFIG[incident.status]
                    const StatusIcon = statusConfig.icon

                    return (
                      <tr 
                        key={incident.id} 
                        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => openDialog(incident)}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <Radio className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{getCallSign(incident)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-medium">{incident.type}</span>
                        </td>
                        <td className="py-4 px-4">
                          <Badge className={`${severityConfig.color} text-white font-semibold`}>
                            {severityConfig.label}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 max-w-md">
                          <p className="text-sm line-clamp-2">{incident.description}</p>
                        </td>
                        <td className="py-4 px-4">
                          <Badge className={`${statusConfig.color} text-white`}>
                            {statusConfig.label}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 text-sm text-muted-foreground">
                          {format(new Date(incident.created_at), 'dd/MM/yyyy, HH:mm:ss')}
                        </td>
                        {canManage && (
                          <td className="py-4 px-4">
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleDelete(incident)
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
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
                  value={formData.journey_id} 
                  onChange={(e) => setFormData({ ...formData, journey_id: e.target.value })}
                >
                  <option value="">None</option>
                  {journeys.map((journey) => (
                    <option key={journey.id} value={journey.id}>
                      {journey.papas?.full_name || 'Unknown'} - {journey.cheetahs?.call_sign || 'No call sign'}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Type *</Label>
                <Select 
                  value={formData.type} 
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })} 
                  required
                >
                  <option value="">Select type</option>
                  {INCIDENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Severity *</Label>
                <Select 
                  value={formData.severity} 
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value as any })} 
                  required
                >
                  {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </Select>
              </div>

              {editing && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={formData.status} 
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.label}
                      </option>
                    ))}
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
              <Button type="submit" className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">
                {editing ? 'Update Incident' : 'Report Incident'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
