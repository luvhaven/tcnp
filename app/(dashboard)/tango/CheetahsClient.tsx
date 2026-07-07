"use client"

import { useState } from "react"
import FlowerChecklist from "@/components/cheetahs/FlowerChecklist"
import CheetahPrerequisites from "@/components/cheetahs/CheetahPrerequisites"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Database } from "@/types/supabase"
import { canManageFleet } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import { Car, Plus, Edit, Trash2, ChevronDown, AlertTriangle, Gauge } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

type Cheetah = {
  id: string
  call_sign: string
  registration_number: string
  reg_no: string | null
  make: string
  model: string
  year: number
  color: string
  status: string
  capacity: number
  fuel_status: string | null
  program_id: string | null
  features: string | null
  last_maintenance: string | null
  next_maintenance: string | null
  driver_name: string
  driver_phone: string
  created_at: string
  programs: { name: string } | null
  mileage: number | null
  last_service_mileage: number | null
  last_service_date: string | null
}

type CheetahFormState = {
  registration_number: string
  driver_name: string
  driver_phone: string
  make: string
  model: string
  year: number
  color: string
  status: string
  capacity: number
  fuel_status: string
  program_id: string
  features: string
  last_maintenance: string
  next_maintenance: string
  mileage: number
}

type CheetahUpdatePayload = Database['public']['Tables']['cheetahs']['Update']

export default function CheetahsClient({ initialCheetahs }: { initialCheetahs: any[] }) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCheetah, setEditingCheetah] = useState<Cheetah | null>(null)
  const [expandedFlower, setExpandedFlower] = useState<string | null>(null)

  const [formData, setFormData] = useState<CheetahFormState>({
    registration_number: '',
    driver_name: '',
    driver_phone: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    status: 'available',
    capacity: 4,
    fuel_status: 'full',
    program_id: '',
    features: '',
    last_maintenance: '',
    next_maintenance: '',
    mileage: 0
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

  const { data: cheetahs = [] } = useQuery({
    queryKey: ['cheetahs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cheetahs').select(`*, programs(name)`).order('call_sign').limit(100)
      if (error) throw error
      return data as any[]
    },
    initialData: initialCheetahs
  })

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('programs').select('*').in('status', ['planning', 'active']).order('name')
      if (error) throw error
      return data
    }
  })

  const canManage = userRole ? canManageFleet(userRole) : false

  const saveMutation = useMutation({
    mutationFn: async (payload: { isEdit: boolean, data: any }) => {
      if (payload.isEdit) {
        const { error } = await supabase.from('cheetahs').update(payload.data).eq('id', editingCheetah!.id)
        if (error) throw error
      } else {
        const { count } = await supabase.from('cheetahs').select('*', { count: 'exact', head: true })
        const nextNumber = (count || 0) + 1
        const callSign = `CHEETAH-${nextNumber.toString().padStart(3, '0')}`
        const { error } = await supabase.from('cheetahs').insert([{ ...payload.data, call_sign: callSign }])
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cheetahs'] })
      toast.success(variables.isEdit ? 'Cheetah updated successfully!' : 'Cheetah added successfully!')
      setDialogOpen(false)
      setEditingCheetah(null)
      resetForm()
    },
    onError: (error: any) => {
      console.error('Error saving cheetah:', error)
      toast.error(error.message || 'Failed to save Cheetah')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cheetahs').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['cheetahs'] })
      const previous = queryClient.getQueryData<any[]>(['cheetahs'])
      if (previous) {
        queryClient.setQueryData<any[]>(['cheetahs'], old => old?.filter(c => c.id !== deletedId))
      }
      return { previous }
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['cheetahs'], context?.previous)
      toast.error('Failed to delete vehicle')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cheetahs'] })
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedRegNo = formData.registration_number.trim()
    const trimmedDriverName = formData.driver_name.trim()
    const trimmedDriverPhone = formData.driver_phone.trim()
    const trimmedMake = formData.make.trim()
    const trimmedModel = formData.model.trim()
    const trimmedColor = formData.color.trim()
    const trimmedFeatures = formData.features.trim()
    const trimmedLastMaintenance = formData.last_maintenance.trim()
    const trimmedNextMaintenance = formData.next_maintenance.trim()

    const basePayload: CheetahUpdatePayload = {
      reg_no: trimmedRegNo,
      registration_number: trimmedRegNo,
      driver_name: trimmedDriverName,
      driver_phone: trimmedDriverPhone,
      make: trimmedMake,
      model: trimmedModel,
      year: formData.year,
      color: trimmedColor,
      status: formData.status,
      capacity: formData.capacity,
      fuel_status: formData.fuel_status.trim() || null,
      program_id: formData.program_id ? formData.program_id : null,
      features: trimmedFeatures ? trimmedFeatures : null,
      last_maintenance: trimmedLastMaintenance ? trimmedLastMaintenance : null,
      next_maintenance: trimmedNextMaintenance ? trimmedNextMaintenance : null
    }

    saveMutation.mutate({ isEdit: !!editingCheetah, data: basePayload })
  }

  const handleEdit = (cheetah: any) => {
    setEditingCheetah(cheetah)
    setFormData({
      registration_number: cheetah.registration_number || cheetah.reg_no || '',
      driver_name: cheetah.driver_name,
      driver_phone: cheetah.driver_phone,
      make: cheetah.make,
      model: cheetah.model,
      year: cheetah.year,
      color: cheetah.color,
      status: cheetah.status,
      capacity: cheetah.capacity,
      fuel_status: cheetah.fuel_status || 'full',
      program_id: cheetah.program_id || '',
      features: cheetah.features || '',
      last_maintenance: cheetah.last_maintenance || '',
      next_maintenance: cheetah.next_maintenance || '',
      mileage: cheetah.mileage || 0
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!await confirm({ message: 'Are you sure you want to delete this vehicle?', variant: 'destructive' })) return
    deleteMutation.mutate(id)
    toast.success('Vehicle deleted successfully!')
  }

  const resetForm = () => {
    setFormData({
      registration_number: '',
      driver_name: '',
      driver_phone: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      color: '',
      status: 'available',
      capacity: 4,
      fuel_status: 'full',
      program_id: '',
      features: '',
      last_maintenance: '',
      next_maintenance: '',
      mileage: 0
    })
  }

  const openCreateDialog = () => {
    setEditingCheetah(null)
    resetForm()
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tango</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Manage protocol vehicles</p>
        </div>
        {canManage && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Cheetah
          </Button>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div layout className="grid gap-4 md:grid-cols-4">
        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-primary/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Total Fleet</CardTitle>
            <div className="p-2 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Car className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-primary group-hover:to-primary/70 transition-all duration-500">{cheetahs.length}</div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-green-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
            <div className="p-2 rounded-full bg-green-500/10 group-hover:bg-green-500/20 transition-colors">
              <Car className="h-4 w-4 text-green-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-green-500 group-hover:to-green-600 transition-all duration-500">
              {cheetahs.filter(c => c.status === 'available').length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-blue-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">In Use</CardTitle>
            <div className="p-2 rounded-full bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
              <Car className="h-4 w-4 text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-blue-500 group-hover:to-blue-600 transition-all duration-500">
              {cheetahs.filter(c => c.status === 'in_use').length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-orange-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
            <div className="p-2 rounded-full bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors">
              <Car className="h-4 w-4 text-orange-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-orange-500 group-hover:to-orange-600 transition-all duration-500">
              {cheetahs.filter(c => c.status === 'maintenance').length}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Car className="h-5 w-5" />
            <span>Active Fleet</span>
          </CardTitle>
          <CardDescription>All protocol vehicles</CardDescription>
        </CardHeader>
        <CardContent>
          {cheetahs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Car className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No vehicles yet</p>
              <p className="text-xs text-muted-foreground">Add your first vehicle to get started</p>
              <Button className="mt-4" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Vehicle
              </Button>
            </div>
          ) : (
            <motion.div layout className="space-y-3">
              <AnimatePresence>
                {cheetahs.map((cheetah) => (
                  <div key={cheetah.id}>
                    <motion.div
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-lg">
                          {cheetah.call_sign || 'N/A'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {cheetah.make} {cheetah.model} ({cheetah.year}) • {cheetah.registration_number}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {cheetah.color} • Capacity: {cheetah.capacity} passengers
                        </p>
                        {/* Mileage display + SOP 35k warning */}
                        {cheetah.mileage != null && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <Gauge className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{cheetah.mileage.toLocaleString()} mi</span>
                            {cheetah.mileage >= 35000 && (
                              <Badge variant="destructive" className="text-[9px] gap-0.5 h-4 px-1.5">
                                <AlertTriangle className="h-2.5 w-2.5" />Service Due
                              </Badge>
                            )}
                            {cheetah.mileage >= 30000 && cheetah.mileage < 35000 && (
                              <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[9px] gap-0.5 h-4 px-1.5">
                                <AlertTriangle className="h-2.5 w-2.5" />Approaching Limit
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={cheetah.status === 'available' ? 'success' : cheetah.status === 'in_use' ? 'warning' : 'secondary'}>
                          {cheetah.status}
                        </Badge>
                        {canManage && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(cheetah)} className="hover:bg-primary/10">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(cheetah.id)} className="hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-teal-500/10"
                          title="FLOWER Checklist"
                          onClick={() => setExpandedFlower(expandedFlower === cheetah.id ? null : cheetah.id)}
                        >
                          <ChevronDown className={`h-4 w-4 text-teal-500 transition-transform ${expandedFlower === cheetah.id ? 'rotate-180' : ''}`} />
                        </Button>
                      </div>
                    </motion.div>
                    {expandedFlower === cheetah.id && (
                      <div className="px-2 pb-3 space-y-2">
                        <FlowerChecklist cheetahId={cheetah.id} cheetahCallSign={cheetah.call_sign || cheetah.registration_number} />
                        <CheetahPrerequisites cheetahId={cheetah.id} cheetahCallSign={cheetah.call_sign || cheetah.registration_number} />
                      </div>
                    )}
                  </div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCheetah ? 'Edit Cheetah' : 'Add New Cheetah'}</DialogTitle>
            <DialogDescription>
              {editingCheetah ? 'Update Cheetah information' : 'Add a new Cheetah to the fleet'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="registration_number">Registration Number *</Label>
              <Input
                id="registration_number"
                required
                placeholder="e.g., ABC-123-XY"
                value={formData.registration_number}
                onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="driver_name">Driver Name *</Label>
                <Input
                  id="driver_name"
                  required
                  placeholder="e.g., James Okafor"
                  value={formData.driver_name}
                  onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver_phone">Driver Phone *</Label>
                <Input
                  id="driver_phone"
                  required
                  placeholder="e.g., +2348012345678"
                  value={formData.driver_phone}
                  onChange={(e) => setFormData({ ...formData, driver_phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="program_id">Program</Label>
              <select
                id="program_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={formData.program_id}
                onChange={(e) => setFormData({ ...formData, program_id: e.target.value })}
              >
                <option value="">Select program (optional)</option>
                {programs.map((program: any) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="make">Make *</Label>
                <Input
                  id="make"
                  required
                  placeholder="e.g., Toyota"
                  value={formData.make}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model *</Label>
                <Input
                  id="model"
                  required
                  placeholder="e.g., Land Cruiser"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Year *</Label>
                <Input
                  id="year"
                  type="number"
                  required
                  min="1990"
                  max={new Date().getFullYear() + 1}
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mileage">Mileage</Label>
                <Input
                  id="mileage"
                  type="number"
                  min="0"
                  placeholder="e.g., 25000"
                  value={formData.mileage}
                  onChange={(e) => setFormData({ ...formData, mileage: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="color">Color *</Label>
                <Input
                  id="color"
                  required
                  placeholder="e.g., Black"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity *</Label>
                <Input
                  id="capacity"
                  type="number"
                  required
                  min="1"
                  max="20"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fuel_status">Fuel Status *</Label>
                <select
                  id="fuel_status"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.fuel_status}
                  onChange={(e) => setFormData({ ...formData, fuel_status: e.target.value })}
                >
                  <option value="full">Full</option>
                  <option value="three_quarters">3/4 Full</option>
                  <option value="half">Half</option>
                  <option value="quarter">1/4</option>
                  <option value="empty">Empty</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <select
                  id="status"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="available">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="features">Features</Label>
              <Textarea
                id="features"
                placeholder="e.g., GPS, Armored, Tinted windows..."
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="last_maintenance">Last Maintenance</Label>
                <DatePicker
                  value={formData.last_maintenance}
                  onChange={(value) => setFormData({ ...formData, last_maintenance: value })}
                  placeholder="Select date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_maintenance">Next Maintenance</Label>
                <DatePicker
                  value={formData.next_maintenance}
                  onChange={(value) => setFormData({ ...formData, next_maintenance: value })}
                  placeholder="Select date"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingCheetah ? 'Update Cheetah' : 'Add Cheetah'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
