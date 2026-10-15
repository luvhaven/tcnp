export type NormalizedSupabaseError = {
  message: string
  details?: string
  hint?: string
  code?: string | number
  status?: number
  stack?: string
  cause?: unknown
  raw?: unknown
}

const FALLBACK_MESSAGE = 'Supabase request failed'

const sanitizeObject = (value: Record<string, unknown>): Record<string, unknown> => {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return Object.keys(value).reduce<Record<string, unknown>>((acc, key) => {
      const candidate = value[key]
      if (candidate === null) {
        acc[key] = candidate
      } else if (['string', 'number', 'boolean'].includes(typeof candidate)) {
        acc[key] = candidate as string | number | boolean
      }
      return acc
    }, {})
  }
}

export const normalizeSupabaseError = (error: unknown): NormalizedSupabaseError => {
  if (error instanceof Error) {
    return {
      message: error.message || FALLBACK_MESSAGE,
      stack: error.stack,
      cause: (error as Error & { cause?: unknown }).cause
    }
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>
    const normalized: NormalizedSupabaseError = {
      message:
        typeof candidate.message === 'string' && candidate.message.length > 0
          ? candidate.message
          : typeof candidate.error === 'string' && candidate.error.length > 0
            ? candidate.error
            : FALLBACK_MESSAGE
    }

    if (typeof candidate.details === 'string') {
      normalized.details = candidate.details
    }

    if (typeof candidate.hint === 'string') {
      normalized.hint = candidate.hint
    }

    if (typeof candidate.code === 'string' || typeof candidate.code === 'number') {
      normalized.code = candidate.code
    }

    if (typeof candidate.status === 'number') {
      normalized.status = candidate.status
    }

    normalized.raw = sanitizeObject(candidate)

    return normalized
  }

  return {
    message: typeof error === 'string' ? error : FALLBACK_MESSAGE,
    raw: error
  }
}

export const logSupabaseError = (context: string, error: unknown): NormalizedSupabaseError => {
  const normalized = normalizeSupabaseError(error)
  console.error(`${context}: ${normalized.message}`, normalized)
  return normalized
}

/**
 * Browser messages for a fetch that never completed. Each engine words it
 * differently and none of them carry a status code, so the text is all there
 * is to match on.
 */
const TRANSPORT_FAILURE_MESSAGES = [
  'load failed',            // WebKit / iOS Safari
  'failed to fetch',        // Chromium
  'networkerror',           // Firefox
  'network request failed',
  'err_network',
  'err_internet_disconnected',
]

/**
 * True when a Supabase call failed in transport rather than being answered.
 *
 * PostgREST reports these with an empty `code`, because a connection that
 * never reached Postgres has no Postgres error code — so they are
 * indistinguishable from a real database error by code alone, and retrying a
 * genuine error (a permission denial, a missing row) would only repeat it.
 *
 * Deliberately excludes SupabaseRequestTimeoutError. A timeout has already
 * cost the user the full deadline; retrying it twice more would leave them
 * staring at a skeleton for three times as long. A dropped connection, by
 * contrast, fails fast and is usually gone by the next attempt.
 */
export const isTransientNetworkError = (error: unknown): boolean => {
  const { message } = normalizeSupabaseError(error)
  const text = message.toLowerCase()

  if (text.includes('tcnp_supabase_request_timeout')) return false

  return TRANSPORT_FAILURE_MESSAGES.some((marker) => text.includes(marker))
}
