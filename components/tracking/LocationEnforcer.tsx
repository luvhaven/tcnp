'use client'

/**
 * LocationEnforcer
 *
 * Shows a soft, dismissible banner when the current user has not
 * granted browser location access.
 *
 * - Admin / command roles: always skippable, auto-dismissed on any failure
 * - Field officers (DO, Oscars): shown a persistent banner but never fully blocked
 *
 * Design principle: NEVER hard-block the app. Operational continuity > location precision.
 */

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MapPin, AlertTriangle, X, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

// Roles that can always dismiss the prompt
const SKIPPABLE_ROLES = [
  'dev_admin', 'super_admin', 'admin', 'command', 'head_of_command',
  'captain', 'vice_captain', 'viewer', 'hod', 'hop',
  'head_of_operations', 'tango_oscar', 'head_tango_oscar',
]

export function LocationEnforcer() {
  const [show, setShow] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [locationMode, setLocationMode] = useState<'gps' | 'ip' | 'unavailable' | null>(null)

  useEffect(() => {
    const check = async () => {
      try {
        if (typeof navigator === 'undefined') return
        if (!('geolocation' in navigator)) return

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        const userRole = (data as any)?.role ?? null
        setRole(userRole)

        // Check permission via Permissions API where available
        const nav = navigator as any
        if ('permissions' in nav && nav.permissions) {
          try {
            const result = await nav.permissions.query({ name: 'geolocation' })
            if (result.state === 'granted') return  // Already tracking — hide enforcer

            setShow(true)

            result.addEventListener('change', () => {
              if (result.state === 'granted') setShow(false)
            })
          } catch {
            // Permissions API not available (e.g. Firefox private mode) — try a quick probe
            nav.geolocation.getCurrentPosition(
              () => setShow(false),
              () => setShow(true),
              { timeout: 3000, maximumAge: 60000 }
            )
          }
        } else {
          nav.geolocation.getCurrentPosition(
            () => setShow(false),
            () => setShow(true),
            { timeout: 3000, maximumAge: 60000 }
          )
        }
      } catch {
        // Non-fatal — never block the app
      }
    }

    const timer = setTimeout(check, 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleEnable = useCallback(async () => {
    setRequesting(true)

    // ── Step 1: Try hardware GPS ───────────────────────────────────────────
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        const nav = navigator as any
        nav.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, // Lower bar on desktop — avoids instant denial
          timeout: 10000,
          maximumAge: 60000
        })
      })

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await (supabase as any).rpc('upsert_user_location', {
          p_user_id: user.id,
          p_latitude: position.coords.latitude,
          p_longitude: position.coords.longitude,
          p_accuracy: position.coords.accuracy,
          p_altitude: position.coords.altitude ?? null,
          p_heading: position.coords.heading ?? null,
          p_speed: position.coords.speed ?? null,
          p_battery_level: null
        })
      }

      setLocationMode('gps')
      toast.success('Location sharing enabled — you are now visible on the live map.')
      setShow(false)
      setRequesting(false)
      return
    } catch (gpsErr: any) {
      console.warn('Hardware GPS unavailable:', gpsErr?.message)
    }

    // ── Step 2: IP-based network fallback (via local proxy) ───────────────
    try {
      const ipRes = await fetch('/api/geoip', { signal: AbortSignal.timeout(8000) })
      if (ipRes.ok) {
        const ipData = await ipRes.json()
        if (ipData?.latitude && ipData?.longitude) {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await (supabase as any).rpc('upsert_user_location', {
              p_user_id: user.id,
              p_latitude: ipData.latitude,
              p_longitude: ipData.longitude,
              p_accuracy: 5000,
              p_altitude: null,
              p_heading: null,
              p_speed: null,
              p_battery_level: null
            })
          }
          setLocationMode('ip')
          toast.warning('Using approximate network location. Enable GPS for precision tracking.')
          setShow(false)
          setRequesting(false)
          return
        }
      }
    } catch (ipErr) {
      console.warn('IP geolocation fallback failed:', ipErr)
    }

    // ── Step 3: Both failed — handle gracefully by role ───────────────────
    setLocationMode('unavailable')
    const isSkippable = role ? SKIPPABLE_ROLES.includes(role) : true

    if (isSkippable) {
      // Admin/command: silently dismiss — don't block operational work
      toast.info('Location unavailable on this device. You can enable it later in browser settings.', {
        duration: 5000
      })
      setShow(false)
    } else {
      // Field officers: keep the banner visible but don't throw a scary error
      toast.warning('Location access is required for field operations. Please check your browser settings.', {
        duration: 8000
      })
    }
    setRequesting(false)
  }, [role])

  // Skippable roles can always dismiss
  const canSkip = role ? SKIPPABLE_ROLES.includes(role) : true

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom-4">

        {/* Dismiss — always shown (field officers see it too, just encouraged to enable) */}
        <button
          onClick={() => setShow(false)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Location Access Required</h2>
            <p className="text-xs text-muted-foreground">TCNP Live Tracking Protocol</p>
          </div>
        </div>

        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 flex gap-2.5 text-sm text-orange-700 dark:text-orange-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            All personnel must share their location for live coordination. Your position is only visible to administrators and command.
          </span>
        </div>

        {locationMode === 'unavailable' && (
          <div className="rounded-lg bg-muted border border-border p-3 flex gap-2.5 text-xs text-muted-foreground">
            <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              GPS and network location are both restricted on this device.
              {canSkip
                ? ' You can dismiss this prompt and continue working.'
                : ' Please enable location in your OS settings or browser address bar, then refresh.'}
            </span>
          </div>
        )}

        <Button
          onClick={handleEnable}
          disabled={requesting}
          className="w-full"
          size="lg"
        >
          {requesting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Getting location…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Enable Location Sharing
            </span>
          )}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          {canSkip
            ? 'You may close this prompt without enabling location.'
            : 'You can revoke location access at any time via your browser settings.'}
        </p>
      </div>
    </div>
  )
}
