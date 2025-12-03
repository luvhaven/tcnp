"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Hotel, Plus, Edit, Trash2, Home, Building } from "lucide-react"
import { toast } from "sonner"
import { canManageNests } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function NestsPage() {
  const supabase = createClient()
  const [nests, setNests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    rating: 5,
    amenities: '',
    type: 'nest' // Default type
  })
  const [currentRole, setCurrentRole] = useState<string | null>(null)

  const canManage = currentRole ? canManageNests(currentRole) : false

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data } = await (supabase as any)
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

          if (data?.role) {
            setCurrentRole(data.role)
          }
        }

        await loadData()
      } catch (error) {
        console.error('Error loading current user for NestsPage:', error)
        await loadData()
      }
    }

    init()
  }, [])

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from('nests')
        .select('*')
        .order('name')

      if (error) throw error
      setNests(data || [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load hotels')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (!canManage) {
        toast.error('You are not authorized to manage hotels')
        return
      }

      if (editing) {
        const { error } = await (supabase as any)
          .from('nests')
          .update(formData)
          .eq('id', editing.id)

        if (error) throw error
        toast.success('Hotel updated!')
      } else {
        const { error } = await (supabase as any)
          .from('nests')
          .insert([formData])

        if (error) throw error
        toast.success('Hotel added!')
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
      phone: item.phone || '',
      email: item.email || '',
      rating: item.rating || 5,
      amenities: item.amenities || ''
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this hotel?')) return

    try {
      if (!canManage) {
        toast.error('You are not authorized to manage hotels')
        return
      }

      const { error } = await supabase
        .from('nests')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Hotel deleted!')
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
      phone: '',
      email: '',
      rating: 5,
      amenities: ''
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
            <div className="h-5 w-40 rounded-md skeleton" />
            <div className="mt-2 h-4 w-56 rounded-md skeleton" />
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
          <h2 className="text-3xl font-bold tracking-tight">NOscar Management</h2>
          <p className="text-muted-foreground">
            Manage NOscar Dens and Nests
          </p>
        </div>
        {canManage && (
          <Button onClick={() => {
            setEditing(null)
            setFormData({
              name: '',
              address: '',
              city: '',
              phone: '',
              email: '',
              rating: 5,
              amenities: '',
              type: 'nest'
            })
            setDialogOpen(true)
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Add NOscar
          </Button>
        )}
      </div>

      <Tabs defaultValue="den" className="space-y-4">
        <TabsList>
          <TabsTrigger value="den">
            <Home className="mr-2 h-4 w-4" />
            NOscar Den
          </TabsTrigger>
          <TabsTrigger value="nest">
            <Building className="mr-2 h-4 w-4" />
            NOscar Nest
          </TabsTrigger>
        </TabsList>

        {['den', 'nest'].map((type) => (
          <TabsContent key={type} value={type}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  {type === 'den' ? <Home className="h-5 w-5" /> : <Building className="h-5 w-5" />}
                  <span>{type === 'den' ? 'NOscar Dens' : 'NOscar Nests'}</span>
                </CardTitle>
                <CardDescription>
                  {type === 'den' ? 'Private residences and secure locations' : 'Hotels and public accommodation'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {nests.filter(n => n.type === type || (!n.type && type === 'nest')).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Hotel className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm font-medium">No {type === 'den' ? 'Dens' : 'Nests'} found</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {nests
                      .filter(n => n.type === type || (!n.type && type === 'nest'))
                      .map((nest) => (
                        <Card key={nest.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-lg">{nest.name}</CardTitle>
                              {canManage && (
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                    setEditing(nest)
                                    setFormData({
                                      name: nest.name,
                                      address: nest.address || '',
                                      city: nest.city || '',
                                      phone: nest.phone || '',
                                      email: nest.email || '',
                                      rating: nest.rating || 5,
                                      amenities: nest.amenities || '',
                                      type: nest.type || 'nest'
                                    })
                                    setDialogOpen(true)
                                  }}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(nest.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            <CardDescription>{nest.city}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2 text-sm">
                              <p className="text-muted-foreground">{nest.address}</p>
                              {nest.phone && <p>📞 {nest.phone}</p>}
                              {nest.amenities && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {nest.amenities.split(',').map((item: string, i: number) => (
                                    <span key={i} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                      {item.trim()}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit NOscar' : 'Add NOscar'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update NOscar information' : 'Add a new NOscar location'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                required
                placeholder="e.g., Transcorp Hilton"
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
                  placeholder="e.g., 1 Aguiyi Ironsi Street"
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

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+234 xxx xxx xxxx"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="info@hotel.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rating">Rating *</Label>
                <Input
                  id="rating"
                  type="number"
                  required
                  min="1"
                  max="5"
                  value={formData.rating}
                  onChange={(e) => setFormData({ ...formData, rating: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="nest">NOscar Nest (Hotel)</option>
                <option value="den">NOscar Den (Private)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amenities">Amenities (comma separated)</Label>
              <Textarea
                id="amenities"
                placeholder="e.g., Pool, Gym, Spa, Restaurant, Conference rooms..."
                value={formData.amenities}
                onChange={(e) => setFormData({ ...formData, amenities: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editing ? 'Update' : 'Add'} Hotel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
