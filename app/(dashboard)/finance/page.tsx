"use client"

import { openStoredFile } from '@/lib/save-file'
import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { notifyError } from '@/lib/notify'
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { canAccessFinance } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
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
  Banknote, Upload, Download, Trash2, FileText, Lock, Loader2, FileSpreadsheet, Receipt, FileBarChart, Search,
} from "lucide-react"
import { UPLOAD_RULES, validateUploadFiles } from "@/lib/security/upload-validation"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"

// ─── Singleton client ───
const supabase = createClient()

type FinanceDoc = {
  id: string
  title: string
  category: string
  period: string | null
  program_id: string | null
  storage_path: string
  file_name: string
  file_size: number | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
  programs?: { name: string } | null
  users?: { full_name: string | null } | null
}

const CATEGORIES = [
  { value: "report", label: "Report", icon: FileBarChart },
  { value: "budget", label: "Budget", icon: FileSpreadsheet },
  { value: "receipt", label: "Receipt", icon: Receipt },
  { value: "invoice", label: "Invoice", icon: FileText },
  { value: "statement", label: "Statement", icon: FileText },
  { value: "other", label: "Other", icon: FileText },
]

function formatBytes(bytes: number | null) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FinancePage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const allowed = canAccessFinance(currentUser?.role, currentUser?.has_admin_access)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filterCategory, setFilterCategory] = useState("all")
  const [search, setSearch] = useState("")
  const [form, setForm] = useState({
    title: "",
    category: "report",
    period: "",
    program_id: "",
    notes: "",
    file: null as File | null,
  })

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: allowed,
  })

  const { data: docs = [], isLoading, isError: listFailed, refetch: refetchList, isRefetching: listRetrying } = useQuery({
    queryKey: ["finance-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_documents")
        .select("*, programs(name), users:uploaded_by(full_name)")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as FinanceDoc[]
    },
    enabled: allowed,
  })

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return docs.filter(d =>
      (filterCategory === "all" || d.category === filterCategory) &&
      (!needle || d.title.toLowerCase().includes(needle))
    )
  }, [docs, filterCategory, search])
  const filtersActive = filterCategory !== "all" || search.trim() !== ""
  const clearFilters = () => { setFilterCategory("all"); setSearch("") }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.file || !form.title.trim()) {
      toast.error("Title and file are required")
      return
    }
    const fileError = validateUploadFiles([form.file], UPLOAD_RULES.financeDocument)
    if (fileError) {
      toast.error(fileError)
      return
    }
    setUploading(true)
    try {
      const ext = form.file.name.split(".").pop() || "pdf"
      const path = `${form.category}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from("finance-documents").upload(path, form.file, { contentType: form.file.type })
      if (upErr) throw upErr
      const { error: insErr } = await supabase.from("finance_documents").insert({
        title: form.title.trim(),
        category: form.category,
        period: form.period.trim() || null,
        program_id: form.program_id || null,
        storage_path: path,
        file_name: form.file.name,
        file_size: form.file.size,
        notes: form.notes.trim() || null,
        uploaded_by: currentUser?.id ?? null,
      })
      if (insErr) throw insErr
      toast.success("Document uploaded")
      setDialogOpen(false)
      setForm({ title: "", category: "report", period: "", program_id: "", notes: "", file: null })
      queryClient.invalidateQueries({ queryKey: ["finance-documents"] })
    } catch (err: any) {
      notifyError(err, "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const download = async (doc: FinanceDoc) => {
    try {
      const { data, error } = await supabase.storage.from("finance-documents").createSignedUrl(doc.storage_path, 300)
      if (error || !data?.signedUrl) throw error ?? new Error("Could not create download link")
      await openStoredFile(data.signedUrl, doc.storage_path.split("/").pop() || doc.title)
    } catch (err: any) {
      notifyError(err, "Download failed")
    }
  }

  const deleteMutation = useMutation({
    // The entry goes first: if that fails nothing is lost. Only once it is gone
    // is the stored file removed, so a failed delete never leaves an entry
    // whose download is broken.
    mutationFn: async (doc: FinanceDoc) => {
      const { data, error } = await supabase.from("finance_documents").delete().eq("id", doc.id).select("id")
      if (error) throw error
      if (data && data.length === 0) throw new Error("This document could not be deleted. You may not have permission, or it was already removed.")
      const { error: fileError } = await supabase.storage.from("finance-documents").remove([doc.storage_path])
      return { fileLeft: Boolean(fileError) }
    },
    onSuccess: ({ fileLeft }) => {
      if (fileLeft) toast.warning("Document removed, but its stored file could not be deleted. Ask an admin to tidy up storage.")
      else toast.success("Document removed")
      queryClient.invalidateQueries({ queryKey: ["finance-documents"] })
    },
    onError: (err: any) => notifyError(err, "Delete failed"),
  })

  if (userLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!allowed) {
    return (
      <div className="empty-state">
        <Lock className="h-12 w-12" />
        <h2 className="text-lg font-semibold">Finance — Restricted</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Financial records are limited to Command, Captains, Vice Captains and Admins.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <PageHeader
        icon={Banknote}
        title="Finance"
        badge="Leadership Only"
        description="Financial reports, budgets and receipts — stored privately, downloads via time-limited signed links."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Upload aria-hidden="true" /> Upload Document
          </Button>
        }
      />

      {/* Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 sm:w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles"
            aria-label="Search document titles"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger aria-label="Filter by category" className="h-9 min-w-0 flex-1 sm:w-[170px] sm:flex-none"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="shrink-0 text-sm text-muted-foreground">{filtered.length} document{filtered.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {/* Documents */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : listFailed ? (
        <ErrorState onRetry={() => { void refetchList() }} retrying={listRetrying} />
      ) : filtered.length === 0 && docs.length > 0 && filtersActive ? (
        <EmptyState
          icon={Search}
          title="No documents match these filters"
          description="Try another title or category."
          action={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
          className="rounded-xl border py-10"
        />
      ) : filtered.length === 0 ? (
        <div className="empty-state rounded-xl border">
          <FileText className="h-10 w-10" />
          <p className="font-medium">No documents yet</p>
          <p className="text-sm text-muted-foreground">Upload the first financial report or receipt.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map(doc => {
              const catMeta = CATEGORIES.find(c => c.value === doc.category) ?? CATEGORIES[5]
              return (
                <motion.div key={doc.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Card className="card-hover">
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
                        <catMeta.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{doc.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs uppercase">{catMeta.label}</Badge>
                          {doc.period && <span>{doc.period}</span>}
                          {doc.programs?.name && <span>· {doc.programs.name}</span>}
                          <span>· {doc.file_name}{doc.file_size ? ` (${formatBytes(doc.file_size)})` : ""}</span>
                          {doc.users?.full_name && <span>· by {doc.users.full_name}</span>}
                        </div>
                        {doc.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{doc.notes}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => download(doc)}>
                          <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Download</span>
                        </Button>
                        <Button aria-label={`Delete ${doc.title}`}
                          variant="ghost" size="icon" className="h-9 w-9 text-red-500"
                          pending={deleteMutation.isPending && deleteMutation.variables?.id === doc.id}
                          disabled={deleteMutation.isPending}
                          onClick={async () => {
                            const ok = await confirm({ title: "Delete document?", message: `"${doc.title}" will be permanently removed.`, confirmText: "Delete", variant: "destructive" })
                            if (ok) deleteMutation.mutate(doc)
                          }}
                        >
                          {!(deleteMutation.isPending && deleteMutation.variables?.id === doc.id) && <Trash2 className="h-4 w-4" aria-hidden="true" />}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Financial Document</DialogTitle>
            <DialogDescription>Stored in a private bucket — only leadership can view or download.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="finance-file">File *</Label>
              <Input id="finance-file" type="file" accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,image/*" className="cursor-pointer" required
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance-title">Title *</Label>
              <Input id="finance-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Q2 2026 Operations Budget" required />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="finance-category">Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="finance-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-period">Period</Label>
                <Input id="finance-period" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="e.g. Q2 2026" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance-programme">Programme</Label>
              <Select value={form.program_id || "none"} onValueChange={(v) => setForm({ ...form, program_id: v === "none" ? "" : v })}>
                <SelectTrigger id="finance-programme"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance-notes">Notes</Label>
              <Textarea id="finance-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 gap-2" disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
