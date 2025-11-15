"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plane, Plus, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"

export default function EagleSquaresPage() {
  const supabase = createClient()
  const [airports, setAirports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    city: '',
    country: '',
    latitude: '',
    longitude: '',
    facilities: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from('eagle_squares')
        .select('*')
        .order('name')

      if (error) throw error
      setAirports(data || [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load airports')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      if (editing) {
        const { error } = await supabase
          .from('eagle_squares')
          .update(formData)
          .eq('id', editing.id)

        if (error) throw error
        toast.success('Airport updated!')
      } else {
        const { error } = await supabase
          .from('eagle_squares')
          .insert([formData])

        if (error) throw error
        toast.success('Airport added!')
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
      code: item.code,
      city: item.city,
      country: item.country,
      latitude: item.latitude || '',
      longitude: item.longitude || '',
      facilities: item.facilities || ''
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this airport?')) return

    try {
      const { error } = await supabase
        .from('eagle_squares')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Airport deleted!')
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      city: '',
      country: '',
      latitude: '',
      longitude: '',
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
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Eagle Squares (Airports)</h1>
          <p className="text-muted-foreground">Manage airports and flight tracking</p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Airport
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Plane className="h-5 w-5" />
            <span>Airports</span>
          </CardTitle>
          <CardDescription>All registered airports</CardDescription>
        </CardHeader>
        <CardContent>
          {airports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Plane className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No airports yet</p>
              <Button className="mt-4" onClick={openDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Airport
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {airports.map((airport) => (
                <div
                  key={airport.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex-1">
                    <p className="font-medium text-lg">{airport.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {airport.code} • {airport.city}, {airport.country}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(airport)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(airport.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Airport' : 'Add Airport'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update airport information' : 'Add a new airport'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Airport Name *</Label>
                <Input
                  id="name"
                  required
                  placeholder="e.g., Nnamdi Azikiwe International"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Airport Code *</Label>
                <Input
                  id="code"
                  required
                  placeholder="e.g., ABV"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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

              <div className="space-y-2">
                <Label htmlFor="country">Country *</Label>
                <Input
                  id="country"
                  required
                  placeholder="e.g., Nigeria"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  placeholder="e.g., 9.0065"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  placeholder="e.g., 7.2631"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="facilities">Facilities</Label>
              <Textarea
                id="facilities"
                placeholder="e.g., VIP lounge, Customs, Immigration..."
                value={formData.facilities}
                onChange={(e) => setFormData({ ...formData, facilities: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editing ? 'Update' : 'Add'} Airport
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
