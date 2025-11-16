"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { UserCircle, Plus, Edit, Trash2, UserCheck, UserX, Shield, Award } from "lucide-react"
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

export default function ManageOfficersPage() {
  const supabase = createClient()
  const [officers, setOfficers] = useState<Officer[]>([])
  const [titles, setTitles] = useState<OfficialTitle[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [titleDialogOpen, setTitleDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Officer | null>(null)
  const [assigningTitleFor, setAssigningTitleFor] = useState<Officer | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'delta_oscar'
  })

  // Auto-generate OSCAR based on name and role
  const generateOscar = (fullName: string, role: string) => {
    if (!fullName) return ''
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase()
    const roleCode = role.toUpperCase().replace('_', '-')
    return `OSCAR-${initials}-${roleCode}`
  }
  const [titleFormData, setTitleFormData] = useState({
    title_id: '',
    program_id: ''
  })

  const roles = [
    { value: 'super_admin', label: 'Super Admin' },
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
    { value: 'november_oscar', label: 'November Oscar (NO)' },
    { value: 'victor_oscar', label: 'Victor Oscar (VO)' },
    { value: 'viewer', label: 'Viewer' }
  ]

  useEffect(() => {
    loadData()
    
    return () => {
      // Cleanup if needed
    }
  }, [])

  const loadData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        toast.error('Please login to access this page.')
        return
      }
      
      // Get current user details
      const { data: userData } = await (supabase as any)
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single()
      
      setCurrentUser(userData as any)

      if (!userData || !['super_admin', 'admin'].includes((userData as any).role)) {
        toast.error('Access denied. Admin privileges required.')
        return
      }

      // Load officers and titles
      const [officersRes, titlesRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, full_name, email, phone, role, is_active, oscar, activation_status, unit, current_title_id')
          .order('full_name')
          .limit(100),
        supabase
          .from('official_titles')
          .select('*')
          .order('unit, name')
      ])

      if (officersRes.data) setOfficers(officersRes.data as Officer[])
      if (titlesRes.data) setTitles(titlesRes.data as OfficialTitle[])
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
      if (editing) {
        // Update existing officer
        const oscar = generateOscar(formData.full_name, formData.role)
        
        const { error } = await supabase
          .from('users')
          .update({
            full_name: formData.full_name,
            phone: formData.phone,
            oscar: oscar,
            role: formData.role as any
          } as any)
          .eq('id', editing.id)

        if (error) throw error
        toast.success('Officer updated successfully!')
      } else {
        // Create new officer via secure admin endpoint (auto-confirmed, immediate access)
        const response = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            phone: formData.phone,
            role: formData.role
          })
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create officer')
        }

        toast.success('Officer created successfully!')
      }

      setDialogOpen(false)
      setEditing(null)
      resetForm()
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Failed to save officer')
    }
  }

  const handleAssignTitle = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!assigningTitleFor) return
    
    try {
      const { data, error } = await (supabase as any).rpc('assign_title', {
        p_user_id: assigningTitleFor.id,
        p_title_code: titles.find(t => t.id === titleFormData.title_id)?.code,
        p_program_id: titleFormData.program_id || null,
        p_assigned_by: currentUser?.id
      })

      if (error) throw error
      
      toast.success('Title assigned successfully!')
      setTitleDialogOpen(false)
      setAssigningTitleFor(null)
      setTitleFormData({ title_id: '', program_id: '' })
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Failed to assign title')
    }
  }

  const handleEdit = (officer: Officer) => {
    setEditing(officer)
    setFormData({
      email: officer.email,
      password: '',
      full_name: officer.full_name || '',
      phone: officer.phone || '',
      role: officer.role
    })
    setDialogOpen(true)
  }

  const handleAssignTitleClick = (officer: Officer) => {
    setAssigningTitleFor(officer)
    setTitleDialogOpen(true)
  }

  const handleToggleActivation = async (officer: Officer) => {
    try {
      const newStatus = officer.is_active ? 'deactivated' : 'active'
      const { error } = await supabase
        .from('users')
        .update({
          is_active: !officer.is_active,
          activation_status: newStatus
        } as any)
        .eq('id', officer.id)

      if (error) throw error
      toast.success(`Officer ${newStatus}!`)
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error('Failed to update officer status')
    }
  }

  const handleDelete = async (officer: Officer) => {
    if (officer.role === 'super_admin') {
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
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', officer.id)

      if (error) throw error
      toast.success('Officer deleted successfully!')
      loadData()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error('Failed to delete officer')
    }
  }

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      full_name: '',
      phone: '',
      role: 'delta_oscar'
    })
  }

  const getInitials = (name: string) => {
    if (!name) return '??'
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'bg-purple-500'
      case 'admin': return 'bg-blue-500'
      case 'captain': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }

  const getTitleByUnit = (unit: string) => {
    return titles.filter(t => t.unit === unit)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need admin privileges to access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Manage Protocol Officers</h1>
          <p className="text-muted-foreground mt-1">
            Create, edit, and manage Protocol Officers and their titles
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Protocol Officer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{officers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {officers.filter(o => o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Deactivated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {officers.filter(o => !o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">With Titles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {officers.filter(o => o.current_title_id).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Officers List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {officers.map((officer) => (
          <Card key={officer.id} className={!officer.is_active ? 'opacity-60' : ''}>
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
                {officer.role !== 'super_admin' && officer.id !== currentUser?.id && (
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

      {/* Add/Edit Officer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Officer' : 'Add Protocol Officer'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update officer details' : 'Create a new Protocol Officer account'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {!editing && (
              <>
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
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </>
            )}
            
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
              <Label htmlFor="role">Role *</Label>
              <Select
                id="role"
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => {
                setDialogOpen(false)
                setEditing(null)
                resetForm()
              }} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                {editing ? 'Update' : 'Create'} Officer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Title Dialog */}
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
    </div>
  )
}
