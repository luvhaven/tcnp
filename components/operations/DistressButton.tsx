"use client"

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const HOLD_MS = 1500
const RING_RADIUS = 18
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface DistressButtonProps {
  /** Fires once the hold completes — runs the existing Broken Arrow flow. */
  onTrigger: () => void
  /** Broken Arrow is already the journey's status. */
  active?: boolean
  sending?: boolean
}

/**
 * BROKEN ARROW — press and hold for 1.5s.
 *
 * The hold is the confirmation: a distress call has to be quick to send under
 * stress, but must never go out from a pocket tap. Releasing early cancels.
 * Works with pointer (touch/mouse) and keyboard (hold Space or Enter).
 *
 * Renders a sticky full-width bar on phones and an inline button from md up;
 * pages using it need bottom padding (pb-28 md:pb-0) so the bar never covers
 * content.
 */
export default function DistressButton(props: DistressButtonProps) {
  return (
    <>
      <div
        // Sits directly above the phone tab bar (BottomNav), which owns the safe-area inset.
        className="distress-bar fixed inset-x-0 z-40 border-t border-destructive/30 bg-background/95 px-4 pt-3 pb-3 backdrop-blur-sm md:hidden"
        style={{ bottom: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))' }}
      >
        <HoldButton {...props} />
      </div>
      <div className="hidden md:block">
        <HoldButton {...props} />
      </div>
    </>
  )
}

function HoldButton({ onTrigger, active = false, sending = false }: DistressButtonProps) {
  const [progress, setProgress] = useState(0)
  const startedAt = useRef<number | null>(null)
  const frame = useRef<number | null>(null)
  const disabled = active || sending
  const hintId = useId()

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    startedAt.current = null
    setProgress(0)
  }, [])

  // Latest callback without restarting an in-progress hold when it changes
  const onTriggerRef = useRef(onTrigger)
  useEffect(() => { onTriggerRef.current = onTrigger }, [onTrigger])

  const start = useCallback(() => {
    if (disabled || startedAt.current !== null) return
    startedAt.current = performance.now()
    const loop = () => {
      if (startedAt.current === null) return
      const p = Math.min(1, (performance.now() - startedAt.current) / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        stop()
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(200)
        onTriggerRef.current()
        return
      }
      frame.current = requestAnimationFrame(loop)
    }
    frame.current = requestAnimationFrame(loop)
  }, [disabled, stop])

  useEffect(() => stop, [stop])

  const holding = progress > 0

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={active ? 'Broken Arrow is active' : 'Broken Arrow distress call — press and hold for 1.5 seconds to send'}
      aria-describedby={hintId}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        start()
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return
        e.preventDefault()
        if (!e.repeat) start()
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop()
      }}
      onBlur={stop}
      className={cn(
        'relative flex min-h-14 w-full touch-none select-none items-center justify-center gap-3 rounded-xl px-4',
        'bg-destructive text-base font-bold uppercase tracking-wide text-destructive-foreground shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        holding && 'brightness-110'
      )}
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth="4" />
          <circle
            cx="22" cy="22" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          />
        </svg>
        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span>{active ? 'Broken Arrow active' : holding ? 'Keep holding…' : 'Broken Arrow'}</span>
        <span id={hintId} className="text-sm font-medium normal-case tracking-normal opacity-90">
          {active ? 'Send Cocktail when moving again' : 'Press and hold to send distress'}
        </span>
      </span>
    </button>
  )
}
