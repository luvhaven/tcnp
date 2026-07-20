'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AlertTriangle, X, ShieldAlert, Volume2, VolumeX } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { audioManager } from '@/lib/audio/AudioManager'

interface BrokenArrowEvent {
  journeyId: string
  papaName: string
  cheetahCallSign: string
  timestamp: string
}

export function BrokenArrowAlert() {
  const supabase = createClient()
  const [alert, setAlert] = useState<BrokenArrowEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // Mirror the global muted state for rendering
  const [muted, setMuted] = useState(() => audioManager.muted)
  // Journeys whose broken_arrow the operator has already acknowledged. Prevents
  // re-alarming when the same still-broken_arrow row is updated again (e.g. an
  // admin edits ETA, or a duplicate realtime frame arrives). Cleared when the
  // journey leaves broken_arrow, so a genuinely new incident alerts again.
  const acknowledgedRef = useRef<Set<string>>(new Set())

  const handleDismiss = useCallback(() => {
    audioManager.stopAlarm()
    setDismissed(true)
    setAlert(prev => {
      if (prev) acknowledgedRef.current.add(prev.journeyId)
      return null
    })
  }, [])

  const handleMuteToggle = useCallback(() => {
    const nowMuted = audioManager.toggleMute()
    setMuted(nowMuted)
    // If unmuting, restart the alarm so they hear feedback immediately
    if (!nowMuted) audioManager.startAlarm()
  }, [])

  // Start / stop alarm loop via AudioManager
  useEffect(() => {
    if (!alert || dismissed) return
    audioManager.startAlarm()
    audioManager.vibrateEmergency()
    return () => audioManager.stopAlarm()
  }, [alert, dismissed])

  // Realtime listener: watch for broken_arrow status changes
  useEffect(() => {
    const channel = supabase
      .channel('broken-arrow-monitor')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'journeys' },
        async (payload) => {
          const updated = payload.new as any
          if (!updated?.id) return

          if (updated.status !== 'broken_arrow') {
            // Journey resumed or cleared — forget any prior acknowledgement so a
            // future broken_arrow on this journey raises a fresh alarm.
            acknowledgedRef.current.delete(updated.id)
            return
          }

          // Already acknowledged this incident — don't re-open or re-sound it.
          if (acknowledgedRef.current.has(updated.id)) return

          let papaName = 'Unknown Papa'
          let cheetahCallSign = 'Unknown Cheetah'

          if (updated.papa_id) {
            const { data } = await (supabase as any)
              .from('papas')
              .select('full_name')
              .eq('id', updated.papa_id)
              .single()
            if (data?.full_name) papaName = data.full_name
          }

          if (updated.assigned_cheetah_id) {
            const { data } = await (supabase as any)
              .from('cheetahs')
              .select('call_sign')
              .eq('id', updated.assigned_cheetah_id)
              .single()
            if (data?.call_sign) cheetahCallSign = data.call_sign
          }

          // Reset mute for each new incident so it always alerts
          audioManager.setMuted(false)
          setMuted(false)
          setDismissed(false)
          setAlert({
            journeyId: updated.id,
            papaName,
            cheetahCallSign,
            timestamp: new Date().toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <AnimatePresence>
      {alert && !dismissed && (
        <>
          {/* Full-screen backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-red-950/80 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Alert panel */}
          <motion.div
            key="alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ba-title"
            aria-describedby="ba-desc"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 350, damping: 25 } }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          >
            <div className="relative w-full max-w-lg rounded-2xl border-4 border-red-500 bg-red-950 text-white shadow-[0_0_80px_rgba(239,68,68,0.8)] animate-pulse-slow">
              {/* Top-right: dismiss only */}
              <button
                type="button"
                onClick={handleDismiss}
                className="absolute right-3 top-3 rounded-full bg-red-800 p-1.5 hover:bg-red-700 transition-colors"
                aria-label="Dismiss alert"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="p-8 text-center space-y-4">
                {/* Animated icon */}
                <div className="flex justify-center">
                  <div className="relative">
                    <ShieldAlert className="h-20 w-20 text-red-400 animate-ping absolute inset-0 opacity-75" />
                    <ShieldAlert className="h-20 w-20 text-red-300 relative" />
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h2 id="ba-title" className="text-4xl font-black tracking-widest uppercase text-red-300">
                    BROKEN ARROW
                  </h2>
                  <p className="text-red-400 text-sm font-medium mt-1 tracking-wide">
                    MAJOR INCIDENT DECLARED — ALL UNITS STANDBY
                  </p>
                  {/* Muted indicator */}
                  {muted && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-300/70 bg-red-900/40 rounded-full px-3 py-1">
                      <VolumeX className="h-3 w-3" />
                      Sound muted — alert is still active
                    </p>
                  )}
                </div>

                {/* Details */}
                <div id="ba-desc" className="bg-red-900/60 rounded-xl p-4 space-y-2 text-left border border-red-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400 font-medium">Papa:</span>
                    <span className="font-bold">{alert.papaName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400 font-medium">Cheetah:</span>
                    <span className="font-bold">{alert.cheetahCallSign}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400 font-medium">Time:</span>
                    <span className="font-bold font-mono">{alert.timestamp}</span>
                  </div>
                </div>

                {/* Action row: mute toggle + acknowledge */}
                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2 w-full">
                  {/* Mute / Unmute — prominent, labelled */}
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-all",
                      muted
                        ? "border-yellow-400 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20"
                        : "border-red-400 bg-red-900/60 text-red-200 hover:bg-red-800"
                    )}
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    {muted ? 'Unmute Alarm' : 'Mute Alarm'}
                  </button>

                  {/* Acknowledge */}
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-500 text-red-300 hover:bg-red-800 bg-transparent"
                    onClick={handleDismiss}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Acknowledge &amp; Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
