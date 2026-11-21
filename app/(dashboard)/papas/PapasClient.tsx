"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
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
  Eye,
  PlaneLanding,
} from "lucide-react"
import { toast } from "sonner"
import { notifyError, UserFacingError } from '@/lib/notify'
import PapaFormTabs from "@/components/papas/PapaFormTabs"
import PapaPhotoStep from "@/components/papas/PapaPhotoStep"
import PapaDetailsView from "@/components/papas/PapaDetailsView"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import {
  PAPA_DIRECTORY_COLUMNS,
  canEditPapaPassport,
  canViewPapaPassport,
  fetchPapaPrivateDetails,
  papaPrivateKey,
  papaPrivateSiblingFilter,
  shouldWritePapaPrivate,
  splitPapaPrivate,
  upsertPapaPrivateDetails,
  type PapaPrivateDetails,
} from "@/lib/papa-privacy"
import { motion, AnimatePresence } from "framer-motion"

type Papa = {
  id: string
  event_id?: string
  program_id?: string
  full_name: string
  title: string
  email?: string
  phone: string
  flight_number?: string
  airline?: string
  flight_arrival_time?: string | null
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
  profile_photo_url?: string | null
  created_at: string
}

export default function PapasClient({ initialPapas, initialPapasError = false }: { initialPapas: Papa[]; initialPapasError?: boolean }) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPapa, setEditingPapa] = useState<Papa | null>(null)
  const [search, setSearch] = useState('')
  // The programme and the arrivals quick filter live in the address bar so a
  // shared link or a refresh lands on the same view.
  const searchParams = useSearchParams()
  const [programmeFilter, setProgrammeFilter] = useState<string>(() => searchParams.get('programme') || 'all')
  const [arrivingSoon, setArrivingSoon] = useState<boolean>(() => searchParams.get('arriving') === '24h')
  const writeAddress = (name: 'programme' | 'arriving', value: string | null) => {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set(name, value)
    else url.searchParams.delete(name)
    window.history.replaceState(null, '', url)
  }
  const selectProgramme = (next: string) => {
    setProgrammeFilter(next)
    writeAddress('programme', next === 'all' ? null : next)
  }
  const toggleArrivingSoon = () => {
    const next = !arrivingSoon
    setArrivingSoon(next)
    writeAddress('arriving', next ? '24h' : null)
  }
  // After a Papa is created (or from the details view) we walk through photo → details.
  const [viewer, setViewer] = useState<{ papaId: string; step: 'photo' | 'details'; fromCreate?: boolean } | null>(null)

  // The one rule: Command authority comes from the role / has_admin_access
  // (SQL is_admin()), unit power from membership rows. The Oscar label grants
  // nothing. Alpha's level only matters for passports.
  const alpha = useUnitAccess('alpha')
  // Creating, editing and deleting Papas: SQL is_admin() ("Admins have full
  // access to papas"), i.e. platform admins and Command.
  const canManage = alpha.isCommand
  // Passports: is_admin() OR an Alpha head / sub-lead (can_view_papa_passport).
  const canViewPassport = canViewPapaPassport(alpha)
  const canEditPassport = canEditPapaPassport(alpha)

  const {
    data: papas = [],
    isError: papasFailed,
    isFetching: papasFetching,
    refetch: refetchPapas,
  } = useQuery({
    queryKey: ['papas'],
    queryFn: async () => {
      // Read every Papa (PostgREST caps a single response), never a silent first page.
      const rows: Papa[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('papas').select(PAPA_DIRECTORY_COLUMNS).order('full_name').order('id').range(offset, offset + 999)
        if (error) throw error
        rows.push(...((data || []) as unknown as Papa[]))
        if (!data || data.length < 1000) return rows
      }
    },
    // A failed server read seeds nothing, so the client fetches instead of
    // showing a fresh-looking empty list for a minute.
    initialData: initialPapasError ? undefined : initialPapas,
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

  const filteredPapas = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = new Date().getTime()
    const horizon = now + 24 * 60 * 60 * 1000
    return papas.filter((p) => {
      if (programmeFilter !== 'all' && p.program_id !== programmeFilter) return false
      if (arrivingSoon) {
        const arrival = p.flight_arrival_time ? new Date(p.flight_arrival_time).getTime() : NaN
        if (Number.isNaN(arrival) || arrival < now || arrival > horizon) return false
      }
      if (!q) return true
      return [p.full_name, p.title, p.nationality, p.phone, p.email, p.flight_number, p.airline]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [papas, search, programmeFilter, arrivingSoon])
  const hasFilters = !!search || programmeFilter !== 'all' || arrivingSoon
  const clearFilters = () => {
    setSearch('')
    selectProgramme('all')
    if (arrivingSoon) toggleArrivingSoon()
  }

  // Passport details are read on demand, one Papa at a time, and only for
  // people can_view_papa_passport admits. The viewer and the edit dialog
  // share this cache entry.
  const privatePapaId = dialogOpen && editingPapa
    ? editingPapa.id
    : viewer?.step === 'details' ? viewer.papaId : null
  const privateDetails = useQuery({
    queryKey: papaPrivateKey(privatePapaId),
    queryFn: () => fetchPapaPrivateDetails(supabase as any, privatePapaId!),
    enabled: canViewPassport && Boolean(privatePapaId),
    staleTime: 60_000,
    // A background refetch must not move the open edit form.
    refetchOnWindowFocus: !dialogOpen,
  })
  // The edit form starts from the first passport that loads for this
  // dialog, and keeps that as its baseline. A later refetch (or a failed
  // one, which in React Query v5 flips status to 'error' but keeps data)
  // never remounts the form or changes what "unchanged" means on save.
  const [editPrivateBaseline, setEditPrivateBaseline] = useState<{ id: string; data: PapaPrivateDetails | null } | null>(null)
  if (dialogOpen && editingPapa && privatePapaId === editingPapa.id && privateDetails.data !== undefined
    && editPrivateBaseline?.id !== editingPapa.id) {
    setEditPrivateBaseline({ id: editingPapa.id, data: privateDetails.data })
  } else if (!dialogOpen && editPrivateBaseline) {
    setEditPrivateBaseline(null)
  }
  const editPrivateLoaded = !editingPapa || editPrivateBaseline?.id === editingPapa.id
  const editPrivateData = editingPapa && editPrivateBaseline?.id === editingPapa.id ? editPrivateBaseline.data : null
  const setPrivateCache = (papaId: string, details: PapaPrivateDetails | null) => {
    const key = papaPrivateKey(papaId)
    queryClient.setQueryData(key, details)
    // The Alpha briefing batch holds its own copy of this row.
    void queryClient.invalidateQueries(papaPrivateSiblingFilter(key))
  }

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      // Passport fields never go into papas; they are written separately
      // below, and only when allowed and actually changed.
      const { papa: formPapa, privateDetails: nextPrivate } = splitPapaPrivate(data)
      const { event_id, speaking_schedule, personal_assistants, ...rest } = formPapa as any
      const papaData = {
        ...rest,
        program_id: event_id || null,
        flight_departure_time: rest.flight_departure_time || null,
        flight_arrival_time: rest.flight_arrival_time || null,
        speaking_schedule: speaking_schedule || [],
        personal_assistants: personal_assistants || []
      }
      const writePrivate = shouldWritePapaPrivate({
        allowed: canEditPassport,
        loaded: editPrivateLoaded,
        previous: editPrivateData,
        next: nextPrivate,
      })

      let isEdit = false
      let result: Papa[] | null = null
      if (editingPapa) {
        const { data: updated, error } = await supabase.from('papas').update(papaData).eq('id', editingPapa.id).select(PAPA_DIRECTORY_COLUMNS)
        if (error) throw error
        isEdit = true
        result = updated as unknown as Papa[]
      } else {
        const { data: inserted, error } = await supabase.from('papas').insert([papaData]).select(PAPA_DIRECTORY_COLUMNS)
        if (error) throw error
        result = inserted as unknown as Papa[]
      }

      // The Papa is saved by now. A passport failure is reported on its own
      // so a retry never creates the Papa twice.
      const savedId = result?.[0]?.id
      let savedPrivate: PapaPrivateDetails | null = null
      let privateError: unknown = null
      if (writePrivate && savedId) {
        try {
          savedPrivate = await upsertPapaPrivateDetails(supabase as any, savedId, nextPrivate)
        } catch (error) {
          privateError = error
        }
      }
      return { isEdit, result, savedPrivate, privateError }
    },
    onSuccess: (data) => {
      const saved = data.result?.[0] as Papa | undefined
      if (saved) {
        queryClient.setQueryData(['papas'], (old: Papa[] | undefined) => {
          const rest = (old || []).filter(p => p.id !== saved.id)
          return [...rest, saved].sort((a, b) => a.full_name.localeCompare(b.full_name))
        })
        if (data.savedPrivate) setPrivateCache(saved.id, data.savedPrivate)
      }
      queryClient.invalidateQueries({ queryKey: ['papas'] })
      toast.success(data.isEdit ? 'Papa updated successfully!' : 'Papa added successfully!')
      if (data.privateError) {
        notifyError(data.privateError, 'The Papa was saved, but the passport details were not. Open the Papa to try again.')
      }
      setDialogOpen(false)
      setEditingPapa(null)
      if (saved) setViewer({ papaId: saved.id, step: data.isEdit ? 'details' : 'photo', fromCreate: !data.isEdit })
    },
    onError: (error: any) => {
      console.error('Error saving papa:', error)
      notifyError(error, 'Failed to save Papa')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // RLS turns a refused delete into "0 rows" rather than an error, so ask
      // for the deleted row back and treat an empty result as a refusal.
      const { data, error } = await supabase.from('papas').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new UserFacingError('You are not allowed to delete this Papa, or it has already been removed.')
      }
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
    onSuccess: (id) => {
      // The passport row went with the Papa (ON DELETE CASCADE).
      queryClient.removeQueries({ queryKey: papaPrivateKey(id) })
      toast.success('Papa deleted successfully!')
    },
    onError: (err, _id, context) => {
      queryClient.setQueryData(['papas'], context?.previousPapas)
      notifyError(err, 'Failed to delete Papa')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['papas'] })
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

  const viewerPapa = viewer ? papas.find(p => p.id === viewer.papaId) ?? null : null

  const setPapaPhoto = (papaId: string, url: string | null) => {
    queryClient.setQueryData(['papas'], (old: Papa[] | undefined) =>
      (old || []).map(p => (p.id === papaId ? { ...p, profile_photo_url: url } : p))
    )
  }

  const openCreateDialog = () => {
    setEditingPapa(null)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <PageHeader
        icon={Users}
        title="Papas & Guest Ministers"
        description="VIP registry, personal protocols, stage requirements, and flight coordination."
        actions={canManage && (
          <Button onClick={openCreateDialog}>
            <Plus aria-hidden="true" />
            Add Papa
          </Button>
        )}
      />

      {/* Stats Cards */}
      <StatGrid>
        <StatCard label="Total Papas" value={papas.length} icon={Users} />
        <StatCard label="With Flights" value={papas.filter(p => p.flight_number).length} icon={Plane} tone="info" />
        <StatCard label="Stage Directives" value={papas.filter(p => p.needs_water_on_stage || p.has_slides || p.uses_stage_props).length} icon={Sparkles} tone="warning" />
        <StatCard label="With Entourage" value={papas.filter(p => (p.entourage_count || 0) > 0).length} icon={UserCheck} tone="success" />
      </StatGrid>

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

          {/* Search and filters */}
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Search by name, title, nationality, flight number…"
                aria-label="Search Papas"
                className="pl-9 bg-background h-9 text-base sm:text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={programmeFilter} onValueChange={selectProgramme}>
              <SelectTrigger className="h-9 w-full bg-background text-xs sm:w-56" aria-label="Filter by programme">
                <SelectValue placeholder="All programmes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programmes</SelectItem>
                {programs.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
                {/* A programme from the link that is not in the list (deleted, or not visible to you). */}
                {programmeFilter !== 'all' && !programMap.has(programmeFilter) && (
                  <SelectItem value={programmeFilter}>Unknown programme</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={arrivingSoon ? 'default' : 'outline'}
              size="sm"
              aria-pressed={arrivingSoon}
              onClick={toggleArrivingSoon}
              className="h-9 gap-1.5 text-xs"
            >
              <PlaneLanding className="h-3.5 w-3.5" aria-hidden="true" />
              Arriving in the next 24 hours
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-9">
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {papasFailed && papas.length > 0 && (
            <ErrorState
              className="mb-4 rounded-xl border border-destructive/30 py-4"
              title="Couldn't refresh the Papa list"
              description="Showing the last list we loaded."
              onRetry={() => { void refetchPapas() }}
              retrying={papasFetching}
            />
          )}
          {papasFailed && papas.length === 0 ? (
            <ErrorState
              title="Couldn't load Papas"
              onRetry={() => { void refetchPapas() }}
              retrying={papasFetching}
            />
          ) : filteredPapas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground/60 mb-3">
                <Users className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold">{hasFilters ? 'No matching Papas found' : 'No Papas registered'}</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                {search
                  ? `No results matched "${search}". Try checking the spelling or search term.`
                  : hasFilters
                    ? 'No Papas match these filters. Try another programme or clear the filters.'
                    : 'Register guest ministers to track flights, stage preferences, and hotel nests.'}
              </p>
              {canManage && !hasFilters && (
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
                        {/* VIP photo, falling back to initials */}
                        <button
                          type="button"
                          onClick={() => setViewer({ papaId: papa.id, step: 'details' })}
                          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-sm shadow-xs"
                          aria-label={`View ${papa.full_name}`}
                        >
                          {papa.profile_photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={papa.profile_photo_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials || "VIP"
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-base text-foreground truncate">
                              {papa.title} {papa.full_name}
                            </h3>
                            {programName && (
                              <Badge variant="outline" className="text-xs font-medium bg-primary/5 text-primary border-primary/20">
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
                                <Badge variant="secondary" className="text-[11px] font-medium gap-1 py-0 h-5 bg-sky-500/10 text-sky-600 dark:text-sky-400 border-0">
                                  <Droplets className="h-2.5 w-2.5" />
                                  Stage Water ({papa.water_temperature || "Room"})
                                </Badge>
                              )}
                              {papa.has_slides && (
                                <Badge variant="secondary" className="text-[11px] font-medium gap-1 py-0 h-5 bg-primary/10 text-primary border-0">
                                  <Sliders className="h-2.5 w-2.5" />
                                  Slides Ready
                                </Badge>
                              )}
                              {papa.mic_preference && (
                                <Badge variant="secondary" className="text-[11px] font-medium gap-1 py-0 h-5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0">
                                  <Mic className="h-2.5 w-2.5" />
                                  Mic: {papa.mic_preference}
                                </Badge>
                              )}
                              {(papa.entourage_count || 0) > 0 && (
                                <Badge variant="secondary" className="text-[11px] font-medium gap-1 py-0 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
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
                        <Button variant="outline" size="sm" onClick={() => setViewer({ papaId: papa.id, step: 'details' })} className="h-9 gap-1 text-xs" aria-label={`View ${papa.full_name}`}>
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">View</span>
                        </Button>
                        {papa.phone && (
                          <Button asChild variant="outline" size="sm" className="h-9 gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
                            <a href={`tel:${papa.phone}`} aria-label={`Call ${papa.full_name}`}>
                              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="hidden sm:inline">Call</span>
                            </a>
                          </Button>
                        )}
                        {canManage && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(papa)} className="h-9 w-9 hover:bg-primary/10" aria-label={`Edit ${papa.full_name}`}>
                              <Edit className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(papa.id)} className="h-9 w-9 hover:bg-destructive/10 text-destructive" aria-label={`Delete ${papa.full_name}`}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
          {editingPapa && canViewPassport && !editPrivateLoaded && privateDetails.isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading Papa details">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <PapaFormTabs
              // Remounts only on the first move from not-loaded to loaded
              // (the baseline is frozen after that), so typing is never lost.
              key={`${editingPapa?.id ?? 'new'}:${editPrivateLoaded ? 'private' : 'basic'}`}
              initialData={editingPapa ? {
                ...editingPapa,
                ...(editPrivateData ?? {}),
                event_id: editingPapa.event_id || editingPapa.program_id || '',
              } as any : undefined}
              events={programs}
              onSubmit={handleSubmit}
              onCancel={() => {
                setDialogOpen(false)
                setEditingPapa(null)
              }}
              isEditing={!!editingPapa}
              pending={saveMutation.isPending}
              showPassport={canEditPassport && editPrivateLoaded}
              passportNotice={canEditPassport && !editPrivateLoaded ? (
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>Passport details couldn&apos;t load, so they are hidden and won&apos;t be changed by this save. Reloading them resets this form.</span>
                  <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => { void privateDetails.refetch() }} pending={privateDetails.isFetching}>
                    Reload passport
                  </Button>
                </span>
              ) : null}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Photo + details viewer */}
      <Dialog open={!!viewerPapa} onOpenChange={(open) => { if (!open) setViewer(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {viewer?.step === 'photo' ? (viewer.fromCreate ? 'Papa Photo' : 'Change Papa Photo') : 'Papa Details'}
            </DialogTitle>
          </DialogHeader>
          {viewerPapa && viewer?.step === 'photo' && (
            <PapaPhotoStep
              papa={viewerPapa}
              onUploaded={(url) => setPapaPhoto(viewerPapa.id, url)}
              onDone={() => setViewer({ papaId: viewerPapa.id, step: 'details' })}
              doneLabel={viewer.fromCreate ? 'Skip for now' : 'Back to details'}
            />
          )}
          {viewerPapa && viewer?.step === 'details' && (
            <PapaDetailsView
              papa={viewerPapa}
              programName={viewerPapa.program_id ? programMap.get(viewerPapa.program_id) : null}
              canManage={canManage}
              canViewPassport={canViewPassport}
              canEditPassport={canEditPassport}
              passport={canViewPassport ? {
                details: privateDetails.data,
                isLoading: privateDetails.isLoading,
                isError: privateDetails.isError && privateDetails.data === undefined,
                onRetry: () => { void privateDetails.refetch() },
                retrying: privateDetails.isFetching,
              } : undefined}
              onPassportSaved={(details) => setPrivateCache(viewerPapa.id, details)}
              onChangePhoto={() => setViewer({ papaId: viewerPapa.id, step: 'photo' })}
              onEdit={() => {
                setViewer(null)
                handleEdit(viewerPapa)
              }}
            />
          )}
          {viewerPapa && viewer?.step === 'details' && alpha.loadFailed && !canViewPassport && (
            <p className="text-xs text-muted-foreground" role="status">
              We couldn&apos;t check your unit access, so any passport details stay hidden. Reload the page to try again.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
