"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { UserCircle, Plus } from "lucide-react"
import { toast } from "sonner"

export default function OfficersPage() {
  const supabase = createClient()
  const [officers, setOfficers] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    role: "delta_oscar"
  })

  const roles = [
    { value: "delta_oscar", label: "Delta Oscar (DO)" },
    { value: "tango_oscar", label: "Tango Oscar (TO)" },
    { value: "alpha_oscar", label: "Alpha Oscar (AO)" },
    { value: "november_oscar", label: "November Oscar (NO)" },
    { value: "victor_oscar", label: "Victor Oscar (VO)" },
    { value: "captain", label: "Captain" },
    { value: "vice_captain", label: "Vice Captain" },
    { value: "head_of_operations", label: "Head of Operations" },
    { value: "head_of_command", label: "Head of Command" },
    { value: "command", label: "Command" },
    { value: "viewer", label: "Viewer" },
  ]

  useEffect(() => {
    loadOfficers()
  }, [])

  const loadOfficers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await (supabase as any)
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single()
        setCurrentUser(profile || null)
      } else {
        setCurrentUser(null)
      }

      const response = await fetch("/api/officers/list")

      if (!response.ok) {
        console.error("Failed to load officers via API:", await response.text())
        return
      }

      const body = await response.json()
      setOfficers(body.officers || [])
    } catch (error) {
      console.error("Error loading officers:", error)
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      full_name: "",
      phone: "",
      role: "delta_oscar",
    })
  }

  const handleCreateOfficer = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          phone: formData.phone,
          role: formData.role,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create officer")
      }

      toast.success("Protocol Officer created successfully!")
      setDialogOpen(false)
      resetForm()
      loadOfficers()
    } catch (error: any) {
      console.error("Error creating officer:", error)
      toast.error(error.message || "Failed to create officer")
    }
  }

  const canManageOfficers =
    currentUser && (currentUser.role === "admin" || currentUser.role === "super_admin")

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-40 rounded-md skeleton" />
            <div className="mt-2 h-4 w-72 rounded-md skeleton" />
          </div>
          <div className="h-9 w-32 rounded-md skeleton" />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 rounded-md skeleton" />
              </CardHeader>
              <CardContent>
                <div className="h-6 w-12 rounded-md skeleton" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="h-5 w-32 rounded-md skeleton" />
            <div className="mt-2 h-4 w-40 rounded-md skeleton" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 rounded-lg border p-4"
                >
                  <div className="h-10 w-10 rounded-full skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded-md skeleton" />
                    <div className="h-3 w-40 rounded-md skeleton" />
                    <div className="h-3 w-24 rounded-md skeleton" />
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
          <h1 className="text-3xl font-bold tracking-tight">Protocol Officers</h1>
          <p className="text-sm text-muted-foreground max-w-xl">Directory of all Protocol Officers serving in the department</p>
        </div>
        {canManageOfficers && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Protocol Officer</span>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{officers.length}</div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.is_online).length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => !o.is_online).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <UserCircle className="h-5 w-5" />
            <span>All Officers</span>
          </CardTitle>
          <CardDescription>Protocol staff directory</CardDescription>
        </CardHeader>
        <CardContent>
          {officers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCircle className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No officers yet</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {officers.map((officer) => (
                <div
                  key={officer.id}
                  className="flex items-center space-x-3 rounded-lg border p-4 transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm"
                >
                  <Avatar>
                    <AvatarImage src={officer.avatar_url} />
                    <AvatarFallback>
                      {getInitials(officer.full_name || officer.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{officer.full_name || 'No name'}</p>
                    <p className="text-xs text-muted-foreground truncate">{officer.email}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="secondary" className="text-xs uppercase tracking-wide">
                        {officer.role || 'No role'}
                      </Badge>
                      <div className="flex items-center space-x-1">
                        <div className={`h-2 w-2 rounded-full ${officer.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-xs text-muted-foreground">
                          {officer.is_online ? 'online' : 'offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Officer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Protocol Officer</DialogTitle>
            <DialogDescription>
              Create a new Protocol Officer account so they can be assigned to duties and tracked.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateOfficer} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Temporary Password *</Label>
              <Input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Default Role *</Label>
              <Select
                id="role"
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false)
                  resetForm()
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Create Officer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
