'use client'

import { useEffect, useState, useRef } from 'react'
import { useIsClient } from '@/hooks/useIsClient'

/**
 * iOS-Safe LocationTracker Component with Permission Requests
 * 
 * This version:
 * 1. Waits 10 seconds on iOS before starting (3 seconds on other devices)
 * 2. Actively requests permission (like other devices)
 * 3. Wraps ALL operations in try-catch to prevent crashes
 * 4. Uses low accuracy on iOS to improve reliability
 */
export function LocationTracker() {
  const isClient = useIsClient()
  const [isIOS, setIsIOS] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isTracking, setIsTracking] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [permissionRequested, setPermissionRequested] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const lastPositionRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null)

  // Helper to calculate distance in meters
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3 // metres
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

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

  // Wait before starting - longer on iOS
  useEffect(() => {
    if (!isClient) return

    // Wait 10 seconds on iOS, 3 seconds otherwise
    const delay = isIOS ? 10000 : 3000

    const timer = setTimeout(() => {
      if (mountedRef.current) {
        setIsReady(true)
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [isClient, isIOS])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (watchIdRef.current !== null) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }, [])

  // Battery tracking state
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      try {
        // @ts-ignore - BatteryManager is not standard
        navigator.getBattery().then((battery: any) => {
          const updateBattery = () => {
            setBatteryLevel(Math.round(battery.level * 100))
          }

          updateBattery()
          battery.addEventListener('levelchange', updateBattery)

          return () => {
            battery.removeEventListener('levelchange', updateBattery)
          }
        })
      } catch (e) {
        console.warn('Battery status not supported')
      }
    }
  }, [])

  // Start tracking with permission request
  useEffect(() => {
    if (!isReady || permissionRequested) return

    const startTracking = async () => {
      setPermissionRequested(true)

      try {
        // Check if geolocation is available
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
          console.log('📍 Geolocation not available on this device')
          return
        }

        // Import Supabase only when needed
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.log('📍 No authenticated user, skipping location tracking')
          return
        }

        // Function to update location in database
        const updateLocation = async (position: GeolocationPosition) => {
          if (!mountedRef.current) return

          try {
            // Get latest battery level directly if possible, or use state
            let currentBattery = batteryLevel

            if (currentBattery === null && 'getBattery' in navigator) {
              try {
                // @ts-ignore
                const batt = await navigator.getBattery()
                currentBattery = Math.round(batt.level * 100)
                setBatteryLevel(currentBattery)
              } catch (e) { }
            }

            // Calculate speed if missing
            let speed = position.coords.speed
            const currentTimestamp = position.timestamp || Date.now()

            if (speed === null && lastPositionRef.current) {
              const dist = getDistanceMeters(
                lastPositionRef.current.latitude,
                lastPositionRef.current.longitude,
                position.coords.latitude,
                position.coords.longitude
              )
              const timeDiff = (currentTimestamp - lastPositionRef.current.timestamp) / 1000 // seconds

              if (timeDiff > 0) {
                speed = dist / timeDiff
              }
            }

            // Update last position for next calculation
            lastPositionRef.current = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              timestamp: currentTimestamp
            }

            const { error } = await (supabase as any).rpc('upsert_user_location', {
              p_user_id: user.id,
              p_latitude: position.coords.latitude,
              p_longitude: position.coords.longitude,
              p_accuracy: position.coords.accuracy,
              p_altitude: position.coords.altitude ?? null,
              p_heading: position.coords.heading ?? null,
              p_speed: speed ?? 0, // Default to 0 instead of null to avoid N/A
              p_battery_level: currentBattery
            })

            if (error) {
              console.warn('📍 Location update failed (non-fatal):', error.message)
            } else {
              console.log('📍 Location updated successfully')
            }
          } catch (e) {
            console.warn('📍 Location DB update failed (non-fatal):', e)
          }
        }

        // ... (rest of tracking logic)


        // Request permission by getting current position first
        // This triggers the browser's permission dialog
        console.log('📍 Requesting location permission...')

        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              {
                enableHighAccuracy: !isIOS, // Low accuracy on iOS
                timeout: 15000,
                maximumAge: 0
              }
            )
          })

          if (!mountedRef.current) return

          console.log('📍 Initial location obtained, starting continuous tracking')
          await updateLocation(position)

          // Start continuous tracking
          watchIdRef.current = navigator.geolocation.watchPosition(
            async (pos) => {
              if (mountedRef.current) {
                setIsTracking(true)
                await updateLocation(pos)
              }
            },
            (error) => {
              // Don't crash on watch errors
              console.warn('📍 Watch position error (non-fatal):', error.message)
              if (error.code === error.PERMISSION_DENIED) {
                setIsTracking(false)
              }
            },
            {
              enableHighAccuracy: !isIOS,
              timeout: 30000,
              maximumAge: 10000
            }
          )

          setIsTracking(true)
          console.log('📍 Location tracking active')

        } catch (error: any) {
          // Handle permission denial and other errors gracefully
          if (error?.code === 1) {
            console.log('📍 Location permission denied by user')
          } else if (error?.code === 2) {
            console.log('📍 Location unavailable (device may have location disabled)')
          } else if (error?.code === 3) {
            console.log('📍 Location request timed out')
          } else {
            console.warn('📍 Location permission request failed (non-fatal):', error?.message || error)
          }
          // Never crash - just don't track
        }

      } catch (error) {
        console.warn('📍 Location tracking setup failed (non-fatal):', error)
      }
    }

    startTracking()
  }, [isReady, permissionRequested, isIOS])

  // Only show banner if tracking is active and not dismissed
  const showBanner = isTracking && !bannerDismissed

  if (!showBanner) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-3 sm:px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-2 text-xs text-white shadow-lg sm:text-sm whitespace-nowrap">
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
