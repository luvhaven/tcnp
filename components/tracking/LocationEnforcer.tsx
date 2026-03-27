'use client'

/**
 * LocationEnforcer
 *
 * Shows a persistent, non-dismissible overlay when the current user has not
 * granted browser location access. The overlay blocks navigation until the
 * user clicks "Enable Location" and the browser permission is either granted
 * or the user explicitly skips (allowed only for admin/command roles).
 *
 * Admins can dismiss the prompt; field officers (DO, etc.) cannot.
 */

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MapPin, AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const ADMIN_ROLES = ['dev_admin', 'admin', 'command', 'head_of_command', 'captain', 'vice_captain', 'viewer']

export function LocationEnforcer() {
  const [show, setShow] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Check permission status on mount
  useEffect(() => {
    const check = async () => {
      try {
        if (typeof navigator === 'undefined') return
        if (!('geolocation' in navigator)) return

        // Get current user role
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

        // Query permission status
        if ('permissions' in navigator) {
          const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
          if (result.state === 'granted') return // Already good

          // Show enforcer for all logged-in users
          setShow(true)

          // Re-check if user grants via browser UI
          result.addEventListener('change', () => {
            if (result.state === 'granted') setShow(false)
          })
        } else {
          // Can't query Permissions API — try a quick getCurrentPosition
          try {
            await new Promise<void>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                () => { setShow(false); resolve() },
                () => { setShow(true); resolve() },
                { timeout: 2000 }
              )
            })
          } catch {
            setShow(true)
          }
        }
      } catch {
        // Non-fatal
      }
    }

    // Slight delay to avoid conflicting with LocationTracker mount
    const timer = setTimeout(check, 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleEnable = useCallback(async () => {
    setRequesting(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        })
      })

      // Log the position to DB
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

      toast.success('Location sharing enabled — you are now visible on the live map.')
      setShow(false)
    } catch (err: any) {
      if (err?.code === 1) {
        toast.error('Location access denied. Please allow location in your browser settings.')
      } else {
        toast.error('Could not get location. Please try again.')
      }
    } finally {
      setRequesting(false)
    }
  }, [])

  // Non-field roles can skip; DO/field officers cannot
  const canSkip = role ? ADMIN_ROLES.includes(role) : true

  if (!show || dismissed) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="relative mx-4 max-w-md w-full rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom-4">
        {/* Skip for admins only */}
        {canSkip && (
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Skip"
          >
            <X className="h-4 w-4" />
          </button>
        )}

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
          You can revoke this at any time via your browser settings.
          {canSkip && ' As an admin you may skip this prompt.'}
        </p>
      </div>
    </div>
  )
}
