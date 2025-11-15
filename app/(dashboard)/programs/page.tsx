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
import { Calendar, Plus, Edit, Trash2, Archive, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import ProgramExport from "@/components/programs/ProgramExport"

type Program = {
  id: string
  name: string
  description: string | null
  theatre_id: string | null
  start_date: string
  end_date: string | null
  status: string
  created_at: string
  theatres: { name: string } | null
}

export default function ProgramsPage() {
  const supabase = createClient()
  const [programs, setPrograms] = useState<Program[]>([])
  const [theatres, setTheatres] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    theatre_id: '',
    start_date: '',
    end_date: '',
    status: 'planning'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [programsRes, theatresRes] = await Promise.all([
        supabase
          .from('programs')
          .select(`
            *,
            theatres(name)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('theatres').select('*').order('name')
      ])

      if (programsRes.data) setPrograms(programsRes.data as Program[])
      if (theatresRes.data) setTheatres(theatresRes.data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load programs')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const data = {
        ...formData,
        theatre_id: formData.theatre_id || null
      }

      if (editing) {
        const { error } = await supabase
          .from('programs')
          .update(data)
          .eq('id', editing.id)

        if (error) throw error
        toast.success('Program updated!')
      } else {
        const { error } = await supabase
          .from('programs')
          .insert([data])

        if (error) throw error
        toast.success('Program created!')
      }

      setDialogOpen(false)
      setEditing(null)
      resetForm()
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save program')
    }
  }

  const handleEdit = (program: Program) => {
    setEditing(program)
    setFormData({
      name: program.name,
      description: program.description || '',
      theatre_id: program.theatre_id || '',
      start_date: program.start_date.split('T')[0],
      end_date: program.end_date ? program.end_date.split('T')[0] : '',
      status: program.status
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this program? This will affect all related data.')) return

    try {
      const { error } = await supabase
        .from('programs')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Program deleted!')
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete program')
    }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('programs')
        .update({ status: newStatus })
        .eq('id', id)

      if (error) throw error
      toast.success(`Program marked as ${newStatus}!`)
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      theatre_id: '',
      start_date: '',
      end_date: '',
      status: 'planning'
    })
  }

  const openDialog = () => {
    setEditing(null)
    resetForm()
    setDialogOpen(true)
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planning: 'bg-blue-500',
      active: 'bg-green-500',
      completed: 'bg-purple-500',
      archived: 'bg-gray-500'
    }
    return colors[status] || 'bg-gray-500'
  }

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1)
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
          <h1 className="text-3xl font-bold">Programs</h1>
          <p className="text-muted-foreground">Manage events and programs</p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Program
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Planning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {programs.filter(p => p.status === 'planning').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {programs.filter(p => p.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {programs.filter(p => p.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Archived</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {programs.filter(p => p.status === 'archived').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>All Programs</span>
          </CardTitle>
          <CardDescription>Manage all events and programs</CardDescription>
        </CardHeader>
        <CardContent>
          {programs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No programs yet</p>
              <Button className="mt-4" onClick={openDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Program
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {programs.map((program) => (
                <div
                  key={program.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`h-3 w-3 rounded-full ${getStatusColor(program.status)}`} />
                      <div>
                        <p className="font-medium text-lg">{program.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {program.theatres?.name || 'No venue'} • Starts {new Date(program.start_date).toLocaleDateString()}
                        </p>
                        {program.description && (
                          <p className="text-xs text-muted-foreground mt-1">{program.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      {getStatusLabel(program.status)}
                    </Badge>
                    
                    {/* Export Button for Completed/Archived Programs */}
                    {(program.status === 'completed' || program.status === 'archived') && (
                      <ProgramExport
                        programId={program.id}
                        programName={program.name}
                        status={program.status}
                      />
                    )}
                    
                    {program.status === 'planning' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(program.id, 'active')}
                      >
                        Activate
                      </Button>
                    )}
                    
                    {program.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(program.id, 'completed')}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Complete
                      </Button>
                    )}
                    
                    {program.status === 'completed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(program.id, 'archived')}
                      >
                        <Archive className="h-4 w-4 mr-1" />
                        Archive
                      </Button>
                    )}
                    
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(program)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(program.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Program' : 'Add New Program'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update program information' : 'Create a new program or event'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Program Name *</Label>
              <Input
                id="name"
                required
                placeholder="e.g., Presidential Visit 2024"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Program details and objectives..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="theatre_id">Venue (Theatre)</Label>
                <Select
                  id="theatre_id"
                  value={formData.theatre_id}
                  onChange={(e) => setFormData({ ...formData, theatre_id: e.target.value })}
                >
                  <option value="">Select venue</option>
                  {theatres.map((theatre) => (
                    <option key={theatre.id} value={theatre.id}>
                      {theatre.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  id="status"
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date *</Label>
                <Input
                  id="start_date"
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>


            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editing ? 'Update Program' : 'Create Program'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
