"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Users, Plus, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"
import PapaFormTabs from "@/components/papas/PapaFormTabs"
import { canManagePapas } from "@/lib/utils"

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

export default function PapasPage() {
  const supabase = createClient()
  const [papas, setPapas] = useState<Papa[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPapa, setEditingPapa] = useState<Papa | null>(null)
  const [currentRole, setCurrentRole] = useState<string | null>(null)

  const canManage = currentRole ? canManagePapas(currentRole) : false

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

          if (data?.role) {
            setCurrentRole(data.role)
          }
        }

        await loadPapas()
        await loadPrograms()
      } catch (error) {
        console.error('Error loading current user for PapasPage:', error)
        await loadPapas()
        await loadPrograms()
      }
    }

    init()
  }, [])

  const loadPapas = async () => {
    try {
      const { data, error } = await supabase
        .from('papas')
        .select('*')
        .order('full_name')

      if (error) throw error
      setPapas(data || [])
    } catch (error) {
      console.error('Error loading papas:', error)
      toast.error('Failed to load Papas')
    } finally {
      setLoading(false)
    }
  }

  const loadPrograms = async () => {
    try {
      const { data, error } = await supabase
        .from('programs')
        .select('id, name')
        .order('name')

      if (error) throw error
      setPrograms(data || [])
    } catch (error) {
      console.error('Error loading programs:', error)
    }
  }

  const handleSubmit = async (data: any) => {
    try {
      if (!canManage) {
        toast.error('You are not authorized to manage Papas')
        return
      }

      console.log('Papa form data received:', data)
      
      // Extract event/program and convert arrays to JSONB
      const {
        event_id,
        speaking_schedule,
        personal_assistants,
        ...rest
      } = data

      const papaData = {
        ...rest,
        program_id: event_id || null,
        speaking_schedule: speaking_schedule || [],
        personal_assistants: personal_assistants || []
      }
      
      console.log('Papa data to save:', papaData)

      if (editingPapa) {
        const { data: result, error } = await supabase
          .from('papas')
          .update(papaData)
          .eq('id', editingPapa.id)
          .select()

        if (error) {
          console.error('Supabase update error:', error)
          console.error('Error details:', JSON.stringify(error, null, 2))
          throw error
        }
        console.log('Papa updated:', result)
        toast.success('Papa updated successfully!')
      } else {
        const { data: result, error } = await supabase
          .from('papas')
          .insert([papaData])
          .select()

        if (error) {
          console.error('Supabase insert error:', error)
          console.error('Error details:', JSON.stringify(error, null, 2))
          throw error
        }
        console.log('Papa created:', result)
        toast.success('Papa added successfully!')
      }

      setDialogOpen(false)
      setEditingPapa(null)
      loadPapas()
    } catch (error: any) {
      console.error('Error saving papa:', error)
      console.error('Error type:', typeof error)
      console.error('Error keys:', Object.keys(error || {}))
      toast.error(error.message || error.hint || error.details || 'Failed to save Papa')
    }
  }

  const handleEdit = (papa: Papa) => {
    setEditingPapa(papa)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Papa?')) return

    try {
      if (!canManage) {
        toast.error('You are not authorized to manage Papas')
        return
      }

      const { error } = await supabase
        .from('papas')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Papa deleted successfully!')
      loadPapas()
    } catch (error: any) {
      console.error('Error deleting papa:', error)
      toast.error(error.message || 'Failed to delete Papa')
    }
  }

  const openCreateDialog = () => {
    setEditingPapa(null)
    setDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading Papas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Papas</h1>
          <p className="text-muted-foreground">Manage guest ministers and VIPs</p>
        </div>
        {canManage && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Papa
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Papas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{papas.length}</div>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Flights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {papas.filter(p => p.flight_number).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Registered Papas</span>
          </CardTitle>
          <CardDescription>All guest ministers and VIPs</CardDescription>
        </CardHeader>
        <CardContent>
          {papas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No Papas yet</p>
              <p className="text-xs text-muted-foreground">Add your first Papa to get started</p>
              {canManage && (
                <Button className="mt-4" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Papa
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {papas.map((papa) => (
                <div
                  key={papa.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:-translate-y-0.5 hover:shadow-md animate-slide-up"
                >
                  <div className="flex-1">
                    <p className="font-medium text-lg">
                      {papa.title} {papa.full_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {papa.nationality || 'Nationality not set'} {papa.flight_number && `• Flight: ${papa.flight_number}`}
                    </p>
                    {papa.phone && (
                      <p className="text-xs text-muted-foreground mt-1">
                        📞 {papa.phone}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(papa)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(papa.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog with Tabbed Form */}
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
