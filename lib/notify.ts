/**
 * User-facing error notifications.
 *
 * Raw Supabase / PostgREST / fetch errors are written for developers
 * ("new row violates row-level security policy for table …", "TypeError:
 * Failed to fetch"). `notifyError` turns the ones we recognise into plain
 * language, falls back to a caller-supplied sentence for everything else, and
 * reports the unexpected ones to Sentry so the raw text reaches us instead of
 * the user.
 */

import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'

export type ErrorKind =
  | 'duplicate'
  | 'in-use'
  | 'permission'
  | 'not-found'
  | 'offline'
  | 'session-expired'
  | 'unknown'

export const FRIENDLY_MESSAGES: Record<Exclude<ErrorKind, 'unknown'>, string> = {
  duplicate: 'That already exists. Please use a different value.',
  'in-use': "This is still in use elsewhere, so it can't be changed or removed.",
  permission: "You don't have permission to do that.",
  'not-found': "We couldn't find that record. It may have been removed.",
  offline: 'You appear to be offline. Check your connection and try again.',
  'session-expired': 'Your session expired, please sign in again.',
}

/**
 * An error whose message was written for the user (form validation, a
 * friendly message from our own API route). notifyError shows it verbatim and
 * does not report it.
 */
export class UserFacingError extends Error {
  readonly userFacing = true
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

/**
 * True for errors whose own message is safe and useful to show: our
 * UserFacingError, and Supabase Auth's 4xx validation errors ("Password should
 * be at least 6 characters", "New password should be different…"), which are
 * written for end users.
 */
export function isUserFacingError(err: unknown): err is Error {
  if (!err || typeof err !== 'object') return false
  if ((err as { userFacing?: unknown }).userFacing === true) return true
  const { name, status } = err as { name?: unknown; status?: unknown }
  return (name === 'AuthApiError' || name === 'AuthWeakPasswordError') &&
    typeof status === 'number' && status >= 400 && status < 500 && status !== 401
}

const NETWORK_PATTERNS = [/failed to fetch/i, /load failed/i, /networkerror/i, /network request failed/i]
const JWT_PATTERNS = [/jwt expired/i, /invalid jwt/i, /refresh token/i, /session.*expired/i]

function field(err: unknown, key: string): string {
  if (!err || typeof err !== 'object') return ''
  const value = (err as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function isOffline(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  } catch {
    return false
  }
}

/** Classifies an error without touching any UI. Pure apart from navigator.onLine. */
export function classifyError(err: unknown): ErrorKind {
  const code = field(err, 'code')
  const message = typeof err === 'string' ? err : field(err, 'message')
  const name = field(err, 'name')
  const status = field(err, 'status')

  if (code === '23505') return 'duplicate'
  if (code === '23503') return 'in-use'
  if (code === '42501' || /row-level security/i.test(message)) return 'permission'
  if (code === 'PGRST116') return 'not-found'
  if (code === 'PGRST301' || code === 'PGRST303' || JWT_PATTERNS.some(re => re.test(message))) {
    return 'session-expired'
  }
  // fetch() rejects with a TypeError whose message varies by browser ("Failed
  // to fetch" in Chromium, "Load failed" in Safari, "NetworkError…" in
  // Firefox). A TypeError with any other message is a code bug, not the
  // network, so it is deliberately left as 'unknown' and reported.
  if (isOffline() || NETWORK_PATTERNS.some(re => re.test(message)) || name === 'NetworkError') {
    return 'offline'
  }
  if (status === '401' && /jwt|token|session/i.test(message)) return 'session-expired'
  return 'unknown'
}

/** The sentence the user should see for `err`. Never the raw error text. */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (isUserFacingError(err) && err.message) return err.message
  const kind = classifyError(err)
  return kind === 'unknown' ? fallback : FRIENDLY_MESSAGES[kind]
}

/** Stable toast id so the same failure repeated (e.g. a retry loop) replaces rather than stacks. */
export function toastIdFor(message: string): string {
  return `notify-error:${message}`
}

export interface NotifyErrorOptions {
  /** Extra Sentry tags, e.g. `{ area: 'officers' }`. */
  tags?: Record<string, string>
  /** Set false to skip Sentry for an error the caller already reported. */
  report?: boolean
  /** Optional secondary line shown under the message. */
  description?: string
}

/**
 * Shows a friendly error toast for `err` and reports unexpected errors.
 * Returns the message shown, which is handy for inline error text too.
 */
export function notifyError(err: unknown, fallback: string, opts: NotifyErrorOptions = {}): string {
  const userFacing = isUserFacingError(err) && !!err.message
  const kind = userFacing ? 'unknown' : classifyError(err)
  const message = userFacing ? (err as Error).message : kind === 'unknown' ? fallback : FRIENDLY_MESSAGES[kind]

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[notifyError] ${fallback}`, err)
  }

  // Duplicates, missing permissions, offline and expired sessions are expected
  // outcomes of normal use; only the unexplained ones are worth an event.
  if (kind === 'unknown' && !userFacing && opts.report !== false) {
    try {
      const error = err instanceof Error ? err : new Error(field(err, 'message') || fallback)
      Sentry.captureException(error, {
        level: 'error',
        tags: { source: 'notifyError', ...(field(err, 'code') ? { 'supabase.code': field(err, 'code') } : {}), ...opts.tags },
        extra: { fallback },
      })
    } catch {
      // Monitoring must never break the UI.
    }
  }

  toast.error(message, { id: toastIdFor(message), description: opts.description })
  return message
}
