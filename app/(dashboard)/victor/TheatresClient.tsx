"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import PapaBriefingsSection from "@/components/papas/PapaBriefingsSection"
import DenChecklist from "@/components/theatre/DenChecklist"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MapPin, Plus, Edit, Trash2, Scan, Armchair, Landmark, Waypoints, Loader2, RotateCw, ClipboardCheck, ClipboardList, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { notifyError, UserFacingError } from '@/lib/notify'
import { ErrorState } from "@/components/ui/error-state"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import VIPManagementPanel from "@/components/theatre/VIPManagementPanel"
import SeatArrangements from "@/components/theatre/SeatArrangements"
import VictorOperations from "@/components/victor/VictorOperations"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { motion, AnimatePresence } from "framer-motion"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import { Skeleton } from "@/components/ui/skeleton"
import UnitTasks from "@/components/units/UnitTasks"
import UnitProgrammeTeam from "@/components/units/UnitProgrammeTeam"

export const VICTOR_TABS = ['venues', 'seating', 'vip-access', 'operations', 'routine-check', 'tasks', 'team'] as const
export type VictorTab = (typeof VICTOR_TABS)[number]

/**
 * The tab to show for a ?tab= value. Unknown values give 'venues'. The
 * Routine Check is kept while membership is still loading (its trigger shows
 * as loading) and falls back to 'venues' once the viewer is known not to have it.
 * Tasks and Programme team have the same audience (Victor members and Command).
 */
export function resolveVictorTab(
  value: string | null | undefined,
  routine: { allowed: boolean; loading: boolean },
): VictorTab {
  const tab = (VICTOR_TABS as readonly string[]).includes(value ?? '') ? (value as VictorTab) : 'venues'
  if ((tab === 'routine-check' || tab === 'tasks' || tab === 'team') && !routine.allowed && !routine.loading) return 'venues'
  return tab
}

export default function TheatresClient({
  initialTheatres,
  initialTheatresError = false,
}: {
  initialTheatres: any[]
  initialTheatresError?: boolean
}) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    capacity: 0,
    venue_type: '',
    facilities: ''
  })
  const [theatreChoice, setSelectedTheatreId] = useState<string>("")
  // The tab lives in ?tab= so a reload, Back or a link (the SOP links to
  // ?tab=routine-check) lands on it. 'venues' is the default and not written.
  const searchParams = useSearchParams()
  const addressTab = searchParams.get('tab')
  const [requestedTab, setRequestedTab] = useState<string>(() => addressTab ?? 'venues')
  // A notification tap or Back that changes ?tab= while the page stays mounted moves the tab with it.
  const [seenAddressTab, setSeenAddressTab] = useState<string | null>(addressTab)
  if (seenAddressTab !== addressTab) {
    setSeenAddressTab(addressTab)
    setRequestedTab(addressTab ?? 'venues')
  }

  const {
    data: theatres = [],
    error: theatresError,
    isLoading: theatresLoading,
    refetch: refetchTheatres,
  } = useQuery({
    queryKey: ['theatres'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('theatres')
        .select('id, name, address, city, capacity, venue_type, facilities')
        .order('name')
      if (error) throw error
      return data || []
    },
    initialData: initialTheatresError ? undefined : initialTheatres,
    staleTime: 60_000,
    retry: 1,
  })

  const selectedTheatreId = theatres.some((t) => t.id === theatreChoice) ? theatreChoice : theatres[0]?.id || ""
  const selectedTheatre = theatres.find((t) => t.id === selectedTheatreId)

  const { data: currentUser } = useCurrentUser()
  // One rule: Victor access comes from the officer's active membership
  // (lib/unit-access). RLS stays the final authority for every write.
  const victorAccess = useUnitAccess('victor')
  // theatres: is_admin() OR can_manage_unit('victor').
  const canManage = victorAccess.canManage || victorAccess.isCommand
  // seat_arrangements and the Victor operations tables: can_manage_unit('victor').
  const canEditSeats = victorAccess.canManage
  // Routine checks: any Victor member, or Command/admin, logs their own round.
  const canUseRoutineCheck = victorAccess.isMember || victorAccess.isCommand
  // Briefing config from the membership level, never from the role or Oscar
  // text: coordinators edit the Victor fields, members and Command read them.
  // This matches papas/[id]/role-update exactly: it allows canCoordinate, or
  // can_work_unit_programme('victor', P), which for Victor is platform admin
  // or member AND active on P AND can_coordinate_unit (Victor has no
  // head-issued grants), so a plain member can never edit there either.
  const briefingRole = victorAccess.canCoordinate
    ? 'head_victor_oscar'
    : victorAccess.isMember || victorAccess.isCommand
      ? 'victor_oscar'
      : null

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editing) {
        const { error } = await supabase.from('theatres').update(data).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('theatres').insert([data])
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['theatres'] })
      toast.success(editing ? 'Venue updated!' : 'Venue added!')
      setDialogOpen(false)
      setEditing(null)
      resetForm()
    },
    onError: (error: any) => {
      notifyError(error, 'Failed to save venue')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('theatres').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['theatres'] })
      const previousTheatres = queryClient.getQueryData<any[]>(['theatres'])
      if (previousTheatres) {
        queryClient.setQueryData<any[]>(['theatres'], old => old?.filter(t => t.id !== deletedId))
      }
      return { previousTheatres }
    },
    onError: (err: any, _deletedId, context) => {
      if (context?.previousTheatres) queryClient.setQueryData(['theatres'], context.previousTheatres)
      // 23503: journeys or routine-check rounds still point at the venue
      // (den_checklist_logs is ON DELETE RESTRICT, so rounds are never erased).
      notifyError(
        err?.code === '23503'
          ? new UserFacingError("This venue can't be deleted: journeys or routine-check rounds are recorded against it.")
          : err,
        'Failed to delete venue',
      )
    },
    onSuccess: (deletedId) => {
      if (theatreChoice === deletedId) setSelectedTheatreId("")
      toast.success('Venue deleted')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['theatres'] })
    }
  })

  // While membership loads the Routine Check trigger shows (disabled), so the
  // tab bar does not reflow; it disappears once the viewer is known not to have it.
  const routineTabShown = canUseRoutineCheck || victorAccess.isLoading
  const activeTab = resolveVictorTab(requestedTab, { allowed: canUseRoutineCheck, loading: victorAccess.isLoading })
  const selectTab = (next: string) => {
    const tab = resolveVictorTab(next, { allowed: canUseRoutineCheck, loading: victorAccess.isLoading })
    setRequestedTab(tab)
    try {
      const url = new URL(window.location.href)
      if (tab === 'venues') url.searchParams.delete('tab')
      else url.searchParams.set('tab', tab)
      window.history.replaceState(window.history.state, '', url)
    } catch {
      // The address is a convenience; the tab still changes.
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate(formData)
  }

  const handleEdit = (item: any) => {
    setEditing(item)
    setFormData({
      name: item.name,
      address: item.address,
      city: item.city,
      capacity: item.capacity || 0,
      venue_type: item.venue_type || '',
      facilities: item.facilities || ''
    })
    setDialogOpen(true)
  }

  const handleDelete = async (theatre: { id: string; name: string }) => {
    // A logged routine-check round is a record: the database refuses to
    // delete a venue that has any (ON DELETE RESTRICT), so say so up front.
    const { count, error } = await (supabase as any)
      .from('den_checklist_logs')
      .select('id', { count: 'exact', head: true })
      .eq('theatre_id', theatre.id)
    if (!error && (count ?? 0) > 0) {
      notifyError(
        new UserFacingError(`${theatre.name} has ${count} routine-check round${count === 1 ? '' : 's'} logged, so it can't be deleted. Those rounds are the record of the operation.`),
        'Failed to delete venue',
      )
      return
    }
    if (!await confirm({
      title: `Delete ${theatre.name}?`,
      message: 'The venue is removed for everyone. This cannot be undone.',
      confirmText: 'Delete venue',
      variant: 'destructive',
    })) return
    deleteMutation.mutate(theatre.id)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      city: '',
      capacity: 0,
      venue_type: '',
      facilities: ''
    })
  }

  const openDialog = () => {
    setEditing(null)
    resetForm()
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">

      <PageHeader
        icon={Landmark}
        title="Victor"
        badge="Venues & Seating"
        description="Event theatres, VIP seat arrangements, and hall layout management."
        actions={canManage && (
          <Button onClick={openDialog}>
            <Plus aria-hidden="true" />
            Add Venue
          </Button>
        )}
      />

      {victorAccess.loadFailed && (
        <ErrorState
          className="rounded-xl border border-destructive/30 bg-destructive/5 py-6"
          title="We couldn't confirm your Victor membership"
          description="Unit tools stay hidden until it loads. Check your connection and try again."
          onRetry={() => void queryClient.invalidateQueries({ queryKey: ['unit-access'] })}
        />
      )}

      {/* ── Papa briefings (config from the Victor membership level) ── */}
      {briefingRole && (
        <div className="border rounded-xl p-4 bg-muted/30">
          <PapaBriefingsSection role={briefingRole} userId={currentUser?.id ?? null} />
        </div>
      )}

      {/* Stats Cards */}
      <StatGrid columns={3}>
        <StatCard label="Total Venues" value={theatresLoading ? '—' : theatres.length} />
        <StatCard label="Total Capacity" tone="success" value={theatresLoading ? '—' : theatres.reduce((sum, t) => sum + (t.capacity || 0), 0).toLocaleString()} />
        <StatCard label="Average Capacity" tone="primary" value={theatresLoading ? '—' : theatres.length > 0 ? Math.round(theatres.reduce((sum, t) => sum + (t.capacity || 0), 0) / theatres.length).toLocaleString() : 0} />
      </StatGrid>

      {theatresError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span>Unable to load venues. Check your connection and try again.</span>
          <Button variant="outline" size="sm" onClick={() => void refetchTheatres()}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" /> Retry
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={selectTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 lg:grid-cols-4">
          <TabsTrigger value="venues">Venues Management</TabsTrigger>
          <TabsTrigger value="seating">
            <Armchair className="mr-2 h-4 w-4" />
            Seat Arrangements
          </TabsTrigger>
          <TabsTrigger value="vip-access">
            <Scan className="mr-2 h-4 w-4" />
            Senior Ministers&apos; Access
          </TabsTrigger>
          <TabsTrigger value="operations">
            <Waypoints className="mr-2 h-4 w-4" />
            Victor Operations
          </TabsTrigger>
          {routineTabShown && (
            <TabsTrigger
              value="routine-check"
              className="min-h-11 sm:min-h-0"
              disabled={!canUseRoutineCheck}
              aria-label={canUseRoutineCheck ? undefined : 'Routine Check (checking your Victor membership)'}
            >
              {canUseRoutineCheck
                ? <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                : <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Routine Check
            </TabsTrigger>
          )}
          {routineTabShown && (
            <>
              <TabsTrigger
                value="tasks"
                className="min-h-11 sm:min-h-0"
                disabled={!canUseRoutineCheck}
                aria-label={canUseRoutineCheck ? undefined : 'Tasks (checking your Victor membership)'}
              >
                <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />
                Tasks
              </TabsTrigger>
              <TabsTrigger
                value="team"
                className="min-h-11 sm:min-h-0"
                disabled={!canUseRoutineCheck}
                aria-label={canUseRoutineCheck ? undefined : 'Programme team (checking your Victor membership)'}
              >
                <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                Programme team
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="venues">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MapPin className="h-5 w-5" />
                <span>Venues</span>
              </CardTitle>
              <CardDescription>All registered venues</CardDescription>
            </CardHeader>
            <CardContent>
              {theatresLoading && theatres.length === 0 ? (
                <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading venues…
                </div>
              ) : theatres.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MapPin className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-sm font-medium">No venues yet</p>
                  {canManage && (
                    <Button className="mt-4" onClick={openDialog}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Venue
                    </Button>
                  )}
                </div>
              ) : (
                <motion.div layout className="space-y-3">
                  <AnimatePresence>
                    {theatres.map((theatre) => (
                      <motion.div
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        key={theatre.id}
                        className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg border p-4 transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-lg">{theatre.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {theatre.address}, {theatre.city}
                          </p>
                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
                            <Badge variant="secondary" className="text-xs">
                              {theatre.venue_type || 'Venue'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Capacity: <span className="font-semibold">{theatre.capacity}</span> people
                            </span>
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex shrink-0 items-center gap-2">
                            <Button variant="ghost" size="icon" aria-label={`Edit ${theatre.name}`} onClick={() => handleEdit(theatre)} className="hover:bg-primary/10">
                              <Edit className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={`Delete ${theatre.name}`} onClick={() => void handleDelete(theatre)} className="hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seating">
          <SeatArrangements canEdit={canEditSeats} currentUserId={currentUser?.id ?? null} />
        </TabsContent>

        <TabsContent value="vip-access">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="min-w-0 text-2xl font-bold tracking-tight">Senior Ministers&apos; Access</h2>
              <div className="w-full sm:w-[300px]">
                <Select value={selectedTheatreId} onValueChange={setSelectedTheatreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Theatre" />
                  </SelectTrigger>
                  <SelectContent>
                    {theatres.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedTheatreId ? (
              <VIPManagementPanel canManage={canEditSeats} theatreId={selectedTheatreId} />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MapPin className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p>Select a theatre to manage VIP access</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="operations">
          <VictorOperations
            canManage={canEditSeats}
            currentUserId={currentUser?.id ?? null}
            selectedTheatreId={selectedTheatreId || null}
          />
        </TabsContent>

        {routineTabShown && (
          <TabsContent value="routine-check">
            {!canUseRoutineCheck ? (
              <div className="space-y-3" role="status" aria-label="Loading the routine check">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="min-w-0 text-2xl font-bold tracking-tight">Routine Check</h2>
                <div className="w-full sm:w-[300px]">
                  <Select value={selectedTheatreId} onValueChange={setSelectedTheatreId}>
                    <SelectTrigger aria-label="Theatre for the routine check" className="h-11 sm:h-10">
                      <SelectValue placeholder="Select Theatre" />
                    </SelectTrigger>
                    <SelectContent>
                      {theatres.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selectedTheatre ? (
                <DenChecklist
                  key={selectedTheatre.id}
                  theatreId={selectedTheatre.id}
                  theatreName={selectedTheatre.name}
                  canSubmit={canUseRoutineCheck && !victorAccess.isLoading}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <MapPin className="mb-4 h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
                    <p className="text-sm">{theatresLoading ? 'Loading theatres…' : 'Add a theatre to run the routine check.'}</p>
                  </CardContent>
                </Card>
              )}
            </div>
            )}
          </TabsContent>
        )}

        {routineTabShown && (
          <>
            <TabsContent value="tasks">
              <UnitTasks unitSlug="victor" />
            </TabsContent>
            <TabsContent value="team">
              <UnitProgrammeTeam unitSlug="victor" />
            </TabsContent>
          </>
        )}
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Venue' : 'Add Venue'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update venue information' : 'Add a new venue'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Venue Name *</Label>
              <Input
                id="name"
                required
                placeholder="e.g., Aso Rock Villa"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <Input
                  id="address"
                  required
                  placeholder="e.g., Three Arms Zone"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  required
                  placeholder="e.g., Abuja"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="venue_type">Venue Type</Label>
                <Input
                  id="venue_type"
                  placeholder="e.g., Government Building, Conference Center"
                  value={formData.venue_type}
                  onChange={(e) => setFormData({ ...formData, venue_type: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity *</Label>
                <Input
                  id="capacity"
                  type="number"
                  required
                  min="0"
                  placeholder="e.g., 500"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="facilities">Facilities</Label>
              <Textarea
                id="facilities"
                placeholder="e.g., Security checkpoints, Parking, AV equipment..."
                value={formData.facilities}
                onChange={(e) => setFormData({ ...formData, facilities: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? 'Update Venue' : 'Add Venue'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
