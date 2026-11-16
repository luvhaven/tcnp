"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, Download, FileText, ImagePlus, Plus, Trash2, Video } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { downloadReportPdf, loadPdfImage, type ReportPdfImage } from "@/lib/den-report-pdf"
import {
  DEN_BUCKET,
  DEN_REPORTS_KEY,
  DEN_REPORT_SECTIONS,
  DEN_REPORT_TYPE_LABEL,
  DEN_REPOSITORY_KEY,
  fileRejection,
  formatBytes,
  kindForMime,
  reportGaps,
  storagePathFor,
  type DenReport,
  type DenReportSectionKey,
  type DenReportType,
} from "@/lib/den-repository"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"

type Props = {
  selectedProgram: string // 'all' or a program id
  programName: string | null
  programs: { id: string; name: string }[]
  /** Head, sub-lead or platform admin: opens the official report, edits any. */
  canCoordinate: boolean
  /** Head or platform admin: deletes reports and media. */
  canManage: boolean
  /** A Den member (may write a field report for a programme they are on). */
  isMember: boolean
  currentUserId: string | null
}

type ReportRow = DenReport & { author: { full_name: string | null } | null }
type Media = { id: string; report_id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; caption: string | null; uploaded_by: string | null; url?: string | null }
type Outstanding = { program_id: string; program_name: string; end_date: string | null; has_draft: boolean }
type Draft = { title: string } & Record<DenReportSectionKey, string>

const COLUMNS = "id, program_id, report_type, title, status, summary, what_went_well, what_did_not_go_well, guest_feedback, recommendations, lessons_learned, created_by, submitted_at, created_at, updated_at, author:users!den_reports_created_by_fkey(full_name)"
const blankDraft = (title = ""): Draft => ({ title, summary: "", what_went_well: "", what_did_not_go_well: "", guest_feedback: "", recommendations: "", lessons_learned: "" })
const toDraft = (report: DenReport): Draft => ({
  title: report.title,
  ...Object.fromEntries(DEN_REPORT_SECTIONS.map(section => [section.key, report[section.key] ?? ""])) as Record<DenReportSectionKey, string>,
})

/**
 * Post-operation reporting. A report is written in sections, carries photos
 * and videos, and on submission is published to the Den and filed in the
 * repository by the database — there is no approval step and nothing to
 * remember to do afterwards.
 */
export default function DenReports({ selectedProgram, programName, programs, canCoordinate, canManage, isMember, currentUserId }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const scoped = selectedProgram !== "all"

  const [editor, setEditor] = useState<{ report: ReportRow | null; type: DenReportType; programId: string } | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft())
  const [exporting, setExporting] = useState(false)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DEN_REPORTS_KEY })
    queryClient.invalidateQueries({ queryKey: DEN_REPOSITORY_KEY })
  }
  const nameOfProgram = (id: string) => programs.find(program => program.id === id)?.name ?? null

  const reports = useQuery({
    queryKey: [...DEN_REPORTS_KEY, "list", selectedProgram],
    queryFn: async () => {
      let query = db.from("den_reports").select(COLUMNS).order("created_at", { ascending: false }).limit(100)
      if (scoped) query = query.eq("program_id", selectedProgram)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ReportRow[]
    },
  })

  const outstanding = useQuery({
    queryKey: [...DEN_REPORTS_KEY, "outstanding"],
    queryFn: async () => {
      const { data, error } = await db.rpc("den_outstanding_reports")
      if (error) throw error
      return (data ?? []) as Outstanding[]
    },
  })

  const reportId = editor?.report?.id ?? null
  const media = useQuery({
    queryKey: [...DEN_REPORTS_KEY, "media", reportId],
    enabled: Boolean(reportId),
    queryFn: async () => {
      const { data, error } = await db.from("den_report_media")
        .select("id, report_id, storage_path, file_name, mime_type, size_bytes, caption, uploaded_by")
        .eq("report_id", reportId).order("created_at")
      if (error) throw error
      const rows = (data ?? []) as Media[]
      if (rows.length === 0) return rows
      const { data: signed } = await supabase.storage.from(DEN_BUCKET).createSignedUrls(rows.map(row => row.storage_path), 3600)
      const urlByPath = new Map((signed ?? []).map(entry => [entry.path, entry.signedUrl]))
      return rows.map(row => ({ ...row, url: urlByPath.get(row.storage_path) ?? null }))
    },
  })

  const report = editor?.report ?? null
  const readOnly = Boolean(report) && !(canCoordinate || report?.created_by === currentUserId)
  const submitted = report?.status === "submitted"
  const gaps = editor ? reportGaps(draft, editor.type) : []

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      if (!editor) throw new Error("No report is open.")
      const values = {
        title: draft.title.trim(),
        ...Object.fromEntries(DEN_REPORT_SECTIONS.map(section => [section.key, draft[section.key].trim() || null])),
        ...(submit ? { status: "submitted" } : {}),
      }
      if (editor.report) {
        const { data, error } = await db.from("den_reports").update(values).eq("id", editor.report.id).select(COLUMNS)
        if (error) throw error
        if (!data?.length) throw new Error("You are not allowed to change this report.")
        return { saved: data[0] as ReportRow, submit }
      }
      const { data, error } = await db.from("den_reports")
        .insert([{ ...values, program_id: editor.programId, report_type: editor.type, created_by: currentUserId }])
        .select(COLUMNS).single()
      if (error) {
        if (error.code === "23505") throw new Error("This programme already has a post-operation report. Open it from the list.")
        throw error
      }
      return { saved: data as ReportRow, submit }
    },
    onSuccess: ({ saved, submit }) => {
      refresh()
      if (submit) {
        setEditor(null)
        toast.success("Report submitted and filed in the repository")
      } else {
        // Stay in the editor: a saved draft is what unlocks adding photos and videos.
        setEditor(current => current ? { ...current, report: saved } : current)
        toast.success(submitted ? "Report updated" : "Draft saved")
      }
    },
    onError: (error) => notifyError(error, "Could not save this report"),
  })

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!reportId) throw new Error("Save the draft first.")
      for (const file of files) {
        const rejection = fileRejection(file, { mediaOnly: true })
        if (rejection) throw new Error(rejection)
      }
      for (const file of files) {
        const path = storagePathFor({ reportId }, file.name, crypto.randomUUID())
        const { error: uploadError } = await supabase.storage.from(DEN_BUCKET).upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        const { error } = await db.from("den_report_media").insert([{
          report_id: reportId, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: currentUserId,
        }])
        if (error) {
          await supabase.storage.from(DEN_BUCKET).remove([path])
          throw error
        }
      }
      return files.length
    },
    onSuccess: (count) => { queryClient.invalidateQueries({ queryKey: [...DEN_REPORTS_KEY, "media"] }); toast.success(count === 1 ? "File added" : `${count} files added`) },
    onError: (error) => { queryClient.invalidateQueries({ queryKey: [...DEN_REPORTS_KEY, "media"] }); notifyError(error, "Could not add this file") },
  })

  const setCaption = useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const { error } = await db.from("den_report_media").update({ caption: caption.trim() || null }).eq("id", id)
      if (error) throw error
    },
    onError: (error) => notifyError(error, "Could not save this caption"),
  })

  const removeMedia = useMutation({
    mutationFn: async (item: Media) => {
      const { data, error } = await db.from("den_report_media").delete().eq("id", item.id).select("id")
      if (error) throw error
      if (!data?.length) throw new Error("Only the Team Lead or the person who added this can remove it.")
      await supabase.storage.from(DEN_BUCKET).remove([item.storage_path])
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [...DEN_REPORTS_KEY, "media"] }); toast.success("Removed") },
    onError: (error) => notifyError(error, "Could not remove this"),
  })

  const removeReport = useMutation({
    mutationFn: async (target: ReportRow) => {
      const { data: files } = await db.from("den_report_media").select("storage_path").eq("report_id", target.id)
      const { data, error } = await db.from("den_reports").delete().eq("id", target.id).select("id")
      if (error) throw error
      if (!data?.length) throw new Error("You are not allowed to delete this report.")
      const paths = (files ?? []).map((row: { storage_path: string }) => row.storage_path)
      if (paths.length) await supabase.storage.from(DEN_BUCKET).remove(paths)
    },
    onSuccess: () => { refresh(); setEditor(null); toast.success("Report deleted") },
    onError: (error) => notifyError(error, "Could not delete this report"),
  })

  const openNew = (type: DenReportType, programId: string) => {
    const label = nameOfProgram(programId)
    setDraft(blankDraft(type === "post_operation" ? `Post-operation report${label ? ` — ${label}` : ""}` : ""))
    setEditor({ report: null, type, programId })
  }
  const openExisting = (target: ReportRow) => {
    setDraft(toDraft(target))
    setEditor({ report: target, type: target.report_type, programId: target.program_id })
  }

  const exportPdf = async () => {
    if (!report) return
    setExporting(true)
    try {
      const files = media.data ?? []
      const images = (await Promise.all(
        files.filter(file => file.url && kindForMime(file.mime_type) === "image").slice(0, 8)
          .map(file => loadPdfImage(file.url as string, file.mime_type, file.caption)),
      )).filter((image): image is ReportPdfImage => Boolean(image))
      await downloadReportPdf({
        report: { ...report, ...draft, title: draft.title },
        programName: nameOfProgram(report.program_id),
        authorName: report.author?.full_name ?? null,
        images,
        // Videos cannot go in a PDF, so they are listed by name instead.
        otherMedia: files.filter(file => kindForMime(file.mime_type) === "video").map(file => file.file_name),
      })
    } catch (error) {
      notifyError(error, "Could not create the PDF")
    } finally {
      setExporting(false)
    }
  }

  const list = reports.data ?? []
  const owed = (outstanding.data ?? []).filter(row => !scoped || row.program_id === selectedProgram)
  const officialExists = scoped && list.some(row => row.report_type === "post_operation")

  return (
    <div className="space-y-6">
      {owed.length > 0 && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{owed.length === 1 ? "A post-operation report is outstanding" : `${owed.length} post-operation reports are outstanding`}</p>
              <p className="text-sm text-muted-foreground">{owed.map(row => row.program_name).join(", ")}</p>
            </div>
          </div>
          {canCoordinate && owed.length === 1 && !owed[0].has_draft && (
            <Button size="sm" className="shrink-0" onClick={() => openNew("post_operation", owed[0].program_id)}>Write it now</Button>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <FileText className="h-5 w-5" aria-hidden="true" />
              Reports
              {programName && <Badge variant="outline">{programName}</Badge>}
            </CardTitle>
            <CardDescription>What happened, what to change, and what the next team should know. A submitted report is filed in the repository automatically.</CardDescription>
          </div>
          {scoped && (canCoordinate || isMember) && (
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {isMember && (
                <Button size="sm" variant="outline" onClick={() => openNew("field", selectedProgram)}>
                  <Plus aria-hidden="true" />
                  Field report
                </Button>
              )}
              {canCoordinate && !officialExists && (
                <Button size="sm" onClick={() => openNew("post_operation", selectedProgram)}>
                  <Plus aria-hidden="true" />
                  Post-operation report
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {reports.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)}</div>
          ) : reports.isError ? (
            <ErrorState title="Could not load reports" onRetry={() => reports.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={scoped ? "No reports for this programme yet" : "No reports yet"}
              description={scoped ? "The post-operation report is written once the programme ends. Officers can add field reports at any time." : "Choose a programme above to write one."}
              className="py-8"
            />
          ) : (
            <ul className="divide-y rounded-xl border">
              {list.map(row => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => openExisting(row)}
                    className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block truncate text-sm font-medium">{row.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {DEN_REPORT_TYPE_LABEL[row.report_type]}
                        {!scoped && nameOfProgram(row.program_id) ? ` · ${nameOfProgram(row.program_id)}` : ""}
                        {row.author?.full_name ? ` · ${row.author.full_name}` : ""}
                        {` · ${format(new Date(row.submitted_at ?? row.created_at), "d MMM yyyy")}`}
                      </span>
                    </span>
                    <Badge variant={row.status === "submitted" ? "secondary" : "outline"} className="shrink-0">
                      {row.status === "submitted" ? "Submitted" : "Draft"}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null) }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          {editor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {DEN_REPORT_TYPE_LABEL[editor.type]}
                  {report && <Badge variant={submitted ? "secondary" : "outline"}>{submitted ? "Submitted" : "Draft"}</Badge>}
                </DialogTitle>
                <DialogDescription>
                  {nameOfProgram(editor.programId) ?? "Programme"}
                  {report?.author?.full_name ? ` · written by ${report.author.full_name}` : ""}
                  {report?.submitted_at ? ` · submitted ${format(new Date(report.submitted_at), "d MMM yyyy")}` : ""}
                </DialogDescription>
              </DialogHeader>

              <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (!readOnly && draft.title.trim() && !save.isPending) save.mutate(false) }}>
                <div className="space-y-2">
                  <Label htmlFor="den-report-title">Title *</Label>
                  <Input id="den-report-title" required maxLength={200} readOnly={readOnly} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                </div>
                {DEN_REPORT_SECTIONS.map(section => (
                  <div key={section.key} className="space-y-1.5">
                    <Label htmlFor={`den-report-${section.key}`}>{section.label}</Label>
                    {readOnly ? (
                      <p className="whitespace-pre-line rounded-md border bg-muted/40 p-3 text-sm">{draft[section.key] || <span className="text-muted-foreground">Nothing recorded.</span>}</p>
                    ) : (
                      <Textarea
                        id={`den-report-${section.key}`}
                        rows={section.key === "summary" ? 3 : 4}
                        maxLength={6000}
                        placeholder={section.hint}
                        value={draft[section.key]}
                        onChange={(event) => setDraft({ ...draft, [section.key]: event.target.value })}
                      />
                    )}
                  </div>
                ))}

                <section className="space-y-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Photos and videos</h3>
                    {report && !readOnly && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
                        <ImagePlus className="h-4 w-4" aria-hidden="true" />
                        {upload.isPending ? "Uploading…" : "Add"}
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
                          className="sr-only"
                          disabled={upload.isPending}
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? [])
                            event.target.value = ""
                            if (files.length) upload.mutate(files)
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {!report ? (
                    <p className="text-sm text-muted-foreground">Save the draft first, then add photos and videos (up to 50 MB each).</p>
                  ) : media.isLoading ? (
                    <Skeleton className="h-24 rounded-lg" />
                  ) : (media.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No media attached.</p>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {(media.data ?? []).map(item => {
                        const kind = kindForMime(item.mime_type)
                        return (
                          <li key={item.id} className="space-y-2 rounded-lg border p-2">
                            {item.url && kind === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket; the image optimiser cannot fetch it
                              <img src={item.url} alt={item.caption ?? item.file_name} className="h-40 w-full rounded-md object-cover" />
                            ) : item.url && kind === "video" ? (
                              <video src={item.url} controls preload="metadata" className="h-40 w-full rounded-md bg-black object-contain" />
                            ) : (
                              <div className="flex h-40 items-center justify-center rounded-md bg-muted text-muted-foreground"><Video className="h-6 w-6" aria-hidden="true" /></div>
                            )}
                            <div className="flex items-center gap-2">
                              {readOnly ? (
                                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.caption ?? item.file_name}</p>
                              ) : (
                                <Input
                                  aria-label={`Caption for ${item.file_name}`}
                                  placeholder="Caption"
                                  className="h-8 text-xs"
                                  maxLength={200}
                                  defaultValue={item.caption ?? ""}
                                  onBlur={(event) => { if (event.target.value.trim() !== (item.caption ?? "")) setCaption.mutate({ id: item.id, caption: event.target.value }) }}
                                />
                              )}
                              {(canManage || item.uploaded_by === currentUserId) && (
                                <Button
                                  type="button"
                                  aria-label={`Remove ${item.file_name}`}
                                  variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                                  onClick={async () => { if (await confirm({ message: `Remove ${item.file_name}? This cannot be undone.`, variant: "destructive" })) removeMedia.mutate(item) }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{formatBytes(item.size_bytes)}</p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                {!readOnly && !submitted && gaps.length > 0 && (
                  <p className="text-sm text-muted-foreground">Still needed before submitting: {gaps.join(", ")}.</p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {report && (
                      <Button type="button" variant="outline" pending={exporting} onClick={exportPdf}>
                        {!exporting && <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                        PDF
                      </Button>
                    )}
                    {report && (canManage || (report.created_by === currentUserId && !submitted)) && (
                      <Button
                        type="button" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={async () => { if (await confirm({ message: `Delete "${report.title}" and its media? This cannot be undone.`, variant: "destructive" })) removeReport.mutate(report) }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                  {readOnly ? (
                    <Button type="button" variant="outline" onClick={() => setEditor(null)}>Close</Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button type="submit" variant={submitted ? "default" : "outline"} pending={save.isPending && save.variables === false} disabled={!draft.title.trim() || save.isPending}>
                        {submitted ? "Save changes" : "Save draft"}
                      </Button>
                      {!submitted && (
                        <Button
                          type="button"
                          pending={save.isPending && save.variables === true}
                          disabled={gaps.length > 0 || save.isPending}
                          onClick={async () => {
                            if (await confirm({ message: "Submit this report? It will be visible to the whole Den and leadership, and filed in the repository." })) save.mutate(true)
                          }}
                        >
                          Submit report
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
