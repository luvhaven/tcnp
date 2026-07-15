"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { canManageHospitality, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import {
  Compass, Plus, Pencil, Trash2, MapPin, UtensilsCrossed, Landmark, ShoppingBag, Trees, Music, Waves, Sparkles, Loader2, Lightbulb,
} from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

type Place = {
  id: string
  name: string
  category: string
  description: string | null
  address: string | null
  city: string | null
  image_paths: string[]
  tips: string | null
  created_at: string
}

const CATEGORIES = [
  { value: "restaurant", label: "Dining", icon: UtensilsCrossed, color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { value: "sightseeing", label: "Sightseeing", icon: Compass, color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  { value: "culture", label: "Culture & History", icon: Landmark, color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { value: "shopping", label: "Shopping", icon: ShoppingBag, color: "bg-pink-500/15 text-pink-600 dark:text-pink-400" },
  { value: "nature", label: "Nature", icon: Trees, color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { value: "entertainment", label: "Entertainment", icon: Music, color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { value: "relaxation", label: "Relaxation", icon: Waves, color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  { value: "other", label: "Other", icon: Sparkles, color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
]

function publicUrl(path: string) {
  return supabase.storage.from("hospitality-media").getPublicUrl(path).data.publicUrl
}

export default function HospitalityPage() {
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const canEdit = canManageHospitality(currentUser?.role, currentUser?.oscar)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Place | null>(null)
  const [uploading, setUploading] = useState(false)
  const [filterCategory, setFilterCategory] = useState("all")
  const [form, setForm] = useState({
    name: "",
    category: "sightseeing",
    description: "",
    address: "",
    city: "Lagos",
    tips: "",
    files: [] as File[],
  })

  const { data: places = [], isLoading } = useQuery({
    queryKey: ["hospitality-places"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitality_places")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []).map((p: any) => ({
        ...p,
        image_paths: Array.isArray(p.image_paths) ? p.image_paths : [],
      })) as Place[]
    },
  })

  const filtered = useMemo(
    () => places.filter(p => filterCategory === "all" || p.category === filterCategory),
    [places, filterCategory]
  )

  const savePlace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error("Name is required"); return }
    setUploading(true)
    try {
      const imagePaths: string[] = editing ? [...editing.image_paths] : []
      for (const file of form.files) {
        const ext = file.name.split(".").pop() || "jpg"
        const path = `places/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error } = await supabase.storage.from("hospitality-media").upload(path, file, { contentType: file.type })
        if (error) throw error
        imagePaths.push(path)
      }
      const payload = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        tips: form.tips.trim() || null,
        image_paths: imagePaths,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from("hospitality_places").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("hospitality_places").insert({ ...payload, created_by: currentUser?.id ?? null })
        if (error) throw error
      }
      toast.success(editing ? "Place updated" : "Place added")
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["hospitality-places"] })
    } catch (err: any) {
      toast.error(err.message || "Failed to save")
    } finally {
      setUploading(false)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (place: Place) => {
      if (place.image_paths.length > 0) {
        await supabase.storage.from("hospitality-media").remove(place.image_paths)
      }
      const { error } = await supabase.from("hospitality_places").delete().eq("id", place.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Place removed")
      queryClient.invalidateQueries({ queryKey: ["hospitality-places"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ name: "", category: "sightseeing", description: "", address: "", city: "Lagos", tips: "", files: [] })
    setDialogOpen(true)
  }

  const openEdit = (place: Place) => {
    setEditing(place)
    setForm({
      name: place.name,
      category: place.category,
      description: place.description ?? "",
      address: place.address ?? "",
      city: place.city ?? "",
      tips: place.tips ?? "",
      files: [],
    })
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-teal-950 via-slate-900 to-slate-900 p-6 text-white">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-6 w-6 text-teal-300" />
              <h1 className="text-2xl font-bold tracking-tight">Hospitality</h1>
              <Badge className="border-0 bg-teal-500/20 text-teal-200 uppercase text-[10px] tracking-wider">Sights & Sounds</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-300">
              Curated experiences for our Papas — the finest places to visit, dine and unwind while they are with us.
            </p>
          </div>
          {canEdit && (
            <Button onClick={openCreate} className="gap-2 bg-teal-600 hover:bg-teal-500">
              <Plus className="h-4 w-4" /> Add Place
            </Button>
          )}
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory("all")}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            filterCategory === "all" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          All
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setFilterCategory(c.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filterCategory === c.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </button>
        ))}
      </div>

      {/* Places grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-72 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state rounded-xl border">
          <Compass className="h-10 w-10" />
          <p className="font-medium">No places yet</p>
          <p className="text-sm text-muted-foreground">Hospitality curates destinations worth a Papa&apos;s time here.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filtered.map(place => {
              const meta = CATEGORIES.find(c => c.value === place.category) ?? CATEGORIES[7]
              return (
                <motion.div key={place.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Card className="card-hover group h-full overflow-hidden">
                    <div className="relative aspect-[4/3] bg-muted">
                      {place.image_paths.length > 0 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={publicUrl(place.image_paths[0])} alt={place.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground/40">
                          <meta.icon className="h-12 w-12" />
                        </div>
                      )}
                      <Badge className={cn("absolute left-2 top-2 border-0 text-[10px] uppercase tracking-wide", meta.color)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{place.name}</p>
                          {(place.address || place.city) && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {[place.address, place.city].filter(Boolean).join(", ")}
                            </p>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(place)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                              onClick={async () => {
                                const ok = await confirm({ title: "Remove place?", message: `"${place.name}" will be removed from the guide.` })
                                if (ok) deleteMutation.mutate(place)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {place.description && <p className="line-clamp-3 text-sm text-muted-foreground">{place.description}</p>}
                      {place.tips && (
                        <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {place.tips}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Place" : "Add Place"}</DialogTitle>
            <DialogDescription>Every officer can browse the guide; Hospitality curates it.</DialogDescription>
          </DialogHeader>
          <form onSubmit={savePlace} className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nike Art Gallery" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="2 Elegushi Rd, Lekki Phase 1" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Why this place is worth a Papa's time…" />
            </div>
            <div className="space-y-2">
              <Label>Protocol tips</Label>
              <Textarea rows={2} value={form.tips} onChange={(e) => setForm({ ...form, tips: e.target.value })} placeholder="Best visiting hours, security notes, reservations…" />
            </div>
            <div className="space-y-2">
              <Label>{editing ? "Add more photos" : "Photos"}</Label>
              <Input type="file" accept="image/*" multiple className="cursor-pointer" onChange={(e) => setForm({ ...form, files: Array.from(e.target.files ?? []) })} />
              {form.files.length > 0 && <p className="text-xs text-muted-foreground">{form.files.length} photo(s) selected</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 gap-2" disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {uploading ? "Saving…" : editing ? "Save Changes" : "Add Place"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
