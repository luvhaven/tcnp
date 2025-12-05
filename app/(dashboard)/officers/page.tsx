"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserCircle, Plus, Edit, Trash2, UserCheck, UserX, Award } from "lucide-react"
import { toast } from "sonner"

type Officer = {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  oscar: string | null
  role: string
  unit: string | null
  current_title_id: string | null
  is_active: boolean
  is_online?: boolean
  activation_status: string
  created_at: string
}

type OfficialTitle = {
  id: string
  code: string
  name: string
  unit: string
  is_fixed: boolean
  is_team_lead: boolean
  max_positions: number
}

type Program = {
  id: string
  name: string
  status: string
}

export default function OfficersPage() {
  const supabase = createClient()
  const [officers, setOfficers] = useState<Officer[]>([])
  const [titles, setTitles] = useState<OfficialTitle[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [titleDialogOpen, setTitleDialogOpen] = useState(false)
  const [assignFromDirectoryOpen, setAssignFromDirectoryOpen] = useState(false)
  const [editing, setEditing] = useState<Officer | null>(null)
  const [assigningTitleFor, setAssigningTitleFor] = useState<Officer | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'delta_oscar',
    photo_url: ''
  })

  const [titleFormData, setTitleFormData] = useState({
    title_id: '',
    program_id: '',
    role: ''
  })

  const [assignForm, setAssignForm] = useState({
    officer_id: "",
    title_id: "",
    program_id: "",
  })
  const [assignSearch, setAssignSearch] = useState("")

  const roles = [
    // dev_admin is hidden from UI - only for developers
    { value: 'admin', label: 'Admin' },
    { value: 'prof', label: 'Prof (View Only)' },
    { value: 'duchess', label: 'Duchess (View Only)' },
    { value: 'captain', label: 'Captain' },
    { value: 'vice_captain', label: 'Vice Captain' },
    { value: 'head_of_operations', label: 'Head of Operations' },
    { value: 'head_of_command', label: 'Head of Command' },
    { value: 'command', label: 'Command' },
    { value: 'delta_oscar', label: 'Delta Oscar (DO)' },
    { value: 'tango_oscar', label: 'Tango Oscar (TO)' },
    { value: 'head_tango_oscar', label: 'Head, Tango Oscar' },
    { value: 'alpha_oscar', label: 'Alpha Oscar (AO)' },
    { value: 'head_alpha_oscar', label: 'Head, Alpha Oscar' },
    { value: 'noscar_den', label: 'NOscar Den' },
    { value: 'head_noscar_den', label: 'Head, NOscar Den' },
    { value: 'noscar_nest', label: 'NOscar Nest' },
    { value: 'head_noscar_nest', label: 'Head, NOscar Nest' },
    { value: 'victor_oscar', label: 'Victor Oscar (VO)' },
    { value: 'head_victor_oscar', label: 'Head, Victor Oscar' },
    { value: 'echo_oscar', label: 'Echo Oscar (EO)' },
    { value: 'head_echo_oscar', label: 'Head, Echo Oscar' },
    { value: 'viewer', label: 'Viewer' }
  ]

  const filteredOfficersForAssign = officers
    .slice()
    .sort((a, b) => Number(b.is_active) - Number(a.is_active))
    .filter((officer) => {
      if (!assignSearch.trim()) return true
      const query = assignSearch.toLowerCase()
      const name = (officer.full_name || "").toLowerCase()
      const email = (officer.email || "").toLowerCase()
      const oscar = (officer.oscar || "").toLowerCase()
      const role = (officer.role || "").toLowerCase()
      return (
        name.includes(query) ||
        email.includes(query) ||
        oscar.includes(query) ||
        role.includes(query)
      )
    })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await (supabase as any)
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single()
        setCurrentUser(profile || null)
      } else {
        setCurrentUser(null)
      }

      const response = await fetch("/api/officers/list")

      if (!response.ok) {
        console.error("Failed to load officers via API:", await response.text())
        setLoading(false)
        return
      }

      const body = await response.json()
      setOfficers(body.officers || [])

      // Load titles and programs for manage tab
      if (currentUser && ['dev_admin', 'admin'].includes(currentUser.role)) {
        const [titlesRes, programsRes] = await Promise.all([
          supabase
            .from('official_titles')
            .select('*')
            .order('unit, name'),
          supabase
            .from('programs')
            .select('id, name, status')
            .order('created_at', { ascending: false })
        ])

        if (titlesRes.data) setTitles(titlesRes.data as OfficialTitle[])
        if (programsRes.data) setPrograms(programsRes.data as Program[])
      }
    } catch (error) {
      console.error("Error loading officers:", error)
    } finally {
      setLoading(false)
    }
  }

  const generateOscar = (fullName: string, role: string) => {
    if (!fullName) return ''
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase()
    const roleCode = role.toUpperCase().replace('_', '-')
    return `OSCAR-${initials}-${roleCode}`
  }

  const getInitials = (name: string) => {
    if (!name) return '??'
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'dev_admin': return 'bg-purple-500'
      case 'admin': return 'bg-blue-500'
      case 'captain': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }

  const getTitleByUnit = (unit: string) => {
    return titles.filter(t => t.unit === unit)
  }

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      full_name: '',
      phone: '',
      role: 'delta_oscar',
      photo_url: ''
    })
    setEditing(null)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('officer-photos')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('officer-photos')
        .getPublicUrl(filePath)

      setFormData({ ...formData, photo_url: publicUrl })
      toast.success('Photo uploaded successfully')
    } catch (error: any) {
      console.error('Error uploading photo:', error)
      toast.error(error.message || 'Failed to upload photo')
    }
  }

  const handleCreateOfficer = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          phone: formData.phone,
          role: formData.role,
          photo_url: formData.photo_url,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create officer")
      }

      toast.success("Protocol Officer created successfully!")
      setDialogOpen(false)
      resetForm()
      loadData()
    } catch (error: any) {
      console.error("Error creating officer:", error)
      toast.error(error.message || "Failed to create officer")
    }
  }

  const handleEdit = (officer: Officer) => {
    setEditing(officer)
    setFormData({
      email: officer.email,
      password: '', // Password empty by default for security
      full_name: officer.full_name || '',
      phone: officer.phone || '',
      role: officer.role,
      photo_url: officer.photo_url || ''
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (!editing) {
        await handleCreateOfficer(e)
        return
      }

      // Use the admin update-user API
      const response = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editing.id,
          email: formData.email,
          password: formData.password, // Only sent if not empty
          full_name: formData.full_name,
          phone: formData.phone,
          role: formData.role,
          photo_url: formData.photo_url
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to update officer")
      }

      toast.success('Officer updated successfully!')

      setDialogOpen(false)
      resetForm()
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Failed to save officer')
    }
  }

  const handleAssignTitleClick = (officer: Officer) => {
    setAssigningTitleFor(officer)
    const preferredProgram = programs.find(p => p.status === 'active') || programs[0] || null
    setTitleFormData({
      title_id: officer.current_title_id || '',
      program_id: preferredProgram?.id || '',
      role: officer.role // Initialize with current role
    })
    setTitleDialogOpen(true)
  }

  const handleAssignTitle = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!assigningTitleFor) return

    try {
      // 1. Update Role if changed
      if (titleFormData.role && titleFormData.role !== assigningTitleFor.role) {
        const response = await fetch("/api/admin/update-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: assigningTitleFor.id,
            role: titleFormData.role
          }),
        })

        if (!response.ok) {
          throw new Error("Failed to update officer role")
        }
      }

      // 2. Assign Title (if selected)
      if (titleFormData.title_id) {
        const { data, error } = await (supabase as any).rpc('assign_title', {
          p_user_id: assigningTitleFor.id,
          p_title_code: titles.find(t => t.id === titleFormData.title_id)?.code,
          p_program_id: titleFormData.program_id || null,
          p_assigned_by: currentUser?.id
        })

        if (error) throw error
      }

      toast.success('Officer updated successfully!')
      setTitleDialogOpen(false)
      setAssigningTitleFor(null)
      setTitleFormData({ title_id: '', program_id: '', role: '' })
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Failed to update officer')
    }
  }

  const handleAssignFromDirectory = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (!assignForm.officer_id || !assignForm.title_id) {
        toast.error('Select an officer and a title')
        return
      }

      const title = titles.find(t => t.id === assignForm.title_id)
      if (!title) {
        toast.error('Selected title not found')
        return
      }

      const { error } = await (supabase as any).rpc('assign_title', {
        p_user_id: assignForm.officer_id,
        p_title_code: title.code,
        p_program_id: assignForm.program_id || null,
        p_assigned_by: currentUser?.id
      })

      if (error) throw error

      toast.success('Title assigned successfully!')
      setAssignFromDirectoryOpen(false)
      setAssignForm({ officer_id: '', title_id: '', program_id: '' })
      loadData()
    } catch (error: any) {
      console.error('Error assigning from directory:', error)
      toast.error(error.message || 'Failed to assign title')
    }
  }

  const handleToggleActivation = async (officer: Officer) => {
    try {
      const newStatus = officer.is_active ? 'deactivated' : 'active'

      const response = await fetch('/api/officers/toggle-activation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          officerId: officer.id,
          isActive: officer.is_active,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update officer status')
      }

      toast.success(`Officer ${newStatus}!`)
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Failed to update officer status')
    }
  }

  const handleDelete = async (officer: Officer) => {
    if (officer.role === 'dev_admin') {
      toast.error('Cannot delete Super Admin account')
      return
    }

    if (officer.id === currentUser?.id) {
      toast.error('Cannot delete your own account')
      return
    }

    if (!confirm(`Are you sure you want to delete ${officer.full_name}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/delete-user?id=${officer.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete officer')
      }

      toast.success('Officer deleted successfully!')
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Failed to delete officer')
    }
  }

  const canManageOfficers = currentUser && ['dev_admin', 'admin'].includes(currentUser.role)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-40 rounded-md skeleton" />
            <div className="mt-2 h-4 w-72 rounded-md skeleton" />
          </div>
          <div className="h-9 w-32 rounded-md skeleton" />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 rounded-md skeleton" />
              </CardHeader>
              <CardContent>
                <div className="h-6 w-12 rounded-md skeleton" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="h-5 w-32 rounded-md skeleton" />
            <div className="mt-2 h-4 w-40 rounded-md skeleton" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 rounded-lg border p-4"
                >
                  <div className="h-10 w-10 rounded-full skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded-md skeleton" />
                    <div className="h-3 w-40 rounded-md skeleton" />
                    <div className="h-3 w-24 rounded-md skeleton" />
                  </div>
                </div>
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
          <h1 className="text-3xl font-bold tracking-tight">Officers</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Directory and management of all Protocol Officers</p>
        </div>
        {canManageOfficers && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true) }} className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Officer</span>
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{officers.length}</div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {officers.filter(o => o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.is_online).length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Titles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {officers.filter(o => o.current_title_id).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="directory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          {canManageOfficers && <TabsTrigger value="manage">Manage</TabsTrigger>}
        </TabsList>

        <TabsContent value="directory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <UserCircle className="h-5 w-5" />
                <span>All Officers</span>
              </CardTitle>
              <CardDescription>Protocol staff directory</CardDescription>
            </CardHeader>
            <CardContent>
              {officers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <UserCircle className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-sm font-medium">No officers yet</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {officers.map((officer) => (
                    <div
                      key={officer.id}
                      className="flex items-center space-x-3 rounded-lg border p-4 transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm"
                    >
                      <Avatar>
                        <AvatarFallback>
                          {getInitials(officer.full_name || officer.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{officer.full_name || 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{officer.email}</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant="secondary" className="text-xs uppercase tracking-wide">
                            {roles.find(r => r.value === officer.role)?.label || officer.role}
                          </Badge>
                          <div className="flex items-center space-x-1">
                            <div className={`h-2 w-2 rounded-full ${officer.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                            <span className="text-xs text-muted-foreground">
                              {officer.is_online ? 'online' : 'offline'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canManageOfficers && (
          <TabsContent value="manage" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                Edit officer details and assign titles and duties across programs
              </p>
              <Button onClick={() => setAssignFromDirectoryOpen(true)} className="gap-2">
                <UserCheck className="h-4 w-4" />
                <span>Assign Officer to Program</span>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {officers.map((officer) => (
                <Card
                  key={officer.id}
                  className={`${!officer.is_active ? 'opacity-60' : ''} transition-all hover:-translate-y-0.5 hover:shadow-md`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className={getRoleBadgeColor(officer.role)}>
                            {getInitials(officer.full_name || officer.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-base">{officer.full_name || 'No Name'}</CardTitle>
                          <CardDescription className="text-xs">{officer.email}</CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {officer.is_active ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Role:</span>
                        <Badge className={getRoleBadgeColor(officer.role)}>
                          {roles.find(r => r.value === officer.role)?.label || officer.role}
                        </Badge>
                      </div>
                      {officer.phone && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Phone:</span>
                          <span className="font-medium">{officer.phone}</span>
                        </div>
                      )}
                      {officer.oscar && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">OSCAR:</span>
                          <Badge variant="outline">{officer.oscar}</Badge>
                        </div>
                      )}
                      {officer.unit && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Unit:</span>
                          <Badge variant="secondary">{officer.unit}</Badge>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleEdit(officer)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleAssignTitleClick(officer)}
                      >
                        <Award className="h-3 w-3 mr-1" />
                        Title
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActivation(officer)}
                      >
                        {officer.is_active ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                      </Button>
                      {officer.role !== 'dev_admin' && officer.id !== currentUser?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(officer)}
                        >
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Create/Edit Officer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Officer' : 'Add Protocol Officer'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update officer details and role.' : 'Create a new Protocol Officer account so they can be assigned to duties and tracked.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">
                {editing ? 'New Password (leave blank to keep current)' : 'Temporary Password *'}
              </Label>
              <Input
                id="password"
                type="password"
                required={!editing}
                placeholder={editing ? "Enter new password to change" : "Enter temporary password"}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">{editing ? 'Role *' : 'Default Role *'}</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="photo">Officer Photo (Optional)</Label>
              <Input
                id="photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="cursor-pointer"
              />
              {formData.photo_url && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={formData.photo_url} />
                    <AvatarFallback>Photo</AvatarFallback>
                  </Avatar>
                  <span>Photo uploaded</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false)
                  setEditing(null)
                  resetForm()
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                {editing ? 'Update Officer' : 'Create Officer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Title Dialog */}
      {canManageOfficers && (
        <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Official Title</DialogTitle>
              <DialogDescription>
                Assign an official title to {assigningTitleFor?.full_name}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAssignTitle} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Official Title *</Label>
                <Select
                  id="title"
                  required
                  value={titleFormData.title_id}
                  onChange={(e) => setTitleFormData({ ...titleFormData, title_id: e.target.value })}
                >
                  <option value="">Select a title...</option>
                  <optgroup label="Fixed Leadership">
                    {getTitleByUnit('leadership').filter(t => t.is_fixed).map((title) => (
                      <option key={title.id} value={title.id}>
                        {title.name} {title.is_team_lead && '(Team Lead)'}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Leadership">
                    {getTitleByUnit('leadership').filter(t => !t.is_fixed).map((title) => (
                      <option key={title.id} value={title.id}>
                        {title.name} {title.max_positions > 1 && `(${title.max_positions} positions)`}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Command">
                    {getTitleByUnit('command').map((title) => (
                      <option key={title.id} value={title.id}>
                        {title.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Oscar Units">
                    {getTitleByUnit('oscar').map((title) => (
                      <option key={title.id} value={title.id}>
                        {title.name} {title.is_team_lead && '⭐'}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="program">Program</Label>
                <Select
                  id="program"
                  value={titleFormData.program_id}
                  onChange={(e) => setTitleFormData({ ...titleFormData, program_id: e.target.value })}
                >
                  <option value="">No specific program</option>
                  {programs.length > 0 && (
                    <>
                      <optgroup label="Active Programs">
                        {programs
                          .filter((program) => program.status === 'active')
                          .map((program) => (
                            <option key={program.id} value={program.id}>
                              {program.name}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Planning / Upcoming">
                        {programs
                          .filter((program) => program.status === 'planning')
                          .map((program) => (
                            <option key={program.id} value={program.id}>
                              {program.name}
                            </option>
                          ))}
                      </optgroup>
                    </>
                  )}
                </Select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-900 mb-1">Title Assignment Rules:</p>
                <ul className="text-blue-700 space-y-1 text-xs">
                  <li>• Prof and Duchess are fixed and cannot be reassigned</li>
                  <li>• Vice Captain has 2 available positions</li>
                  <li>• Each Oscar unit has regular and Team Lead positions</li>
                  <li>• Titles can be reassigned for different programs</li>
                </ul>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => {
                  setTitleDialogOpen(false)
                  setAssigningTitleFor(null)
                  setTitleFormData({ title_id: '', program_id: '' })
                }} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">
                  Assign Title
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Assign Officer from Directory Dialog */}
      {canManageOfficers && (
        <Dialog open={assignFromDirectoryOpen} onOpenChange={setAssignFromDirectoryOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Officer to Program</DialogTitle>
              <DialogDescription>
                Choose any existing Protocol Officer and assign them an official title for a specific program.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAssignFromDirectory} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="officer">Protocol Officer *</Label>
                <Input
                  id="officer_search"
                  placeholder="Search by name, email, OSCAR or role"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  className="text-sm"
                />
                <Select
                  id="officer"
                  required
                  value={assignForm.officer_id}
                  onChange={(e) => setAssignForm({ ...assignForm, officer_id: e.target.value })}
                >
                  <option value="">Select an officer...</option>
                  {filteredOfficersForAssign.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.full_name || officer.email}
                      {officer.oscar ? ` • ${officer.oscar}` : ""}
                      {officer.is_active ? "" : " • (inactive)"}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assign_title">Official Title *</Label>
                <Select
                  id="assign_title"
                  required
                  value={assignForm.title_id}
                  onChange={(e) => setAssignForm({ ...assignForm, title_id: e.target.value })}
                >
                  <option value="">Select a title...</option>
                  {titles.map((title) => (
                    <option key={title.id} value={title.id}>
                      {title.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assign_program">Program</Label>
                <Select
                  id="assign_program"
                  value={assignForm.program_id}
                  onChange={(e) => setAssignForm({ ...assignForm, program_id: e.target.value })}
                >
                  <option value="">No specific program</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAssignFromDirectoryOpen(false)
                    setAssignForm({ officer_id: '', title_id: '', program_id: '' })
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">
                  Assign Title
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

