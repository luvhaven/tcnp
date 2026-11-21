"use client"

import { useState } from "react"
import FlowerChecklist from "@/components/cheetahs/FlowerChecklist"
import CheetahPrerequisites from "@/components/cheetahs/CheetahPrerequisites"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Database } from "@/types/supabase"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import { ErrorState } from "@/components/ui/error-state"
import { Car, Plus, Edit, Trash2, ChevronDown, AlertTriangle, Gauge, UserRound } from "lucide-react"
import { toast } from "sonner"
import { notifyError } from '@/lib/notify'
import { motion, AnimatePresence } from "framer-motion"
import TangoOperations from "@/components/tango/TangoOperations"
import { driverOptionLabel, driverShortBlocker, lagosDate, rethrowDriverError, useTangoDriverRoster } from "@/components/tango/DriversPanel"

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
  /** Copied from the default driver by the database; free text on older vehicles. */
  driver_name: string | null
  driver_phone: string | null
  default_driver_id?: string | null
  created_at: string
  programs: { name: string } | null
  mileage: number | null
  last_service_mileage: number | null
  last_service_date: string | null
}

type CheetahFormState = {
  registration_number: string
  /** Optional default driver (tango_drivers); '' = none. */
  default_driver_id: string
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
  /** Kept as text so an unrecorded mileage stays empty instead of saving as 0. */
  mileage: string
}

// default_driver_id is newer than the generated types, and driver_name /
// driver_phone became nullable in 20261116193000_tango_drivers.sql.
type CheetahUpdatePayload = Omit<Database['public']['Tables']['cheetahs']['Update'], 'driver_name' | 'driver_phone'> & {
  driver_name?: string | null
  driver_phone?: string | null
  default_driver_id?: string | null
}

const VEHICLE_STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  in_use: 'In use',
  maintenance: 'Maintenance',
  retired: 'Retired',
}

/** Readable vehicle status; unknown values fall back to the stored text with underscores spaced. */
function vehicleStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  const known = VEHICLE_STATUS_LABELS[status]
  if (known) return known
  const spaced = status.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export default function CheetahsClient({ initialCheetahs, initialCheetahsError = false }: { initialCheetahs: any[]; initialCheetahsError?: boolean }) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCheetah, setEditingCheetah] = useState<Cheetah | null>(null)
  const [expandedFlower, setExpandedFlower] = useState<string | null>(null)

  const [formData, setFormData] = useState<CheetahFormState>({
    registration_number: '',
    default_driver_id: '',
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
    mileage: ''
  })

  const tangoAccess = useUnitAccess('tango')

  // A failed server read seeds nothing (not a fresh empty fleet), so the
  // client fetches and an error shows instead of "No Cheetahs".
  const { data: cheetahs = [], isError: cheetahsFailed, isFetching: cheetahsFetching, refetch: refetchCheetahs } = useQuery({
    queryKey: ['cheetahs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cheetahs').select(`*, programs(name)`).order('call_sign').limit(100)
      if (error) throw error
      return data as any[]
    },
    initialData: initialCheetahsError ? undefined : initialCheetahs,
  })

  const { data: programs = [] } = useQuery({
    // Distinct key: this is filtered to planning/active only, so sharing a
    // cache slot with an unfiltered query elsewhere would intermittently
    // hide completed/archived programs (or vice versa) depending on fetch
    // order — see ProgramsClient.tsx for the full explanation.
    queryKey: ['programs', 'active-full'],
    queryFn: async () => {
      const { data, error } = await supabase.from('programs').select('*').in('status', ['planning', 'active']).order('name')
      if (error) throw error
      return data
    }
  })

  // cheetahs writes: Tango head (cheetahs_tango_head_manage_v4) or Command
  // (cheetahs_command_manage). FLOWER checks: any Tango member or Command.
  const canManage = tangoAccess.canManage || tangoAccess.isCommand
  const canRunFlower = tangoAccess.isMember || tangoAccess.isCommand
  const rosterQuery = useTangoDriverRoster(canManage)
  const drivers = rosterQuery.data ?? []
  const today = lagosDate(new Date()) as string

  const saveMutation = useMutation({
    mutationFn: async (payload: { isEdit: boolean, data: any }) => {
      if (payload.isEdit) {
        const { error } = await (supabase as any).from('cheetahs').update(payload.data).eq('id', editingCheetah!.id)
        if (error) rethrowDriverError(error)
      } else {
        const { count } = await supabase.from('cheetahs').select('*', { count: 'exact', head: true })
        const nextNumber = (count || 0) + 1
        const callSign = `CHEETAH-${nextNumber.toString().padStart(3, '0')}`
        // driver_name / driver_phone are optional now and copied from the default driver.
        const { error } = await (supabase as any).from('cheetahs').insert([{ ...payload.data, call_sign: callSign }])
        if (error) rethrowDriverError(error)
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
      notifyError(error, 'Failed to save Cheetah')
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
    onSuccess: () => {
      toast.success('Vehicle deleted successfully!')
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['cheetahs'], context?.previous)
      notifyError(err, 'Failed to delete vehicle')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cheetahs'] })
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedRegNo = formData.registration_number.trim()
    const trimmedMake = formData.make.trim()
    const trimmedModel = formData.model.trim()
    const trimmedColor = formData.color.trim()
    const trimmedFeatures = formData.features.trim()
    const trimmedLastMaintenance = formData.last_maintenance.trim()
    const trimmedNextMaintenance = formData.next_maintenance.trim()
    const parsedMileage = Number.parseInt(formData.mileage.trim(), 10)

    const basePayload: CheetahUpdatePayload = {
      reg_no: trimmedRegNo,
      registration_number: trimmedRegNo,
      default_driver_id: formData.default_driver_id || null,
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
      next_maintenance: trimmedNextMaintenance ? trimmedNextMaintenance : null,
      mileage: Number.isFinite(parsedMileage) && parsedMileage >= 0 ? parsedMileage : null
    }

    // Removing a default driver also clears the details copied from them.
    // Older free-text details (no default driver) are left as they are.
    if (editingCheetah?.default_driver_id && !formData.default_driver_id) {
      basePayload.driver_name = null
      basePayload.driver_phone = null
    }

    if (saveMutation.isPending) return
    saveMutation.mutate({ isEdit: !!editingCheetah, data: basePayload })
  }

  const handleEdit = (cheetah: any) => {
    setEditingCheetah(cheetah)
    setFormData({
      registration_number: cheetah.registration_number || cheetah.reg_no || '',
      default_driver_id: cheetah.default_driver_id || '',
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
      mileage: cheetah.mileage != null ? String(cheetah.mileage) : ''
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!await confirm({ message: 'Are you sure you want to delete this vehicle?', variant: 'destructive' })) return
    deleteMutation.mutate(id)
  }

  const resetForm = () => {
    setFormData({
      registration_number: '',
      default_driver_id: '',
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
      mileage: ''
    })
  }

  const openCreateDialog = () => {
    setEditingCheetah(null)
    resetForm()
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 page-enter">
      <PageHeader
        icon={Car}
        title="Tango"
        badge="Cheetah Fleet & Transport"
        description="VIP Cheetah vehicles, assigned drivers, and FLOWER safety inspections."
        actions={canManage && (
          <Button onClick={openCreateDialog}>
            <Plus aria-hidden="true" />
            Add New Cheetah
          </Button>
        )}
      />

      {/* Stats */}
      <StatGrid>
        <StatCard label="Total Fleet" value={cheetahs.length} />
        <StatCard label="Available" value={cheetahs.filter(c => c.status === 'available').length} tone="success" />
        <StatCard label="In Use" value={cheetahs.filter(c => c.status === 'in_use').length} tone="info" />
        <StatCard label="Maintenance" value={cheetahs.filter(c => c.status === 'maintenance').length} tone="warning" />
      </StatGrid>

      {cheetahsFailed && (
        <ErrorState
          title="Couldn't load the fleet"
          description={cheetahs.length > 0 ? "Showing the last list we loaded." : "Check your connection and try again."}
          onRetry={() => { void refetchCheetahs() }}
          retrying={cheetahsFetching}
          className="rounded-xl border py-6"
        />
      )}

      {tangoAccess.loadFailed && !tangoAccess.isCommand && (
        <ErrorState
          title="Your Tango access could not be checked"
          description="Vehicles are shown read-only until your unit membership loads."
          onRetry={() => void queryClient.invalidateQueries({ queryKey: ['unit-access'] })}
          className="rounded-xl border py-6"
        />
      )}

      <TangoOperations
        cheetahs={cheetahs}
        programs={programs}
      />

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
              <p className="text-xs text-muted-foreground">
                {canManage ? 'Add your first vehicle to get started' : 'Vehicles added by the Tango team will appear here'}
              </p>
              {canManage && (
                <Button className="mt-4" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Vehicle
                </Button>
              )}
            </div>
          ) : (
            <motion.div layout className="space-y-3">
              <AnimatePresence>
                {cheetahs.map((cheetah) => (
                  <div key={cheetah.id}>
                    <motion.div
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg border p-4 transition-all hover:bg-accent hover:shadow-md hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-lg">
                          {cheetah.call_sign || 'N/A'}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {cheetah.make} {cheetah.model} ({cheetah.year}) • {cheetah.registration_number}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {cheetah.color} • Capacity: {cheetah.capacity} passengers
                        </p>
                        {cheetah.driver_name && (
                          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">
                              {cheetah.default_driver_id ? 'Default driver' : 'Driver'}: {cheetah.driver_name}
                              {cheetah.driver_phone ? ` · ${cheetah.driver_phone}` : ''}
                            </span>
                          </p>
                        )}
                        {/* Mileage display + SOP 35k warning */}
                        {cheetah.mileage != null && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
                      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                        <Badge variant={cheetah.status === 'available' ? 'success' : cheetah.status === 'in_use' ? 'warning' : 'secondary'}>
                          {vehicleStatusLabel(cheetah.status)}
                        </Badge>
                        {canManage && (
                          <>
                            <Button aria-label="Edit Cheetah" variant="ghost" size="icon" onClick={() => handleEdit(cheetah)} className="hover:bg-primary/10">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button aria-label="Delete Cheetah" variant="ghost" size="icon" onClick={() => handleDelete(cheetah.id)} className="hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {canRunFlower && <Button aria-label="Toggle FLOWER checklist"
                          variant="ghost"
                          size="icon"
                          className="hover:bg-teal-500/10"
                          title="FLOWER Checklist"
                          onClick={() => setExpandedFlower(expandedFlower === cheetah.id ? null : cheetah.id)}
                        >
                          <ChevronDown className={`h-4 w-4 text-teal-500 transition-transform ${expandedFlower === cheetah.id ? 'rotate-180' : ''}`} />
                        </Button>}
                      </div>
                    </motion.div>
                    {canRunFlower && expandedFlower === cheetah.id && (
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

            <div className="space-y-2">
              <Label htmlFor="default_driver_id">Default driver</Label>
              <select
                id="default_driver_id"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:h-10"
                value={formData.default_driver_id}
                onChange={(e) => setFormData({ ...formData, default_driver_id: e.target.value })}
              >
                <option value="">No default driver</option>
                {/* While the roster is loading or failed, keep the saved driver visible
                    instead of letting the select fall back to "No default driver". */}
                {formData.default_driver_id && !drivers.some(driver => driver.id === formData.default_driver_id) && (
                  <option value={formData.default_driver_id}>
                    {formData.default_driver_id === editingCheetah?.default_driver_id && editingCheetah?.driver_name
                      ? `${editingCheetah.driver_name} (current)`
                      : 'Current driver'}
                  </option>
                )}
                {drivers
                  .filter(driver => driver.status !== 'inactive' || driver.id === formData.default_driver_id)
                  .map(driver => {
                    // The current choice stays selectable so an edit never silently drops it.
                    const reason = driver.id === editingCheetah?.default_driver_id ? null : driverShortBlocker(driver, null, today)
                    return (
                      <option key={driver.id} value={driver.id} disabled={Boolean(reason)}>
                        {driverOptionLabel(driver, reason)}
                      </option>
                    )
                  })}
              </select>
              <p className="text-xs text-muted-foreground">
                {rosterQuery.isError
                  ? 'Drivers could not be loaded. You can save the vehicle and pick a driver later.'
                  : editingCheetah && !editingCheetah.default_driver_id && editingCheetah.driver_name && !formData.default_driver_id
                    ? `Recorded as free text: ${editingCheetah.driver_name}${editingCheetah.driver_phone ? ` · ${editingCheetah.driver_phone}` : ''}. Pick a driver to link this vehicle to the driver list.`
                    : 'Optional. Journeys allocated this Cheetah start with this driver. Drivers are managed in the Drivers tab.'}
              </p>
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
                  inputMode="numeric"
                  value={formData.mileage}
                  onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 nav:grid-cols-4">
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
              <Button type="submit" pending={saveMutation.isPending}>
                {editingCheetah ? 'Update Cheetah' : 'Add Cheetah'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
