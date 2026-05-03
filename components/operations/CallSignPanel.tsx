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

// ─── Hex colours per call sign (guaranteed render — no Tailwind purge risk) ────

const SIGN_COLORS: Record<string, { base: string; hover: string }> = {
  first_course:  { base: '#2563eb', hover: '#1d4ed8' },
  cocktail:      { base: '#059669', hover: '#047857' },
  chapman:       { base: '#0d9488', hover: '#0f766e' },
  dessert:       { base: '#4f46e5', hover: '#4338ca' },
  blue_cocktail: { base: '#0ea5e9', hover: '#0284c7' },
  red_cocktail:  { base: '#f97316', hover: '#ea580c' },
  re_order:      { base: '#9333ea', hover: '#7e22ce' },
  broken_arrow:  { base: '#dc2626', hover: '#b91c1c' },
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
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const getBtnStyle = useCallback((key: string, isHovered: boolean) => {
    const c = SIGN_COLORS[key]
    if (!c) return { backgroundColor: '#6b7280', color: '#ffffff' }
    return { backgroundColor: isHovered ? c.hover : c.base, color: '#ffffff', transition: 'background-color 150ms ease' }
  }, [])

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
                  const isActive = status === sign.key
                  const isHov = hoveredKey === sign.key
                  return (
                    <button
                      key={sign.key}
                      onClick={() => handleSignClick(sign)}
                      disabled={loading}
                      onMouseEnter={() => setHoveredKey(sign.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      style={getBtnStyle(sign.key, isHov)}
                      className={cn(
                        'py-3 px-2 rounded-lg border-2 border-transparent flex flex-col items-center gap-1 text-center transition-transform hover:scale-[1.03] active:scale-[0.98]',
                        isActive && 'ring-2 ring-white/60 ring-offset-2',
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
                const isHov = hoveredKey === sign.key
                return (
                  <button
                    key={sign.key}
                    onClick={() => handleSignClick(sign)}
                    disabled={loading}
                    onMouseEnter={() => setHoveredKey(sign.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={getBtnStyle(sign.key, isHov)}
                    className={cn(
                      'w-full py-2 px-3 rounded-lg border-2 border-transparent flex items-center gap-3 transition-transform hover:scale-[1.02] active:scale-[0.98]',
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
