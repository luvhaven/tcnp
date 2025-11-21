"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Car, Plus, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"

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
}

type CheetahUpdatePayload = Database['public']['Tables']['cheetahs']['Update']
type CheetahInsertPayload = Database['public']['Tables']['cheetahs']['Insert']
type ProgramRow = Database['public']['Tables']['programs']['Row']

export default function CheetahsPage() {
  const supabase = createClient() as any
  const [cheetahs, setCheetahs] = useState<Cheetah[]>([])
  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCheetah, setEditingCheetah] = useState<Cheetah | null>(null)
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
    next_maintenance: ''
  })

  useEffect(() => {
    loadCheetahs()
  }, [])

  const loadCheetahs = async () => {
    try {
      const [cheetahsRes, programsRes] = await Promise.all([
        supabase
          .from('cheetahs')
          .select(`
            *,
            programs(name)
          `)
          .order('call_sign'),
        supabase
          .from('programs')
          .select('*')
          .in('status', ['planning', 'active'])
          .order('name')
      ])

      if (cheetahsRes.error) throw cheetahsRes.error
      setCheetahs(cheetahsRes.data || [])
      setPrograms((programsRes.data as ProgramRow[]) || [])
    } catch (error) {
      console.error('Error loading cheetahs:', error)
      toast.error('Failed to load Cheetahs')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
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

      if (editingCheetah) {
        // Update
        const { error } = await supabase
          .from('cheetahs')
          .update(basePayload)
          .eq('id', editingCheetah.id)

        if (error) throw error
        toast.success('Cheetah updated successfully!')
      } else {
        // Create - generate call_sign automatically
        // Get count to generate sequential number
        const { count } = await supabase
          .from('cheetahs')
          .select('*', { count: 'exact', head: true })
        
        const nextNumber = (count || 0) + 1
        const callSign = `CHEETAH-${nextNumber.toString().padStart(3, '0')}`

        const insertPayload: CheetahInsertPayload = {
          ...basePayload,
          call_sign: callSign
        }

        const { error } = await supabase
          .from('cheetahs')
          .insert([insertPayload])

        if (error) throw error
        toast.success('Cheetah added successfully!')
      }

      setDialogOpen(false)
      setEditingCheetah(null)
      resetForm()
      loadCheetahs()
    } catch (error: any) {
      console.error('Error saving cheetah:', error)
      toast.error(error.message || 'Failed to save Cheetah')
    }
  }

  const handleEdit = (cheetah: Cheetah) => {
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
      next_maintenance: cheetah.next_maintenance || ''
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vehicle?')) return

    try {
      const { error } = await supabase
        .from('cheetahs')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Vehicle deleted successfully!')
      loadCheetahs()
    } catch (error: any) {
      console.error('Error deleting cheetah:', error)
      toast.error(error.message || 'Failed to delete vehicle')
    }
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
      next_maintenance: ''
    })
  }

  const openCreateDialog = () => {
    setEditingCheetah(null)
    resetForm()
    setDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading vehicles...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fleet (Cheetahs)</h1>
          <p className="text-muted-foreground">Manage protocol vehicles</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Cheetah
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Fleet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cheetahs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cheetahs.filter(c => c.status === 'available').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Use</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cheetahs.filter(c => c.status === 'in_use').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cheetahs.filter(c => c.status === 'maintenance').length}
            </div>
          </CardContent>
        </Card>
      </div>

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
            <div className="space-y-3">
              {cheetahs.map((cheetah) => (
                <div
                  key={cheetah.id}
                  className="flex items-center justify-between rounded-lg border p-4"
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
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={cheetah.status === 'available' ? 'success' : cheetah.status === 'in_use' ? 'warning' : 'secondary'}>
                      {cheetah.status}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(cheetah)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(cheetah.id)}>
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
              <Select
                id="program_id"
                value={formData.program_id}
                onChange={(e) => setFormData({ ...formData, program_id: e.target.value })}
              >
                <option value="">Select program (optional)</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </Select>
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
                <Select
                  id="fuel_status"
                  required
                  value={formData.fuel_status}
                  onChange={(e) => setFormData({ ...formData, fuel_status: e.target.value })}
                >
                  <option value="full">Full</option>
                  <option value="three_quarters">3/4 Full</option>
                  <option value="half">Half</option>
                  <option value="quarter">1/4</option>
                  <option value="empty">Empty</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  id="status"
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="available">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="retired">Retired</option>
                </Select>
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
                <Input
                  id="last_maintenance"
                  type="date"
                  value={formData.last_maintenance}
                  onChange={(e) => setFormData({ ...formData, last_maintenance: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_maintenance">Next Maintenance</Label>
                <Input
                  id="next_maintenance"
                  type="date"
                  value={formData.next_maintenance}
                  onChange={(e) => setFormData({ ...formData, next_maintenance: e.target.value })}
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
