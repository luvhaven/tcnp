'use client'

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { Camera, Edit, Globe, Lock, Mail, Mic, Phone, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notifyError } from '@/lib/notify'
import {
  EMPTY_PAPA_PRIVATE_DETAILS,
  PASSPORT_COUNTRY_MAX,
  PASSPORT_NUMBER_MAX,
  formatPassportExpiry,
  hasPapaPrivateDetails,
  normalisePapaPrivateDetails,
  passportExpiryStatus,
  upsertPapaPrivateDetails,
  type PapaPrivateDetails,
} from '@/lib/papa-privacy'

type PapaDetails = {
  id: string
  full_name: string
  title?: string | null
  profile_photo_url?: string | null
  nationality?: string | null
  phone?: string | null
  email?: string | null
  flight_number?: string | null
  airline?: string | null
  flight_arrival_time?: string | null
  flight_departure_time?: string | null
  arrival_city?: string | null
  arrival_country?: string | null
  short_bio?: string | null
  mic_preference?: string | null
  presentation_style?: string | null
  water_temperature?: string | null
  needs_water_on_stage?: boolean | null
  has_slides?: boolean | null
  needs_clicker?: boolean | null
  needs_face_towels?: boolean | null
  uses_stage_props?: boolean | null
  stage_props_details?: string | null
  special_requirements?: string | null
  food_preferences?: string | null
  dietary_restrictions?: string | null
  accommodation_preferences?: string | null
  additional_notes?: string | null
  speaking_schedule?: any
  entourage_count?: number | null
  personal_assistants?: any
}

/** The private-details read, owned by the caller (fetched only when allowed). */
export type PapaPassportState = {
  details: PapaPrivateDetails | null | undefined
  isLoading: boolean
  isError: boolean
  onRetry?: () => void
  retrying?: boolean
}

type PapaDetailsViewProps = {
  papa: PapaDetails
  programName?: string | null
  canManage?: boolean
  /**
   * can_view_papa_passport: Command / platform admins and Alpha head or
   * sub-leads. Everyone else never sees the passport block, and the caller
   * never fetches it for them.
   */
  canViewPassport?: boolean
  /** Passport read state; required with canViewPassport. */
  passport?: PapaPassportState
  /** Passport edits follow the same rule as reads. */
  canEditPassport?: boolean
  onPassportSaved?: (details: PapaPrivateDetails) => void
  onEdit?: () => void
  onChangePhoto?: () => void
}

function formatDateTime(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

function Field({ label, value, wide }: { label: string; value?: ReactNode; wide?: boolean }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium">{value}</dd>
    </div>
  )
}

const EXPIRY_BADGE: Record<string, { label: string; className: string } | undefined> = {
  expired: { label: 'Expired', className: 'border-destructive/40 bg-destructive/10 text-destructive' },
  expiring: { label: 'Under 6 months left', className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
}

/**
 * Restricted passport block (papa_private_details). Shown only to people
 * can_view_papa_passport admits; saves go straight to that table, never to
 * papas, so the number is never copied into the shared Papa record.
 */
export function PapaPassportPanel({
  papaId,
  papaName,
  state,
  canEdit = false,
  onSaved,
  className,
}: {
  papaId: string
  papaName: string
  state: PapaPassportState
  canEdit?: boolean
  onSaved?: (details: PapaPrivateDetails) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<PapaPrivateDetails>(EMPTY_PAPA_PRIVATE_DETAILS)
  const details = state.details ?? null
  const badge = EXPIRY_BADGE[passportExpiryStatus(details?.passport_expiry)]
  const fieldId = (name: string) => `papa-${papaId}-${name}`

  const startEdit = () => {
    setDraft({ ...EMPTY_PAPA_PRIVATE_DETAILS, ...(details ?? {}) })
    setEditing(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const saved = await upsertPapaPrivateDetails(createClient() as any, papaId, normalisePapaPrivateDetails(draft))
      onSaved?.(saved)
      setEditing(false)
      toast.success('Passport details saved')
    } catch (error) {
      notifyError(error, 'Failed to save passport details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={className ?? 'rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-4'} aria-label={`Passport details for ${papaName}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Passport
          <span className="sr-only">(restricted to Command and Alpha leads)</span>
        </h4>
        {canEdit && !editing && !state.isLoading && !state.isError && (
          <Button type="button" size="sm" variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={startEdit} aria-label={`Edit passport details for ${papaName}`}>
            <Edit className="h-3.5 w-3.5" aria-hidden="true" />
            {hasPapaPrivateDetails(details) ? 'Edit' : 'Add passport'}
          </Button>
        )}
      </div>

      {state.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading passport details">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      ) : state.isError ? (
        <ErrorState
          className="py-4"
          title="Couldn't load passport details"
          description="They stay hidden until they load."
          onRetry={state.onRetry}
          retrying={state.retrying}
        />
      ) : editing ? (
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={fieldId('passport-number')}>Passport number</Label>
              <Input
                id={fieldId('passport-number')}
                autoComplete="off"
                maxLength={PASSPORT_NUMBER_MAX}
                className="h-11 sm:h-10"
                value={draft.passport_number ?? ''}
                onChange={(e) => setDraft({ ...draft, passport_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fieldId('passport-country')}>Issuing country</Label>
              <Input
                id={fieldId('passport-country')}
                autoComplete="off"
                maxLength={PASSPORT_COUNTRY_MAX}
                className="h-11 sm:h-10"
                value={draft.passport_country ?? ''}
                onChange={(e) => setDraft({ ...draft, passport_country: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fieldId('passport-expiry')}>Expiry date</Label>
              <Input
                id={fieldId('passport-expiry')}
                type="date"
                className="h-11 sm:h-10"
                value={draft.passport_expiry ?? ''}
                onChange={(e) => setDraft({ ...draft, passport_expiry: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="min-h-11 sm:min-h-9" pending={saving}>
              Save passport
            </Button>
          </div>
        </form>
      ) : hasPapaPrivateDetails(details) ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Number" value={details?.passport_number} />
          <Field label="Issuing country" value={details?.passport_country} />
          <Field
            label="Expires"
            value={details?.passport_expiry ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {formatPassportExpiry(details.passport_expiry)}
                {badge && <Badge variant="outline" className={badge.className}>{badge.label}</Badge>}
              </span>
            ) : null}
          />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No passport details on file.</p>
      )}
    </section>
  )
}

/** Read-only dossier for a single Papa: photo, contact, flight, stage and entourage details. */
export default function PapaDetailsView({
  papa,
  programName,
  canManage,
  canViewPassport = false,
  passport,
  canEditPassport = false,
  onPassportSaved,
  onEdit,
  onChangePhoto,
}: PapaDetailsViewProps) {
  const initials = papa.full_name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const schedule = Array.isArray(papa.speaking_schedule) ? papa.speaking_schedule : []
  const assistants = Array.isArray(papa.personal_assistants) ? papa.personal_assistants : []
  const stageNeeds = [
    papa.needs_water_on_stage && `Water on stage (${papa.water_temperature || 'Room temperature'})`,
    papa.has_slides && 'Slides',
    papa.needs_clicker && 'Clicker',
    papa.needs_face_towels && 'Face towels',
    papa.uses_stage_props && 'Stage props',
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-amber-500/5">
          {papa.profile_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={papa.profile_photo_url} alt={papa.full_name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-amber-600 dark:text-amber-400">
              {initials || 'VIP'}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-xl font-bold">{papa.title ? `${papa.title} ` : ''}{papa.full_name}</h3>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            {programName && <Badge variant="outline" className="bg-primary/5 text-primary">{programName}</Badge>}
            {papa.nationality && (
              <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" />{papa.nationality}</Badge>
            )}
            {papa.mic_preference && (
              <Badge variant="secondary" className="gap-1"><Mic className="h-3 w-3" />{papa.mic_preference}</Badge>
            )}
            {(papa.entourage_count || 0) > 0 && (
              <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />Entourage {papa.entourage_count}</Badge>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
            {papa.phone && (
              <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
                <a href={`tel:${papa.phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" />{papa.phone}</a>
              </Button>
            )}
            {papa.email && (
              <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
                <a href={`mailto:${papa.email}`} aria-label={`Email ${papa.full_name}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" />Email</a>
              </Button>
            )}
            {canManage && onChangePhoto && (
              <Button size="sm" variant="ghost" onClick={onChangePhoto} className="gap-1.5">
                <Camera className="h-3.5 w-3.5" />{papa.profile_photo_url ? 'Change photo' : 'Add photo'}
              </Button>
            )}
            {canManage && onEdit && (
              <Button size="sm" variant="ghost" onClick={onEdit} className="gap-1.5">
                <Edit className="h-3.5 w-3.5" />Edit details
              </Button>
            )}
          </div>
        </div>
      </div>

      {papa.short_bio && (
        <section className="rounded-xl border bg-card p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bio</h4>
          <p className="whitespace-pre-wrap text-sm">{papa.short_bio}</p>
        </section>
      )}

      {/* Passport sits outside Travel: a Papa without a flight still has one. */}
      {canViewPassport && passport && (
        <PapaPassportPanel
          papaId={papa.id}
          papaName={papa.full_name}
          state={passport}
          canEdit={canEditPassport}
          onSaved={onPassportSaved}
        />
      )}

      {(papa.flight_number || papa.airline || papa.flight_arrival_time || papa.arrival_city) && (
        <Section title="Travel">
          <Field label="Flight" value={[papa.airline, papa.flight_number].filter(Boolean).join(' ') || null} />
          <Field label="Arrives" value={formatDateTime(papa.flight_arrival_time)} />
          <Field label="Departs" value={formatDateTime(papa.flight_departure_time)} />
          <Field label="Arrival city" value={[papa.arrival_city, papa.arrival_country].filter(Boolean).join(', ') || null} />
        </Section>
      )}

      <Section title="Presentation">
        <Field label="Mic preference" value={papa.mic_preference || 'Not set'} />
        <Field label="Presentation style" value={papa.presentation_style} />
        <Field label="Stage needs" value={stageNeeds.length ? stageNeeds.join(', ') : 'None recorded'} wide />
        <Field label="Stage props" value={papa.uses_stage_props ? papa.stage_props_details : null} wide />
        <Field label="Special requirements" value={papa.special_requirements} wide />
      </Section>

      {(papa.food_preferences || papa.dietary_restrictions || papa.accommodation_preferences || papa.additional_notes) && (
        <Section title="Preferences">
          <Field label="Food" value={papa.food_preferences} />
          <Field label="Dietary restrictions" value={papa.dietary_restrictions} />
          <Field label="Accommodation" value={papa.accommodation_preferences} wide />
          <Field label="Notes" value={papa.additional_notes} wide />
        </Section>
      )}

      {schedule.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Speaking schedule</h4>
          <ul className="space-y-2">
            {schedule.map((slot: any, i: number) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{[slot.day, slot.time].filter(Boolean).join(' · ') || 'TBD'}</span>
                {slot.topic && <span className="text-muted-foreground"> — {slot.topic}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {assistants.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal assistants</h4>
          <ul className="space-y-2">
            {assistants.map((pa: any, i: number) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{pa.name || 'Unnamed'}</span>
                  {pa.role && <span className="text-muted-foreground"> — {pa.role}</span>}
                </span>
                {pa.phone && (
                  <a href={`tel:${pa.phone}`} className="inline-flex items-center gap-1 text-primary">
                    <Phone className="h-3 w-3" />{pa.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  )
}
