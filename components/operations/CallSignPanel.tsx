"use client"

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Loader2, CheckCircle, AlertTriangle, Clock, Navigation,
  Radio, Waves, AlertCircle
} from 'lucide-react'
import {
  CALL_SIGNS, getCallSignLabel, getCallSignVisual,
  SEVERITY_SOLID, SEVERITY_SOFT,
  type CallSign, type CallSignKey, type CallSignDirection,
} from '@/lib/constants/call-signs'
import { ArrowUpRight, ArrowDownLeft, MapPin, Minus } from 'lucide-react'
import { CallSignChip } from '@/components/ui/call-sign-chip'

/** Direction glyph per movement phase — identity carried by form, not colour. */
const PHASE_ICON: Record<CallSignDirection, React.ComponentType<{ className?: string }>> = {
  outbound: ArrowUpRight,
  inbound: ArrowDownLeft,
  transit: Navigation,
  arrived: MapPin,
  alert: AlertTriangle,
  none: Minus,
}
import { useJourneyStatus, STATUS_CALL_SIGNS, EVENT_CALL_SIGNS } from '@/hooks/useJourneyStatus'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface CallSignPanelProps {
  journeyId: string
  papaName?: string
  cheetahName?: string
  origin?: string
  destination?: string
}

// Colour for these buttons now comes from the shared severity system
// (lib/constants/call-signs.ts) rather than eight hand-picked hexes that
// disagreed with every other screen. As an *action* grid the movement phases
// stay quiet and are told apart by their direction icon + label; the currently
// active phase is the one that fills in. That way the loud colours are left
// for the choices that actually carry consequence — traffic and distress.

// ─── Component ────────────────────────────────────────────────────────────────

export default function CallSignPanel({
  journeyId,
  papaName,
  cheetahName,
  origin,
  destination,
}: CallSignPanelProps) {
  const { status, lastUpdated, loading, updateStatus, completeJourney } = useJourneyStatus(journeyId)
  const [selectedSign, setSelectedSign] = useState<CallSign | null>(null)
  const [notes, setNotes] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  /** Movement phases: outline until they're the live phase, then filled. */
  const statusBtnClass = useCallback((key: string, isActive: boolean) => {
    const { severity } = getCallSignVisual(key)
    return isActive ? SEVERITY_SOLID[severity] : SEVERITY_SOFT[severity]
  }, [])

  /** Broadcasts carry consequence, so they stay tinted at rest. */
  const eventBtnClass = useCallback((key: string) => {
    const { severity } = getCallSignVisual(key)
    return SEVERITY_SOFT[severity]
  }, [])

  const isTerminal = status === 'completed' || status === 'cancelled'
  const isBrokenArrow = status === 'broken_arrow'

  const handleSignClick = (sign: CallSign) => {
    setSelectedSign(sign)
    setNotes('')
    setDialogOpen(true)
  }

  const handleConfirm = async () => {
    if (!selectedSign) return
    await updateStatus(selectedSign.key, notes)
    setDialogOpen(false)
  }

  return (
    <div className="space-y-5">
      {/* Journey context */}
      {(papaName || origin || destination) && (
        <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
          {cheetahName && <span className="font-medium text-foreground">🚗 {cheetahName}</span>}
          {papaName && <span>· {papaName}</span>}
          {origin && destination && <span>· {origin} → {destination}</span>}
        </div>
      )}

      {/* Current status bar */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm font-semibold">Current Status</span>
              </div>
              <CallSignChip
                callSign={status ?? 'planned'}
                label={status ? undefined : 'Awaiting first call sign'}
              />
            </div>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Select any call sign below to update the journey — no fixed steps.
          </p>
        </CardContent>
      </Card>

      {/* ── Broken Arrow: incident-active banner ─────────────────────────── */}
      {isBrokenArrow && (
        <Card className="border-destructive/60 bg-destructive/5 animate-pulse">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-destructive">INCIDENT ACTIVE — BROKEN ARROW</p>
              <p className="text-xs text-destructive/80 mt-0.5">
                Incident acknowledged. When the Cheetah is moving again, tap <strong>Cocktail</strong> or any call sign below to resume operations.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Live call sign panel ─────────────────────────────────────────── */}
      {!isTerminal && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Status-advancing call signs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" />
                Protocol Call Signs
              </CardTitle>
              <CardDescription className="text-xs">
                Click any sign to update Papa's journey status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {CALL_SIGNS.filter(s => STATUS_CALL_SIGNS.includes(s.key)).map(sign => {
                  const isActive = status === sign.key
                  const { direction } = getCallSignVisual(sign.key)
                  const DirIcon = PHASE_ICON[direction]
                  return (
                    <button
                      key={sign.key}
                      onClick={() => handleSignClick(sign)}
                      disabled={loading}
                      aria-pressed={isActive}
                      className={cn(
                        'relative flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-center transition-all duration-150',
                        'hover:-translate-y-0.5 hover:shadow-elevation active:translate-y-0',
                        statusBtnClass(sign.key, isActive),
                        loading && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      {isActive && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                      )}
                      <DirIcon className="h-4 w-4 opacity-80" aria-hidden />
                      <span className="text-sm font-semibold">{sign.label}</span>
                      <span className="text-[10px] leading-tight opacity-75">{sign.description}</span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Live event call signs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Waves className="h-4 w-4 text-sky-600" />
                Live Broadcasts
              </CardTitle>
              <CardDescription className="text-xs">Traffic & route updates — visible on Ops Monitor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {CALL_SIGNS.filter(s => EVENT_CALL_SIGNS.includes(s.key)).map(sign => (
                <button
                  key={sign.key}
                  onClick={() => handleSignClick(sign)}
                  disabled={loading}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-150',
                    'hover:-translate-y-0.5 hover:shadow-elevation active:translate-y-0',
                    eventBtnClass(sign.key),
                    loading && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-current" aria-hidden />
                  <div className="text-left">
                    <span className="block text-sm font-semibold">{sign.label}</span>
                    <span className="text-[10px] opacity-75">{sign.description}</span>
                  </div>
                </button>
              ))}

              {/* Complete journey */}
              <button
                onClick={completeJourney}
                disabled={loading}
                className="w-full py-2 px-3 rounded-lg border-2 border-green-300 bg-green-600 text-white flex items-center gap-3 transition-all hover:bg-green-700 active:scale-[0.98]"
              >
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <div className="text-left">
                  <span className="font-semibold text-sm block">Complete Journey</span>
                  <span className="text-[10px] opacity-80">Mark mission as complete</span>
                </div>
              </button>
            </CardContent>
          </Card>

          {/* Broken Arrow — full width */}
          <Card className="border-destructive/30 md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Emergency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <button
                onClick={() => {
                  const sign = CALL_SIGNS.find(s => s.key === 'broken_arrow')
                  if (sign) handleSignClick(sign)
                }}
                disabled={loading || isBrokenArrow}
                className="w-full py-3 px-4 rounded-lg border-2 border-destructive bg-destructive/10 text-destructive hover:bg-destructive hover:text-white flex items-center gap-3 transition-all font-semibold active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AlertTriangle className="h-5 w-5" />
                <div className="text-left">
                  <span className="text-sm block">
                    {isBrokenArrow ? 'INCIDENT ACTIVE — BROKEN ARROW' : 'BROKEN ARROW'}
                  </span>
                  <span className="text-xs font-normal opacity-80">
                    {isBrokenArrow
                      ? 'Update with Cocktail or another sign above when resolved'
                      : 'Distress — major incident immobilizing all Cheetahs'}
                  </span>
                </div>
              </button>
            </CardContent>
          </Card>
        </div>
      )}

      {isTerminal && (
        <Card className="bg-muted/30">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Journey is <strong>{status?.replace(/_/g, ' ')}</strong>. No further call signs available.
            </p>
          </CardContent>
        </Card>
      )}

      {isBrokenArrow && !isTerminal && (
        <p className="text-[11px] text-center text-destructive/70">
          Broken Arrow is active. Use the call signs above to clear the incident when safe.
        </p>
      )}

      {/* Confirmation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedSign?.key === 'broken_arrow' ? '🚨 BROKEN ARROW' : `Execute: ${selectedSign?.label}`}
            </DialogTitle>
            <DialogDescription>{selectedSign?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {EVENT_CALL_SIGNS.includes(selectedSign?.key as CallSignKey) && (
              <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
                📡 This is a <strong>live broadcast</strong> — it will appear on the Ops Monitor without changing your main journey status.
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add any relevant details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleConfirm}
              disabled={loading}
              variant={selectedSign?.key === 'broken_arrow' ? 'destructive' : 'default'}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm — {selectedSign?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
