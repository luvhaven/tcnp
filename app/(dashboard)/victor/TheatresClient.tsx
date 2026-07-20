"use client"

import { useState, useEffect } from "react"
import PapaBriefingsSection from "@/components/papas/PapaBriefingsSection"
import DenChecklist from "@/components/theatre/DenChecklist"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MapPin, Plus, Edit, Trash2, Users, Scan, ChevronDown, Armchair } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import VIPManagementPanel from "@/components/theatre/VIPManagementPanel"
import SeatArrangements from "@/components/theatre/SeatArrangements"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { motion, AnimatePresence } from "framer-motion"
import { canManageVenues, canManageSeatArrangements } from "@/lib/utils"
import { useCurrentUser } from "@/hooks/useCurrentUser"

export default function TheatresClient({
  initialTheatres,
  initialEagleSquares
}: {
  initialTheatres: any[]
  initialEagleSquares: any[]
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
  const [selectedTheatreId, setSelectedTheatreId] = useState<string>("")
  const [expandedDen, setExpandedDen] = useState<string | null>(null)

  const { data: theatres = [] } = useQuery({
    queryKey: ['theatres'],
    queryFn: async () => {
      const { data, error } = await supabase.from('theatres').select('*').order('name')
      if (error) throw error
      return data || []
    },
    initialData: initialTheatres
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

  useEffect(() => {
    if (theatres.length > 0 && !selectedTheatreId) {
      setSelectedTheatreId(theatres[0].id)
    }
  }, [theatres, selectedTheatreId])

  const canManage = userRole ? canManageVenues(userRole) : false
  const { data: currentUser } = useCurrentUser()
  const canEditSeats = canManageSeatArrangements(currentUser?.role, currentUser?.oscar)

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
      toast.error(error.message || 'Failed to save venue')
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
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['theatres'], context?.previousTheatres)
      toast.error('Failed to delete venue')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['theatres'] })
      toast.success('Venue deleted!')
    }
  })

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

  const handleDelete = async (id: string) => {
    if (!await confirm({ message: 'Delete this venue?', variant: 'destructive' })) return
    deleteMutation.mutate(id)
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
      {/* Den Facility Checklist shown for VO roles */}
      {userRole && ['victor_oscar', 'head_victor_oscar', 'super_admin', 'admin'].includes(userRole) && theatres.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Den Facility Checks</h3>
            <Badge variant="secondary" className="text-[9px]">Run 4× per day</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {theatres.slice(0, 1).map((t: any) => (
              <DenChecklist key={t.id} theatreId={t.id} theatreName={t.name} />
            ))}
          </div>
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Victor</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Manage event venues and locations</p>
        </div>
        {canManage && (
          <Button onClick={openDialog} className="shrink-0 self-start sm:self-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add Venue
          </Button>
        )}
      </motion.div>

      {/* ── Papa Briefings for Victor Oscar roles ── */}
      {userRole && ['victor_oscar', 'head_victor_oscar'].includes(userRole) && (
        <div className="border rounded-xl p-4 bg-muted/30">
          <PapaBriefingsSection role={userRole} />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Total Venues', value: theatres.length, color: 'text-foreground', bg: 'bg-primary/8', ring: 'ring-border' },
          { label: 'Total Capacity', value: theatres.reduce((sum, t) => sum + (t.capacity || 0), 0).toLocaleString(), color: 'text-[hsl(var(--success))]', bg: 'bg-[hsl(var(--success)/0.08)]', ring: 'ring-[hsl(var(--success)/0.2)]' },
          { label: 'Average Capacity', value: theatres.length > 0 ? Math.round(theatres.reduce((sum, t) => sum + (t.capacity || 0), 0) / theatres.length).toLocaleString() : 0, color: 'text-purple-500', bg: 'bg-purple-500/10', ring: 'ring-purple-500/20' },
        ].map(({ label, value, color, bg, ring }) => (
          <div key={label} className={`rounded-2xl border bg-card p-5 ring-1 ${ring} transition-all hover:shadow-elevation-md hover:-translate-y-0.5`}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={`stat-figure mt-2 text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="venues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="venues">Venues Management</TabsTrigger>
          <TabsTrigger value="seating">
            <Armchair className="mr-2 h-4 w-4" />
            Seat Arrangements
          </TabsTrigger>
          <TabsTrigger value="vip-access">
            <Scan className="mr-2 h-4 w-4" />
            Senior Ministers&apos; Access
          </TabsTrigger>
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
              {theatres.length === 0 ? (
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
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(theatre)} className="hover:bg-primary/10">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(theatre.id)} className="hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4 text-destructive" />
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
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">Senior Ministers&apos; Access</h2>
              <div className="w-[300px]">
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
              <VIPManagementPanel />
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
