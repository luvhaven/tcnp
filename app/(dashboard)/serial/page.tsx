"use client"

import { useMemo, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { canAccessSierra, canManageSierra, cn } from "@/lib/utils"
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
import {
  Camera, Upload, Instagram, Trash2, Film, ImageIcon, Lock, Loader2, Link2,
} from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

type MediaAsset = {
  id: string
  program_id: string | null
  papa_id: string | null
  uploaded_by: string
  title: string | null
  caption: string | null
  category: string
  media_type: "image" | "video"
  storage_path: string
  status: "raw" | "editing" | "edited" | "posted"
  instagram_url: string | null
  created_at: string
  programs?: { name: string } | null
  users?: { full_name: string | null } | null
}

const CATEGORIES = [
  { value: "arrival", label: "Arrival" },
  { value: "pickup", label: "Pickup" },
  { value: "eagle_square", label: "Eagle Square" },
  { value: "theatre", label: "Theatre" },
  { value: "bts", label: "Behind the Scenes" },
  { value: "other", label: "Other" },
]

const STATUSES = [
  { value: "raw", label: "Raw", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
  { value: "editing", label: "In Edit", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { value: "edited", label: "Edited", color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  { value: "posted", label: "Posted", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
]

function statusMeta(status: string) {
  return STATUSES.find(s => s.value === status) ?? STATUSES[0]
}

function publicUrl(path: string) {
  return supabase.storage.from("serial-media").getPublicUrl(path).data.publicUrl
}

export default function SerialPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filterProgram, setFilterProgram] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [igEditing, setIgEditing] = useState<MediaAsset | null>(null)
  const [igUrl, setIgUrl] = useState("")
  const [form, setForm] = useState({
    title: "",
    caption: "",
    category: "arrival",
    program_id: "",
    files: [] as File[],
  })

  const allowed = canAccessSierra(currentUser?.role, currentUser?.oscar)
  const canManage = canManageSierra(currentUser?.role, currentUser?.oscar)

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      return data ?? []
    },
    enabled: allowed,
  })

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["serial-media"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("*, programs(name), users:uploaded_by(full_name)")
        .order("created_at", { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as MediaAsset[]
    },
    enabled: allowed,
  })

  const filtered = useMemo(() => assets.filter(a => {
    if (filterProgram !== "all" && a.program_id !== filterProgram) return false
    if (filterCategory !== "all" && a.category !== filterCategory) return false
    if (filterStatus !== "all" && a.status !== filterStatus) return false
    return true
  }), [assets, filterProgram, filterCategory, filterStatus])

  const stats = useMemo(() => ({
    total: assets.length,
    posted: assets.filter(a => a.status === "posted").length,
    inFlight: assets.filter(a => a.status === "editing" || a.status === "edited").length,
  }), [assets])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser || form.files.length === 0) {
      toast.error("Choose at least one photo or video.")
      return
    }
    setUploading(true)
    let ok = 0
    try {
      for (const file of form.files) {
        const isVideo = file.type.startsWith("video/")
        const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")
        const path = `${form.program_id || "untagged"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage.from("serial-media").upload(path, file, { contentType: file.type })
        if (upErr) throw upErr
        const { error: insErr } = await supabase.from("media_assets").insert({
          program_id: form.program_id || null,
          uploaded_by: currentUser.id,
          title: form.title || file.name,
          caption: form.caption || null,
          category: form.category,
          media_type: isVideo ? "video" : "image",
          storage_path: path,
        })
        if (insErr) throw insErr
        ok++
      }
      toast.success(`${ok} asset${ok > 1 ? "s" : ""} uploaded`)
      setUploadOpen(false)
      setForm({ title: "", caption: "", category: "arrival", program_id: "", files: [] })
      queryClient.invalidateQueries({ queryKey: ["serial-media"] })
    } catch (err: any) {
      toast.error(err.message || "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, instagram_url }: { id: string; status?: string; instagram_url?: string | null }) => {
      const updates: any = { updated_at: new Date().toISOString() }
      if (status) updates.status = status
      if (instagram_url !== undefined) {
        updates.instagram_url = instagram_url
        if (instagram_url) updates.status = "posted"
      }
      const { error } = await supabase.from("media_assets").update(updates).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["serial-media"] }),
    onError: (err: any) => toast.error(err.message || "Update failed"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (asset: MediaAsset) => {
      await supabase.storage.from("serial-media").remove([asset.storage_path])
      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Asset deleted")
      queryClient.invalidateQueries({ queryKey: ["serial-media"] })
    },
    onError: (err: any) => toast.error(err.message || "Delete failed"),
  })

  if (userLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!allowed) {
    return (
      <div className="empty-state">
        <Lock className="h-12 w-12" />
        <h2 className="text-lg font-semibold">Serial — Restricted</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          The Serial media room is limited to the Serial unit, Command, Captains and Admins.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-fuchsia-950 via-slate-900 to-slate-900 p-6 text-white">
        <div className="absolute -left-10 -top-16 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Camera className="h-6 w-6 text-fuchsia-300" />
              <h1 className="text-2xl font-bold tracking-tight">Serial</h1>
              <Badge className="bg-fuchsia-500/20 text-fuchsia-200 border-0 uppercase text-[10px] tracking-wider">Social Media Unit</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-300">
              Capture, curate and publish Papa arrivals, pickups and theatre moments — from lens to Instagram.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)} className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-500">
            <Upload className="h-4 w-4" /> Upload Media
          </Button>
        </div>
        <div className="relative z-10 mt-6 grid grid-cols-3 gap-3 max-w-md">
          <div className="rounded-xl bg-white/5 px-4 py-3 backdrop-blur">
            <p className="stat-figure text-2xl font-bold">{stats.total}</p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Assets</p>
          </div>
          <div className="rounded-xl bg-white/5 px-4 py-3 backdrop-blur">
            <p className="stat-figure text-2xl font-bold">{stats.inFlight}</p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">In Pipeline</p>
          </div>
          <div className="rounded-xl bg-white/5 px-4 py-3 backdrop-blur">
            <p className="stat-figure text-2xl font-bold">{stats.posted}</p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Posted</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterProgram} onValueChange={setFilterProgram}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Program" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Gallery */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <ImageIcon className="h-12 w-12" />
          <p className="font-medium">No media yet</p>
          <p className="text-sm text-muted-foreground">Upload the first capture from an arrival or theatre session.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filtered.map((asset, i) => {
              const meta = statusMeta(asset.status)
              return (
                <motion.div
                  key={asset.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.25 }}
                >
                  <Card className="card-hover group overflow-hidden">
                    <div className="relative aspect-video bg-muted">
                      {asset.media_type === "video" ? (
                        <video src={publicUrl(asset.storage_path)} className="h-full w-full object-cover" controls preload="metadata" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={publicUrl(asset.storage_path)} alt={asset.title ?? "Serial media"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                      )}
                      <div className="absolute left-2 top-2 flex gap-1">
                        <Badge className={cn("border-0 text-[10px] uppercase tracking-wide", meta.color)}>{meta.label}</Badge>
                        {asset.media_type === "video" && (
                          <Badge className="border-0 bg-black/60 text-white text-[10px]"><Film className="mr-1 h-3 w-3" />Video</Badge>
                        )}
                      </div>
                    </div>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{asset.title || "Untitled"}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {CATEGORIES.find(c => c.value === asset.category)?.label}
                            {asset.programs?.name ? ` · ${asset.programs.name}` : ""}
                          </p>
                        </div>
                        {asset.instagram_url && (
                          <a href={asset.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:text-pink-400" title="View on Instagram">
                            <Instagram className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      {asset.caption && <p className="line-clamp-2 text-xs text-muted-foreground">{asset.caption}</p>}
                      {canManage && (
                        <div className="flex items-center gap-1 pt-1">
                          <Select value={asset.status} onValueChange={(v) => statusMutation.mutate({ id: asset.id, status: v })}>
                            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Set Instagram link"
                            onClick={() => { setIgEditing(asset); setIgUrl(asset.instagram_url ?? "") }}>
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-red-500 hover:text-red-600" title="Delete"
                            onClick={() => deleteMutation.mutate(asset)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogDescription>Photos and videos are tagged to a program and flow through the edit pipeline.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label>Files (images or videos) *</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="cursor-pointer"
                onChange={(e) => setForm({ ...form, files: Array.from(e.target.files ?? []) })}
              />
              {form.files.length > 0 && (
                <p className="text-xs text-muted-foreground">{form.files.length} file(s) selected</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Papa arrival — Gate 3" />
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
                <Label>Program tag</Label>
                <Select value={form.program_id || "none"} onValueChange={(v) => setForm({ ...form, program_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Untagged" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Untagged</SelectItem>
                    {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Caption</Label>
              <Textarea value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Optional caption for publishing…" rows={2} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 gap-2" disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Instagram URL dialog */}
      <Dialog open={!!igEditing} onOpenChange={(open) => !open && setIgEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instagram Link</DialogTitle>
            <DialogDescription>Paste the published post URL — the asset is marked as Posted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={igUrl} onChange={(e) => setIgUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setIgEditing(null)}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (igEditing) statusMutation.mutate({ id: igEditing.id, instagram_url: igUrl.trim() || null })
                  setIgEditing(null)
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
