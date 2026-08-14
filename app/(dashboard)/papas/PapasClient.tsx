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
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Search,
  Plane,
  Phone,
  Mail,
  Sparkles,
  Globe,
  Mic,
  Droplets,
  Sliders,
  UserCheck,
} from "lucide-react"
import { toast } from "sonner"
import PapaFormTabs from "@/components/papas/PapaFormTabs"
import { canManagePapas } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

type Papa = {
  id: string
  event_id?: string
  program_id?: string
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
    queryKey: ['programs', 'lite'],
    queryFn: async () => {
      const { data, error } = await supabase.from('programs').select('id, name').order('name')
      if (error) throw error
      return data || []
    }
  })

  const programMap = useMemo(() => {
    const map = new Map<string, string>()
    programs.forEach(p => map.set(p.id, p.name))
    return map
  }, [programs])

  const canManage = userRole ? canManagePapas(userRole) : false

  const filteredPapas = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return papas
    return papas.filter((p) =>
      [p.full_name, p.title, p.nationality, p.phone, p.email, p.flight_number, p.airline]
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['papas'] })
      const previousPapas = queryClient.getQueryData(['papas'])
      queryClient.setQueryData(['papas'], (old: Papa[] | undefined) =>
        old ? old.filter(p => p.id !== id) : []
      )
      return { previousPapas }
    },
    onError: (_err, _id, context) => {
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
    <div className="space-y-6 page-enter">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Papas & Guest Ministers</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                VIP registry, personal protocols, stage requirements, and flight coordination.
              </p>
            </div>
          </div>
        </div>
        {canManage && (
          <Button onClick={openCreateDialog} className="shadow-sm font-semibold gap-1.5 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            Add Papa
          </Button>
        )}
      </motion.div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 nav:grid-cols-4">
        {[
          { label: 'Total Papas', value: papas.length, icon: Users, color: 'text-foreground', bg: 'bg-muted', ring: 'ring-border' },
          { label: 'With Flights', value: papas.filter(p => p.flight_number).length, icon: Plane, color: 'text-sky-500', bg: 'bg-sky-500/10', ring: 'ring-sky-500/20' },
          { label: 'Stage Directives', value: papas.filter(p => p.needs_water_on_stage || p.has_slides || p.uses_stage_props).length, icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
          { label: 'With Entourage', value: papas.filter(p => (p.entourage_count || 0) > 0).length, icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
        ].map(({ label, value, icon: Icon, color, bg, ring }) => (
          <div key={label} className={`rounded-2xl border bg-card p-4 sm:p-5 ring-1 ${ring} transition-all hover:shadow-elevation-md hover:-translate-y-0.5`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className={`stat-figure mt-1.5 text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
              </div>
              <div className={`shrink-0 rounded-xl ${bg} p-2`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Registry Card */}
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span>Guest Minister Directory</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Detailed dossiers, logistics preferences, and flight coordination
              </CardDescription>
            </div>
            <Badge variant="outline" className="self-start sm:self-auto text-xs font-medium bg-background">
              {filteredPapas.length} of {papas.length} Ministers
            </Badge>
          </div>

          {/* Search bar */}
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, title, nationality, flight number…"
                className="pl-9 bg-background h-9 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && (
              <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="text-xs h-9">
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {filteredPapas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground/60 mb-3">
                <Users className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold">{search ? 'No matching Papas found' : 'No Papas registered'}</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                {search ? `No results matched "${search}". Try checking the spelling or search term.` : 'Register guest ministers to track flights, stage preferences, and hotel nests.'}
              </p>
              {canManage && !search && (
                <Button className="mt-4 gap-1.5 text-xs font-semibold" size="sm" onClick={openCreateDialog}>
                  <Plus className="h-3.5 w-3.5" />
                  Add First Papa
                </Button>
              )}
            </div>
          ) : (
            <motion.div layout className="grid gap-3 sm:gap-4">
              <AnimatePresence>
                {filteredPapas.map((papa) => {
                  const programName = papa.program_id ? programMap.get(papa.program_id) : null
                  const initials = papa.full_name
                    .split(' ')
                    .map(n => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={papa.id}
                      className="group relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card hover:border-primary/40 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {/* VIP Initials Avatar */}
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-sm shadow-xs">
                          {initials || "VIP"}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-base text-foreground truncate">
                              {papa.title} {papa.full_name}
                            </h3>
                            {programName && (
                              <Badge variant="outline" className="text-[10px] font-medium bg-primary/5 text-primary border-primary/20">
                                {programName}
                              </Badge>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {papa.nationality && (
                              <span className="inline-flex items-center gap-1">
                                <Globe className="h-3 w-3 text-muted-foreground/70" />
                                {papa.nationality}
                              </span>
                            )}
                            {papa.flight_number && (
                              <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium">
                                <Plane className="h-3 w-3" />
                                {papa.airline ? `${papa.airline} ` : ''}{papa.flight_number}
                              </span>
                            )}
                            {papa.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground/70" />
                                {papa.phone}
                              </span>
                            )}
                            {papa.email && (
                              <span className="hidden md:inline-flex items-center gap-1">
                                <Mail className="h-3 w-3 text-muted-foreground/70" />
                                {papa.email}
                              </span>
                            )}
                          </div>

                          {/* Stage Requirements Tags */}
                          {(papa.needs_water_on_stage || papa.has_slides || papa.mic_preference || (papa.entourage_count || 0) > 0) && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {papa.needs_water_on_stage && (
                                <Badge variant="secondary" className="text-[9px] font-medium gap-1 py-0 h-4.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 border-0">
                                  <Droplets className="h-2.5 w-2.5" />
                                  Stage Water ({papa.water_temperature || "Room"})
                                </Badge>
                              )}
                              {papa.has_slides && (
                                <Badge variant="secondary" className="text-[9px] font-medium gap-1 py-0 h-4.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-0">
                                  <Sliders className="h-2.5 w-2.5" />
                                  Slides Ready
                                </Badge>
                              )}
                              {papa.mic_preference && (
                                <Badge variant="secondary" className="text-[9px] font-medium gap-1 py-0 h-4.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0">
                                  <Mic className="h-2.5 w-2.5" />
                                  Mic: {papa.mic_preference}
                                </Badge>
                              )}
                              {(papa.entourage_count || 0) > 0 && (
                                <Badge variant="secondary" className="text-[9px] font-medium gap-1 py-0 h-4.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                                  <Users className="h-2.5 w-2.5" />
                                  Entourage: {papa.entourage_count}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40 w-full sm:w-auto justify-end">
                        {papa.phone && (
                          <a href={`tel:${papa.phone}`} className="inline-flex">
                            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
                              <Phone className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Call</span>
                            </Button>
                          </a>
                        )}
                        {canManage && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(papa)} className="h-8 w-8 hover:bg-primary/10" aria-label={`Edit ${papa.full_name}`}>
                              <Edit className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(papa.id)} className="h-8 w-8 hover:bg-destructive/10 text-destructive" aria-label={`Delete ${papa.full_name}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editingPapa ? 'Edit Papa Dossier' : 'Add New Guest Minister'}</DialogTitle>
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
