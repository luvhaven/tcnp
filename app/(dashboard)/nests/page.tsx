"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
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
import { Hotel, Plus, Edit, Trash2, Home, Building, Users, UserPlus, UserCheck, UserX } from "lucide-react"
import { toast } from "sonner"
import { canManageNests } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

export default function NestsPage() {
  const supabase = createClient()
  const confirm = useConfirm()
  const [nests, setNests] = useState<any[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [officers, setOfficers] = useState<Officer[]>([])
  const [assignments, setAssignments] = useState<NoscarAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [officerDialogOpen, setOfficerDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [selectedNest, setSelectedNest] = useState<any>(null)
  const [selectedProgram, setSelectedProgram] = useState<string>('all')
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
  const [currentRole, setCurrentRole] = useState<string | null>(null)

  const canManage = currentRole ? canManageNests(currentRole) : false

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data } = await (supabase as any)
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

          if (data?.role) {
            setCurrentRole(data.role)
          }
        }

        await loadData()
      } catch (error) {
        console.error('Error loading current user for NestsPage:', error)
        await loadData()
      }
    }

    init()
  }, [])

  const loadData = async () => {
    try {
      // Load nests
      const { data: nestsData, error: nestsError } = await supabase
        .from('nests')
        .select('*')
        .order('name')

      if (nestsError) throw nestsError
      setNests(nestsData || [])

      // Load programs
      const { data: programsData } = await supabase
        .from('programs')
        .select('id, name, status')
        .order('name')

      setPrograms(programsData || [])

      // Load NOscar officers (november_oscar roles)
      const { data: officersData } = await supabase
        .from('users')
        .select('id, full_name, email, role, oscar')
        .in('role', ['november_oscar', 'head_of_operations', 'admin', 'super_admin'])
        .eq('is_active', true)
        .order('full_name')

      setOfficers(officersData || [])

      // Load assignments
      const { data: assignmentsData } = await (supabase as any)
        .from('noscar_assignments')
        .select(`
          *,
          user:users(id, full_name, email, role, oscar)
        `)
        .order('assigned_date', { ascending: false })

      setAssignments(assignmentsData || [])

    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (!canManage) {
        toast.error('You are not authorized to manage hotels')
        return
      }

      const submitData = {
        ...formData,
        program_id: formData.program_id || null
      }

      if (editing) {
        const { error } = await (supabase as any)
          .from('nests')
          .update(submitData)
          .eq('id', editing.id)

        if (error) throw error
        toast.success('NOscar location updated!')
      } else {
        const { error } = await (supabase as any)
          .from('nests')
          .insert([submitData])

        if (error) throw error
        toast.success('NOscar location added!')
      }

      setDialogOpen(false)
      setEditing(null)
      resetForm()
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save')
    }
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
      type: item.type || 'nest',
      program_id: item.program_id || ''
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!await confirm({ message: 'Delete this location?', variant: 'destructive' })) return

    try {
      if (!canManage) {
        toast.error('You are not authorized to manage locations')
        return
      }

      const { error } = await supabase
        .from('nests')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Location deleted!')
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete')
    }
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

    try {
      const { error } = await (supabase as any)
        .from('noscar_assignments')
        .insert([{
          user_id: officerFormData.user_id,
          nest_id: selectedNest.id,
          assignment_type: officerFormData.assignment_type,
          program_id: selectedNest.program_id,
          is_active: true,
          assigned_date: new Date().toISOString().split('T')[0]
        }])

      if (error) throw error
      toast.success('Officer assigned!')
      setOfficerDialogOpen(false)
      setOfficerFormData({ user_id: '', assignment_type: 'nest' })
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign officer')
    }
  }

  const toggleOfficerActive = async (assignment: NoscarAssignment) => {
    try {
      const { error } = await (supabase as any)
        .from('noscar_assignments')
        .update({ is_active: !assignment.is_active })
        .eq('id', assignment.id)

      if (error) throw error
      toast.success(assignment.is_active ? 'Officer marked inactive' : 'Officer marked active')
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status')
    }
  }

  const removeAssignment = async (assignmentId: string) => {
    if (!await confirm({ message: 'Remove this officer from the location?', variant: 'destructive' })) return

    try {
      const { error } = await (supabase as any)
        .from('noscar_assignments')
        .delete()
        .eq('id', assignmentId)

      if (error) throw error
      toast.success('Officer removed from location')
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove')
    }
  }

  const getOfficersForNest = (nestId: string) => {
    return assignments.filter(a => a.nest_id === nestId)
  }

  const getInitials = (name: string) => {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
  }

  const filteredNests = selectedProgram === 'all'
    ? nests
    : nests.filter(n => n.program_id === selectedProgram)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 rounded-md skeleton" />
            <div className="mt-2 h-4 w-48 rounded-md skeleton" />
          </div>
          <div className="h-10 w-28 rounded-md skeleton" />
        </div>
        <Card>
          <CardHeader>
            <div className="h-5 w-40 rounded-md skeleton" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 rounded-lg skeleton" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">NOscar Management</h2>
          <p className="text-muted-foreground">
            Manage NOscar Theatres, Nests, and Officers
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
              Add Location
            </Button>
          )}
        </div>
      </div>

      {/* Program Filter */}
      <div className="flex items-center gap-4">
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
      </div>

      <Tabs defaultValue="den" className="space-y-4">
        <TabsList>
          <TabsTrigger value="den">
            <Home className="mr-2 h-4 w-4" />
            NOscar Theatre
          </TabsTrigger>
          <TabsTrigger value="nest">
            <Building className="mr-2 h-4 w-4" />
            NOscar Nest
          </TabsTrigger>
        </TabsList>

        {['den', 'nest'].map((type) => (
          <TabsContent key={type} value={type}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  {type === 'den' ? <Home className="h-5 w-5" /> : <Building className="h-5 w-5" />}
                  <span>{type === 'den' ? 'NOscar Theatres' : 'NOscar Nests'}</span>
                </CardTitle>
                <CardDescription>
                  {type === 'den' ? 'Private residences and secure theatre locations' : 'Hotels and public accommodation'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredNests.filter(n => n.type === type || (!n.type && type === 'nest')).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Hotel className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm font-medium">No {type === 'den' ? 'Theatres' : 'Nests'} found</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredNests
                      .filter(n => n.type === type || (!n.type && type === 'nest'))
                      .map((nest) => {
                        const nestOfficers = getOfficersForNest(nest.id)
                        const programName = programs.find(p => p.id === nest.program_id)?.name

                        return (
                          <Card key={nest.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div>
                                  <CardTitle className="text-lg">{nest.name}</CardTitle>
                                  {programName && (
                                    <Badge variant="outline" className="mt-1">{programName}</Badge>
                                  )}
                                </div>
                                {canManage && (
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                      setSelectedNest(nest)
                                      setOfficerFormData({ ...officerFormData, assignment_type: type as 'theatre' | 'nest' })
                                      setOfficerDialogOpen(true)
                                    }}>
                                      <UserPlus className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(nest)}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(nest.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <CardDescription>{nest.city}</CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-3 text-sm">
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
                                        <div key={assignment.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
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
                          </Card>
                        )
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Add/Edit Location Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit NOscar Location' : 'Add NOscar Location'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update location information' : 'Add a new NOscar location'}
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
                <Label htmlFor="type">Type *</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nest">NOscar Nest (Hotel)</SelectItem>
                    <SelectItem value="den">NOscar Theatre (Private)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                {editing ? 'Update' : 'Add'} Location
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
              Select an officer to assign to this {selectedNest?.type === 'den' ? 'theatre' : 'nest'}
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
