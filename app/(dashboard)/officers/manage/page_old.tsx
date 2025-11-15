"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { UserCircle, Plus, Edit, Trash2, UserCheck, UserX, Shield } from "lucide-react"
import { toast } from "sonner"

type Officer = {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  oscar: string | null
  role_id: string
  is_active: boolean
  activation_status: string
  online_status: string
  created_at: string
  roles: { name: string; description: string } | null
}

export default function ManageOfficersPage() {
  const supabase = createClient()
  const [officers, setOfficers] = useState<Officer[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Officer | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    oscar: '',
    role_id: ''
  })

  useEffect(() => {
    loadData()
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
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single()
      
      setCurrentUser(userData)

      // Check if user is admin or super admin (role is stored directly in users.role)
      const isAdmin = userData?.role === 'admin' || userData?.role === 'super_admin'
      
      if (!isAdmin) {
        toast.error('Access denied. Admin privileges required.')
        return
      }

      // Load officers and roles
      const [officersRes, rolesRes] = await Promise.all([
        supabase
          .from('users')
          .select(`
            *,
            roles(name, description)
          `)
          .order('full_name'),
        supabase.from('roles').select('*').order('name')
      ])

      if (officersRes.data) setOfficers(officersRes.data as Officer[])
      if (rolesRes.data) setRoles(rolesRes.data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load officers')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      if (editing) {
        // Update existing officer
        const { error } = await supabase
          .from('users')
          .update({
            full_name: formData.full_name,
            phone: formData.phone,
            oscar: formData.oscar,
            role_id: formData.role_id
          })
          .eq('id', editing.id)

        if (error) throw error
        toast.success('Officer updated successfully!')
      } else {
        // Create new officer via admin
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: formData.email,
          password: formData.password,
          email_confirm: true
        })

        if (authError) throw authError

        // Insert into users table with auto-active status (admin created)
        const { error: userError } = await supabase
          .from('users')
          .insert([{
            id: authData.user.id,
            email: formData.email,
            full_name: formData.full_name,
            phone: formData.phone,
            oscar: formData.oscar,
            role_id: formData.role_id,
            activation_status: 'active',
            is_active: true,
            created_by: currentUser?.id
          }])

        if (userError) throw userError
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

  const handleEdit = (officer: Officer) => {
    setEditing(officer)
    setFormData({
      email: officer.email,
      password: '',
      full_name: officer.full_name || '',
      phone: officer.phone || '',
      oscar: officer.oscar || '',
      role_id: officer.role_id
    })
    setDialogOpen(true)
  }

  const handleToggleActivation = async (officer: Officer) => {
    try {
      const newStatus = officer.is_active ? 'deactivated' : 'active'
      const { error } = await supabase
        .from('users')
        .update({
          is_active: !officer.is_active,
          activation_status: newStatus
        })
        .eq('id', officer.id)

      if (error) throw error
      toast.success(`Officer ${newStatus}!`)
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this officer? This action cannot be undone.')) return

    try {
      // Delete from users table (will cascade to auth if needed)
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      // Also delete from auth
      const { error: authError } = await supabase.auth.admin.deleteUser(id)
      if (authError) console.error('Auth delete error:', authError)

      toast.success('Officer deleted successfully!')
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete officer')
    }
  }

  const handleRoleChange = async (officerId: string, newRoleId: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role_id: newRoleId })
        .eq('id', officerId)

      if (error) throw error
      toast.success('Role updated successfully!')
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update role')
    }
  }

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      full_name: '',
      phone: '',
      oscar: '',
      role_id: ''
    })
  }

  const openDialog = () => {
    setEditing(null)
    resetForm()
    setDialogOpen(true)
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  // Check if user has admin access
  const isAdmin = currentUser?.roles?.name === 'admin' || currentUser?.roles?.name === 'super_admin'
  const isSuperAdmin = currentUser?.roles?.name === 'super_admin'

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You need admin privileges to access this page</CardDescription>
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
          <p className="text-muted-foreground">Create, edit, and manage officer accounts</p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Protocol Officer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{officers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.online_status === 'online').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.activation_status === 'pending').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <UserCircle className="h-5 w-5" />
            <span>All Protocol Officers</span>
          </CardTitle>
          <CardDescription>Manage officer accounts, roles, and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          {officers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCircle className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No officers yet</p>
              <Button className="mt-4" onClick={openDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Protocol Officer
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {officers.map((officer) => (
                <div
                  key={officer.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center space-x-3">
                    <Avatar>
                      <AvatarFallback>
                        {getInitials(officer.full_name || officer.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium">{officer.full_name || 'No name'}</p>
                        {officer.oscar && (
                          <Badge variant="outline" className="text-xs">
                            {officer.oscar}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{officer.email}</p>
                      {officer.phone && (
                        <p className="text-xs text-muted-foreground">📞 {officer.phone}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Role Selector */}
                    <Select
                      value={officer.role_id}
                      onChange={(e) => handleRoleChange(officer.id, e.target.value)}
                      disabled={!isSuperAdmin && officer.roles?.name === 'super_admin'}
                      className="w-32"
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </Select>

                    {/* Status Badges */}
                    <div className="flex items-center space-x-1">
                      <div className={`h-2 w-2 rounded-full ${officer.online_status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <Badge variant={officer.is_active ? 'success' : 'secondary'} className="text-xs">
                        {officer.activation_status}
                      </Badge>
                    </div>

                    {/* Action Buttons */}
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(officer)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleToggleActivation(officer)}
                      disabled={officer.roles?.name === 'super_admin' && !isSuperAdmin}
                    >
                      {officer.is_active ? (
                        <UserX className="h-4 w-4 text-orange-500" />
                      ) : (
                        <UserCheck className="h-4 w-4 text-green-500" />
                      )}
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(officer.id)}
                      disabled={officer.roles?.name === 'super_admin' || officer.id === currentUser?.id}
                    >
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Protocol Officer' : 'Add New Protocol Officer'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update officer information' : 'Create a new protocol officer account (auto-activated)'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  required
                  placeholder="e.g., Daniel Oriazowan"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="oscar">OSCAR (Call Sign)</Label>
                <Input
                  id="oscar"
                  placeholder="e.g., OSCAR-ALPHA"
                  value={formData.oscar}
                  onChange={(e) => setFormData({ ...formData, oscar: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  disabled={!!editing}
                  placeholder="officer@tcnp.org"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  required
                  placeholder="+2348026381777"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="Minimum 8 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="role_id">Role *</Label>
              <Select
                id="role_id"
                required
                value={formData.role_id}
                onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} - {role.description}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editing ? 'Update Officer' : 'Create Officer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
