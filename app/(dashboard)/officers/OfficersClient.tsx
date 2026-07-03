"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserCircle, Plus, Edit, Trash2, UserCheck, UserX, Award, Search } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

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
  photo_url?: string | null
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

export default function OfficersClient({ initialOfficers }: { initialOfficers: Officer[] }) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

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
    role: '',
    photo_url: ''
  })

  const [titleFormData, setTitleFormData] = useState({
    title_id: '',
    program_id: '',
    role: ''
  })

  const [assignForm, setAssignForm] = useState<{ officer_ids: string[], program_id: string }>({
    officer_ids: [],
    program_id: "",
  })
  const [assignSearch, setAssignSearch] = useState("")
  const [globalSearch, setGlobalSearch] = useState("")
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([])

  const roles = [
    { value: 'admin', label: 'Admin' },
    { value: 'captain', label: 'Captain' },
    { value: 'vice_captain', label: 'Vice Captain' },
    { value: 'head_of_operations', label: 'Head of Operations' },
    { value: 'head_of_command', label: 'Head of Command' },
    { value: 'command', label: 'Command' },
    { value: 'tango_oscar', label: 'Tango Oscar (TO)' },
    { value: 'head_tango_oscar', label: 'Head, Tango Oscar' },
    { value: 'alpha_oscar', label: 'Alpha Oscar (AO)' },
    { value: 'head_alpha_oscar', label: 'Head, Alpha Oscar' },
    { value: 'noscar_den', label: 'NOscar Theatre' },
    { value: 'head_noscar_den', label: 'Head, NOscar Theatre' },
    { value: 'noscar_nest', label: 'NOscar Nest' },
    { value: 'head_noscar_nest', label: 'Head, NOscar Nest' },
    { value: 'victor_oscar', label: 'Victor Oscar (VO)' },
    { value: 'head_victor_oscar', label: 'Head, Victor Oscar' },
    { value: 'echo_oscar', label: 'Echo Oscar (EO)' },
    { value: 'head_echo_oscar', label: 'Head, Echo Oscar' },
    { value: 'viewer', label: 'Viewer' }
  ]

  const { data: currentUser } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) console.error('Auth check error:', error)
        if (!user) return null
        const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
        return data
      } catch (err) {
        // Suppress network-level "Failed to fetch" errors that crash the component boundary
        console.warn('Network error while checking auth session, falling back gracefully.', err)
        return null
      }
    },
    retry: 1
  })

  const ADMIN_ROLES = ['super_admin', 'dev_admin', 'admin', 'command', 'head_of_command', 'captain', 'vice_captain']
  const canManageOfficers = currentUser && ADMIN_ROLES.includes(currentUser.role)

  const { data: officers = [] } = useQuery({
    queryKey: ['officers'],
    queryFn: async () => {
      const response = await fetch("/api/officers/list")
      if (!response.ok) throw new Error("Failed to load officers via API")
      const body = await response.json()
      return (body.officers || []) as Officer[]
    },
    initialData: initialOfficers
  })

  // Filter officers based on global search
  const filteredOfficers = officers.filter((officer: Officer) => {
    if (!globalSearch.trim()) return true
    const q = globalSearch.toLowerCase()
    return (
      (officer.full_name || "").toLowerCase().includes(q) ||
      (officer.oscar || "").toLowerCase().includes(q)
    )
  })

  const { data: titles = [] } = useQuery({
    queryKey: ['titles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('official_titles').select('*').order('unit, name')
      if (error) throw error
      return data as OfficialTitle[]
    },
    enabled: !!canManageOfficers
  })

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('programs').select('id, name, status').order('created_at', { ascending: false })
      if (error) throw error
      return data as Program[]
    },
    enabled: !!canManageOfficers
  })

  const createOfficerMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Failed to create officer")
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
      toast.success("Protocol Officer created successfully!")
      setDialogOpen(false)
      resetForm()
    },
    onError: (error: any) => toast.error(error.message || "Failed to create officer")
  })

  const updateOfficerMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Failed to update officer")
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
      toast.success('Officer updated successfully!')
      setDialogOpen(false)
      resetForm()
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update officer')
  })

  const deleteOfficerMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/delete-user?id=${id}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to delete officer')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
      toast.success('Officer deleted successfully!')
    },
    onError: (error: any) => toast.error(error.message || 'Failed to delete officer')
  })

  const toggleActivationMutation = useMutation({
    mutationFn: async (officer: Officer) => {
      const response = await fetch('/api/officers/toggle-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerId: officer.id, isActive: officer.is_active }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update officer status')
      return { is_active: result.is_active, activation_status: result.activation_status }
    },
    onSuccess: (updatedData, variables) => {
      // Optimistically update BOTH statuses instantly to avoid UI bounce-back
      queryClient.setQueryData(['officers'], (oldData: Officer[] | undefined) => {
        if (!oldData) return oldData
        return oldData.map(o => o.id === variables.id ? {
          ...o,
          is_active: updatedData.is_active,
          activation_status: updatedData.activation_status
        } : o)
      })

      // Delay invalidation slightly to guarantee Supabase DB commit has cleared globally
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['officers'] })
      }, 500)

      toast.success(`Officer ${updatedData.is_active ? 'activated' : 'deactivated'}!`)
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update officer status')
  })

  const assignTitleMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (payload.roleUpdate && payload.roleUpdate.role !== payload.roleUpdate.currentRole) {
        const res = await fetch("/api/admin/update-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: payload.roleUpdate.id, role: payload.roleUpdate.role }),
        })
        if (!res.ok) throw new Error("Failed to update officer role")
      }
      if (payload.titleData?.title_id) {
        const { error } = await supabase.rpc('assign_title', payload.rpcData)
        if (error) throw error

        // Auto-activate logic: if assigned to an active program, and they are currently inactive
        if (payload.rpcData.p_program_id) {
          const prog = programs.find((p: any) => p.id === payload.rpcData.p_program_id)
          if (prog && prog.status === 'active') {
            const officer = officers.find((o: any) => o.id === payload.rpcData.p_user_id)
            if (officer && (!officer.is_active || officer.activation_status === 'pending')) {
              await fetch('/api/officers/toggle-activation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ officerId: officer.id, isActive: false })
              })
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
      toast.success('Officer updated successfully!')
      setTitleDialogOpen(false)
      setAssignFromDirectoryOpen(false)
      setAssigningTitleFor(null)
      setTitleFormData({ title_id: '', program_id: '', role: '' })
      setAssignForm({ officer_ids: [], program_id: '' })
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update officer')
  })

  const getInitials = (name: string) => {
    if (!name) return '??'
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'dev_admin': return 'bg-purple-500 text-white'
      case 'admin': return 'bg-blue-500 text-white'
      case 'captain': return 'bg-green-500 text-white'
      default: return 'bg-secondary text-secondary-foreground'
    }
  }

  const getTitleByUnit = (unit: string) => titles.filter(t => t.unit === unit)

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
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('officer-photos').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('officer-photos').getPublicUrl(fileName)
      setFormData({ ...formData, photo_url: publicUrl })
      toast.success('Photo uploaded successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload photo')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) {
      createOfficerMutation.mutate(formData)
    } else {
      updateOfficerMutation.mutate({ id: editing.id, ...formData })
    }
  }

  const handleEdit = (officer: Officer) => {
    setEditing(officer)
    setFormData({
      email: officer.email,
      password: '',
      full_name: officer.full_name || '',
      phone: officer.phone || '',
      role: officer.role,
      photo_url: officer.photo_url || ''
    })
    setDialogOpen(true)
  }

  const handleAssignTitleClick = (officer: Officer) => {
    setAssigningTitleFor(officer)
    const preferredProgram = programs.find(p => p.status === 'active') || programs[0] || null
    setTitleFormData({
      title_id: officer.current_title_id || '',
      program_id: preferredProgram?.id || '',
      role: officer.role
    })
    setTitleDialogOpen(true)
  }

  const handleAssignTitle = (e: React.FormEvent) => {
    e.preventDefault()
    if (!assigningTitleFor) return
    assignTitleMutation.mutate({
      roleUpdate: { id: assigningTitleFor.id, role: titleFormData.role, currentRole: assigningTitleFor.role },
      titleData: titleFormData,
      rpcData: {
        p_user_id: assigningTitleFor.id,
        p_title_code: titles.find(t => t.id === titleFormData.title_id)?.code,
        p_program_id: titleFormData.program_id || null,
        p_assigned_by: currentUser?.id
      }
    })
  }

  const handleAssignOfficialOscar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!assigningTitleFor) return
    assignTitleMutation.mutate({
      roleUpdate: { id: assigningTitleFor.id, role: titleFormData.role, currentRole: assigningTitleFor.role },
      titleData: { title_id: '', program_id: '' }, // empty, bypassing RPC
      rpcData: {}
    })
  }

  const handleAssignFromDirectory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (assignForm.officer_ids.length === 0) {
      toast.error('Select at least one officer')
      return
    }

    try {
      const response = await fetch("/api/admin/bulk-assign-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officer_ids: assignForm.officer_ids,
          program_id: assignForm.program_id || null
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Failed to batch assign officers")

      queryClient.invalidateQueries({ queryKey: ['officers'] })
      toast.success(`Successfully assigned ${assignForm.officer_ids.length} officer(s) to program!`)
      setAssignFromDirectoryOpen(false)
      setAssignForm({ officer_ids: [], program_id: '' })
    } catch (error: any) {
      toast.error(error.message || 'Failed to batch assign officers')
    }
  }

  const handleDelete = async (officer: Officer) => {
    if (officer.role === 'dev_admin') return toast.error('Cannot delete Super Admin account')
    if (officer.id === currentUser?.id) return toast.error('Cannot delete your own account')
    const name = officer.full_name || officer.email
    const oscar = officer.oscar ? ` (${officer.oscar})` : ''
    const confirmed = await confirm({
      title: '⚠️ Delete Officer',
      message: `You are about to permanently delete ${name}${oscar}. This action cannot be undone — all assignments, roles and history for this officer will be removed.`,
      confirmText: 'Yes, Delete Permanently',
      cancelText: 'Cancel',
      variant: 'destructive',
      requireInput: 'DELETE'
    })
    if (!confirmed) return
    deleteOfficerMutation.mutate(officer.id)
  }

  const handleBulkDelete = async () => {
    if (selectedOfficers.length === 0) return
    const confirmed = await confirm({
      title: '⚠️ Bulk Delete Muti-Select',
      message: `You are about to permanently delete ${selectedOfficers.length} officers. This action cannot be undone — all histories and assignments will be destroyed.`,
      confirmText: 'Yes, Delete Selected',
      cancelText: 'Cancel',
      variant: 'destructive',
      requireInput: 'DELETE'
    })
    if (!confirmed) return

    const officersToDelete = filteredOfficers.filter((o: Officer) =>
      selectedOfficers.includes(o.id) && o.role !== 'dev_admin' && o.id !== currentUser?.id
    )

    if (officersToDelete.length === 0) {
      toast.error('Selected officers cannot be deleted')
      return
    }

    try {
      await Promise.all(officersToDelete.map((o: Officer) => deleteOfficerMutation.mutateAsync(o.id)))
      setSelectedOfficers([])
      toast.success(`Batch deletion of ${officersToDelete.length} officers complete.`)
    } catch (e: any) {
      toast.error('Bulk delete encountered an error: ' + e.message)
    }
  }

  const filteredOfficersForAssign = officers
    .slice()
    .sort((a: Officer, b: Officer) => Number(b.is_active) - Number(a.is_active))
    .filter((officer: Officer) => {
      if (!assignSearch.trim()) return true
      const query = assignSearch.toLowerCase()
      const name = (officer.full_name || "").toLowerCase()
      const email = (officer.email || "").toLowerCase()
      const oscar = (officer.oscar || "").toLowerCase()
      const role = (officer.role || "").toLowerCase()
      return name.includes(query) || email.includes(query) || oscar.includes(query) || role.includes(query)
    })

  return (
    <div className="space-y-6 animate-fade-in">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Officers</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Directory and management of all Protocol Officers</p>
        </div>
        {canManageOfficers && (
          <Button onClick={() => { setEditing(null); resetForm(); setDialogOpen(true) }} className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Officer</span>
          </Button>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div layout className="grid gap-4 md:grid-cols-4">
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
              {officers.filter((o: Officer) => o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter((o: Officer) => o.is_online).length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Titles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {officers.filter((o: Officer) => o.current_title_id).length}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Tabs defaultValue="directory" className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <TabsList>
            <TabsTrigger value="directory">Directory</TabsTrigger>
            {canManageOfficers && <TabsTrigger value="manage">Manage</TabsTrigger>}
            {canManageOfficers && <TabsTrigger value="pending">
              Pending
              {filteredOfficers.filter(o => o.activation_status === 'pending').length > 0 && (
                <Badge variant="destructive" className="ml-2 px-1 text-[10px]">
                  {filteredOfficers.filter(o => o.activation_status === 'pending').length}
                </Badge>
              )}
            </TabsTrigger>}
          </TabsList>
          {canManageOfficers && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or oscar..."
                className="pl-8 bg-background border-primary/20 focus-visible:ring-primary/50"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
            </div>
          )}
        </div>

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
              {filteredOfficers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <UserCircle className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-sm font-medium">No officers yet</p>
                </div>
              ) : (
                <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence>
                    {filteredOfficers
                      .filter((officer: Officer) => officer.activation_status !== 'pending')
                      .map((officer: Officer) => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          key={officer.id}
                          className="flex items-center space-x-3 rounded-lg border p-4 transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm"
                        >
                          <Avatar>
                            {officer.photo_url ? <AvatarImage src={officer.photo_url} /> : <AvatarFallback>{getInitials(officer.full_name || officer.email)}</AvatarFallback>}
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{officer.full_name || 'No name'}</p>
                            <p className="text-xs text-muted-foreground truncate">{officer.email}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge className={`text-[10px] uppercase tracking-wide ${getRoleBadgeColor(officer.role)}`}>
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
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canManageOfficers && (
          <TabsContent value="manage" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <p className="text-sm text-muted-foreground">
                Edit officer details and assign titles and duties across programs
              </p>
              <div className="flex items-center gap-2">
                {selectedOfficers.length > 0 && (
                  <Button variant="destructive" onClick={handleBulkDelete} className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    <span>Delete Selected ({selectedOfficers.length})</span>
                  </Button>
                )}
                <Button onClick={() => setAssignFromDirectoryOpen(true)} className="gap-2">
                  <UserCheck className="h-4 w-4" />
                  <span>Assign to Program</span>
                </Button>
              </div>
            </div>

            <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {filteredOfficers.map((officer: Officer) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    key={officer.id}
                  >
                    <Card className={`${!officer.is_active ? 'opacity-60' : ''} transition-all hover:-translate-y-0.5 hover:shadow-md h-full flex flex-col`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                checked={selectedOfficers.includes(officer.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedOfficers(prev => [...prev, officer.id])
                                  else setSelectedOfficers(prev => prev.filter(id => id !== officer.id))
                                }}
                                className="h-4 w-4 rounded border-input dark:border-white/20 bg-transparent text-primary focus:ring-primary cursor-pointer accent-primary"
                                aria-label={`Select ${officer.full_name}`}
                              />
                            </div>
                            <Avatar>
                              {officer.photo_url ? <AvatarImage src={officer.photo_url} /> : <AvatarFallback className={getRoleBadgeColor(officer.role)}>{getInitials(officer.full_name || officer.email)}</AvatarFallback>}
                            </Avatar>
                            <div>
                              <CardTitle className="text-base">{officer.full_name || 'No Name'}</CardTitle>
                              <CardDescription className="text-xs">{officer.email}</CardDescription>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
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
                      <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
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

                        <div className="flex gap-2 pt-2 border-t mt-4">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEdit(officer)}>
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleAssignTitleClick(officer)}>
                            <Award className="h-3 w-3 mr-1" />
                            Title
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleActivationMutation.mutate(officer)}>
                            {officer.is_active ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                          </Button>
                          {officer.role !== 'dev_admin' && officer.id !== currentUser?.id && (
                            <Button size="sm" variant="outline" onClick={() => handleDelete(officer)}>
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </TabsContent>
        )}

        {canManageOfficers && (
          <TabsContent value="pending" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                Review and approve outstanding self-registration requests
              </p>
            </div>
            {filteredOfficers.filter(o => o.activation_status === 'pending').length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-white/5 rounded-xl border border-white/10">
                <UserCheck className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm font-medium">No pending approvals</p>
              </div>
            ) : (
              <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {filteredOfficers.filter((o: Officer) => o.activation_status === 'pending').map((officer: Officer) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={officer.id}
                    >
                      <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md h-full flex flex-col border-orange-500/30 bg-orange-500/5">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar>
                                {officer.photo_url ? <AvatarImage src={officer.photo_url} /> : <AvatarFallback className="bg-orange-500 text-white">{getInitials(officer.full_name || officer.email)}</AvatarFallback>}
                              </Avatar>
                              <div>
                                <CardTitle className="text-base">{officer.full_name || 'No Name'}</CardTitle>
                                <CardDescription className="text-xs">{officer.email}</CardDescription>
                              </div>
                            </div>
                            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                              Awaiting
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Requested Role:</span>
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
                          </div>

                          <div className="flex gap-2 pt-2 border-t mt-4">
                            <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => toggleActivationMutation.mutate(officer)}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Approve & Activate
                            </Button>
                            {officer.role !== 'dev_admin' && officer.id !== currentUser?.id && (
                              <Button size="sm" variant="outline" onClick={() => handleDelete(officer)}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Officer' : 'Add Protocol Officer'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update officer details and role.' : 'Create a new Protocol Officer account.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">{editing ? 'New Password (leave blank to keep current)' : 'Temporary Password *'}</Label>
              <Input id="password" type="password" required={!editing} placeholder={editing ? "Enter new password" : "Enter temporary password"} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input id="full_name" required value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">{editing ? 'Oscar *' : 'Oscar *'}</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo">Officer Photo (Optional)</Label>
              <Input id="photo" type="file" accept="image/*" onChange={handlePhotoUpload} className="cursor-pointer" />
              {formData.photo_url && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={formData.photo_url} />
                    <AvatarFallback>Photo</AvatarFallback>
                  </Avatar>
                  <span>Photo uploaded</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); resetForm() }} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1">{editing ? 'Update Officer' : 'Create Officer'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {canManageOfficers && (
        <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Roles & Titles</DialogTitle>
              <DialogDescription>Modify assignments for {assigningTitleFor?.full_name}</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="program_role" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="program_role">Program Role</TabsTrigger>
                <TabsTrigger value="official_oscar">Official Oscar</TabsTrigger>
              </TabsList>

              <TabsContent value="program_role">
                <form onSubmit={handleAssignTitle} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Program Role *</Label>
                    <Select required value={titleFormData.title_id || 'unassigned'} onValueChange={(value) => setTitleFormData({ ...titleFormData, title_id: value === 'unassigned' ? '' : value })}>
                      <SelectTrigger id="title">
                        <SelectValue placeholder="Select a title..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Select a title...</SelectItem>
                        {getTitleByUnit('leadership').filter(t => t.is_fixed).map((title) => <SelectItem key={title.id} value={title.id}>{title.name} {title.is_team_lead && '(Team Lead)'}</SelectItem>)}
                        {getTitleByUnit('leadership').filter(t => !t.is_fixed).map((title) => <SelectItem key={title.id} value={title.id}>{title.name} {title.max_positions > 1 && `(${title.max_positions} positions)`}</SelectItem>)}
                        {getTitleByUnit('command').map((title) => <SelectItem key={title.id} value={title.id}>{title.name} {title.max_positions > 1 && `(${title.max_positions} positions)`}</SelectItem>)}
                        {getTitleByUnit('oscar').map((title) => <SelectItem key={title.id} value={title.id}>{title.name} {title.is_team_lead && '⭐'} {title.max_positions > 1 && `(${title.max_positions} positions)`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="program">Program</Label>
                    <Select value={titleFormData.program_id || 'unassigned'} onValueChange={(value) => setTitleFormData({ ...titleFormData, program_id: value === 'unassigned' ? '' : value })}>
                      <SelectTrigger id="program">
                        <SelectValue placeholder="No specific program" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">No specific program</SelectItem>
                        {programs.filter(p => p.status === 'active').map(p => <SelectItem key={p.id} value={p.id}>[Active] {p.name}</SelectItem>)}
                        {programs.filter(p => p.status === 'planning').map(p => <SelectItem key={p.id} value={p.id}>[Planning] {p.name}</SelectItem>)}
                        {programs.filter(p => p.status === 'completed').map(p => <SelectItem key={p.id} value={p.id}>[Completed] {p.name}</SelectItem>)}
                        {programs.filter(p => p.status === 'archived').map(p => <SelectItem key={p.id} value={p.id}>[Archived] {p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => { setTitleDialogOpen(false); setAssigningTitleFor(null); setTitleFormData({ title_id: '', program_id: '', role: '' }) }} className="flex-1">Cancel</Button>
                    <Button type="submit" className="flex-1">Assign Program Role</Button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="official_oscar">
                <form onSubmit={handleAssignOfficialOscar} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="base_role">Official Oscar (Base Role) *</Label>
                    <Select required value={titleFormData.role || ''} onValueChange={(value) => setTitleFormData({ ...titleFormData, role: value })}>
                      <SelectTrigger id="base_role">
                        <SelectValue placeholder="Select official oscar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => { setTitleDialogOpen(false); setAssigningTitleFor(null); setTitleFormData({ title_id: '', program_id: '', role: '' }) }} className="flex-1">Cancel</Button>
                    <Button type="submit" className="flex-1 text-white bg-amber-600 hover:bg-amber-700">Set Official Oscar</Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}

      {canManageOfficers && (
        <Dialog open={assignFromDirectoryOpen} onOpenChange={setAssignFromDirectoryOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Assign Officer to Program</DialogTitle>
              <DialogDescription>Choose any existing Protocol Officer and assign them an official title for a specific program.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAssignFromDirectory} className="space-y-4 mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <Label>Protocol Officers *</Label>
                  <span className="text-xs text-muted-foreground">{assignForm.officer_ids.length} selected</span>
                </div>
                <Input id="officer_search" placeholder="Filter by name, email, OSCAR or role" value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} className="text-sm mb-2" />
                <div className="max-h-[250px] overflow-y-auto space-y-1 border rounded-md p-2 bg-background/50">
                  {filteredOfficersForAssign.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-4">No officers found matching search.</p>
                  ) : (
                    filteredOfficersForAssign.map((officer: Officer) => (
                      <label key={officer.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors border border-transparent hover:border-border">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input text-primary focus:ring-primary bg-background"
                          checked={assignForm.officer_ids.includes(officer.id)}
                          onChange={(e) => {
                            if (e.target.checked) setAssignForm(prev => ({ ...prev, officer_ids: [...prev.officer_ids, officer.id] }))
                            else setAssignForm(prev => ({ ...prev, officer_ids: prev.officer_ids.filter(id => id !== officer.id) }))
                          }}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium leading-none mb-1">{officer.full_name || officer.email}</span>
                          <span className="text-[10px] text-muted-foreground flex gap-1 items-center">
                            {roles.find(r => r.value === officer.role)?.label}
                            {officer.oscar && <span className="opacity-50">• {officer.oscar}</span>}
                            {!officer.is_active && <span className="text-orange-500 font-medium">• Pending</span>}
                          </span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign_program">Program</Label>
                <Select value={assignForm.program_id || 'unassigned'} onValueChange={(value) => setAssignForm({ ...assignForm, program_id: value === 'unassigned' ? '' : value })}>
                  <SelectTrigger id="assign_program">
                    <SelectValue placeholder="No specific program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">No specific program</SelectItem>
                    {programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => { setAssignFromDirectoryOpen(false); setAssignForm({ officer_ids: [], program_id: '' }) }} className="flex-1">Cancel</Button>
                <Button type="submit" className="flex-1">Assign to Program</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
