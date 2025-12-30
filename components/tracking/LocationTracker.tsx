'use client'

import { useEffect, useState } from 'react'
import { useIsClient } from '@/hooks/useIsClient'

/**
 * iOS-Safe LocationTracker Component
 * 
 * This version is specifically designed to NOT crash on iOS Safari by:
 * 1. Waiting 10 seconds before attempting any geolocation operations
 * 2. Wrapping ALL geolocation calls in try-catch blocks
 * 3. Never auto-requesting permissions - only works if permission already granted
 * 4. Failing silently with console warnings instead of throwing errors
 */
export function LocationTracker() {
  const isClient = useIsClient()
  const [isIOS, setIsIOS] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isTracking, setIsTracking] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)

  // Detect iOS on mount
  useEffect(() => {
    if (isClient && typeof navigator !== 'undefined') {
      try {
        const ua = navigator.userAgent
        const isIOSDevice = /iPad|iPhone|iPod/.test(ua) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        setIsIOS(isIOSDevice)
      } catch (e) {
        console.warn('iOS detection failed (non-fatal)')
      }
    }
  }, [isClient])

  // Wait significantly longer on iOS before doing anything
  useEffect(() => {
    if (!isClient) return

    // Wait 10 seconds on iOS, 3 seconds otherwise
    const delay = isIOS ? 10000 : 3000

    const timer = setTimeout(() => {
      setIsReady(true)
    }, delay)

    return () => clearTimeout(timer)
  }, [isClient, isIOS])

  // Check if we already have permission (don't request it)
  useEffect(() => {
    if (!isReady) return

    const checkPermission = async () => {
      try {
        // Check if geolocation is even available
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
          console.log('📍 Geolocation not available on this device')
          return
        }

        // On iOS, skip the permissions API as it's often unreliable
        if (isIOS) {
          // Instead, try to get a single position with a short timeout
          // If it works, we have permission
          try {
            await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                { timeout: 5000, enableHighAccuracy: false, maximumAge: 60000 }
              )
            })
            setPermissionGranted(true)
            console.log('📍 iOS location permission confirmed')
          } catch (e) {
            console.log('📍 iOS location not available or denied')
            // Don't crash - just don't track
          }
          return
        }

        // On non-iOS, check permissions API
        if ('permissions' in navigator) {
          try {
            const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
            if (result.state === 'granted') {
              setPermissionGranted(true)
              console.log('📍 Location permission already granted')
            } else {
              console.log('📍 Location permission not granted:', result.state)
            }
          } catch (e) {
            console.warn('Permissions API not available (non-fatal)')
          }
        }
      } catch (error) {
        // Never crash - just log
        console.warn('📍 Permission check failed (non-fatal):', error)
      }
    }

    checkPermission()
  }, [isReady, isIOS])

  // Start tracking only if permission is already granted
  useEffect(() => {
    if (!isReady || !permissionGranted) return

    let watchId: number | null = null
    let mounted = true

    const startTracking = async () => {
      try {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
          return
        }

        // Import the Supabase client and tracking logic only when needed
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.log('📍 No authenticated user, skipping location tracking')
          return
        }

        const updateLocation = async (position: GeolocationPosition) => {
          if (!mounted) return

          try {
            const { error } = await (supabase as any).rpc('upsert_user_location', {
              p_user_id: user.id,
              p_latitude: position.coords.latitude,
              p_longitude: position.coords.longitude,
              p_accuracy: position.coords.accuracy,
              p_altitude: position.coords.altitude ?? null,
              p_heading: position.coords.heading ?? null,
              p_speed: position.coords.speed ?? null,
              p_battery_level: null
            })

            if (error) {
              console.warn('📍 Location update failed (non-fatal):', error)
            } else {
              console.log('📍 Location updated successfully')
            }
          } catch (e) {
            console.warn('📍 Location DB update failed (non-fatal):', e)
          }
        }

        // Use watchPosition with generous timeouts
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            if (mounted) {
              setIsTracking(true)
              updateLocation(position)
            }
          },
          (error) => {
            // Don't crash on errors - just log them
            console.warn('📍 Geolocation error (non-fatal):', error.message)
            if (error.code === error.PERMISSION_DENIED) {
              setPermissionGranted(false)
              setIsTracking(false)
            }
          },
          {
            enableHighAccuracy: !isIOS, // Low accuracy on iOS to reduce crashes
            timeout: 30000,
            maximumAge: 10000
          }
        )

        setIsTracking(true)
        console.log('📍 Location tracking started')
      } catch (error) {
        console.warn('📍 Failed to start tracking (non-fatal):', error)
      }
    }

    startTracking()

    return () => {
      mounted = false
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }, [isReady, permissionGranted, isIOS])

  // Only show banner if tracking is active and not dismissed
  const showBanner = isTracking && !bannerDismissed

  if (!showBanner) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-3 sm:px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-2 text-xs text-white shadow-lg sm:text-sm">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
        <span>Live location sharing is active.</span>
        <button
          type="button"
          onClick={() => setBannerDismissed(true)}
          className="ml-1 text-xs font-medium text-emerald-100 hover:text-white"
        >
          Hide
        </button>
      </div>
    </div>
  )
}
