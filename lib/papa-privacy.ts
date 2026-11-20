/**
 * Papa passport privacy: who may see/edit passports, and the helpers that
 * keep passport data out of the shared papas table.
 *
 * Passports live in public.papa_private_details (migration
 * 20261116173000_papa_private_details.sql). The SQL rule is
 *   can_view_papa_passport(papa) = is_admin() OR can_coordinate_unit('alpha')
 * i.e. Command / platform admins, and the Alpha head or a sub-lead, who
 * handle immigration. Ordinary members of any unit (Alpha included), Delta
 * Oscars and other units never see a passport. RLS is the final authority;
 * this module mirrors it so the UI neither fetches nor shows what RLS refuses.
 *
 * Pure: safe for client, server and node tests.
 */

import { unitAccess, type UnitAccess, type UnitAccessViewer, type UnitMembership } from '@/lib/unit-access'

export const PAPA_PRIVATE_TABLE = 'papa_private_details'

export const PAPA_PRIVATE_FIELDS = ['passport_number', 'passport_country', 'passport_expiry'] as const
export type PapaPrivateField = (typeof PAPA_PRIVATE_FIELDS)[number]

export type PapaPrivateDetails = {
  passport_number: string | null
  passport_country: string | null
  /** ISO date (YYYY-MM-DD). */
  passport_expiry: string | null
}

export type PapaPrivateRow = PapaPrivateDetails & {
  papa_id: string
  updated_by?: string | null
  updated_at?: string | null
}

export const EMPTY_PAPA_PRIVATE_DETAILS: PapaPrivateDetails = Object.freeze({
  passport_number: null,
  passport_country: null,
  passport_expiry: null,
}) as PapaPrivateDetails

/** Limits match the table's CHECK constraints. */
export const PASSPORT_NUMBER_MAX = 64
export const PASSPORT_COUNTRY_MAX = 80

/**
 * The papas columns the Papas directory reads. An explicit list, never
 * select('*'), so nothing private rides along if a column is added later
 * (and so the page never carried passport_number before the migration ran).
 */
export const PAPA_DIRECTORY_COLUMNS = [
  'id', 'title', 'full_name', 'short_bio', 'nationality', 'phone', 'email',
  'arrival_country', 'arrival_city', 'flight_number', 'flight_provider',
  'flight_departure_time', 'flight_arrival_time', 'presentation_style',
  'profile_photo_url', 'created_at', 'organization', 'position',
  'special_requirements', 'program_id', 'airline', 'uses_stage_props',
  'needs_water_on_stage', 'water_temperature', 'has_slides', 'needs_face_towels',
  'mic_preference', 'food_preferences', 'dietary_restrictions',
  'accommodation_preferences', 'additional_notes', 'speaking_schedule',
  'entourage_count', 'personal_assistants', 'needs_clicker', 'stage_props_details',
].join(', ')

/** Prefix shared by every private-details cache entry (single and batch). */
export const PAPA_PRIVATE_ROOT_KEY = ['papa-private'] as const

/**
 * Filter for invalidateQueries after a passport save: every other
 * private-details entry (the single-Papa and the briefing batch shapes hold
 * copies of the same rows), but not the entry the caller just wrote with
 * setQueryData, so that one is not refetched for nothing.
 */
export function papaPrivateSiblingFilter(ownKey: readonly unknown[]) {
  const own = JSON.stringify(ownKey)
  return {
    queryKey: PAPA_PRIVATE_ROOT_KEY,
    predicate: (query: { queryKey: readonly unknown[] }) => JSON.stringify(query.queryKey) !== own,
  }
}

/** React Query key for one Papa's private details. */
export const papaPrivateKey = (papaId: string | null | undefined) =>
  ['papa-private', papaId ?? null] as const

/** React Query key for a batch read (briefings). */
export const papaPrivateBatchKey = (papaIds: readonly string[]) =>
  ['papa-private', 'batch', [...papaIds].sort().join(',')] as const

/**
 * Client mirror of SQL can_view_papa_passport(): Command (is_admin(), which
 * includes platform admins) or an Alpha coordinator (head / sub-lead).
 */
export function canViewPapaPassport(access: Pick<UnitAccess, 'isCommand' | 'canCoordinate'>): boolean {
  return access.isCommand === true || access.canCoordinate === true
}

/** Passport access straight from the viewer's memberships and role. */
export function papaPassportAccess(
  memberships: readonly UnitMembership[] | null | undefined,
  viewer: UnitAccessViewer = {},
): boolean {
  return canViewPapaPassport(unitAccess(memberships, 'alpha', viewer))
}

/** Passport edits follow the same rule as reads (DELETE is is_admin() only). */
export const canEditPapaPassport = canViewPapaPassport

function cleanText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  return text.slice(0, max)
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar date as YYYY-MM-DD, or null. Accepts an ISO timestamp too. */
export function normaliseExpiry(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim().slice(0, 10)
  const match = ISO_DATE.exec(text)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null
  return text
}

/** Trims, empties to null and validates an expiry date. */
export function normalisePapaPrivateDetails(input: Partial<Record<PapaPrivateField, unknown>> | null | undefined): PapaPrivateDetails {
  return {
    passport_number: cleanText(input?.passport_number, PASSPORT_NUMBER_MAX),
    passport_country: cleanText(input?.passport_country, PASSPORT_COUNTRY_MAX),
    passport_expiry: normaliseExpiry(input?.passport_expiry),
  }
}

export function hasPapaPrivateDetails(details: PapaPrivateDetails | null | undefined): boolean {
  return Boolean(details && (details.passport_number || details.passport_country || details.passport_expiry))
}

export function samePapaPrivateDetails(a: PapaPrivateDetails | null | undefined, b: PapaPrivateDetails | null | undefined): boolean {
  const left = normalisePapaPrivateDetails(a)
  const right = normalisePapaPrivateDetails(b)
  return PAPA_PRIVATE_FIELDS.every(field => left[field] === right[field])
}

/**
 * Splits a form/offline payload into the papas row and the private details.
 * The papas row never carries a passport field, whatever the caller sent.
 */
export function splitPapaPrivate<T extends Record<string, any>>(data: T): {
  papa: Omit<T, PapaPrivateField>
  privateDetails: PapaPrivateDetails
} {
  const papa: Record<string, any> = {}
  const raw: Partial<Record<PapaPrivateField, unknown>> = {}
  for (const [key, value] of Object.entries(data ?? {})) {
    if ((PAPA_PRIVATE_FIELDS as readonly string[]).includes(key)) raw[key as PapaPrivateField] = value
    else papa[key] = value
  }
  return { papa: papa as Omit<T, PapaPrivateField>, privateDetails: normalisePapaPrivateDetails(raw) }
}

/** Removes every passport field from a papas payload. */
export function stripPapaPrivateFields<T extends Record<string, any>>(data: T): Omit<T, PapaPrivateField> {
  return splitPapaPrivate(data).papa
}

/**
 * Whether a save should write papa_private_details: only for an allowed
 * viewer whose private details were loaded (an unloaded value must never
 * overwrite what is stored), and only when something changed. A new Papa
 * with nothing entered writes nothing.
 */
export function shouldWritePapaPrivate(options: {
  allowed: boolean
  loaded: boolean
  previous: PapaPrivateDetails | null | undefined
  next: PapaPrivateDetails
}): boolean {
  if (!options.allowed || !options.loaded) return false
  if (!options.previous && !hasPapaPrivateDetails(options.next)) return false
  return !samePapaPrivateDetails(options.previous ?? EMPTY_PAPA_PRIVATE_DETAILS, options.next)
}

export type PassportExpiryStatus = 'none' | 'expired' | 'expiring' | 'valid'

/**
 * Many countries refuse entry on a passport with under six months left, so
 * Alpha flags those before a Papa travels.
 */
export function passportExpiryStatus(expiry: string | null | undefined, now: Date = new Date()): PassportExpiryStatus {
  const iso = normaliseExpiry(expiry)
  if (!iso) return 'none'
  const [y, m, d] = iso.split('-').map(Number)
  const expiryUtc = Date.UTC(y, m - 1, d)
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  if (expiryUtc < todayUtc) return 'expired'
  const sixMonths = Date.UTC(now.getFullYear(), now.getMonth() + 6, now.getDate())
  return expiryUtc < sixMonths ? 'expiring' : 'valid'
}

/** "12 Mar 2027" without time-zone drift. */
export function formatPassportExpiry(expiry: string | null | undefined): string | null {
  const iso = normaliseExpiry(expiry)
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}

type QueryClient = { from: (table: string) => any }

/** One Papa's private details, or null when none are stored (or RLS hides them). */
export async function fetchPapaPrivateDetails(client: QueryClient, papaId: string): Promise<PapaPrivateDetails | null> {
  const { data, error } = await client
    .from(PAPA_PRIVATE_TABLE)
    .select('papa_id, passport_number, passport_country, passport_expiry')
    .eq('papa_id', papaId)
    .maybeSingle()
  if (error) throw error
  return data ? normalisePapaPrivateDetails(data) : null
}

/** Private details for many Papas in one request, keyed by papa id. */
export async function fetchPapaPrivateDetailsBatch(client: QueryClient, papaIds: readonly string[]): Promise<Record<string, PapaPrivateDetails>> {
  const ids = [...new Set(papaIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const { data, error } = await client
    .from(PAPA_PRIVATE_TABLE)
    .select('papa_id, passport_number, passport_country, passport_expiry')
    .in('papa_id', ids)
  if (error) throw error
  const out: Record<string, PapaPrivateDetails> = {}
  for (const row of (data ?? []) as PapaPrivateRow[]) out[row.papa_id] = normalisePapaPrivateDetails(row)
  return out
}

/**
 * Saves one Papa's private details (insert or update). The database stamps
 * updated_by / updated_at; RLS refuses anyone can_view_papa_passport rejects.
 */
export async function upsertPapaPrivateDetails(client: QueryClient, papaId: string, details: PapaPrivateDetails): Promise<PapaPrivateDetails> {
  const clean = normalisePapaPrivateDetails(details)
  const { data, error } = await client
    .from(PAPA_PRIVATE_TABLE)
    .upsert([{ papa_id: papaId, ...clean }], { onConflict: 'papa_id' })
    .select('papa_id, passport_number, passport_country, passport_expiry')
    .maybeSingle()
  if (error) throw error
  return data ? normalisePapaPrivateDetails(data) : clean
}
