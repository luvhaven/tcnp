'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PHOTO_INPUT_ACCEPT, UPLOAD_RULES, validateUploadFiles } from '@/lib/security/upload-validation'
import { preparePhotoForUpload, PHOTO_TOO_LARGE_MESSAGE } from '@/lib/photo-upload'
import { notifyError } from '@/lib/notify'

type PapaPhotoStepProps = {
  papa: { id: string; full_name: string; title?: string | null; profile_photo_url?: string | null }
  onUploaded: (url: string | null) => void
  onDone: () => void
  /** Label for the finish button, e.g. "Skip for now" before a photo exists. */
  doneLabel?: string
}

/** Upload or replace a Papa's profile photo. Shown right after a Papa is created and from the details view. */
export default function PapaPhotoStep({ papa, onUploaded, onDone, doneLabel }: PapaPhotoStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(papa.profile_photo_url ?? null)

  const upload = async (picked: File) => {
    setBusy(true)
    try {
      // Shrink and convert to JPEG in the browser first. The upload passes
      // through a Vercel function, which refuses bodies over 4.5 MB, and a
      // stored HEIC would show as a broken image on Android and Windows.
      const file = await preparePhotoForUpload(picked, { maxSide: 1600, maxBytes: UPLOAD_RULES.functionPhoto.maxBytes })
      const invalid = validateUploadFiles([file], UPLOAD_RULES.functionPhoto)
      if (invalid) {
        toast.error(invalid)
        return
      }
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`/api/papas/${papa.id}/photo`, { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (res.status === 413) throw new Error(PHOTO_TOO_LARGE_MESSAGE)
      if (!res.ok) throw new Error(json.error || 'Failed to upload photo')
      setPhotoUrl(json.profile_photo_url)
      onUploaded(json.profile_photo_url)
      toast.success('Photo saved')
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'UserFacingError') notifyError(error, 'Failed to upload photo')
      else toast.error(error instanceof Error && error.message ? error.message : 'Failed to upload photo')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/papas/${papa.id}/photo`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to remove photo')
      setPhotoUrl(null)
      onUploaded(null)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove photo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div>
        <h3 className="text-lg font-semibold">Add a photo for {papa.title ? `${papa.title} ` : ''}{papa.full_name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Officers use this photo to recognise the Papa at arrival and on stage.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-60"
        aria-label={photoUrl ? 'Replace photo' : 'Choose photo'}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={papa.full_name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm font-medium">
            <Camera className="h-8 w-8" />
            Tap to choose a photo
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin" />
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_INPUT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />

      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy} className="gap-1.5">
          <Upload className="h-4 w-4" />
          {photoUrl ? 'Replace photo' : 'Upload photo'}
        </Button>
        {photoUrl && (
          <Button type="button" variant="ghost" onClick={remove} disabled={busy} className="gap-1.5 text-destructive">
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        )}
        <Button type="button" onClick={onDone} disabled={busy}>
          {photoUrl ? 'Continue' : (doneLabel ?? 'Skip for now')}
        </Button>
      </div>
    </div>
  )
}
