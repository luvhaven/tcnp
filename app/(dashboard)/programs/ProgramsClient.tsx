"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Calendar, Plus, Edit, Trash2, Archive, CheckCircle, Building2 } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import ProgramExport from "@/components/programs/ProgramExport"
import ProgramSchedule from "@/components/programs/ProgramSchedule"
import { RequestAvailabilityButton, AvailabilityRosterButton } from "@/components/missions/MissionAvailability"

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

export default function ProgramsClient({ initialPrograms, initialTheatres }: { initialPrograms: Program[], initialTheatres: any[] }) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

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
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleProgram, setScheduleProgram] = useState<Program | null>(null)

  // ── Inline Theatre Creation ────────────────────────────────────────────────
  const [theatreDialogOpen, setTheatreDialogOpen] = useState(false)
  const [newTheatreName, setNewTheatreName] = useState('')
  const [newTheatreLocation, setNewTheatreLocation] = useState('')
  const [creatingTheatre, setCreatingTheatre] = useState(false)

  const handleCreateTheatre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTheatreName.trim()) return
    setCreatingTheatre(true)
    try {
      const { data, error } = await supabase
        .from('theatres')
        .insert([{ name: newTheatreName.trim(), address: newTheatreLocation.trim() || '', city: null }])
        .select()
        .single()
      if (error) throw error
      // Invalidate theatres query so dropdown refreshes
      queryClient.invalidateQueries({ queryKey: ['theatres'] })
      // Immediately select the new theatre
      setFormData(prev => ({ ...prev, theatre_id: data.id }))
      toast.success(`Theatre "${data.name}" created and selected!`)
      setTheatreDialogOpen(false)
      setNewTheatreName('')
      setNewTheatreLocation('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create theatre')
    } finally {
      setCreatingTheatre(false)
    }
  }

  // React Query: Fetch Programs
  // NOTE: several other pages (Papas, Cheetahs, Officers, Nests) also query
  // `programs` under the plain `['programs']` key but with different
  // `select()` shapes (some omitting `status`/`theatres` entirely). Since
  // React Query treats the key as one shared cache slot, whichever query
  // resolved LAST used to overwrite this page's data with its own narrower
  // shape — causing the flicker and "Unknown" status you'd see here. Each
  // page now uses a shape-specific key (`['programs', 'full']` here) so they
  // no longer collide; `invalidateQueries({queryKey:['programs']})` below
  // still refreshes all of them via React Query's key-prefix matching.
  const { data: programs = [] } = useQuery({
    queryKey: ['programs', 'full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programs')
        .select(`*, theatres(name)`)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Program[]
    },
    initialData: initialPrograms
  })

  // React Query: Fetch Theatres
  const { data: theatres = [] } = useQuery({
    queryKey: ['theatres'],
    queryFn: async () => {
      const { data, error } = await supabase.from('theatres').select('*').order('name')
      if (error) throw error
      return data
    },
    initialData: initialTheatres
  })

  // React Query: Mutations
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editing) {
        const { error } = await supabase.from('programs').update(data).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('programs').insert([data])
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] })
      toast.success(editing ? 'Program updated!' : 'Program created!')
      setDialogOpen(false)
      setEditing(null)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save program')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('programs').delete().eq('id', id)
      if (error) throw error
      return id
    },
    // Optimistic UI update
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['programs', 'full'] })
      const previousPrograms = queryClient.getQueryData<Program[]>(['programs', 'full'])
      if (previousPrograms) {
        queryClient.setQueryData<Program[]>(['programs', 'full'], old => old?.filter(p => p.id !== deletedId))
      }
      return { previousPrograms }
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['programs', 'full'], context?.previousPrograms)
      toast.error('Failed to delete program')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] })
      toast.success('Program deleted!')
    }
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase.from('programs').update({ status }).eq('id', id)
      if (error) throw error
      return { id, status }
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['programs', 'full'] })
      const previousPrograms = queryClient.getQueryData<Program[]>(['programs', 'full'])
      if (previousPrograms) {
        queryClient.setQueryData<Program[]>(['programs', 'full'], old =>
          old?.map(p => p.id === id ? { ...p, status } : p)
        )
      }
      return { previousPrograms }
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['programs', 'full'], context?.previousPrograms)
      toast.error('Failed to update status')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] })
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      ...formData,
      theatre_id: formData.theatre_id || null
    }
    saveMutation.mutate(data)
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
    if (!await confirm({ message: 'Delete this program? This will affect all related data.', variant: 'destructive' })) return
    deleteMutation.mutate(id)
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    statusMutation.mutate({ id, status: newStatus })
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

  const getStatusColor = (status?: string | null) => {
    if (!status) return 'bg-gray-500'
    const colors: Record<string, string> = {
      planning: 'bg-blue-500',
      active: 'bg-green-500',
      completed: 'bg-purple-500',
      archived: 'bg-gray-500'
    }
    return colors[status.toLowerCase()] || 'bg-gray-500'
  }

  const getStatusLabel = (status?: string | null) => {
    if (!status) return 'Unknown'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Programs</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Manage events and programs</p>
        </div>
        <Button onClick={openDialog} className="shrink-0 self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Program
        </Button>
      </motion.div>


      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { status: 'planning', label: 'Planning', Icon: Calendar, color: 'text-sky-500', bg: 'bg-sky-500/10', ring: 'ring-sky-500/20' },
          { status: 'active', label: 'Active', Icon: CheckCircle, color: 'text-[hsl(var(--success))]', bg: 'bg-[hsl(var(--success)/0.08)]', ring: 'ring-[hsl(var(--success)/0.2)]' },
          { status: 'completed', label: 'Completed', Icon: CheckCircle, color: 'text-violet-500', bg: 'bg-violet-500/10', ring: 'ring-violet-500/20' },
          { status: 'archived', label: 'Archived', Icon: Archive, color: 'text-muted-foreground', bg: 'bg-muted/60', ring: 'ring-border' },
        ].map(({ status, label, Icon, color, bg, ring }) => (
          <div key={status} className={`rounded-2xl border bg-card p-5 ring-1 ${ring} transition-all hover:shadow-elevation-md hover:-translate-y-0.5`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className={`stat-figure mt-2 text-3xl font-bold ${color}`}>
                  {programs.filter(p => p.status === status).length}
                </p>
              </div>
              <div className={`shrink-0 rounded-xl ${bg} p-2.5`}>
                <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
              </div>
            </div>
          </div>
        ))}
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
            <motion.div layout className="space-y-3">
              <AnimatePresence>
                {programs.map((program) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    key={program.id}
                    className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg border p-4 transition-all hover:bg-accent hover:shadow-md hover:border-primary/30 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${getStatusColor(program.status)}`} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-lg">{program.name}</p>
                          <p className="text-sm text-muted-foreground break-words">
                            {program.theatres?.name || 'No venue'}
                            {' • '}
                            Starts{' '}
                            {program.start_date && !Number.isNaN(new Date(program.start_date).getTime())
                              ? new Date(program.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'}
                          </p>
                          {program.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{program.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:justify-end">
                      <Badge variant="secondary" className="shrink-0">
                        {getStatusLabel(program.status)}
                      </Badge>

                      <ProgramExport
                        programId={program.id}
                        programName={program.name}
                        status={program.status}
                      />

                      {['planning', 'active'].includes(program.status) && (
                        <>
                          <RequestAvailabilityButton programId={program.id} programName={program.name} />
                          <AvailabilityRosterButton programId={program.id} programName={program.name} />
                        </>
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
                      <Button variant="outline" size="sm" onClick={() => {
                        setScheduleProgram(program)
                        setScheduleOpen(true)
                      }}>
                        <Calendar className="mr-2 h-4 w-4" />
                        Schedule
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(program)} className="hover:bg-primary/10">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(program.id)} className="hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
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
                placeholder="e.g., WOFBEC 2026"
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="theatre_id">Theatre</Label>
                  <button
                    type="button"
                    onClick={() => setTheatreDialogOpen(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Building2 className="h-3 w-3" />
                    New Theatre
                  </button>
                </div>
                <Select
                  value={formData.theatre_id || 'unassigned'}
                  onValueChange={(value) => setFormData({ ...formData, theatre_id: value === 'unassigned' ? '' : value })}
                >
                  <SelectTrigger id="theatre_id">
                    <SelectValue placeholder="Select theatre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">No Theatre</SelectItem>
                    {theatres.map((theatre: any) => (
                      <SelectItem key={theatre.id} value={theatre.id}>
                        {theatre.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
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
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value, end_date: '' })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  min={formData.start_date || undefined}
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? 'Update Program' : 'Create Program'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Quick-Create Theatre Dialog ─────────────────────────────────── */}
      <Dialog open={theatreDialogOpen} onOpenChange={setTheatreDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Create New Theatre
            </DialogTitle>
            <DialogDescription>Add a theatre directly without leaving the program form.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTheatre} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="new_theatre_name">Theatre Name *</Label>
              <Input
                id="new_theatre_name"
                required
                autoFocus
                placeholder="e.g., Covenant Place Arena"
                value={newTheatreName}
                onChange={(e) => setNewTheatreName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_theatre_location">Address / Location (optional)</Label>
              <Input
                id="new_theatre_location"
                placeholder="e.g., 45 Shehu Shagari Way, Abuja"
                value={newTheatreLocation}
                onChange={(e) => setNewTheatreLocation(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTheatreDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creatingTheatre}>
                {creatingTheatre ? 'Creating…' : 'Create & Select'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Schedule: {scheduleProgram?.name}</DialogTitle>
            <DialogDescription>
              Manage days, sessions, and speaker assignments for this program.
            </DialogDescription>
          </DialogHeader>
          {scheduleProgram && <ProgramSchedule programId={scheduleProgram.id} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
