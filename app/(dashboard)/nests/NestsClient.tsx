"use client"

import { useState } from "react"
import ComfortChecklist from "@/components/nests/ComfortChecklist"
import { useNestETAReminder } from "@/hooks/useNestETAReminder"
import PapaBriefingsSection from "@/components/papas/PapaBriefingsSection"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Hotel, Plus, Edit, Trash2, Building, Users, UserPlus, UserCheck, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { canManageNests } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import PapaAccommodations from "@/components/nests/PapaAccommodations"
import { useCurrentUser } from "@/hooks/useCurrentUser"

type Program = {
  id: string
  name: string
  status: string
}

type Officer = {
  id: string
  full_name: string
  email: string
  role: string
  oscar: string | null
}

type NoscarAssignment = {
  id: string
  user_id: string
  nest_id: string | null
  assignment_type: 'theatre' | 'nest'
  program_id: string
  is_active: boolean
  assigned_date: string
  user?: Officer
}

export default function NestsClient({ initialNests }: { initialNests: any[] }) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [officerDialogOpen, setOfficerDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [selectedNest, setSelectedNest] = useState<any>(null)
  const [selectedProgram, setSelectedProgram] = useState<string>('all')
  const [expandedComfort, setExpandedComfort] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    rating: 5,
    amenities: '',
    type: 'nest',
    program_id: ''
  })
  const [officerFormData, setOfficerFormData] = useState({
    user_id: '',
    assignment_type: 'nest' as 'theatre' | 'nest'
  })

  const { data: userRole } = useQuery({
    queryKey: ['userRole'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
      return data?.role || null
    }
  })

  // Fetch this NO's assigned nest so the ETA reminder knows which nest to watch
  const { data: myNestId } = useQuery({
    queryKey: ['myNestId'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await (supabase as any)
        .from('noscar_assignments')
        .select('nest_id')
        .eq('user_id', user.id)
        .eq('assignment_type', 'nest')
        .eq('is_active', true)
        .limit(1)
        .single()
      return data?.nest_id || null
    }
  })

  // 30-min ETA reminder for this NO's assigned nest
  useNestETAReminder(myNestId ?? null)

  const { data: nests = [] } = useQuery({
    queryKey: ['nests'],
    queryFn: async () => {
      const { data, error } = await supabase.from('nests').select(`*, programs(name)`).order('name')
      if (error) throw error
      return data
    },
    initialData: initialNests
  })

  const { data: programs = [] } = useQuery({
    // Same shape (id, name, status) as OfficersClient's programs query, so
    // it's safe to share this key — see ProgramsClient.tsx for why pages
    // with DIFFERENT select() shapes must not share the bare ['programs'] key.
    queryKey: ['programs', 'lite-status'],
    queryFn: async () => {
      const { data, error } = await supabase.from('programs').select('id, name, status').order('name')
      if (error) throw error
      return data as Program[]
    }
  })

  const { data: officers = [] } = useQuery({
    queryKey: ['officers', 'admin-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, oscar')
        .in('role', ['november_oscar', 'noscar_nest', 'head_noscar_nest', 'head_of_operations', 'admin', 'super_admin'])
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return data as Officer[]
    }
  })

  const { data: assignments = [] } = useQuery({
    queryKey: ['noscar_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('noscar_assignments')
        .select(`*, user:users!noscar_assignments_user_id_fkey(id, full_name, email, role, oscar)`)
        .eq('assignment_type', 'nest')
        .order('assigned_date', { ascending: false })
      if (error) throw error
      return data as any as NoscarAssignment[]
    }
  })

  const canManage = userRole ? canManageNests(userRole) : false
  const { data: currentUser } = useCurrentUser()
  const canEditAccommodations = canManage

  const saveNestMutation = useMutation({
    mutationFn: async (payload: { isEdit: boolean, data: any }) => {
      if (payload.isEdit) {
        const { error } = await supabase.from('nests').update(payload.data).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('nests').insert([payload.data])
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['nests'] })
      toast.success(variables.isEdit ? 'Nest location updated!' : 'Nest location added!')
      setDialogOpen(false)
      setEditing(null)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save')
    }
  })

  const deleteNestMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('nests').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['nests'] })
      const previous = queryClient.getQueryData<any[]>(['nests'])
      if (previous) {
        queryClient.setQueryData<any[]>(['nests'], old => old?.filter(n => n.id !== deletedId))
      }
      return { previous }
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['nests'], context?.previous)
      toast.error('Failed to delete')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['nests'] })
      toast.success('Location deleted!')
    }
  })

  const assignOfficerMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('noscar_assignments').insert([payload])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['noscar_assignments'] })
      toast.success('Officer assigned!')
      setOfficerDialogOpen(false)
      setOfficerFormData({ user_id: '', assignment_type: 'nest' })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to assign officer')
    }
  })

  const toggleOfficerMutation = useMutation({
    mutationFn: async (assignment: NoscarAssignment) => {
      const { error } = await supabase.from('noscar_assignments').update({ is_active: !assignment.is_active }).eq('id', assignment.id)
      if (error) throw error
      return !assignment.is_active
    },
    onSuccess: (isActive) => {
      queryClient.invalidateQueries({ queryKey: ['noscar_assignments'] })
      toast.success(isActive ? 'Officer marked active' : 'Officer marked inactive')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update status')
    }
  })

  const removeAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('noscar_assignments').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['noscar_assignments'] })
      toast.success('Officer removed from location')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove')
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManage) {
      toast.error('You are not authorized to manage hotels')
      return
    }
    const submitData = {
      ...formData,
      type: 'nest',
      program_id: formData.program_id || null
    }
    saveNestMutation.mutate({ isEdit: !!editing, data: submitData })
  }

  const handleEdit = (item: any) => {
    setEditing(item)
    setFormData({
      name: item.name,
      address: item.address,
      city: item.city,
      phone: item.phone || '',
      email: item.email || '',
      rating: item.rating || 5,
      amenities: item.amenities || '',
      type: 'nest',
      program_id: item.program_id || ''
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!canManage) {
      toast.error('You are not authorized to manage locations')
      return
    }
    if (!await confirm({ message: 'Delete this location?', variant: 'destructive' })) return
    deleteNestMutation.mutate(id)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      city: '',
      phone: '',
      email: '',
      rating: 5,
      amenities: '',
      type: 'nest',
      program_id: ''
    })
  }

  const handleAssignOfficer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!officerFormData.user_id || !selectedNest) {
      toast.error('Please select an officer')
      return
    }
    assignOfficerMutation.mutate({
      user_id: officerFormData.user_id,
      nest_id: selectedNest.id,
      assignment_type: 'nest',
      program_id: selectedNest.program_id,
      is_active: true,
      assigned_date: new Date().toISOString().split('T')[0]
    })
  }

  const toggleOfficerActive = async (assignment: NoscarAssignment) => {
    toggleOfficerMutation.mutate(assignment)
  }

  const removeAssignment = async (assignmentId: string) => {
    if (!await confirm({ message: 'Remove this officer from the location?', variant: 'destructive' })) return
    removeAssignmentMutation.mutate(assignmentId)
  }

  const getOfficersForNest = (nestId: string) => {
    return assignments.filter(a => a.nest_id === nestId)
  }

  const getInitials = (name: string) => {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
  }

  const nestLocations = nests.filter((n: any) => n.type === 'nest' || !n.type)
  const filteredNests = selectedProgram === 'all'
    ? nestLocations
    : nestLocations.filter((n: any) => n.program_id === selectedProgram)

  return (
    <div className="space-y-6 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-3xl font-bold tracking-tight">November (Nest)</h2>
          <p className="text-muted-foreground">
            Hotel accommodation for Papas and the officers assigned to each Nest
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button onClick={() => {
              setEditing(null)
              resetForm()
              setDialogOpen(true)
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Nest
            </Button>
          )}
        </div>
      </motion.div>

      {/* Program Filter */}
      <motion.div layout className="flex items-center gap-4">
        <Label>Filter by Program:</Label>
        <Select value={selectedProgram} onValueChange={setSelectedProgram}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="All Programs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {programs.map(program => (
              <SelectItem key={program.id} value={program.id}>
                {program.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* ── Papa Briefings for NOScar roles ── */}
      {userRole && ['noscar_nest', 'head_noscar_nest', 'noscar_den', 'head_noscar_den', 'november_oscar'].includes(userRole) && (
        <div className="border rounded-xl p-4 bg-muted/30">
          <PapaBriefingsSection role={userRole} />
        </div>
      )}

      <PapaAccommodations canEdit={canEditAccommodations} selectedProgram={selectedProgram} currentUserId={currentUser?.id ?? null} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building className="h-5 w-5" />
            <span>Nest Locations</span>
          </CardTitle>
          <CardDescription>Hotels and public accommodation</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredNests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Hotel className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No Nests found</p>
            </div>
          ) : (
            <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {filteredNests.map((nest: any) => {
                  const nestOfficers = getOfficersForNest(nest.id)
                  const programName = programs.find(p => p.id === nest.program_id)?.name

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={nest.id}
                    >
                      <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg">{nest.name}</CardTitle>
                              {programName && (
                                <Badge variant="outline" className="mt-1">{programName}</Badge>
                              )}
                            </div>
                            {canManage && (
                              <div className="flex gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10" onClick={() => {
                                  setSelectedNest(nest)
                                  setOfficerFormData({ ...officerFormData, assignment_type: 'nest' })
                                  setOfficerDialogOpen(true)
                                }}>
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10" onClick={() => handleEdit(nest)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(nest.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <CardDescription>{nest.city}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col">
                          <div className="space-y-3 text-sm flex-1">
                            <p className="text-muted-foreground">{nest.address}</p>
                            {nest.phone && <p>📞 {nest.phone}</p>}

                            {/* Officers Section */}
                            <div className="border-t pt-3 mt-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-xs">Assigned Officers ({nestOfficers.length})</span>
                              </div>
                              {nestOfficers.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No officers assigned</p>
                              ) : (
                                <div className="space-y-2">
                                  {nestOfficers.map(assignment => (
                                    <div key={assignment.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50 transition-colors hover:bg-muted">
                                      <div className="flex items-center gap-2">
                                        <Avatar className="h-6 w-6">
                                          <AvatarFallback className="text-xs">
                                            {getInitials(assignment.user?.full_name || '')}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <p className="text-xs font-medium">{assignment.user?.full_name}</p>
                                          <p className="text-[10px] text-muted-foreground">{assignment.user?.oscar}</p>
                                        </div>
                                      </div>
                                      {canManage && (
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            checked={assignment.is_active}
                                            onCheckedChange={() => toggleOfficerActive(assignment)}
                                            className="scale-75"
                                          />
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => removeAssignment(assignment.id)}
                                          >
                                            <Trash2 className="h-3 w-3 text-destructive" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                        {/* Comfort Checklist Toggle */}
                        <div className="border-t px-4 pb-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setExpandedComfort(expandedComfort === nest.id ? null : nest.id)}
                            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <ChevronDown className={`h-3 w-3 transition-transform ${expandedComfort === nest.id ? 'rotate-180' : ''}`} />
                              Comfort Checklist
                            </span>
                            <span className="text-[10px] font-mono text-pink-500">TCNP.01.07</span>
                          </button>
                          {expandedComfort === nest.id && (
                            <div className="mt-2">
                              <ComfortChecklist nestId={nest.id} nestName={nest.name} />
                            </div>
                          )}
                        </div>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Location Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Nest Location' : 'Add Nest Location'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update location information' : 'Add a new hotel/Nest location'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  required
                  placeholder="e.g., Transcorp Hilton"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="program_id">Program</Label>
                <Select
                  value={formData.program_id || 'unassigned'}
                  onValueChange={(value) => setFormData({ ...formData, program_id: value === 'unassigned' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a program (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">No Program</SelectItem>
                    {programs.map(program => (
                      <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <Input
                  id="address"
                  required
                  placeholder="e.g., 1 Aguiyi Ironsi Street"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  required
                  placeholder="e.g., Abuja"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+234 xxx xxx xxxx"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="info@hotel.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rating">Rating</Label>
                <Input
                  id="rating"
                  type="number"
                  min="1"
                  max="5"
                  value={formData.rating}
                  onChange={(e) => setFormData({ ...formData, rating: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amenities">Amenities (comma separated)</Label>
              <Textarea
                id="amenities"
                placeholder="e.g., Pool, Gym, Spa, Restaurant..."
                value={formData.amenities}
                onChange={(e) => setFormData({ ...formData, amenities: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editing ? 'Update' : 'Add'} Nest
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Officer Dialog */}
      <Dialog open={officerDialogOpen} onOpenChange={setOfficerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Officer to {selectedNest?.name}</DialogTitle>
            <DialogDescription>
              Select an officer to assign to this nest
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignOfficer} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Select Officer</Label>
              <Select value={officerFormData.user_id} onValueChange={(value) => setOfficerFormData({ ...officerFormData, user_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an officer" />
                </SelectTrigger>
                <SelectContent>
                  {officers.map(officer => (
                    <SelectItem key={officer.id} value={officer.id}>
                      <div className="flex items-center gap-2">
                        <span>{officer.full_name}</span>
                        {officer.oscar && <span className="text-muted-foreground text-xs">({officer.oscar})</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setOfficerDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <UserCheck className="mr-2 h-4 w-4" />
                Assign Officer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
