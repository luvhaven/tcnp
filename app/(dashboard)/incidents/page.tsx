"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle, Plus, Edit, Trash2, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

type Incident = {
  id: string
  journey_id: string | null
  type: string
  severity: string
  description: string
  latitude: number | null
  longitude: number | null
  reported_by: string
  status: string
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  journeys?: {
    papas: {
      full_name: string
      title: string
    }
    cheetahs: {
      call_sign: string
    }
  } | null
  reporter?: {
    full_name: string
    oscar: string
  }
}

export default function IncidentsPage() {
  const supabase = createClient()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [journeys, setJourneys] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Incident | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [formData, setFormData] = useState({
    journey_id: '',
    type: '',
    severity: 'medium',
    description: '',
    status: 'open'
  })

  const incidentTypes = [
    'Security Breach',
    'Vehicle Breakdown',
    'Medical Emergency',
    'Traffic Incident',
    'Weather Delay',
    'Route Change',
    'Communication Failure',
    'Broken Arrow',
    'Other'
  ]

  useEffect(() => {
    loadData()
    subscribeToIncidents()
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single()
      
      setCurrentUser(userData)
      
      // Check if user can manage incidents
      const canManageIncidents = userData?.role === 'super_admin' ||
                                 userData?.role === 'admin' ||
                                 userData?.role === 'captain' ||
                                 userData?.role === 'head_of_command'
      setCanManage(canManageIncidents)

      const [incidentsRes, journeysRes] = await Promise.all([
        supabase
          .from('incidents')
          .select(`
            *,
            journeys(
              papas(full_name, title),
              cheetahs(call_sign)
            ),
            reporter:reported_by(full_name, oscar)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('journeys')
          .select(`
            id,
            papas(full_name, title),
            cheetahs(call_sign)
          `)
          .order('created_at', { ascending: false })
          .limit(50)
      ])

      if (incidentsRes.data) setIncidents(incidentsRes.data as Incident[])
      if (journeysRes.data) setJourneys(journeysRes.data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load incidents')
    } finally {
      setLoading(false)
    }
  }

  const subscribeToIncidents = () => {
    const channel = supabase
      .channel('incidents_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents'
        },
        () => {
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      if (editing) {
        // Update existing incident (managers only)
        if (!canManage) {
          toast.error('You do not have permission to update incidents')
          return
        }

        const { error } = await supabase
          .from('incidents')
          .update({
            journey_id: formData.journey_id || null,
            type: formData.type,
            severity: formData.severity,
            description: formData.description,
            status: formData.status,
            resolved_at: formData.status === 'resolved' || formData.status === 'closed' ? new Date().toISOString() : null,
            resolved_by: formData.status === 'resolved' || formData.status === 'closed' ? currentUser?.id : null
          })
          .eq('id', editing.id)

        if (error) throw error
        
        // Create audit log
        await createAuditLog('update', 'incident', editing.id, {
          status: formData.status,
          type: formData.type
        })
        
        toast.success('Incident updated successfully!')
      } else {
        // Create new incident (all users can create)
        const { error } = await supabase
          .from('incidents')
          .insert([{
            journey_id: formData.journey_id || null,
            type: formData.type,
            severity: formData.severity,
            description: formData.description,
            status: 'open',
            reported_by: currentUser?.id
          }])

        if (error) throw error
        
        // Create audit log
        await createAuditLog('create', 'incident', null, {
          type: formData.type,
          severity: formData.severity
        })
        
        toast.success('Incident reported successfully!')
        
        // Send notification for critical incidents
        if (formData.severity === 'critical') {
          toast.error('CRITICAL INCIDENT REPORTED - Notifying all managers', {
            duration: 10000
          })
        }
      }

      setDialogOpen(false)
      setEditing(null)
      resetForm()
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Failed to save incident')
    }
  }

  const createAuditLog = async (action: string, targetType: string, targetId: string | null, changes: any) => {
    try {
      await supabase
        .from('audit_logs')
        .insert([{
          user_id: currentUser?.id,
          action,
          target_type: targetType,
          target_id: targetId,
          changes
        }])
    } catch (error) {
      console.error('Error creating audit log:', error)
    }
  }

  const handleEdit = (incident: Incident) => {
    if (!canManage) {
      toast.error('You do not have permission to edit incidents')
      return
    }

    setEditing(incident)
    setFormData({
      journey_id: incident.journey_id || '',
      type: incident.type,
      severity: incident.severity,
      description: incident.description,
      status: incident.status
    })
    setDialogOpen(true)
  }

  const handleDelete = async (incident: Incident) => {
    if (!canManage) {
      toast.error('You do not have permission to delete incidents')
      return
    }

    if (!confirm(`Are you sure you want to delete this incident?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('incidents')
        .delete()
        .eq('id', incident.id)

      if (error) throw error
      
      await createAuditLog('delete', 'incident', incident.id, {
        type: incident.type
      })
      
      toast.success('Incident deleted successfully!')
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error('Failed to delete incident')
    }
  }

  const handleStatusChange = async (incident: Incident, newStatus: string) => {
    if (!canManage) {
      toast.error('You do not have permission to update incident status')
      return
    }

    try {
      const { error } = await supabase
        .from('incidents')
        .update({
          status: newStatus,
          resolved_at: newStatus === 'resolved' || newStatus === 'closed' ? new Date().toISOString() : null,
          resolved_by: newStatus === 'resolved' || newStatus === 'closed' ? currentUser?.id : null
        })
        .eq('id', incident.id)

      if (error) throw error
      
      await createAuditLog('update', 'incident', incident.id, {
        status: newStatus
      })
      
      toast.success(`Incident marked as ${newStatus}`)
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error('Failed to update incident status')
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

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'bg-blue-500',
      medium: 'bg-yellow-500',
      high: 'bg-orange-500',
      critical: 'bg-red-500'
    }
    return colors[severity] || 'bg-gray-500'
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-red-500',
      in_progress: 'bg-yellow-500',
      resolved: 'bg-green-500',
      closed: 'bg-gray-500'
    }
    return colors[status] || 'bg-gray-500'
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Incidents</h1>
          <p className="text-muted-foreground">Track and manage security incidents</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Report Incident
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{incidents.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {incidents.filter(i => i.status === 'open').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {incidents.filter(i => i.status === 'in_progress').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {incidents.filter(i => i.status === 'resolved').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {incidents.filter(i => i.severity === 'critical' && i.status !== 'closed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Incidents List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5" />
            <span>All Incidents</span>
          </CardTitle>
          <CardDescription>Security incidents and Broken Arrow alerts</CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No incidents reported</p>
              <p className="text-xs text-muted-foreground">All journeys are proceeding normally</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="flex items-start justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-2">
                      <p className="font-medium text-lg">{incident.type}</p>
                      <Badge className={getSeverityColor(incident.severity)}>
                        {incident.severity.toUpperCase()}
                      </Badge>
                      <Badge className={getStatusColor(incident.status)} variant="outline">
                        {incident.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {incident.description}
                    </p>
                    
                    {incident.journeys && (
                      <p className="text-xs text-muted-foreground">
                        <strong>Journey:</strong> {incident.journeys.papas?.title} {incident.journeys.papas?.full_name} • {incident.journeys.cheetahs?.call_sign}
                      </p>
                    )}
                    
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>
                        <strong>Reported by:</strong> {incident.reporter?.full_name} ({incident.reporter?.oscar})
                      </span>
                      <span>
                        {formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-2 ml-4">
                    {canManage && incident.status === 'open' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange(incident, 'in_progress')}
                      >
                        Start Working
                      </Button>
                    )}
                    
                    {canManage && incident.status === 'in_progress' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange(incident, 'resolved')}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Resolve
                      </Button>
                    )}
                    
                    {canManage && (
                      <div className="flex space-x-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(incident)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(incident)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Update Incident' : 'Report Incident'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update incident details and status' : 'Report a new security incident or issue'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Incident Type *</Label>
                <Select
                  id="type"
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="">Select type...</option>
                  {incidentTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="severity">Severity *</Label>
                <Select
                  id="severity"
                  required
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical (Broken Arrow)</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="journey">Related Journey (Optional)</Label>
              <Select
                id="journey"
                value={formData.journey_id}
                onChange={(e) => setFormData({ ...formData, journey_id: e.target.value })}
              >
                <option value="">No journey selected</option>
                {journeys.map((journey) => (
                  <option key={journey.id} value={journey.id}>
                    {journey.papas?.title} {journey.papas?.full_name} • {journey.cheetahs?.call_sign}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                required
                rows={4}
                placeholder="Describe the incident in detail..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {editing && canManage && (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </Select>
              </div>
            )}

            {formData.severity === 'critical' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-900">⚠️ CRITICAL INCIDENT</p>
                <p className="text-xs text-red-700 mt-1">
                  This will trigger immediate notifications to all managers and command center.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => {
                setDialogOpen(false)
                setEditing(null)
                resetForm()
              }} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                {editing ? 'Update' : 'Report'} Incident
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
