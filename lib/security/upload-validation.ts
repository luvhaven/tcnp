/**
 * Client-side upload rules. These mirror the `allowed_mime_types` and
 * `file_size_limit` set on each storage bucket, so a bad file is rejected
 * with a clear message before it reaches Supabase (which enforces the same
 * limits server-side).
 */

const MB = 1024 * 1024

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const

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
  media: { allowedTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES], maxBytes: 100 * MB, label: 'photo or video' },
  financeDocument: { allowedTypes: [...DOCUMENT_MIME_TYPES, ...IMAGE_MIME_TYPES], maxBytes: 20 * MB, label: 'document' },
} as const satisfies Record<string, UploadRule>

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
      return `"${file.name}" is not a supported ${rule.label} type.`
    }
    if (file.size > rule.maxBytes) {
      return `"${file.name}" is larger than ${formatSize(rule.maxBytes)}.`
    }
  }
  return null
}
