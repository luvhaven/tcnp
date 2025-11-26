"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Hotel, Plus, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { canManageNests } from "@/lib/utils"

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
    amenities: ''
  })
  const [currentRole, setCurrentRole] = useState<string | null>(null)

  const canManage = currentRole ? canManageNests(currentRole) : false

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
        const { error } = await supabase
          .from('nests')
          .update(formData)
          .eq('id', editing.id)

        if (error) throw error
        toast.success('Hotel updated!')
      } else {
        const { error } = await supabase
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
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Nests (Hotels)</h1>
          <p className="text-muted-foreground">Manage accommodation facilities</p>
        </div>
        {canManage && (
          <Button onClick={openDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Hotel
          </Button>
        )}
      </div>

      <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Hotel className="h-5 w-5" />
            <span>Hotels</span>
          </CardTitle>
          <CardDescription>All registered hotels</CardDescription>
        </CardHeader>
        <CardContent>
          {nests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Hotel className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No hotels yet</p>
              {canManage && (
                <Button className="mt-4" onClick={openDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Hotel
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {nests.map((nest) => (
                <div
                  key={nest.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:-translate-y-0.5 hover:shadow-md animate-slide-up"
                >
                  <div className="flex-1">
                    <p className="font-medium text-lg">{nest.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {nest.address}, {nest.city}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ⭐ {nest.rating} stars {nest.phone && `• ${nest.phone}`}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(nest)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(nest.id)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Hotel' : 'Add Hotel'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update hotel information' : 'Add a new hotel'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Hotel Name *</Label>
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
              <Label htmlFor="amenities">Amenities</Label>
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
