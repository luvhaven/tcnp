/**
 * November (Den) — repository and report rules. Dependency-free so
 * tests/den-repository.test.cjs can load it directly. Mirrors
 * supabase/migrations/20261116100000_den_repository_and_reports.sql.
 */

export const DEN_BUCKET = 'den-repository'

/** Matches the bucket's file_size_limit. */
export const DEN_MAX_FILE_BYTES = 50 * 1024 * 1024

export const DEN_REPOSITORY_CATEGORIES = ['sop', 'template', 'guide', 'report', 'media', 'vendor', 'other'] as const
export type DenRepositoryCategory = (typeof DEN_REPOSITORY_CATEGORIES)[number]

export const DEN_REPOSITORY_CATEGORY_LABEL: Record<DenRepositoryCategory, string> = {
  sop: 'SOPs',
  template: 'Templates',
  guide: 'Guides',
  report: 'Reports',
  media: 'Photos & videos',
  vendor: 'Vendor documents',
  other: 'Other',
}

export type DenRepositoryKind = 'document' | 'image' | 'video' | 'link' | 'note' | 'report'

export type DenRepositoryItem = {
  id: string
  title: string
  description: string | null
  category: DenRepositoryCategory
  kind: DenRepositoryKind
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  external_url: string | null
  body: string | null
  tags: string[]
  program_id: string | null
  source_report_id: string | null
  created_at: string
}

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export function kindForMime(mime: string | null | undefined): DenRepositoryKind {
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('video/')) return 'video'
  return 'document'
}

/** Why a file cannot be uploaded, in words for the officer; null when it can. */
export function fileRejection(
  file: { size: number; type: string; name: string },
  options: { mediaOnly?: boolean } = {},
): string | null {
  if (file.size > DEN_MAX_FILE_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(DEN_MAX_FILE_BYTES)} per file.`
  }
  if (!ALLOWED_MIME.has(file.type)) return `${file.name} is not a file type the repository accepts.`
  if (options.mediaOnly && kindForMime(file.type) === 'document') return `${file.name} is not a photo or a video.`
  return null
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/**
 * A storage path that is safe and unique: the original name is reduced to
 * plain characters and prefixed with an id, under `library/` or
 * `reports/<report id>/` — the two folders the storage rules recognise.
 */
export function storagePathFor(folder: 'library' | { reportId: string }, fileName: string, uniqueId: string): string {
  // Only the last path segment is used, so a name can never climb out of its folder.
  const name = fileName.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  const rawExtension = dot > 0 ? name.slice(dot + 1) : ''
  const extension = /^[A-Za-z0-9]{1,8}$/.test(rawExtension) ? rawExtension.toLowerCase() : ''
  const base = (extension ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase() || 'file'
  const prefix = folder === 'library' ? 'library' : `reports/${folder.reportId}`
  return `${prefix}/${uniqueId}-${base}${extension ? `.${extension}` : ''}`
}

/** Comma- or space-separated tags, lower-cased, de-duplicated, at most ten. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  for (const raw of text.split(/[,\n]/)) {
    const tag = raw.trim().replace(/^#/, '').toLowerCase().slice(0, 30)
    if (tag) seen.add(tag)
  }
  return [...seen].slice(0, 10)
}

/** Only https links are stored (the table enforces the same). */
export function normalizeLink(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Turns what was typed into a prefix search: every word must appear, and the
 * last letters may still be coming ("cater" finds "catering"). Anything that
 * is not a letter or digit is dropped, so the text can never be read as
 * search operators.
 */
export function toPrefixQuery(text: string): string {
  const words = text.toLowerCase().normalize('NFKD').split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 0).slice(0, 8)
  return words.map(word => `${word}:*`).join(' & ')
}

// ── Reports ──

export type DenReportType = 'post_operation' | 'field'
export type DenReportStatus = 'draft' | 'submitted'

export const DEN_REPORT_TYPE_LABEL: Record<DenReportType, string> = {
  post_operation: 'Post-operation report',
  field: 'Field report',
}

/** The report's sections, in the order they are written and printed. */
export const DEN_REPORT_SECTIONS = [
  { key: 'summary', label: 'Summary', hint: 'What the Den did for this programme, in a few sentences.' },
  { key: 'what_went_well', label: 'What went well', hint: 'Keep doing these.' },
  { key: 'what_did_not_go_well', label: 'What did not go well', hint: 'Be specific: what happened, and why.' },
  { key: 'guest_feedback', label: 'Guest feedback', hint: 'What ministers and guests said or showed.' },
  { key: 'recommendations', label: 'Recommendations', hint: 'What should change before the next programme.' },
  { key: 'lessons_learned', label: 'Lessons learned', hint: 'What the next team should know that you did not.' },
] as const

export type DenReportSectionKey = (typeof DEN_REPORT_SECTIONS)[number]['key']

export type DenReport = {
  id: string
  program_id: string
  report_type: DenReportType
  title: string
  status: DenReportStatus
  created_by: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
} & Record<DenReportSectionKey, string | null>

/** What is still missing before a report can be submitted; empty when ready. */
export function reportGaps(report: Partial<Record<DenReportSectionKey | 'title', string | null>>, type: DenReportType): string[] {
  const filled = (value: string | null | undefined) => Boolean(value && value.trim())
  const gaps: string[] = []
  if (!filled(report.title)) gaps.push('Title')
  if (!filled(report.summary)) gaps.push('Summary')
  // The official report exists to carry these two forward; a field report need not.
  if (type === 'post_operation') {
    if (!filled(report.recommendations)) gaps.push('Recommendations')
    if (!filled(report.lessons_learned)) gaps.push('Lessons learned')
  }
  return gaps
}

export const DEN_REPOSITORY_KEY = ['den', 'repository'] as const
export const DEN_REPORTS_KEY = ['den', 'reports'] as const
