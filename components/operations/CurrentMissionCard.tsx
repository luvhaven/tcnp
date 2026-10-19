"use client"

import { useEffect, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Car, CheckCircle, Crown, Loader2,
  MapPin, Minus, Navigation, Phone, Play, Shield, Waves,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CallSignChip } from '@/components/ui/call-sign-chip'
import { useCelebrate } from '@/components/providers/CelebrateProvider'
import DistressButton from '@/components/operations/DistressButton'
import { useJourneyStatus, STATUS_CALL_SIGNS, EVENT_CALL_SIGNS } from '@/hooks/useJourneyStatus'
import type { DutyOfficer, OpsJourney } from '@/hooks/useMyOperations'
import {
  CALL_SIGNS, NEXT_CALL_SIGN, firstCallSignFor, getCallSignLabel, getCallSignVisual,
  SEVERITY_SOFT, type CallSignDirection, type CallSignKey,
} from '@/lib/constants/call-signs'
import { cn } from '@/lib/utils'

/** Direction glyph per movement phase — identity carried by form, not colour. */
const PHASE_ICON: Record<CallSignDirection, React.ComponentType<{ className?: string }>> = {
  outbound: ArrowUpRight,
  inbound: ArrowDownLeft,
  transit: Navigation,
  arrived: MapPin,
  alert: AlertTriangle,
  none: Minus,
}

const TERMINAL = ['completed', 'cancelled']

interface CurrentMissionCardProps {
  journey: OpsJourney
  currentUserId: string | null
  /** Reload page data after a write lands (realtime confirms it too). */
  onChanged: () => void
  /** Optimistic patches so the page reflects the tap before the reload. */
  onStatusPatched: (status: string) => void
  onAcknowledged: (patch: Partial<DutyOfficer>) => void
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function timeWithCountdown(iso: string | null, now: number) {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const rel = Math.abs(at.getTime() - now) < 60_000 ? 'now' : formatDistanceToNow(at, { addSuffix: true })
  return { clock: format(at, 'HH:mm'), rel }
}

/**
 * The one card a Duty Officer needs in the field: who, where, when, who to
 * call, and the next call sign as a single large button. Routine signs are one
 * tap with a 5s Undo; only Complete (confirm dialog) and Broken Arrow
 * (press-and-hold) ask for deliberate confirmation.
 */
export default function CurrentMissionCard({
  journey, currentUserId, onChanged, onStatusPatched, onAcknowledged,
}: CurrentMissionCardProps) {
  const supabase = createClient()
  const celebrate = useCelebrate()
  const now = useNow(30_000)
  const { status: liveStatus, lastUpdated, sending, updateStatus, completeJourney } =
    useJourneyStatus(journey.id, { onChanged })
  const [acknowledging, setAcknowledging] = useState(false)
  const ackInFlight = useRef(false)

  const status = liveStatus ?? journey.status
  const updatedAt = lastUpdated ?? journey.status_updated_at
  const myDORecord = journey.duty_officers?.find(d => d.user_id === currentUserId)
  const isLead = !!(myDORecord?.is_lead || journey.assigned_duty_officer_id === currentUserId)
  const isPendingAcknowledge = myDORecord?.status === 'pending'
  const isPlanned = status === 'planned' || status === 'scheduled'
  const isTerminal = TERMINAL.includes(status)
  const isBrokenArrow = status === 'broken_arrow'

  const papaName = journey.papas ? `${journey.papas.title ?? ''} ${journey.papas.full_name}`.trim() : 'Unassigned Papa'
  const cheetahName = journey.cheetahs?.call_sign ?? journey.cheetahs?.registration_number ?? null
  const etd = timeWithCountdown(journey.etd ?? journey.scheduled_departure, now)
  const eta = timeWithCountdown(journey.eta ?? journey.scheduled_arrival, now)
  const mapsHref = journey.destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(journey.destination)}`
    : null

  const lead = journey.duty_officers?.find(d => d.is_lead && d.user_id !== currentUserId)
  const contacts = [
    journey.driver?.driver_phone
      ? { key: 'driver', label: `Driver${journey.driver.driver_name ? ` · ${journey.driver.driver_name}` : ''}`, phone: journey.driver.driver_phone }
      : null,
    lead?.users?.phone
      ? { key: 'lead', label: `Lead DO · ${lead.users.full_name}`, phone: lead.users.phone }
      : null,
  ].filter((c): c is { key: string; label: string; phone: string } => !!c)

  const firstSign = firstCallSignFor(journey.origin, journey.destination)
  const next = isPlanned ? firstSign : NEXT_CALL_SIGN[status] ?? null

  const send = async (key: CallSignKey, notes?: string) => {
    const isEvent = EVENT_CALL_SIGNS.includes(key)
    // Routine movement signs get Undo; broadcasts are event rows (nothing to
    // revert) and Broken Arrow must never be one tap away from being undone.
    const result = await updateStatus(key, notes, { undoable: !isEvent && key !== 'broken_arrow' })
    if (result && !isEvent) onStatusPatched(key)
  }

  const handleAcknowledge = async () => {
    if (ackInFlight.current || !currentUserId) return
    ackInFlight.current = true
    setAcknowledging(true)
    try {
      const acknowledged_at = new Date().toISOString()
      const { error } = await (supabase as any)
        .from('journey_duty_officers')
        .update({ status: 'acknowledged', acknowledged_at })
        .eq('journey_id', journey.id)
        .eq('user_id', currentUserId)
      if (error) throw error
      onAcknowledged({ status: 'acknowledged', acknowledged_at })
      celebrate('Assignment accepted — shift handoff complete')
      onChanged()
    } catch (err) {
      console.error('Acknowledgment error:', err)
      toast.error('Failed to acknowledge assignment (Check network or permissions)')
    } finally {
      ackInFlight.current = false
      setAcknowledging(false)
    }
  }

  const otherMovement = CALL_SIGNS.filter(s => STATUS_CALL_SIGNS.includes(s.key) && s.key !== next)
  const broadcasts = CALL_SIGNS.filter(s => EVENT_CALL_SIGNS.includes(s.key))

  return (
    <div className="space-y-3">
      <Card className="border-primary/25">
        <CardContent className="space-y-4 p-4 sm:p-5">
          {/* Who + current status */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Current mission</p>
              <h2 className="truncate text-xl font-bold tracking-tight">{papaName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {cheetahName && (
                  <span className="inline-flex items-center gap-1"><Car className="h-4 w-4" aria-hidden />{cheetahName}</span>
                )}
                {isLead && (
                  <Badge className="border border-amber-400/30 bg-amber-400/20 text-amber-700 dark:text-amber-400">
                    <Crown className="mr-1 h-3 w-3" aria-hidden />Team Lead
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <CallSignChip callSign={status} className="px-3 py-1.5 text-base" />
              {updatedAt && (
                <span className="text-sm text-muted-foreground">
                  updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>

          {/* Where */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3">
            <p className="min-w-0 text-base font-medium">
              <MapPin className="mr-1 inline h-4 w-4 text-primary" aria-hidden />
              {journey.origin} → {journey.destination}
            </p>
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-primary/30 px-3 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Directions to ${journey.destination} in Google Maps`}
              >
                <Navigation className="h-4 w-4" aria-hidden />Directions
              </a>
            )}
          </div>

          {/* When */}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">ETD</dt>
              <dd className="text-base font-semibold">{etd ? `${etd.clock}` : '—'}</dd>
              {etd && <dd className="text-muted-foreground">{etd.rel}</dd>}
            </div>
            <div>
              <dt className="text-muted-foreground">ETA</dt>
              <dd className="text-base font-semibold">{eta ? `${eta.clock}` : '—'}</dd>
              {eta && <dd className="text-muted-foreground">{eta.rel}</dd>}
            </div>
          </dl>

          {/* Who to call */}
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contacts.map(c => (
                <a
                  key={c.key}
                  href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Call ${c.label}`}
                >
                  <Phone className="h-4 w-4 text-primary" aria-hidden />{c.label}
                </a>
              ))}
            </div>
          )}

          {/* DO team */}
          {(journey.duty_officers?.length ?? 0) > 1 && (
            <p className="text-sm text-muted-foreground">
              DO team: {journey.duty_officers!.map(d => `${d.users?.full_name ?? 'Officer'}${d.is_lead ? ' (lead)' : ''}`).join(', ')}
            </p>
          )}

          {/* Shift handoff — must be accepted before any call sign */}
          {isPendingAcknowledge && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Shift handoff pending</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Acknowledge to assume operational responsibility for this journey.
              </p>
              <button
                type="button"
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-base font-semibold text-white hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {acknowledging ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Shield className="h-4 w-4" aria-hidden />}
                {acknowledging ? 'Confirming…' : 'Acknowledge assignment'}
              </button>
            </div>
          )}

          {isBrokenArrow && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm text-destructive">
                <strong>Incident active — Broken Arrow.</strong> When the Cheetah is moving again, send Cocktail to resume.
              </p>
            </div>
          )}

          {isTerminal && (
            <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              Journey is <strong>{status.replace(/_/g, ' ')}</strong>. No further call signs available.
            </p>
          )}

          {/* Next action + the rest of the call signs */}
          {!isPendingAcknowledge && !isTerminal && (
            <div className="space-y-3">
              {next && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    if (next === 'complete') void completeJourney()
                    else void send(next, isPlanned ? 'Journey started' : undefined)
                  }}
                  className={cn(
                    'flex min-h-14 w-full items-center justify-center gap-3 rounded-xl px-4 text-lg font-bold shadow-md',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    next === 'complete' || isPlanned ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground'
                  )}
                >
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    : next === 'complete' ? <CheckCircle className="h-5 w-5" aria-hidden />
                    : isPlanned ? <Play className="h-5 w-5" aria-hidden />
                    : <Navigation className="h-5 w-5" aria-hidden />}
                  {isPlanned
                    ? `Start journey — ${getCallSignLabel(firstSign)}`
                    : next === 'complete' ? 'Next: Complete journey' : `Next: ${getCallSignLabel(next)}`}
                </button>
              )}

              {!isPlanned && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {otherMovement.map(sign => {
                      const { direction, severity } = getCallSignVisual(sign.key)
                      const Icon = PHASE_ICON[direction]
                      const isActive = status === sign.key
                      return (
                        <button
                          key={sign.key}
                          type="button"
                          disabled={sending || isActive}
                          aria-pressed={isActive}
                          onClick={() => void send(sign.key)}
                          className={cn(
                            'flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                            SEVERITY_SOFT[severity]
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden />{sign.label}
                        </button>
                      )
                    })}
                    {next !== 'complete' && (
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void completeJourney()}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 text-sm font-semibold text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      >
                        <CheckCircle className="h-4 w-4" aria-hidden />Complete
                      </button>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <Waves className="h-4 w-4" aria-hidden />Live broadcasts — status unchanged
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {broadcasts.map(sign => (
                        <button
                          key={sign.key}
                          type="button"
                          disabled={sending}
                          onClick={() => void send(sign.key)}
                          title={sign.description}
                          className={cn(
                            'inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-sm font-semibold',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                            SEVERITY_SOFT[getCallSignVisual(sign.key).severity]
                          )}
                        >
                          {sign.label}
                          <span className="font-normal opacity-80">· {sign.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isTerminal && !isPendingAcknowledge && (
        <DistressButton
          active={isBrokenArrow}
          onTrigger={() => void send('broken_arrow', 'Declared via press-and-hold distress button')}
        />
      )}
    </div>
  )
}
