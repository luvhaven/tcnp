"use client"

import { Suspense, useMemo, useRef, useState } from "react"
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { notifyError } from '@/lib/notify'
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import {
  SERIAL_SIGNED_URL_BATCH, SERIAL_SIGNED_URL_REFRESH_MS, SERIAL_SIGNED_URL_SECONDS, chunk, serialPermissions,
  serialStoragePaths, signedUrlMap,
} from "@/lib/site-unit-permissions"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
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
  Camera, Upload, Instagram, Trash2, Film, ImageIcon, Lock, Loader2, Link2, ClipboardList, UsersRound,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import UnitTasks from "@/components/units/UnitTasks"
import UnitProgrammeTeam from "@/components/units/UnitProgrammeTeam"
import { canSeeUnitWork, useAddressTab } from "@/components/units/unit-work-tabs"
import { uploadErrorForUser } from "@/lib/headshot-image"
import { describeBatchUpload, UPLOAD_RULES, validateUploadFiles } from "@/lib/security/upload-validation"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { useConfirm } from "@/components/providers/ConfirmProvider"

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

/**
 * 'serial-media' is a private bucket (raw, unapproved capture), so files are
 * shown through short-lived signed URLs, signed in batches and refreshed
 * before they expire. The storage SELECT policy admits the same people as
 * media_assets: Serial members, Command and admins.
 */
async function signSerialPaths(paths: string[]): Promise<Record<string, string>> {
  const batches = await Promise.all(chunk(paths, SERIAL_SIGNED_URL_BATCH).map(async (batch) => {
    const { data, error } = await supabase.storage.from("serial-media").createSignedUrls(batch, SERIAL_SIGNED_URL_SECONDS)
    if (error) throw error
    return signedUrlMap(data as any)
  }))
  return Object.assign({}, ...batches)
}

/** Only published Instagram links: https on instagram.com (any subdomain) or instagr.am. */
function isInstagramUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return false
    const host = url.hostname.toLowerCase()
    return host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am" || host.endsWith(".instagr.am")
  } catch {
    return false
  }
}

export default function SerialPage() {
  // useSearchParams (?tab=) needs a Suspense boundary so the page can still prerender.
  return (
    <Suspense fallback={<SerialLoading />}>
      <SerialContent />
    </Suspense>
  )
}

function SerialLoading() {
  return <div className="flex items-center justify-center py-24" role="status" aria-busy="true" aria-label="Loading Serial"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" /></div>
}

function SerialContent() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  /** Files finished out of the batch, shown while uploading and after a partial failure. */
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [filterProgram, setFilterProgram] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [igEditing, setIgEditing] = useState<MediaAsset | null>(null)
  const [igUrl, setIgUrl] = useState("")
  const [igError, setIgError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: "",
    caption: "",
    category: "arrival",
    program_id: "",
    files: [] as File[],
  })

  // One rule: Serial access comes from membership only (plus Command and
  // admins). Each flag mirrors the media_assets / serial-media policies.
  const serial = useUnitAccess("serial")
  const permissions = serialPermissions(serial, currentUser?.id)
  const allowed = permissions.canView
  // Tasks and Programme team: Serial members and Command (the components decide who edits).
  const canSeeWork = canSeeUnitWork(serial)
  const [pageTab, selectPageTab] = useAddressTab(canSeeWork ? ["media", "tasks", "team"] : ["media"])

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: allowed,
  })

  const { data: assets = [], isLoading, isError: listFailed, refetch: refetchList, isRefetching: listRetrying } = useQuery({
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

  const storagePaths = useMemo(() => serialStoragePaths(assets), [assets])
  const signedUrls = useQuery({
    // Outside the ["serial-media"] prefix, so editing an asset does not re-sign
    // (and reload) every file; only a new path set or the refresh does.
    queryKey: ["serial-media-urls", storagePaths],
    queryFn: () => signSerialPaths(storagePaths),
    enabled: allowed && storagePaths.length > 0,
    staleTime: SERIAL_SIGNED_URL_REFRESH_MS,
    refetchInterval: SERIAL_SIGNED_URL_REFRESH_MS,
    // Keep showing the last URLs while new ones are signed.
    placeholderData: keepPreviousData,
  })
  const mediaUrl = (path: string) => signedUrls.data?.[path] ?? null

  const filtered = useMemo(() => assets.filter(a => {
    if (filterProgram !== "all" && a.program_id !== filterProgram) return false
    if (filterCategory !== "all" && a.category !== filterCategory) return false
    if (filterStatus !== "all" && a.status !== filterStatus) return false
    return true
  }), [assets, filterProgram, filterCategory, filterStatus])

  const filtersActive = filterProgram !== "all" || filterCategory !== "all" || filterStatus !== "all"
  const clearFilters = () => {
    setFilterProgram("all")
    setFilterCategory("all")
    setFilterStatus("all")
  }


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
    const fileError = validateUploadFiles(form.files, UPLOAD_RULES.media)
    if (fileError) {
      toast.error(fileError)
      return
    }
    setUploading(true)
    // Each file leaves form.files as soon as it is stored and recorded, so a
    // retry after a partial failure sends only what is left (no duplicates).
    const batch = [...form.files]
    let ok = 0
    setUploadProgress({ done: 0, total: batch.length })
    try {
      for (const file of batch) {
        const isVideo = file.type.startsWith("video/")
        const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "")
        const path = `${form.program_id || "untagged"}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from("serial-media").upload(path, file, { contentType: file.type })
        if (upErr) throw uploadErrorForUser(upErr)
        const { error: insErr } = await supabase.from("media_assets").insert({
          program_id: form.program_id || null,
          uploaded_by: currentUser.id,
          title: form.title || file.name,
          caption: form.caption || null,
          category: form.category,
          media_type: isVideo ? "video" : "image",
          storage_path: path,
        })
        if (insErr) {
          // Do not leave an orphaned file behind a failed record.
          await supabase.storage.from("serial-media").remove([path])
          throw insErr
        }
        ok++
        setForm(current => ({ ...current, files: current.files.filter(f => f !== file) }))
        setUploadProgress({ done: ok, total: batch.length })
      }
      toast.success(describeBatchUpload(ok, batch.length))
      setUploadOpen(false)
      setUploadProgress(null)
      setForm({ title: "", caption: "", category: "arrival", program_id: "", files: [] })
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (err: any) {
      notifyError(err, "Upload failed", { description: describeBatchUpload(ok, batch.length) })
    } finally {
      setUploading(false)
      if (ok > 0) void queryClient.invalidateQueries({ queryKey: ["serial-media"] })
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
    onError: (err: any) => notifyError(err, "Update failed"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (asset: MediaAsset) => {
      // Delete the record first: if that fails nothing changes; if removing the
      // file fails afterwards it is only an orphaned file, never a broken listing.
      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id)
      if (error) throw error
      const { error: storageError } = await supabase.storage.from("serial-media").remove([asset.storage_path])
      if (storageError) console.warn("Serial asset file was not removed:", storageError.message)
    },
    onSuccess: () => {
      toast.success("Asset deleted")
      queryClient.invalidateQueries({ queryKey: ["serial-media"] })
    },
    onError: (err: any) => notifyError(err, "Delete failed"),
  })

  const openInstagramEditor = (asset: MediaAsset) => {
    setIgEditing(asset)
    setIgUrl(asset.instagram_url ?? "")
    setIgError(null)
  }

  const saveInstagramLink = () => {
    if (!igEditing) return
    const value = igUrl.trim()
    // An empty field clears the link, as before.
    if (value && !isInstagramUrl(value)) {
      setIgError("Paste the full https link to the post on instagram.com (or instagr.am).")
      return
    }
    statusMutation.mutate({ id: igEditing.id, instagram_url: value || null })
    setIgEditing(null)
  }

  const confirmDelete = async (asset: MediaAsset) => {
    const ok = await confirm({
      title: "Delete this media?",
      message: `"${asset.title || "Untitled"}" and its file will be permanently removed. This cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    })
    if (ok) deleteMutation.mutate(asset)
  }

  if (userLoading || serial.isLoading) {
    return <div className="flex items-center justify-center py-24" aria-busy="true" aria-label="Loading Serial"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!allowed && serial.loadFailed) {
    return (
      <ErrorState
        title="Could not check your unit access"
        description="Serial opens once your membership loads."
        onRetry={() => { void queryClient.invalidateQueries({ queryKey: ["unit-access"] }) }}
      />
    )
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
      <PageHeader
        icon={Camera}
        title="Serial"
        badge="Social Media Unit"
        description="Capture, curate and publish Papa arrivals, pickups and theatre moments — from lens to Instagram."
        actions={permissions.canUpload && (
          <Button className="min-h-11 sm:min-h-9" onClick={() => setUploadOpen(true)}>
            <Upload aria-hidden="true" /> Upload Media
          </Button>
        )}
      />

      <Tabs value={pageTab} onValueChange={selectPageTab} className="space-y-6">
        {canSeeWork && (
          <TabsList className="grid h-auto w-full max-w-xl grid-cols-3 gap-1 p-1">
            <TabsTrigger value="media" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Media</TabsTrigger>
            <TabsTrigger value="tasks" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Tasks</TabsTrigger>
            <TabsTrigger value="team" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Programme team</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="media" className="space-y-6">
      <StatGrid columns={3}>
        <StatCard label="Assets" value={stats.total} />
        <StatCard label="In Pipeline" value={stats.inFlight} tone="info" />
        <StatCard label="Posted" value={stats.posted} tone="success" />
      </StatGrid>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterProgram} onValueChange={setFilterProgram}>
          <SelectTrigger className="w-full sm:w-[180px] h-9"><SelectValue placeholder="Program" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-[170px] h-9"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
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
      ) : listFailed ? (
        <ErrorState onRetry={() => { void refetchList() }} retrying={listRetrying} />
      ) : filtered.length === 0 ? (
        filtersActive && assets.length > 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="No media matches these filters"
            description="Try a different program, category or status."
            action={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <EmptyState
            icon={ImageIcon}
            title="No media yet"
            description="Upload the first capture from an arrival or theatre session."
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filtered.map((asset, i) => {
              const meta = statusMeta(asset.status)
              const src = mediaUrl(asset.storage_path)
              const canEdit = permissions.canEditAsset(asset)
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
                      {!src ? (
                        signedUrls.isError ? (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground" role="status">
                            <ImageIcon className="h-6 w-6" aria-hidden="true" />
                            Preview could not load.
                            <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={() => { void signedUrls.refetch() }}>
                              Try again
                            </Button>
                          </div>
                        ) : signedUrls.isFetching ? (
                          <div className="skeleton h-full w-full" aria-hidden="true" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground" role="status">
                            <ImageIcon className="mr-1.5 h-4 w-4" aria-hidden="true" /> File not found
                          </div>
                        )
                      ) : asset.media_type === "video" ? (
                        <video src={src} className="h-full w-full object-cover" controls preload="metadata" aria-label={asset.title ?? "Serial video"} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={asset.title ?? "Serial media"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                      )}
                      <div className="absolute left-2 top-2 flex gap-1">
                        <Badge className={cn("border-0 text-xs uppercase tracking-wide", meta.color)}>{meta.label}</Badge>
                        {asset.media_type === "video" && (
                          <Badge className="border-0 bg-black/60 text-white text-xs"><Film className="mr-1 h-3 w-3" />Video</Badge>
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
                          {asset.users?.full_name && (
                            <p className="truncate text-xs text-muted-foreground">by {asset.users.full_name}</p>
                          )}
                        </div>
                        {asset.instagram_url && (
                          <a href={asset.instagram_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-pink-500 hover:text-pink-400" title="View on Instagram" aria-label="View on Instagram">
                            <Instagram className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      {asset.caption && <p className="line-clamp-2 text-xs text-muted-foreground">{asset.caption}</p>}
                      {(canEdit || permissions.canDelete) && (
                        <div className="flex items-center gap-1 pt-1">
                          {canEdit && (
                            <>
                              <Select value={asset.status} onValueChange={(v) => statusMutation.mutate({ id: asset.id, status: v })}>
                                <SelectTrigger className="h-11 w-[120px] text-xs sm:h-8" aria-label={`Status of ${asset.title || "this asset"}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button aria-label={`Set Instagram link for ${asset.title || "this asset"}`} variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8" title="Set Instagram link"
                                onClick={() => openInstagramEditor(asset)}>
                                <Link2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {permissions.canDelete && (
                            <Button aria-label={`Delete ${asset.title || "asset"}`} variant="ghost" size="icon" className="ml-auto h-11 w-11 text-red-500 hover:text-red-600 sm:h-8 sm:w-8" title="Delete"
                              disabled={deleteMutation.isPending}
                              onClick={() => { void confirmDelete(asset) }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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
        </TabsContent>

        {canSeeWork && (
          <>
            <TabsContent value="tasks" className="space-y-6">
              <UnitTasks unitSlug="serial" />
            </TabsContent>
            <TabsContent value="team" className="space-y-6">
              <UnitProgrammeTeam unitSlug="serial" />
            </TabsContent>
          </>
        )}
      </Tabs>

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
                onChange={(e) => { setUploadProgress(null); setForm({ ...form, files: Array.from(e.target.files ?? []) }) }}
              />
              {form.files.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {uploadProgress && uploadProgress.done > 0
                    ? `${uploadProgress.done} of ${uploadProgress.total} uploaded · ${form.files.length} left to upload`
                    : `${form.files.length} file(s) selected`}
                </p>
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
                {uploading
                  ? `Uploading ${Math.min((uploadProgress?.done ?? 0) + 1, uploadProgress?.total ?? 1)} of ${uploadProgress?.total ?? 1}…`
                  : uploadProgress && uploadProgress.done > 0 ? "Upload the rest" : "Upload"}
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
          <form
            className="space-y-3"
            noValidate
            onSubmit={(e) => { e.preventDefault(); saveInstagramLink() }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="serial-instagram-url" className="sr-only">Instagram post link</Label>
              <Input
                id="serial-instagram-url"
                type="url"
                inputMode="url"
                value={igUrl}
                onChange={(e) => { setIgUrl(e.target.value); if (igError) setIgError(null) }}
                placeholder="https://www.instagram.com/p/…"
                aria-invalid={igError ? true : undefined}
                aria-describedby={igError ? "serial-instagram-url-error" : undefined}
              />
              {igError ? (
                <p id="serial-instagram-url-error" role="alert" className="text-xs text-destructive">{igError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Leave empty to remove the link.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIgEditing(null)}>Cancel</Button>
              <Button type="submit" className="flex-1">
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
