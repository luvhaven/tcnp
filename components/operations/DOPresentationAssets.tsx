"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { Download, FileUp, Loader2, Presentation, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const BUCKET = "papa-presentations"
const MAX_FILE_SIZE = 25 * 1024 * 1024

type PresentationAsset = {
  id: string
  title: string
  storage_path: string
  original_name: string
  file_size: number | null
  created_at: string
}

type Props = {
  papaId: string
  programId: string | null
  papaName: string
  canUpload: boolean
}

function fileSize(bytes: number | null) {
  if (!bytes) return ""
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DOPresentationAssets({ papaId, programId, papaName, canUpload }: Props) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [assets, setAssets] = useState<PresentationAsset[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [available, setAvailable] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    let query = (supabase as any)
      .from("presentation_assets")
      .select("id,title,storage_path,original_name,file_size,created_at")
      .eq("papa_id", papaId)
      .order("created_at", { ascending: false })
    query = programId ? query.eq("program_id", programId) : query.is("program_id", null)
    const { data, error } = await query

    if (error) {
      // The screen remains usable during the migration rollout; once the v4
      // migration lands, realtime asset access appears without a client update.
      setAvailable(false)
      setAssets([])
    } else {
      setAvailable(true)
      setAssets((data || []) as PresentationAsset[])
    }
    setLoading(false)
  }, [papaId, programId, supabase])

  useEffect(() => { void load() }, [load])

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null)
  }

  const upload = async () => {
    if (!file || !canUpload) return
    const extension = file.name.split(".").pop()?.toLowerCase()
    if (!extension || !["pdf", "ppt", "pptx"].includes(extension)) {
      toast.error("Choose a PDF, PPT, or PPTX presentation.")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Presentation files must be 25 MB or smaller.")
      return
    }

    setUploading(true)
    let path: string | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Your session has expired. Please sign in again.")
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-")
      // The first segment is the Papa id used by private-bucket RLS.
      path = `${papaId}/${programId || "unassigned"}/${crypto.randomUUID()}-${safeName}`
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined })
      if (storageError) throw storageError

      const { error: recordError } = await (supabase as any).from("presentation_assets").insert({
        papa_id: papaId,
        program_id: programId,
        title: file.name.replace(/\.[^.]+$/, ""),
        storage_path: path,
        original_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        uploaded_by: user.id,
      })
      if (recordError) throw recordError

      toast.success("Presentation uploaded for Victor Oscar.")
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      await load()
    } catch (error: any) {
      if (path) await supabase.storage.from(BUCKET).remove([path])
      toast.error(error?.message || "The presentation could not be uploaded.")
    } finally {
      setUploading(false)
    }
  }

  const download = async (asset: PresentationAsset) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(asset.storage_path, 300, { download: asset.original_name })
    if (error || !data?.signedUrl) {
      toast.error(error?.message || "A secure download link could not be created.")
      return
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  if (!available) return null

  return (
    <Card className="border-primary/15">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Presentation className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm">Presentation handoff</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Securely send {papaName}&apos;s final slides to Victor Oscar.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading presentations…
          </div>
        ) : assets.length > 0 ? (
          <div className="space-y-2">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => void download(asset)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-muted/15 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{asset.title}</span>
                  <span className="text-[10px] text-muted-foreground">{fileSize(asset.file_size) || "Secure file"}</span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            No presentation has been uploaded yet.
          </p>
        )}

        {canUpload && (
          <div className="grid gap-2 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              ref={inputRef}
              type="file"
              accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={selectFile}
              className="h-9 text-xs"
            />
            <Button type="button" size="sm" onClick={() => void upload()} disabled={!file || uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}
              {uploading ? "Uploading…" : "Send to Victor"}
            </Button>
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground sm:col-span-2">
              <ShieldCheck className="h-3 w-3" /> Private file · PDF/PPT/PPTX · 25 MB maximum
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
