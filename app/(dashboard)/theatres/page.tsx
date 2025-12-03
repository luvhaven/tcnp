"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MapPin, Plus, Edit, Trash2, Users, Scan } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import VIPManagementPanel from "@/components/theatre/VIPManagementPanel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function TheatresPage() {
  const supabase = createClient()
  const [theatres, setTheatres] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    if (theatres.length > 0 && !selectedTheatreId) {
      setSelectedTheatreId(theatres[0].id)
    }
  }, [theatres])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from('theatres')
        .select('*')
        .order('name')

      if (error) throw error
      setTheatres(data || [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load venues')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editing) {
        const { error } = await supabase
          .from('theatres')
          .update(formData)
          .eq('id', editing.id)

        if (error) throw error
        toast.success('Venue updated!')
      } else {
        const { error } = await supabase
          .from('theatres')
          .insert([formData])

        if (error) throw error
        toast.success('Venue added!')
      }

      setDialogOpen(false)
      setEditing(null)
      resetForm()
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save')
    }
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
    if (!confirm('Delete this venue?')) return

    try {
      const { error } = await supabase
        .from('theatres')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Venue deleted!')
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete')
    }
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 rounded-md skeleton" />
            <div className="mt-2 h-4 w-48 rounded-md skeleton" />
          </div>
          <div className="h-10 w-28 rounded-md skeleton" />
        </div>

        {/* Content skeleton */}
        <Card>
          <CardHeader>
            <div className="h-5 w-32 rounded-md skeleton" />
            <div className="mt-2 h-4 w-40 rounded-md skeleton" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-2">
                    <div className="h-5 w-48 rounded-md skeleton" />
                    <div className="h-4 w-64 rounded-md skeleton" />
                    <div className="h-3 w-32 rounded-md skeleton" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md skeleton" />
                    <div className="h-8 w-8 rounded-md skeleton" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Theatres</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Manage event venues and locations</p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Venue
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-primary/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Total Venues</CardTitle>
            <div className="p-2 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <MapPin className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-primary group-hover:to-primary/70 transition-all duration-500">
              {theatres.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Registered locations
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-emerald-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
            <div className="p-2 rounded-full bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
              <Users className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-emerald-500 group-hover:to-emerald-600 transition-all duration-500">
              {theatres.reduce((sum, t) => sum + (t.capacity || 0), 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Combined seating
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-purple-500/60 border-2">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Average Capacity</CardTitle>
            <div className="p-2 rounded-full bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
              <MapPin className="h-4 w-4 text-purple-500 group-hover:scale-110 transition-transform" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-purple-500 group-hover:to-purple-600 transition-all duration-500">
              {theatres.length > 0
                ? Math.round(theatres.reduce((sum, t) => sum + (t.capacity || 0), 0) / theatres.length).toLocaleString()
                : 0
              }
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Per venue
            </p>
          </CardContent>
        </Card>
      </div>



      <Tabs defaultValue="venues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="venues">Venues Management</TabsTrigger>
          <TabsTrigger value="vip-access">
            <Scan className="mr-2 h-4 w-4" />
            VIP Access
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
                  <Button className="mt-4" onClick={openDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Venue
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {theatres.map((theatre) => (
                    <div
                      key={theatre.id}
                      className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm hover:-translate-y-0.5 animate-slide-up"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-lg">{theatre.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {theatre.address}, {theatre.city}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {theatre.venue_type || 'Venue'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Capacity: <span className="font-semibold">{theatre.capacity}</span> people
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(theatre)} className="hover:bg-primary/10">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(theatre.id)} className="hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vip-access">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">VIP Management</h2>
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
              <Button type="submit">
                {editing ? 'Update' : 'Add'} Venue
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div >
  )
}
