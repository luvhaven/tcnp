'use client'

import { useEffect, useState, useRef } from 'react'
import { useIsClient } from '@/hooks/useIsClient'
import { toast } from 'sonner'

/**
 * iOS-Safe LocationTracker Component with Permission Requests
 * 
 * This version:
 * 1. Waits 10 seconds on iOS before starting (3 seconds on other devices)
 * 2. Actively requests permission (like other devices)
 * 3. Wraps ALL operations in try-catch to prevent crashes
 * 4. Uses low accuracy on iOS to improve reliability
 * 5. Uses WakeLock API to keep screen alive
 * 6. Uses AudioContext for alerts (Network/Location loss)
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

  // Audio Alert System & Admin Notification
  const audioContextRef = useRef<AudioContext | null>(null)

  const sendAdminAlert = async (type: 'LOCATION_LOSS' | 'BATTERY_CRITICAL') => {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Generic notification insert - triggers realtime for admins subscribed to notifications
      // Adjust title/message as per app standard
      await supabase.from('notifications').insert({
        user_id: user.id, // Who caused it
        title: type === 'LOCATION_LOSS' ? 'SOS: Location Offline' : 'Battery Critical',
        message: type === 'LOCATION_LOSS'
          ? `User ${user.email} location stopped updating.`
          : `User device battery is critical.`,
        type: 'alert',
        read: false
      })
    } catch (e) {
      console.warn('Failed to send admin alert', e)
    }
  }

  const playAlert = (type: 'location_lost' | 'network_lost') => {
    // If location is lost, also notifying admin (throttled logic implied or just direct)
    if (type === 'location_lost') {
      sendAdminAlert('LOCATION_LOSS')
    }
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }

      const ctx = audioContextRef.current
      if (ctx.state === 'suspended') ctx.resume()

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      if (type === 'location_lost') {
        // High-pitch urgent alarm (beep-beep-beep)
        osc.type = 'square'
        osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1)
        osc.frequency.setValueAtTime(0, ctx.currentTime + 0.15) // Silence
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.25)
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.35)

        gain.gain.setValueAtTime(0.5, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

        osc.start()
        osc.stop(ctx.currentTime + 0.6)

        // Vibrate: SOS pattern
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100])
      } else {
        // Network lost: Descending warning
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.5)

        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5)

        osc.start()
        osc.stop(ctx.currentTime + 0.5)

        // Vibrate: Long buzz
        if (navigator.vibrate) navigator.vibrate([500])
      }
    } catch (e) {
      console.warn('Audio/Vibration failed (user interaction required first)')
    }
  }

  // Network Monitoring
  useEffect(() => {
    const handleOffline = () => {
      console.warn('⚠️ Network connection lost')
      toast.error('Network lost. Tracking paused.')
      playAlert('network_lost')
    }
    const handleOnline = () => {
      console.log('✅ Network restored')
      toast.success('Network restored. Resuming tracking.')
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // Wake Lock API (Keep screen on)
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('💡 Screen Wake Lock active');
        }
      } catch (err: any) {
        console.warn(`${err.name}, ${err.message}`);
      }
    };

    // Request on mount and re-request if visibility changes (e.g. tab switch)
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) wakeLock.release();
    };
  }, []);

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
          // Re-request logic: If we fail, we start an interval to retry
          const retryTracking = () => {
            console.log('📍 Retrying location request...')
            playAlert('location_lost')
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setIsTracking(true)
                updateLocation(pos)
              },
              (err) => console.warn('Retry failed:', err),
              { enableHighAccuracy: true, timeout: 10000 }
            )
          }

          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              {
                enableHighAccuracy: true, // Always try high accuracy first
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
              console.warn('📍 Watch position error:', error.message)
              setIsTracking(false)
              playAlert('location_lost') // Alert!

              // If permission denied or unavailable, try to prompt/recover
              if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
                toast.error('Location Access Lost! Please check settings.')
                // Retry every 10s if we lose it
                setTimeout(retryTracking, 10000)
              }
            },
            {
              enableHighAccuracy: true, // Force high accuracy for background resilience
              timeout: 30000,
              maximumAge: 0
            }
          )

          setIsTracking(true)

        } catch (error: any) {
          console.warn('📍 Initial Location Permission Failed:', error)
          playAlert('location_lost')
          toast.error('Location Permission Required')
        }

      } catch (error) {
        console.warn('📍 Location tracking setup failed:', error)
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
