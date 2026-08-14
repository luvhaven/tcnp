"use client"

import { useState, useEffect } from "react"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserCircle, Plus, Edit, Trash2, UserCheck, UserX, Award, Search, LayoutGrid, List, Download, Filter, Eye } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { OfficerProfileDialog } from "@/components/officers/OfficerProfileDialog"

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
  team?: string | null
  is_team_head?: boolean | null
  created_at: string
  date_of_birth?: string | null
  gender?: string | null
  address?: string | null
  city?: string | null
  bio?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  profile_completed_at?: string | null
  last_seen?: string | null
  updated_at?: string | null
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
  const [viewingOfficer, setViewingOfficer] = useState<Officer | null>(null)
  const [editing, setEditing] = useState<Officer | null>(null)
  const [assigningTitleFor, setAssigningTitleFor] = useState<Officer | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: '',
    photo_url: '',
    team: '',
    is_team_head: false
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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [filterRole, setFilterRole] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterTeam, setFilterTeam] = useState('all')

  useEffect(() => {
    const saved = localStorage.getItem('officersViewMode')
    if (saved === 'table') setViewMode('table')
  }, [])

  const toggleViewMode = (mode: 'grid' | 'table') => {
    setViewMode(mode)
    localStorage.setItem('officersViewMode', mode)
  }

  const roles = [
    { value: 'admin', label: 'Admin' },
    { value: 'captain', label: 'Captain' },
    { value: 'vice_captain', label: 'Vice Captain' },
    { value: 'head_of_operations', label: 'Head of Operations' },
    { value: 'head_of_command', label: 'Head of Command' },
    { value: 'command', label: 'Command' },
    { value: 'head_tango_oscar', label: 'Head, Tango Oscar' },
    { value: 'tango_oscar', label: 'Tango Oscar (TO)' },
    { value: 'head_alpha_oscar', label: 'Head, Alpha Oscar' },
    { value: 'alpha_oscar', label: 'Alpha Oscar (AO)' },
    { value: 'head_noscar_den', label: 'Head, NOscar Theatre' },
    { value: 'noscar_den', label: 'NOscar Theatre' },
    { value: 'head_noscar_nest', label: 'Head, NOscar Nest' },
    { value: 'noscar_nest', label: 'NOscar Nest' },
    { value: 'november_oscar', label: 'November Oscar (Legacy)' },
    { value: 'head_victor_oscar', label: 'Head, Victor Oscar' },
    { value: 'victor_oscar', label: 'Victor Oscar (VO)' },
    { value: 'delta_oscar', label: 'Delta Oscar (DO)' },
    { value: 'head_serial_oscar', label: 'Head, Serial Oscar' },
    { value: 'serial_oscar', label: 'Serial Oscar (SO)' },
    { value: 'head_compliance_oscar', label: 'Head, Compliance Oscar' },
    { value: 'compliance_oscar', label: 'Compliance Oscar (CO)' },
    { value: 'head_welfare_oscar', label: 'Head, Welfare Oscar' },
    { value: 'welfare_oscar', label: 'Welfare Oscar (WO)' },
    { value: 'head_hospitality_oscar', label: 'Head, Hospitality Oscar' },
    { value: 'hospitality_oscar', label: 'Hospitality Oscar (HO)' },
    { value: 'viewer', label: 'Viewer' }
  ]

  const CATEGORIES = [
    { id: 'leadership', label: 'Leadership', roles: ['captain', 'vice_captain'] },
    { id: 'command', label: 'Command Centre', roles: ['head_of_command', 'command', 'head_of_operations'] },
    { id: 'alpha', label: 'Alpha Oscar (AO)', roles: ['head_alpha_oscar', 'alpha_oscar'] },
    { id: 'tango', label: 'Tango Oscar (TO)', roles: ['head_tango_oscar', 'tango_oscar'] },
    { id: 'victor', label: 'Victor Oscar (VO)', roles: ['head_victor_oscar', 'victor_oscar'] },
    { id: 'november', label: 'November Oscar (NO)', roles: ['november_oscar', 'head_noscar_den', 'noscar_den', 'head_noscar_nest', 'noscar_nest'] },
    { id: 'delta', label: 'Delta Oscar (DO)', roles: ['delta_oscar'] },
    { id: 'serial', label: 'Serial Oscar (SO)', roles: ['head_serial_oscar', 'serial_oscar'] },
    { id: 'compliance', label: 'Compliance Oscar (CO)', roles: ['head_compliance_oscar', 'compliance_oscar'] },
    { id: 'welfare', label: 'Welfare Oscar (WO)', roles: ['head_welfare_oscar', 'welfare_oscar'] },
    { id: 'hospitality', label: 'Hospitality Oscar (HO)', roles: ['head_hospitality_oscar', 'hospitality_oscar'] },
    { id: 'legacy_echo', label: 'Echo (Legacy)', roles: ['head_echo_oscar', 'echo_oscar'] },
    { id: 'others', label: 'Administration & Viewers', roles: ['admin', 'dev_admin', 'viewer'] }
  ]

  const sortOfficersByHierarchy = (a: Officer, b: Officer) => {
    // 1. Captains absolutely first
    if (a.role === 'captain' && b.role !== 'captain') return -1;
    if (b.role === 'captain' && a.role !== 'captain') return 1;

    // 2. Vice Captains next
    if (a.role === 'vice_captain' && b.role !== 'vice_captain') return -1;
    if (b.role === 'vice_captain' && a.role !== 'vice_captain') return 1;

    // 3. Heads next
    const aIsHead = a.role.startsWith('head_');
    const bIsHead = b.role.startsWith('head_');

    if (aIsHead && !bIsHead) return -1;
    if (bIsHead && !aIsHead) return 1;

    // 4. Default to Alphabetical by name
    return (a.full_name || a.email).localeCompare(b.full_name || b.email);
  }

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
    queryKey: ['officers', 'directory'],
    queryFn: async () => {
      const response = await fetch("/api/officers/list")
      if (!response.ok) throw new Error("Failed to load officers via API")
      const body = await response.json()
      return (body.officers || []) as Officer[]
    },
    initialData: initialOfficers
  })

  // Filter officers based on global search & filters
  const filteredOfficers = officers.filter((officer: Officer) => {
    if (filterStatus !== 'all') {
      if (filterStatus === 'active' && !officer.is_active) return false
      if (filterStatus === 'inactive' && officer.is_active) return false
      if (filterStatus === 'pending' && officer.activation_status !== 'pending') return false
    }
    if (filterRole !== 'all' && officer.role !== filterRole) return false
    if (filterTeam !== 'all' && officer.team !== filterTeam) return false

    if (!globalSearch.trim()) return true
    const q = globalSearch.toLowerCase()
    return (
      (officer.full_name || "").toLowerCase().includes(q) ||
      (officer.oscar || "").toLowerCase().includes(q) ||
      (officer.role || "").toLowerCase().includes(q) ||
      (officer.email || "").toLowerCase().includes(q)
    )
  })

  const exportToCSV = () => {
    const headers = ['Full Name', 'Email', 'Phone', 'OSCAR', 'Role', 'Unit', 'Status']
    const csvContent = [
      headers.join(','),
      ...filteredOfficers.map((o: Officer) => [
        `"${o.full_name || ''}"`,
        `"${o.email || ''}"`,
        `"${o.phone || ''}"`,
        `"${o.oscar || ''}"`,
        `"${roles.find(r => r.value === o.role)?.label || o.role}"`,
        `"${o.unit || ''}"`,
        `"${o.activation_status === 'pending' ? 'Pending' : o.is_active ? 'Active' : 'Inactive'}"`
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `tcnp_directory_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

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
    // Distinct key — see ProgramsClient.tsx for why sharing the bare
    // ['programs'] key across pages with different select() shapes caused
    // flicker and missing fields.
    queryKey: ['programs', 'lite-status'],
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
      queryClient.setQueryData(['officers', 'directory'], (oldData: Officer[] | undefined) => {
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
      photo_url: '',
      team: '',
      is_team_head: false
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
      photo_url: officer.photo_url || '',
      team: officer.team || '',
      is_team_head: officer.is_team_head === true
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
      setSelectedOfficers([])
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

    const officersToDelete = officers.filter((o: Officer) =>
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

  const renderCategorizedOfficers = (
    officersList: Officer[],
    renderCard: (officer: Officer) => React.ReactNode
  ) => {
    return (
      <div className="space-y-8 pb-8">
        {CATEGORIES.map(category => {
          const categoryOfficers = officersList
            .filter(o => category.roles.includes(o.role))
            .sort(sortOfficersByHierarchy);

          if (categoryOfficers.length === 0) return null;

          return (
            <div key={category.id} className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <h3 className="text-lg font-semibold tracking-tight">{category.label}</h3>
                <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-xs font-normal bg-secondary/50">
                  {categoryOfficers.length}
                </Badge>
              </div>
              <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {categoryOfficers.map(renderCard)}
                </AnimatePresence>
              </motion.div>
            </div>
          )
        })}

        {/* Render Uncategorized at the bottom if any */}
        {(() => {
          const categorizedRoles = CATEGORIES.flatMap(c => c.roles);
          const uncategorized = officersList
            .filter(o => !categorizedRoles.includes(o.role))
            .sort(sortOfficersByHierarchy);

          if (uncategorized.length === 0) return null;

          return (
            <div key="uncategorized" className="space-y-3 pt-6 mt-8 border-t border-dashed border-border/50">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <h3 className="text-lg font-semibold tracking-tight text-muted-foreground">Uncategorized / External</h3>
                <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs font-normal">
                  {uncategorized.length}
                </Badge>
              </div>
              <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {uncategorized.map(renderCard)}
                </AnimatePresence>
              </motion.div>
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Officers</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Directory and management of all Protocol Officers</p>
        </div>
        {canManageOfficers && (
          <Button onClick={() => { setEditing(null); resetForm(); setDialogOpen(true) }} className="shrink-0 gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            <span>Add Officer</span>
          </Button>
        )}
      </motion.div>

      <div className="grid gap-4 grid-cols-2 nav:grid-cols-4">
        {[
          { label: 'Total Officers', value: officers.length, color: 'text-foreground', bg: 'bg-primary/8', ring: 'ring-primary/15' },
          { label: 'Active', value: officers.filter((o: Officer) => o.is_active).length, color: 'text-[hsl(var(--success))]', bg: 'bg-[hsl(var(--success)/0.08)]', ring: 'ring-[hsl(var(--success)/0.2)]' },
          { label: 'Online Now', value: officers.filter((o: Officer) => o.is_online).length, color: 'text-sky-500', bg: 'bg-sky-500/8', ring: 'ring-sky-500/15' },
          { label: 'With Titles', value: officers.filter((o: Officer) => o.current_title_id).length, color: 'text-violet-500', bg: 'bg-violet-500/8', ring: 'ring-violet-500/15' },
        ].map(({ label, value, color, bg, ring }) => (
          <div key={label} className={`rounded-2xl border bg-card p-5 ring-1 ${ring} transition-all hover:shadow-elevation-md hover:-translate-y-0.5`}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={`stat-figure mt-2 text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="directory" className="space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
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
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {canManageOfficers && (
              <Button variant="outline" size="sm" onClick={exportToCSV} title="Export to CSV" className="h-9 px-2">
                <Download className="h-4 w-4" />
              </Button>
            )}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roles.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                <SelectItem value="strength">Team Strength</SelectItem>
                <SelectItem value="wisdom">Team Wisdom</SelectItem>
                <SelectItem value="swift">Team Swift</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center rounded-md border p-0.5 bg-muted/50 h-9">
              <Button variant={viewMode === 'grid' ? "secondary" : "ghost"} size="sm" className="h-full px-2 shadow-none" onClick={() => toggleViewMode('grid')}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === 'table' ? "secondary" : "ghost"} size="sm" className="h-full px-2 shadow-none" onClick={() => toggleViewMode('table')}>
                <List className="h-4 w-4" />
              </Button>
            </div>
            {canManageOfficers && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, oscar, email..."
                  className="pl-8 h-9 bg-background border-primary/20 focus-visible:ring-primary/50 text-sm"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                />
              </div>
            )}
          </div>
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
                renderCategorizedOfficers(
                  filteredOfficers.filter((o: Officer) => o.activation_status !== 'pending'),
                  (officer: Officer) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={officer.id}
                      onClick={() => setViewingOfficer(officer)}
                      className="group flex min-w-0 items-center gap-3 overflow-hidden rounded-lg border bg-card p-4 transition-all hover:bg-accent hover:border-primary/40 hover:shadow-md cursor-pointer relative"
                    >
                      <Avatar className="shrink-0 group-hover:ring-2 group-hover:ring-primary/40 transition">
                        {officer.photo_url ? <AvatarImage src={officer.photo_url} /> : <AvatarFallback className={getRoleBadgeColor(officer.role)}>{getInitials(officer.full_name || officer.email)}</AvatarFallback>}
                      </Avatar>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate font-medium group-hover:text-primary transition-colors">{officer.full_name || 'No name'}</p>
                          <Eye className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{officer.email}</p>
                        <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-1">
                            <Badge className={`max-w-full truncate text-[10px] uppercase tracking-wide ${getRoleBadgeColor(officer.role)}`}>
                              {roles.find(r => r.value === officer.role)?.label || officer.role}
                            </Badge>
                            {officer.team && (
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-primary/40 text-primary">
                                {officer.is_team_head ? '★ ' : ''}{officer.team}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center space-x-1 shrink-0">
                            <div className={`h-2 w-2 rounded-full ${officer.is_online ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">
                              {officer.is_online ? 'online' : 'offline'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )
                )
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
                  <>
                    <Button variant="ghost" onClick={() => setSelectedOfficers([])} className="text-muted-foreground mr-1 h-9 px-3">
                      Cancel Selection
                    </Button>
                    <Button variant="outline" onClick={() => {
                      setAssignForm({ officer_ids: selectedOfficers, program_id: '' })
                      setAssignFromDirectoryOpen(true)
                    }} className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-900 dark:hover:bg-blue-950">
                      <UserCheck className="h-4 w-4" />
                      <span>Assign Selected ({selectedOfficers.length}) to Program</span>
                    </Button>
                    <Button variant="destructive" onClick={handleBulkDelete} className="gap-2">
                      <Trash2 className="h-4 w-4" />
                      <span>Delete Selected ({selectedOfficers.length})</span>
                    </Button>
                  </>
                )}
                <Button onClick={() => {
                  setAssignForm({ officer_ids: [], program_id: '' })
                  setAssignFromDirectoryOpen(true)
                }} className="gap-2">
                  <UserCheck className="h-4 w-4" />
                  <span>Assign from Directory</span>
                </Button>
              </div>
            </div>

            {filteredOfficers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-card">
                <UserCircle className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm font-medium">No officers match filters</p>
              </div>
            ) : viewMode === 'table' ? (
              <div className="rounded-md border table-scroll-wrapper">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[50px] text-center">
                        <input
                          type="checkbox"
                          checked={selectedOfficers.length > 0 && selectedOfficers.length === filteredOfficers.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedOfficers(filteredOfficers.map(o => o.id))
                            else setSelectedOfficers([])
                          }}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-primary bg-background dark:bg-background/50 accent-primary/80"
                        />
                      </TableHead>
                      <TableHead>Officer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOfficers.sort(sortOfficersByHierarchy).map((officer: Officer) => (
                      <TableRow key={officer.id} className="hover:bg-accent/50 transition-colors">
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={selectedOfficers.includes(officer.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedOfficers(prev => [...prev, officer.id])
                              else setSelectedOfficers(prev => prev.filter(id => id !== officer.id))
                            }}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary bg-background dark:bg-background/50 accent-primary/80"
                          />
                        </TableCell>
                        <TableCell className="cursor-pointer" onClick={() => setViewingOfficer(officer)}>
                          <div className="flex items-center gap-3 group">
                            <Avatar className="h-8 w-8 ring-1 ring-border group-hover:ring-primary/50 transition">
                              {officer.photo_url ? <AvatarImage src={officer.photo_url} /> : <AvatarFallback className={getRoleBadgeColor(officer.role)}>{getInitials(officer.full_name || officer.email)}</AvatarFallback>}
                            </Avatar>
                            <div className="flex flex-col">
                              <span className={`font-medium group-hover:text-primary transition ${!officer.is_active ? 'opacity-60 text-muted-foreground' : ''}`}>{officer.full_name || 'No name'}</span>
                              <span className="text-xs text-muted-foreground">{officer.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {officer.is_active ? (
                            <Badge variant="outline" className="bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)]">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] uppercase tracking-wide ${getRoleBadgeColor(officer.role)}`}>
                            {roles.find(r => r.value === officer.role)?.label || officer.role}
                          </Badge>
                          {officer.oscar && <span className="ml-2 text-xs text-muted-foreground">{officer.oscar}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-primary" onClick={() => setViewingOfficer(officer)} title="View Full Profile">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(officer)} title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleAssignTitleClick(officer)} title="Assign Title">
                              <Award className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className={`h-8 w-8 p-0 ${officer.is_active ? 'text-orange-500' : 'text-green-600'}`} onClick={() => toggleActivationMutation.mutate(officer)} title={officer.is_active ? "Deactivate" : "Activate"}>
                              {officer.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                            </Button>
                            {officer.role !== 'dev_admin' && officer.id !== currentUser?.id && (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => handleDelete(officer)} title="Delete">
                                <Trash2 className="h-4 w-4 shrink-0 transition" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              renderCategorizedOfficers(
                filteredOfficers,
                (officer: Officer) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    key={officer.id}
                  >
                    <Card className={`${!officer.is_active ? 'opacity-60' : ''} transition-all hover:-translate-y-0.5 hover:shadow-md h-full flex flex-col`}>
                      <CardHeader className="cursor-pointer" onClick={() => setViewingOfficer(officer)}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedOfficers.includes(officer.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedOfficers(prev => [...prev, officer.id])
                                  else setSelectedOfficers(prev => prev.filter(id => id !== officer.id))
                                }}
                                className="h-4 w-4 rounded border-input text-primary focus:ring-primary bg-background dark:bg-background/50 accent-primary/80"
                              />
                            </div>
                            <Avatar>
                              {officer.photo_url ? <AvatarImage src={officer.photo_url} /> : <AvatarFallback className={getRoleBadgeColor(officer.role)}>{getInitials(officer.full_name || officer.email)}</AvatarFallback>}
                            </Avatar>
                            <div>
                              <CardTitle className="text-base hover:text-primary transition-colors">{officer.full_name || 'No Name'}</CardTitle>
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
                        <div className="space-y-1 text-sm cursor-pointer" onClick={() => setViewingOfficer(officer)}>
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

                        <div className="flex flex-wrap gap-1.5 pt-2 border-t mt-4">
                          <Button size="sm" variant="secondary" className="flex-1 min-w-[70px]" onClick={() => setViewingOfficer(officer)}>
                            <Eye className="h-3 w-3 mr-1" />
                            Profile
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 min-w-[65px]" onClick={() => handleEdit(officer)}>
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 min-w-[65px]" onClick={() => handleAssignTitleClick(officer)}>
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
                )
              )
            )}
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
                        <CardHeader className="cursor-pointer" onClick={() => setViewingOfficer(officer)}>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar>
                                {officer.photo_url ? <AvatarImage src={officer.photo_url} /> : <AvatarFallback className="bg-orange-500 text-white">{getInitials(officer.full_name || officer.email)}</AvatarFallback>}
                              </Avatar>
                              <div>
                                <CardTitle className="text-base hover:text-primary transition-colors">{officer.full_name || 'No Name'}</CardTitle>
                                <CardDescription className="text-xs">{officer.email}</CardDescription>
                              </div>
                            </div>
                            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                              Awaiting
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
                          <div className="space-y-1 text-sm cursor-pointer" onClick={() => setViewingOfficer(officer)}>
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
                            <Button size="sm" variant="outline" onClick={() => setViewingOfficer(officer)} title="View Full Profile">
                              <Eye className="h-4 w-4 mr-1" />
                              Details
                            </Button>
                            <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => toggleActivationMutation.mutate(officer)}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Approve
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="team">Protocol Team</Label>
                <Select value={formData.team || 'none'} onValueChange={(value) => setFormData({ ...formData, team: value === 'none' ? '' : value, is_team_head: value === 'none' ? false : formData.is_team_head })}>
                  <SelectTrigger id="team">
                    <SelectValue placeholder="Select team..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No team</SelectItem>
                    <SelectItem value="strength">Team Strength</SelectItem>
                    <SelectItem value="wisdom">Team Wisdom</SelectItem>
                    <SelectItem value="swift">Team Swift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="is_team_head">Team Head</Label>
                <div className="flex items-center h-10 gap-2">
                  <input
                    id="is_team_head"
                    type="checkbox"
                    className="h-4 w-4 accent-orange-500"
                    disabled={!formData.team}
                    checked={formData.is_team_head}
                    onChange={(e) => setFormData({ ...formData, is_team_head: e.target.checked })}
                  />
                  <span className="text-sm text-muted-foreground">Moderates team chat</span>
                </div>
              </div>
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

      {/* Full Officer Profile Dialog */}
      <OfficerProfileDialog
        officer={viewingOfficer}
        open={!!viewingOfficer}
        onOpenChange={(open) => {
          if (!open) setViewingOfficer(null)
        }}
        canManage={!!canManageOfficers}
        onEdit={(officer) => handleEdit(officer as Officer)}
        onAssignTitle={(officer) => handleAssignTitleClick(officer as Officer)}
        onToggleActivation={(officer) => toggleActivationMutation.mutate(officer as Officer)}
        onDelete={(officer) => handleDelete(officer as Officer)}
      />
    </div>
  )
}
