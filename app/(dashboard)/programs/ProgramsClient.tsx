"use client"

import { useState, useMemo } from "react"
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
import { Calendar, Plus, Edit, Trash2, Archive, CheckCircle, Building2, Search, Filter } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import ProgramExport from "@/components/programs/ProgramExport"
import ProgramSchedule from "@/components/programs/ProgramSchedule"
import { RequestAvailabilityButton, AvailabilityRosterButton } from "@/components/missions/MissionAvailability"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { isAdmin } from "@/lib/utils"

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

  // Programs are owned by leadership. This page previously rendered Create /
  // Edit / Delete to every authenticated officer, so a Delta Oscar saw the same
  // destructive controls a Captain did. RLS is the real boundary, but shipping
  // buttons that either silently no-op or genuinely destroy a program is not a
  // choice we get to leave to the database.
  const { data: currentUser } = useCurrentUser()
  const canManagePrograms = isAdmin(currentUser?.role)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
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
    if (!canManagePrograms) {
      toast.error('Only Command and leadership can create or edit a program.')
      return
    }
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

  // Hiding a button is presentation, not authorisation — re-check at the point
  // of action so a stale render or a console call still can't get through.
  const handleDelete = async (id: string) => {
    if (!canManagePrograms) {
      toast.error('Only Command and leadership can delete a program.')
      return
    }
    if (!await confirm({ message: 'Delete this program? This will affect all related data.', variant: 'destructive' })) return
    deleteMutation.mutate(id)
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (!canManagePrograms) {
      toast.error('Only Command and leadership can change a program’s status.')
      return
    }
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

  const filteredPrograms = useMemo(() => {
    return programs.filter((program) => {
      const matchesSearch = search.trim() === '' || 
        program.name.toLowerCase().includes(search.toLowerCase()) ||
        (program.theatres?.name && program.theatres.name.toLowerCase().includes(search.toLowerCase())) ||
        (program.description && program.description.toLowerCase().includes(search.toLowerCase()))

      const matchesStatus = statusFilter === 'all' || program.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [programs, search, statusFilter])

  return (
    <div className="space-y-6 page-enter">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Programs & Events</h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-xl">Central registry of ministry programs, theatre venues, schedules, and rosters.</p>
        </div>
        {canManagePrograms && (
          <Button onClick={openDialog} className="shrink-0 self-start sm:self-auto shadow-sm font-semibold gap-1.5">
            <Plus className="h-4 w-4" />
            Add Program
          </Button>
        )}
      </motion.div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 nav:grid-cols-4">
        {[
          { status: 'planning', label: 'Planning', Icon: Calendar, color: 'text-sky-500', bg: 'bg-sky-500/10', ring: 'ring-sky-500/20' },
          { status: 'active', label: 'Active', Icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
          { status: 'completed', label: 'Completed', Icon: CheckCircle, color: 'text-purple-500', bg: 'bg-purple-500/10', ring: 'ring-purple-500/20' },
          { status: 'archived', label: 'Archived', Icon: Archive, color: 'text-muted-foreground', bg: 'bg-muted/60', ring: 'ring-border' },
        ].map(({ status, label, Icon, color, bg, ring }) => (
          <div
            key={status}
            onClick={() => setStatusFilter(prev => prev === status ? 'all' : status)}
            className={`rounded-2xl border bg-card p-4 sm:p-5 ring-1 ${ring} transition-all cursor-pointer hover:shadow-elevation-md hover:-translate-y-0.5 ${statusFilter === status ? 'border-primary shadow-xs' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className={`stat-figure mt-1.5 text-2xl sm:text-3xl font-bold ${color}`}>
                  {programs.filter(p => p.status === status).length}
                </p>
              </div>
              <div className={`shrink-0 rounded-xl ${bg} p-2`}>
                <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span>All Programs</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Operational lifecycle from initial planning to completion & archiving
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'active', 'planning', 'completed', 'archived'] as const).map(tab => (
                <Badge
                  key={tab}
                  variant={statusFilter === tab ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(tab)}
                  className={`text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-colors ${statusFilter === tab ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                >
                  {tab}
                </Badge>
              ))}
            </div>
          </div>

          {/* Search bar */}
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search programs by name, theatre venue, or description…"
                className="pl-9 bg-background h-9 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && (
              <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="text-xs h-9">
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {filteredPrograms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground/60 mb-3">
                <Calendar className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold">{search || statusFilter !== 'all' ? 'No matching programs found' : 'No programs registered'}</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                {search || statusFilter !== 'all' ? 'Try adjusting your search terms or status filter.' : 'Create your first program to start scheduling Papas, venues, and duties.'}
              </p>
              {canManagePrograms && !search && statusFilter === 'all' && (
                <Button className="mt-4 gap-1.5 text-xs font-semibold" size="sm" onClick={openDialog}>
                  <Plus className="h-3.5 w-3.5" />
                  Add First Program
                </Button>
              )}
            </div>
          ) : (
            <motion.div layout className="space-y-3">
              <AnimatePresence>
                {filteredPrograms.map((program) => {
                  const statusBadges: Record<string, { label: string; className: string }> = {
                    active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                    planning: { label: 'Planning', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' },
                    completed: { label: 'Completed', className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
                    archived: { label: 'Archived', className: 'bg-muted text-muted-foreground border-border' },
                  }
                  const badgeInfo = statusBadges[program.status] || { label: program.status, className: 'bg-muted' }

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={program.id}
                      className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-border/70 p-4 transition-all hover:bg-card hover:border-primary/40 hover:shadow-xs sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${getStatusColor(program.status)}`} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate font-semibold text-base text-foreground">{program.name}</h3>
                              <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${badgeInfo.className}`}>
                                {badgeInfo.label}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground break-words flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              {program.theatres?.name ? (
                                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                  {program.theatres.name}
                                </span>
                              ) : (
                                <span>No venue assigned</span>
                              )}
                              <span>•</span>
                              <span>
                                Starts{' '}
                                {program.start_date && !Number.isNaN(new Date(program.start_date).getTime())
                                  ? new Date(program.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                  : '—'}
                              </span>
                            </p>
                            {program.description && (
                              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{program.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5 sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
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
                            className="h-8 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                            onClick={() => handleStatusChange(program.id, 'active')}
                          >
                            Activate
                          </Button>
                        )}

                        {program.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => handleStatusChange(program.id, 'completed')}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Complete
                          </Button>
                        )}

                        {program.status === 'completed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                            onClick={() => handleStatusChange(program.id, 'archived')}
                          >
                            <Archive className="h-3.5 w-3.5 mr-1" />
                            Archive
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-8 text-xs font-medium" onClick={() => {
                          setScheduleProgram(program)
                          setScheduleOpen(true)
                        }}>
                          <Calendar className="mr-1.5 h-3.5 w-3.5" />
                          Schedule
                        </Button>
                        {canManagePrograms && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(program)} className="h-8 w-8 hover:bg-primary/10" aria-label={`Edit ${program.name}`}>
                              <Edit className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(program.id)} className="h-8 w-8 hover:bg-destructive/10 text-destructive" aria-label={`Delete ${program.name}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
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
          {scheduleProgram && <ProgramSchedule programId={scheduleProgram.id} canManage={canManagePrograms} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
