"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { canManageCompliance, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import {
  Shirt, Plus, Trash2, Pencil, Sparkles, Scissors, CheckCircle2, ImageIcon, Loader2, CalendarDays,
} from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

type CompliancePost = {
  id: string
  post_type: "grooming" | "outfit_of_day" | "general_outfit"
  title: string
  body: string | null
  image_paths: string[]
  program_id: string | null
  event_date: string | null
  created_at: string
  programs?: { name: string } | null
}

const POST_TYPES = [
  { value: "outfit_of_day", label: "Outfit of the Day", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { value: "general_outfit", label: "General Outfit", color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  { value: "grooming", label: "Grooming Tip", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
]

// Grooming & dress-code standards relocated from the Guide (SOP TCNP.01.02)
const GROOMING_STANDARDS = [
  {
    heading: "Personal Grooming",
    icon: Scissors,
    items: [
      "All Protocol Members must maintain decent haircut / style",
      "All POs must be well manicured and pedicured",
      "All POs must maintain good personal hygiene at all times",
    ],
  },
  {
    heading: "Dress Code",
    icon: Shirt,
    items: [
      "Dress code is as determined for each event",
      "Each member SHALL have the minimum specified numbers of on-duty apparels",
      "On-duty apparels must be the same type and kind — made by approved TCNP stylists",
      "Apparels shall include comfortable black shoes for all POs",
      "Heavy jewelry is unacceptable",
      "Make-up SHALL be moderate for all female POs",
      "Apparels SHALL be clean at all times",
    ],
  },
]

function publicUrl(path: string) {
  return supabase.storage.from("compliance-media").getPublicUrl(path).data.publicUrl
}

export default function CompliancePage() {
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const canEdit = canManageCompliance(currentUser?.role, currentUser?.oscar)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CompliancePost | null>(null)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    post_type: "outfit_of_day",
    title: "",
    body: "",
    program_id: "",
    event_date: new Date().toISOString().slice(0, 10),
    files: [] as File[],
  })

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      return data ?? []
    },
  })

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["compliance-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_posts")
        .select("*, programs(name)")
        .order("created_at", { ascending: false })
        .limit(120)
      if (error) throw error
      return (data ?? []).map((p: any) => ({
        ...p,
        image_paths: Array.isArray(p.image_paths) ? p.image_paths : [],
      })) as CompliancePost[]
    },
  })

  const outfits = useMemo(() => posts.filter(p => p.post_type !== "grooming"), [posts])
  const groomingPosts = useMemo(() => posts.filter(p => p.post_type === "grooming"), [posts])
  const today = new Date().toISOString().slice(0, 10)
  const outfitOfToday = outfits.find(p => p.post_type === "outfit_of_day" && p.event_date === today)

  const savePost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error("Title is required"); return }
    setUploading(true)
    try {
      const imagePaths: string[] = editing ? [...editing.image_paths] : []
      for (const file of form.files) {
        const ext = file.name.split(".").pop() || "jpg"
        const path = `${form.post_type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error } = await supabase.storage.from("compliance-media").upload(path, file, { contentType: file.type })
        if (error) throw error
        imagePaths.push(path)
      }
      const payload = {
        post_type: form.post_type,
        title: form.title.trim(),
        body: form.body.trim() || null,
        image_paths: imagePaths,
        program_id: form.program_id || null,
        event_date: form.event_date || null,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from("compliance_posts").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("compliance_posts").insert({ ...payload, created_by: currentUser?.id ?? null })
        if (error) throw error
      }
      toast.success(editing ? "Post updated" : "Published")
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["compliance-posts"] })
    } catch (err: any) {
      toast.error(err.message || "Failed to save")
    } finally {
      setUploading(false)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (post: CompliancePost) => {
      if (post.image_paths.length > 0) {
        await supabase.storage.from("compliance-media").remove(post.image_paths)
      }
      const { error } = await supabase.from("compliance_posts").delete().eq("id", post.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Post removed")
      queryClient.invalidateQueries({ queryKey: ["compliance-posts"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  })

  const openCreate = (type: string) => {
    setEditing(null)
    setForm({ post_type: type, title: "", body: "", program_id: "", event_date: today, files: [] })
    setDialogOpen(true)
  }

  const openEdit = (post: CompliancePost) => {
    setEditing(post)
    setForm({
      post_type: post.post_type,
      title: post.title,
      body: post.body ?? "",
      program_id: post.program_id ?? "",
      event_date: post.event_date ?? today,
      files: [],
    })
    setDialogOpen(true)
  }

  const PostCard = ({ post, highlight = false }: { post: CompliancePost; highlight?: boolean }) => {
    const meta = POST_TYPES.find(t => t.value === post.post_type) ?? POST_TYPES[0]
    return (
      <Card className={cn("card-hover h-full overflow-hidden", highlight && "border-emerald-500/50 shadow-[0_0_24px_-8px_rgba(16,185,129,0.4)]")}>
        {post.image_paths.length > 0 && (
          <div className={cn("grid gap-0.5", post.image_paths.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {post.image_paths.slice(0, 4).map((path, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={publicUrl(path)} alt={post.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            ))}
          </div>
        )}
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1">
                <Badge className={cn("border-0 text-[10px] uppercase tracking-wide", meta.color)}>{meta.label}</Badge>
                {post.programs?.name && <Badge variant="outline" className="text-[10px]">{post.programs.name}</Badge>}
              </div>
              <p className="mt-1.5 font-medium">{post.title}</p>
              {post.event_date && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3 w-3" /> {post.event_date}
                </p>
              )}
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(post)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                  onClick={async () => {
                    const ok = await confirm({ title: "Delete post?", message: `"${post.title}" will be removed.` })
                    if (ok) deleteMutation.mutate(post)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          {post.body && <p className="text-sm text-muted-foreground">{post.body}</p>}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 p-6 text-white">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shirt className="h-6 w-6 text-emerald-300" />
              <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
              <Badge className="border-0 bg-emerald-500/20 text-emerald-200 uppercase text-[10px] tracking-wider">Grooming & Dress Code</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-300">
              The standard is perfection — outfit of the day, event dress codes and grooming excellence for every officer.
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => openCreate("outfit_of_day")} className="gap-2 bg-emerald-600 hover:bg-emerald-500">
              <Plus className="h-4 w-4" /> New Post
            </Button>
          )}
        </div>
      </div>

      {/* Today's outfit hero */}
      {outfitOfToday && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-4 w-4" /> Today&apos;s Outfit
          </p>
          <div className="max-w-xl">
            <PostCard post={outfitOfToday} highlight />
          </div>
        </motion.div>
      )}

      <Tabs defaultValue="outfits" className="space-y-4">
        <TabsList>
          <TabsTrigger value="outfits"><Shirt className="mr-2 h-4 w-4" />Outfits</TabsTrigger>
          <TabsTrigger value="grooming"><Scissors className="mr-2 h-4 w-4" />Grooming Standards</TabsTrigger>
        </TabsList>

        <TabsContent value="outfits" className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-xl" />)}
            </div>
          ) : outfits.length === 0 ? (
            <div className="empty-state rounded-xl border">
              <ImageIcon className="h-10 w-10" />
              <p className="font-medium">No outfit posts yet</p>
              <p className="text-sm text-muted-foreground">Compliance publishes the outfit of the day and event dress codes here.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {outfits.map(post => (
                  <motion.div key={post.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <PostCard post={post} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        <TabsContent value="grooming" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {GROOMING_STANDARDS.map(section => (
              <Card key={section.heading}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <section.icon className="h-5 w-5 text-primary" /> {section.heading}
                  </CardTitle>
                  <CardDescription>TCNP SOP 01.02 — Prerequisites & Etiquette</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {section.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {groomingPosts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit Tips</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groomingPosts.map(post => <PostCard key={post.id} post={post} />)}
              </div>
            </div>
          )}

          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => openCreate("grooming")} className="gap-1">
              <Plus className="h-4 w-4" /> Add Grooming Tip
            </Button>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Post" : "New Compliance Post"}</DialogTitle>
            <DialogDescription>Outfits and grooming guidance are visible to every officer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={savePost} className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={form.post_type} onValueChange={(v) => setForm({ ...form, post_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POST_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. All-black with brand lapel pin" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Event date</Label>
                <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Program</Label>
                <Select value={form.program_id || "none"} onValueChange={(v) => setForm({ ...form, program_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Details</Label>
              <Textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Fabric, accessories, footwear, exceptions…" />
            </div>
            <div className="space-y-2">
              <Label>{editing ? "Add more images" : "Images"}</Label>
              <Input type="file" accept="image/*" multiple className="cursor-pointer" onChange={(e) => setForm({ ...form, files: Array.from(e.target.files ?? []) })} />
              {form.files.length > 0 && <p className="text-xs text-muted-foreground">{form.files.length} image(s) selected</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 gap-2" disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {uploading ? "Saving…" : editing ? "Save Changes" : "Publish"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
