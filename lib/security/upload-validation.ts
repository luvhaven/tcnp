/**
 * Client-side upload rules. These mirror the `allowed_mime_types` and
 * `file_size_limit` set on each storage bucket, so a bad file is rejected
 * with a clear message before it reaches Supabase (which enforces the same
 * limits server-side).
 */

const MB = 1024 * 1024

/**
 * Photo types every browser can display. HEIC/HEIF are deliberately absent:
 * Chrome, Android WebView and Edge cannot render them, so a stored HEIC shows
 * as a broken image for most officers. Photo uploads convert to JPEG in the
 * browser first (lib/photo-upload.ts); anything left over is refused with
 * plain guidance instead of being stored broken.
 */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

/** iPhone (and some Samsung) camera formats. Only archives that keep originals accept them. */
export const HEIC_MIME_TYPES = ['image/heic', 'image/heif'] as const

/**
 * `accept` value for photo pickers. A plain image/* (no explicit HEIC) makes
 * iOS hand over a JPEG instead of the original HEIC.
 */
export const PHOTO_INPUT_ACCEPT = 'image/*'

export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/3gpp',
] as const

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

export interface UploadRule {
  allowedTypes: readonly string[]
  maxBytes: number
  /** Short noun used in error messages, e.g. "image". */
  label: string
}

export const UPLOAD_RULES = {
  image: { allowedTypes: IMAGE_MIME_TYPES, maxBytes: 10 * MB, label: 'image' },
  /**
   * Photos that pass through a Vercel function (Papa photos). Vercel refuses
   * request bodies over 4.5 MB before the route runs, so stay under that.
   */
  functionPhoto: { allowedTypes: IMAGE_MIME_TYPES, maxBytes: 4 * MB, label: 'photo' },
  /** Mirrors the nest-room-media bucket (jpeg/png/webp, 10 MB). */
  roomPhoto: { allowedTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 10 * MB, label: 'photo' },
  /** Serial keeps originals; the serial-media bucket accepts HEIC. */
  media: { allowedTypes: [...IMAGE_MIME_TYPES, ...HEIC_MIME_TYPES, ...VIDEO_MIME_TYPES], maxBytes: 100 * MB, label: 'photo or video' },
  financeDocument: { allowedTypes: [...DOCUMENT_MIME_TYPES, ...IMAGE_MIME_TYPES, ...HEIC_MIME_TYPES], maxBytes: 20 * MB, label: 'document' },
} as const satisfies Record<string, UploadRule>

const HEIC_NAME = /\.(heic|heif)$/i

function formatSize(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`
}

/** Returns an error message for the first file that breaks the rule, or null if all pass. */
export function validateUploadFiles(
  files: ReadonlyArray<Pick<File, 'name' | 'type' | 'size'>>,
  rule: UploadRule
): string | null {
  for (const file of files) {
    const type = (file.type || '').toLowerCase()
    if (!type || !rule.allowedTypes.includes(type)) {
      if ((HEIC_MIME_TYPES as readonly string[]).includes(type) || HEIC_NAME.test(file.name || '')) {
        return `"${file.name}" is an iPhone HEIC photo, which most phones and computers can't show. Choose a JPG or PNG, or take a screenshot of the photo and use that.`
      }
      return `"${file.name}" is not a supported ${rule.label} type.`
    }
    if (file.size > rule.maxBytes) {
      return `"${file.name}" is larger than ${formatSize(rule.maxBytes)}.`
    }
  }
  return null
}
