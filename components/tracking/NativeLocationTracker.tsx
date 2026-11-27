'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { isLocationSharingEnabled } from '@/lib/location-sharing'
import {
  ensureNativeTracking, requestNativeLocationPermission, stopNativeTracking, subscribeToNativeLocation, type NativeLocationStatus,
} from '@/lib/native-shell'

/**
 * Location sharing inside the native TCNP app.
 *
 * Here the app itself, not this web page, reads the phone's location and
 * sends it, so sharing continues with the phone locked or TCNP in the
 * background. This component only starts that, shows its state, and stops it
 * when the officer switches sharing off.
 */
export function NativeLocationTracker() {
  const [status, setStatus] = useState<NativeLocationStatus | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    const start = () => ensureNativeTracking().then(
      next => { if (live) { setStatus(next); setFailed(null) } },
      error => { if (live) setFailed(error instanceof Error ? error.message : 'Location sharing could not start.') },
    )
    void start()
    const unsubscribe = subscribeToNativeLocation(next => { if (live) setStatus(next) })
    // The system can end tracking (permission changed in Settings, app updated).
    const onVisible = () => { if (document.visibilityState === 'visible') void start() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      // Unmounted because sharing was switched off: stop the app and give up
      // the device token. A plain page change leaves tracking running.
      if (!isLocationSharingEnabled()) void stopNativeTracking()
    }
  }, [])

  const allowAlways = async () => {
    setBusy(true)
    try {
      const permission = await requestNativeLocationPermission()
      if (permission !== 'always') toast.error('Choose “Always” (or “Allow all the time”) for TCNP in your phone’s location settings.')
      setStatus(await ensureNativeTracking())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change the location permission.')
    } finally { setBusy(false) }
  }

  if (failed) {
    return (
      <div className="pointer-events-auto w-full rounded-xl border border-amber-300 bg-card p-3 text-sm shadow-elevation-lg dark:border-amber-700" role="alert">
        <p className="font-semibold">Location sharing could not start</p>
        <p className="mt-1 text-muted-foreground">{failed}</p>
      </div>
    )
  }
  if (!status) return null

  if (status.permission !== 'always') {
    return (
      <div className="pointer-events-auto w-full rounded-xl border border-amber-300 bg-card p-3 text-sm shadow-elevation-lg dark:border-amber-700" role="alert">
        <p className="font-semibold">Your location stops when the phone locks</p>
        <p className="mt-1 text-muted-foreground">TCNP is only allowed your location while it is open. Allow it “Always” so Command can still see you with the phone in your pocket.</p>
        <button type="button" disabled={busy} onClick={() => void allowAlways()} className="mt-2 min-h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? 'Opening…' : 'Allow “Always”'}
        </button>
      </div>
    )
  }

  if (!status.running || hidden) return null
  return (
    <div className="pointer-events-none flex justify-center sm:justify-end">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-2 text-xs text-white shadow-lg sm:text-sm whitespace-nowrap">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
        <span>Sharing your location, even when locked.</span>
        <button type="button" onClick={() => setHidden(true)} className="ml-1 text-xs font-medium text-emerald-100 hover:text-white">Hide</button>
      </div>
    </div>
  )
}
