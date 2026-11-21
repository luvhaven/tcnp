'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const HOLD_MS = 1500
const QUIET_AFTER_MS = 90_000

/**
 * A dark, touch-proof screen for carrying the phone while on duty.
 *
 * A phone only shares its location while TCNP is open and the screen is on.
 * Pocket mode keeps TCNP in front with a near-black screen (little battery on
 * iPhone displays) and ignores stray touches, so the phone can sit in a pocket
 * or on a dashboard and stay on the map. Press and hold to leave.
 */
export function PocketModeScreen({ lastSentAt, screenHeld, onExit }: { lastSentAt: number | null; screenHeld: boolean; onExit: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const startHold = () => {
    if (timer.current) clearTimeout(timer.current)
    setHolding(true)
    timer.current = setTimeout(() => { setHolding(false); onExit() }, HOLD_MS)
  }
  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  if (typeof document === 'undefined') return null
  const quiet = lastSentAt === null || now - lastSentAt > QUIET_AFTER_MS
  const clock = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sent = lastSentAt === null ? null : new Date(lastSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex select-none flex-col items-center justify-center gap-6 bg-black px-6 text-center text-neutral-500"
      role="dialog"
      aria-modal="true"
      aria-label="Pocket mode: location sharing is running"
      style={{ touchAction: 'none' }}
      onContextMenu={event => event.preventDefault()}
    >
      <p className="text-5xl font-light tabular-nums text-neutral-400">{clock}</p>
      <div className="space-y-1">
        <p className={`flex items-center justify-center gap-2 text-sm font-medium ${quiet ? 'text-amber-500' : 'text-emerald-600'}`}>
          <span className={`inline-flex h-2 w-2 rounded-full ${quiet ? 'bg-amber-500' : 'bg-emerald-600 animate-pulse'}`} />
          {quiet ? 'Waiting for a location' : 'Sharing your location'}
        </p>
        <p className="text-xs" role="status">
          {sent ? `Last sent ${sent}` : 'Nothing sent yet'}
          {quiet && sent ? ' — check signal and that Location is on' : ''}
        </p>
        {!screenHeld && <p className="text-xs text-amber-500">Tap once so the screen stays on</p>}
      </div>
      <p className="max-w-xs text-xs">Keep TCNP open like this and your location keeps sending. Do not lock the phone or switch apps.</p>
      <button
        type="button"
        className={`min-h-14 rounded-full border px-6 text-sm font-medium transition-colors ${holding ? 'border-neutral-300 bg-neutral-800 text-neutral-200' : 'border-neutral-700 text-neutral-400'}`}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) startHold() }}
        onKeyUp={cancelHold}
      >
        {holding ? 'Keep holding…' : 'Press and hold to exit'}
      </button>
    </div>,
    document.body,
  )
}
