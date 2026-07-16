"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { canAccessFinance } from "@/lib/utils"
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
  Banknote, Upload, Download, Trash2, FileText, Lock, Loader2, FileSpreadsheet, Receipt, FileBarChart,
} from "lucide-react"

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

  const allowed = canAccessFinance(currentUser?.role)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filterCategory, setFilterCategory] = useState("all")
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
      const { data } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      return data ?? []
    },
    enabled: allowed,
  })

  const { data: docs = [], isLoading } = useQuery({
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

  const filtered = useMemo(
    () => docs.filter(d => filterCategory === "all" || d.category === filterCategory),
    [docs, filterCategory]
  )

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.file || !form.title.trim()) {
      toast.error("Title and file are required")
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
      toast.error(err.message || "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const download = async (doc: FinanceDoc) => {
    try {
      const { data, error } = await supabase.storage.from("finance-documents").createSignedUrl(doc.storage_path, 300)
      if (error || !data?.signedUrl) throw error ?? new Error("Could not create download link")
      window.open(data.signedUrl, "_blank", "noopener,noreferrer")
    } catch (err: any) {
      toast.error(err.message || "Download failed")
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (doc: FinanceDoc) => {
      await supabase.storage.from("finance-documents").remove([doc.storage_path])
      const { error } = await supabase.from("finance_documents").delete().eq("id", doc.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Document removed")
      queryClient.invalidateQueries({ queryKey: ["finance-documents"] })
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
      <div className="relative overflow-hidden rounded-2xl border bg-card p-6">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Banknote className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
              <Badge variant="outline" className="text-primary uppercase text-[10px] tracking-wider border-primary/20 bg-primary/5">Leadership Only</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Financial reports, budgets and receipts — stored privately, downloads via time-limited signed links.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Upload Document
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{filtered.length} document{filtered.length === 1 ? "" : "s"}</p>
      </div>

      {/* Documents */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
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
                          <Badge variant="secondary" className="text-[10px] uppercase">{catMeta.label}</Badge>
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
                        <Button
                          variant="ghost" size="icon" className="h-9 w-9 text-red-500"
                          onClick={async () => {
                            const ok = await confirm({ title: "Delete document?", message: `"${doc.title}" will be permanently removed.` })
                            if (ok) deleteMutation.mutate(doc)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
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
              <Label>File *</Label>
              <Input type="file" accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,image/*" className="cursor-pointer" required
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
            </div>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Q2 2026 Operations Budget" required />
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
                <Label>Period</Label>
                <Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="e.g. Q2 2026" />
              </div>
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
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
