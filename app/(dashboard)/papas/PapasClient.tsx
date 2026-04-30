"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Users, Plus, Edit, Trash2, Plane, Search } from "lucide-react"
import { toast } from "sonner"
import PapaFormTabs from "@/components/papas/PapaFormTabs"
import { canManagePapas } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

type Papa = {
  id: string
  event_id?: string
  full_name: string
  title: string
  passport_number?: string
  email?: string
  phone: string
  flight_number?: string
  airline?: string
  arrival_city?: string
  arrival_country?: string
  nationality?: string
  short_bio?: string
  uses_stage_props?: boolean
  needs_water_on_stage?: boolean
  water_temperature?: string
  has_slides?: boolean
  needs_face_towels?: boolean
  mic_preference?: string
  presentation_style?: string
  special_requirements?: string
  food_preferences?: string
  dietary_restrictions?: string
  accommodation_preferences?: string
  additional_notes?: string
  speaking_schedule?: any
  entourage_count?: number
  personal_assistants?: any
  created_at: string
}

export default function PapasClient({ initialPapas }: { initialPapas: Papa[] }) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPapa, setEditingPapa] = useState<Papa | null>(null)
  const [search, setSearch] = useState('')

  const { data: userRole } = useQuery({
    queryKey: ['userRole'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
      return data?.role || null
    }
  })

  const { data: papas = [] } = useQuery({
    queryKey: ['papas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('papas').select('*').order('full_name').limit(200)
      if (error) throw error
      return (data || []) as unknown as Papa[]
    },
    initialData: initialPapas
  })

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('programs').select('id, name').order('name')
      if (error) throw error
      return data || []
    }
  })

  const canManage = userRole ? canManagePapas(userRole) : false

  const filteredPapas = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return papas
    return papas.filter((p) =>
      [p.full_name, p.title, p.nationality, p.phone, p.email, p.flight_number]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [papas, search])

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const { event_id, speaking_schedule, personal_assistants, ...rest } = data
      const papaData = {
        ...rest,
        program_id: event_id || null,
        speaking_schedule: speaking_schedule || [],
        personal_assistants: personal_assistants || []
      }

      if (editingPapa) {
        const { data: result, error } = await supabase.from('papas').update(papaData).eq('id', editingPapa.id).select()
        if (error) throw error
        return { isEdit: true, result }
      } else {
        const { data: result, error } = await supabase.from('papas').insert([papaData]).select()
        if (error) throw error
        return { isEdit: false, result }
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['papas'] })
      toast.success(data.isEdit ? 'Papa updated successfully!' : 'Papa added successfully!')
      setDialogOpen(false)
      setEditingPapa(null)
    },
    onError: (error: any) => {
      console.error('Error saving papa:', error)
      toast.error(error.message || 'Failed to save Papa')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('papas').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['papas'] })
      const previousPapas = queryClient.getQueryData<Papa[]>(['papas'])
      if (previousPapas) {
        queryClient.setQueryData<Papa[]>(['papas'], old => old?.filter(p => p.id !== deletedId))
      }
      return { previousPapas }
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['papas'], context?.previousPapas)
      toast.error('Failed to delete Papa')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['papas'] })
      toast.success('Papa deleted successfully!')
    }
  })

  const handleSubmit = async (data: any) => {
    if (!canManage) {
      toast.error('You are not authorized to manage Papas')
      return
    }
    saveMutation.mutate(data)
  }

  const handleEdit = (papa: Papa) => {
    setEditingPapa(papa)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!canManage) {
      toast.error('You are not authorized to manage Papas')
      return
    }
    if (!await confirm({ message: 'Are you sure you want to delete this Papa?', variant: 'destructive' })) return
    deleteMutation.mutate(id)
  }

  const openCreateDialog = () => {
    setEditingPapa(null)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Papas</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Manage guest ministers and VIPs</p>
        </div>
        {canManage && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Papa
          </Button>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div layout className="grid gap-4 md:grid-cols-2">
        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-primary/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Total Papas</CardTitle>
            <div className="p-2 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Users className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-primary group-hover:to-primary/70 transition-all duration-500">
              {papas.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Registered guests
            </p>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-sky-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">With Flights</CardTitle>
            <div className="p-2 rounded-full bg-sky-500/10 group-hover:bg-sky-500/20 transition-colors">
              <Plane className="h-4 w-4 text-sky-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-sky-500 group-hover:to-sky-600 transition-all duration-500">
              {papas.filter(p => p.flight_number).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Arriving by air
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Registered Papas</span>
          </CardTitle>
          <CardDescription>All guest ministers and VIPs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, nationality, flight number…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && (
              <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="text-xs">Clear</Button>
            )}
          </div>

          {filteredPapas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">{search ? 'No results found' : 'No Papas yet'}</p>
              <p className="text-xs text-muted-foreground">
                {search ? `No Papas match "${search}"` : 'Add your first Papa to get started'}
              </p>
              {canManage && !search && (
                <Button className="mt-4" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Papa
                </Button>
              )}
            </div>
          ) : (
            <motion.div layout className="space-y-3">
              <AnimatePresence>
                {filteredPapas.map((papa) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    key={papa.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-lg">
                        {papa.title} {papa.full_name}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm text-muted-foreground">
                          {papa.nationality || 'Nationality not set'}
                        </p>
                        {papa.flight_number && (
                          <Badge variant="secondary" className="text-xs">
                            Flight: {papa.flight_number}
                          </Badge>
                        )}
                      </div>
                      {papa.phone && (
                        <p className="text-xs text-muted-foreground mt-1">
                          📞 {papa.phone}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(papa)} className="hover:bg-primary/10">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(papa.id)} className="hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {search && filteredPapas.length > 0 && (
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  Showing {filteredPapas.length} of {papas.length} Papas
                </p>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPapa ? 'Edit Papa' : 'Add New Papa'}</DialogTitle>
          </DialogHeader>
          <PapaFormTabs
            initialData={editingPapa || undefined}
            events={programs}
            onSubmit={handleSubmit}
            onCancel={() => {
              setDialogOpen(false)
              setEditingPapa(null)
            }}
            isEditing={!!editingPapa}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
