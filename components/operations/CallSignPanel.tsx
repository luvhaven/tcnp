"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Loader2, CheckCircle, AlertTriangle, Clock, Navigation,
  Radio, Waves, AlertCircle
} from 'lucide-react'
import { CALL_SIGNS, type CallSign, type CallSignKey, getCallSignLabel } from '@/lib/constants/call-signs'
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

// ─── Button styling per call sign ─────────────────────────────────────────────

const CALL_SIGN_STYLES: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  first_course:  { bg: 'bg-blue-600 hover:bg-blue-700',       text: 'text-white', border: 'border-blue-700',    ring: 'ring-blue-400' },
  cocktail:      { bg: 'bg-emerald-600 hover:bg-emerald-700', text: 'text-white', border: 'border-emerald-700', ring: 'ring-emerald-400' },
  chapman:       { bg: 'bg-teal-600 hover:bg-teal-700',       text: 'text-white', border: 'border-teal-700',    ring: 'ring-teal-400' },
  dessert:       { bg: 'bg-indigo-600 hover:bg-indigo-700',   text: 'text-white', border: 'border-indigo-700',  ring: 'ring-indigo-400' },
  blue_cocktail: { bg: 'bg-sky-500 hover:bg-sky-600',         text: 'text-white', border: 'border-sky-600',     ring: 'ring-sky-300' },
  red_cocktail:  { bg: 'bg-orange-500 hover:bg-orange-600',   text: 'text-white', border: 'border-orange-600',  ring: 'ring-orange-300' },
  re_order:      { bg: 'bg-purple-600 hover:bg-purple-700',   text: 'text-white', border: 'border-purple-700',  ring: 'ring-purple-400' },
  broken_arrow:  { bg: 'bg-red-600 hover:bg-red-700',         text: 'text-white', border: 'border-red-700',     ring: 'ring-red-400' },
}

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

  const isTerminal = status === 'completed' || status === 'cancelled' || status === 'broken_arrow'

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
              <Badge
                variant={isTerminal ? 'destructive' : 'default'}
                className="capitalize"
              >
                {status
                  ? getCallSignLabel(status) || status.replace(/_/g, ' ')
                  : 'Planned — Awaiting First Call Sign'}
              </Badge>
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
                  const styles = CALL_SIGN_STYLES[sign.key] || { bg: 'bg-muted', text: '', border: '', ring: '' }
                  const isActive = status === sign.key
                  return (
                    <button
                      key={sign.key}
                      onClick={() => handleSignClick(sign)}
                      disabled={loading}
                      className={cn(
                        'py-3 px-2 rounded-lg border-2 flex flex-col items-center gap-1 text-center transition-all hover:scale-[1.03] active:scale-[0.98]',
                        isActive
                          ? cn(styles.bg, styles.text, `ring-2 ring-offset-2 ${styles.ring}`)
                          : cn('border-border hover:border-primary/50', styles.bg, styles.text),
                        loading && 'opacity-60 cursor-not-allowed'
                      )}
                    >
                      {isActive && (
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-80 bg-white/20 rounded px-1">Active</span>
                      )}
                      <span className="font-semibold text-sm">{sign.label}</span>
                      <span className="text-[10px] opacity-80 leading-tight">{sign.description}</span>
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
              {CALL_SIGNS.filter(s => EVENT_CALL_SIGNS.includes(s.key)).map(sign => {
                const styles = CALL_SIGN_STYLES[sign.key] || { bg: 'bg-muted', text: '', border: '', ring: '' }
                return (
                  <button
                    key={sign.key}
                    onClick={() => handleSignClick(sign)}
                    disabled={loading}
                    className={cn(
                      'w-full py-2 px-3 rounded-lg border-2 border-border flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]',
                      styles.bg, styles.text,
                      loading && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    <div className="w-2 h-2 rounded-full bg-white/50 flex-shrink-0" />
                    <div className="text-left">
                      <span className="font-semibold text-sm block">{sign.label}</span>
                      <span className="text-[10px] opacity-80">{sign.description}</span>
                    </div>
                  </button>
                )
              })}

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
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg border-2 border-destructive bg-destructive/10 text-destructive hover:bg-destructive hover:text-white flex items-center gap-3 transition-all font-semibold active:scale-[0.98]"
              >
                <AlertTriangle className="h-5 w-5" />
                <div className="text-left">
                  <span className="text-sm block">BROKEN ARROW</span>
                  <span className="text-xs font-normal opacity-80">Distress — major incident immobilizing all Cheetahs</span>
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
