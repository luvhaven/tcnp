"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { ExternalLink, FileText, FolderOpen, Image as ImageIcon, Link2, NotebookText, Plus, Search, Trash2, Video } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import {
  DEN_BUCKET,
  DEN_REPOSITORY_CATEGORIES,
  DEN_REPOSITORY_CATEGORY_LABEL,
  DEN_REPOSITORY_KEY,
  fileRejection,
  formatBytes,
  kindForMime,
  normalizeLink,
  parseTags,
  storagePathFor,
  toPrefixQuery,
  type DenRepositoryCategory,
  type DenRepositoryItem,
  type DenRepositoryKind,
} from "@/lib/den-repository"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"

type Props = {
  /** Head of November (Den) or a platform admin: manages the repository. */
  canManage: boolean
  currentUserId: string | null
  selectedProgram: string // 'all' or a program id
  programName: string | null
}

type Source = "file" | "link" | "note"

const KIND_ICON: Record<DenRepositoryKind, typeof FileText> = {
  document: FileText, image: ImageIcon, video: Video, link: Link2, note: NotebookText, report: NotebookText,
}
const COLUMNS = "id, title, description, category, kind, storage_path, file_name, mime_type, size_bytes, external_url, body, tags, program_id, source_report_id, created_at"
const EMPTY_FORM = { source: "file" as Source, title: "", description: "", category: "sop" as DenRepositoryCategory, tags: "", link: "", body: "", file: null as File | null, forProgramme: false }

/**
 * The Den's institutional memory. One search box over everything — titles,
 * tags, descriptions, file names and the full text of notes and reports — so
 * what was learned at one programme is found before the next.
 */
export default function DenRepository({ canManage, currentUserId, selectedProgram, programName }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<"all" | DenRepositoryCategory>("all")
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [reading, setReading] = useState<DenRepositoryItem | null>(null)

  const prefixQuery = toPrefixQuery(search)

  const items = useQuery({
    queryKey: [...DEN_REPOSITORY_KEY, "items", prefixQuery, category],
    queryFn: async () => {
      let query = db.from("den_repository_items").select(COLUMNS).order("created_at", { ascending: false }).limit(200)
      if (category !== "all") query = query.eq("category", category)
      if (prefixQuery) query = query.textSearch("search", prefixQuery, { config: "simple" })
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as DenRepositoryItem[]
    },
    placeholderData: previous => previous,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: DEN_REPOSITORY_KEY })

  const addItem = useMutation({
    mutationFn: async () => {
      const base = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        tags: parseTags(form.tags),
        program_id: form.forProgramme && selectedProgram !== "all" ? selectedProgram : null,
        created_by: currentUserId,
      }
      if (form.source === "link") {
        const url = normalizeLink(form.link)
        if (!url) throw new Error("Enter a link that starts with https://")
        const { error } = await db.from("den_repository_items").insert([{ ...base, kind: "link", external_url: url }])
        if (error) throw error
        return
      }
      if (form.source === "note") {
        if (!form.body.trim()) throw new Error("Write the note before saving it.")
        const { error } = await db.from("den_repository_items").insert([{ ...base, kind: "note", body: form.body.trim() }])
        if (error) throw error
        return
      }
      const file = form.file
      if (!file) throw new Error("Choose a file to upload.")
      const rejection = fileRejection(file)
      if (rejection) throw new Error(rejection)
      const path = storagePathFor("library", file.name, crypto.randomUUID())
      const { error: uploadError } = await supabase.storage.from(DEN_BUCKET).upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError
      const { error } = await db.from("den_repository_items").insert([{
        ...base, kind: kindForMime(file.type), storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      }])
      if (error) {
        // Do not leave a file behind that nothing points to.
        await supabase.storage.from(DEN_BUCKET).remove([path])
        throw error
      }
    },
    onSuccess: () => { refresh(); setAddOpen(false); setForm(EMPTY_FORM); toast.success("Added to the repository") },
    onError: (error) => notifyError(error, "Could not add this to the repository"),
  })

  const removeItem = useMutation({
    mutationFn: async (item: DenRepositoryItem) => {
      const { data, error } = await db.from("den_repository_items").delete().eq("id", item.id).select("id")
      if (error) throw error
      if (!data?.length) throw new Error("You are not allowed to remove this.")
      // The record is gone first, so a failed file removal can never leave a broken entry behind.
      if (item.storage_path) await supabase.storage.from(DEN_BUCKET).remove([item.storage_path])
    },
    onSuccess: () => { refresh(); toast.success("Removed from the repository") },
    onError: (error) => notifyError(error, "Could not remove this"),
  })

  const open = async (item: DenRepositoryItem) => {
    if (item.storage_path) {
      const { data, error } = await supabase.storage.from(DEN_BUCKET).createSignedUrl(item.storage_path, 300)
      if (error || !data?.signedUrl) { notifyError(error ?? new Error("no link"), "Could not open this file"); return }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer")
    } else if (item.external_url) {
      window.open(item.external_url, "_blank", "noopener,noreferrer")
    } else {
      setReading(item)
    }
  }

  const list = items.data ?? []
  const filtered = Boolean(prefixQuery) || category !== "all"

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-5 w-5" aria-hidden="true" />
              Repository
            </CardTitle>
            <CardDescription>SOPs, templates, guides, reports, photos and videos. Everything the Den has learned, in one place.</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" className="shrink-0" onClick={() => { setForm(EMPTY_FORM); setAddOpen(true) }}>
              <Plus aria-hidden="true" />
              Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Search the repository"
                placeholder="Search titles, tags, notes and reports"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
              <SelectTrigger className="sm:w-[200px]" aria-label="Filter by kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                {DEN_REPOSITORY_CATEGORIES.map(value => <SelectItem key={value} value={value}>{DEN_REPOSITORY_CATEGORY_LABEL[value]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {items.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
          ) : items.isError ? (
            <ErrorState title="Could not load the repository" onRetry={() => items.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={filtered ? "Nothing matches" : "The repository is empty"}
              description={filtered
                ? "Try fewer or different words, or look in Everything."
                : canManage ? "Start with the documents the team asks for most: the Den SOP, set-up guide and report template." : "The Team Lead adds documents here."}
              action={filtered ? <Button variant="outline" onClick={() => { setSearch(""); setCategory("all") }}>Clear search</Button> : undefined}
              className="py-10"
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(item => {
                const Icon = KIND_ICON[item.kind] ?? FileText
                return (
                  <li key={item.id} className="flex flex-col rounded-xl border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {DEN_REPOSITORY_CATEGORY_LABEL[item.category] ?? item.category}
                          {item.size_bytes ? ` · ${formatBytes(item.size_bytes)}` : ""}
                          {` · ${format(new Date(item.created_at), "d MMM yyyy")}`}
                        </p>
                      </div>
                    </div>
                    {item.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
                    {item.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.tags.slice(0, 5).map(tag => <Badge key={tag} variant="outline" className="font-normal">{tag}</Badge>)}
                      </div>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      <Button size="sm" variant="outline" onClick={() => open(item)}>
                        {item.storage_path || item.external_url ? <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> : null}
                        {item.storage_path ? "Open file" : item.external_url ? "Open link" : "Read"}
                      </Button>
                      {/* A filed report is managed from the Reports tab, where deleting it also removes its media. */}
                      {canManage && !item.source_report_id && (
                        <Button
                          aria-label={`Remove ${item.title}`}
                          variant="ghost" size="icon" className="h-8 w-8"
                          disabled={removeItem.isPending}
                          onClick={async () => { if (await confirm({ message: `Remove "${item.title}" from the repository? This cannot be undone.`, variant: "destructive" })) removeItem.mutate(item) }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add to the repository</DialogTitle>
            <DialogDescription>Upload a file, save a link, or write a note the team can search.</DialogDescription>
          </DialogHeader>
          <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (form.title.trim() && !addItem.isPending) addItem.mutate() }}>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="What are you adding?">
              {(["file", "link", "note"] as Source[]).map(source => (
                <button
                  key={source}
                  type="button"
                  aria-pressed={form.source === source}
                  onClick={() => setForm({ ...form, source })}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${form.source === source ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {source === "note" ? "Written note" : source === "link" ? "Link" : "File"}
                </button>
              ))}
            </div>

            {form.source === "file" && (
              <div className="space-y-2">
                <Label htmlFor="den-repo-file">File *</Label>
                <Input
                  id="den-repo-file"
                  type="file"
                  required
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    setForm({ ...form, file, title: form.title || (file ? file.name.replace(/\.[^.]+$/, "") : "") })
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {form.file ? (fileRejection(form.file) ?? `${form.file.name} · ${formatBytes(form.file.size)}`) : "Documents, photos and videos up to 50 MB each."}
                </p>
              </div>
            )}
            {form.source === "link" && (
              <div className="space-y-2">
                <Label htmlFor="den-repo-link">Link *</Label>
                <Input id="den-repo-link" type="url" required placeholder="https://" value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} />
              </div>
            )}
            {form.source === "note" && (
              <div className="space-y-2">
                <Label htmlFor="den-repo-body">Note *</Label>
                <Textarea id="den-repo-body" required rows={8} maxLength={20000} placeholder="Write the procedure or guidance here. Every word is searchable." value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="den-repo-title">Title *</Label>
              <Input id="den-repo-title" required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="den-repo-category">Kind</Label>
                <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value as DenRepositoryCategory })}>
                  <SelectTrigger id="den-repo-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEN_REPOSITORY_CATEGORIES.filter(value => value !== "report").map(value => <SelectItem key={value} value={value}>{DEN_REPOSITORY_CATEGORY_LABEL[value]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-repo-tags">Tags</Label>
                <Input id="den-repo-tags" placeholder="set-up, catering, wofbec" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="den-repo-description">Description</Label>
              <Input id="den-repo-description" maxLength={300} placeholder="One line on what this is and when to use it" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>
            {selectedProgram !== "all" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.forProgramme} onChange={(event) => setForm({ ...form, forProgramme: event.target.checked })} />
                This belongs to {programName ?? "the selected programme"}
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" pending={addItem.isPending} disabled={!form.title.trim() || (form.source === "file" && (!form.file || Boolean(fileRejection(form.file))))}>
                {form.source === "file" ? "Upload" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reading)} onOpenChange={(isOpen) => { if (!isOpen) setReading(null) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            {reading?.description && <DialogDescription>{reading.description}</DialogDescription>}
          </DialogHeader>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{reading?.body}</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
