'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AlertTriangle, X, ShieldAlert } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

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
  const audioCtxRef = useRef<AudioContext | null>(null)
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const playAlarm = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx

      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.4, ctx.currentTime + start)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + duration)
      }

      // Alarm pattern: two tones rapidly
      playTone(880, 0, 0.3)
      playTone(660, 0.35, 0.3)
      playTone(880, 0.7, 0.3)
      playTone(660, 1.05, 0.3)

      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 400])
      }
    } catch (e) {
      // Audio context may require user interaction
    }
  }, [])

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current)
      alarmIntervalRef.current = null
    }
    try {
      audioCtxRef.current?.close()
    } catch (e) {}
  }, [])

  const handleDismiss = useCallback(() => {
    stopAlarm()
    setDismissed(true)
    setAlert(null)
  }, [stopAlarm])

  useEffect(() => {
    if (!alert || dismissed) return

    // Play alarm immediately then every 5 seconds
    playAlarm()
    alarmIntervalRef.current = setInterval(playAlarm, 5000)

    return () => stopAlarm()
  }, [alert, dismissed, playAlarm, stopAlarm])

  useEffect(() => {
    const channel = supabase
      .channel('broken-arrow-monitor')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'journeys' },
        async (payload) => {
          const updated = payload.new as any
          if (updated?.status !== 'broken_arrow') return

          // Fetch papa and cheetah names
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

          setDismissed(false)
          setAlert({
            journeyId: updated.id,
            papaName,
            cheetahCallSign,
            timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
              {/* Dismiss button */}
              <button
                type="button"
                onClick={handleDismiss}
                className="absolute right-4 top-4 rounded-full bg-red-800 p-1.5 hover:bg-red-700 transition-colors"
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

                {/* Actions */}
                <div className="flex gap-3 justify-center pt-2">
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
