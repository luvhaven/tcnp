'use client'

import { useEffect, useState, useRef } from 'react'
import { useIsClient } from '@/hooks/useIsClient'
import { toast } from 'sonner'

/**
 * LocationTracker Component - Clean Permission Flow
 * 
 * This version:
 * 1. Triggers native location permission immediately on sign-in
 * 2. No alerts during initial permission request
 * 3. Only alerts when tracking is LOST after being established
 * 4. Works on iPhone, Android, and Desktop
 * 5. Uses WakeLock API to keep screen alive
 */
export function LocationTracker() {
  const isClient = useIsClient()
  const [isTracking, setIsTracking] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [permissionRequested, setPermissionRequested] = useState(false)
  const [hasEverTracked, setHasEverTracked] = useState(false) // NEW: Track if we've successfully tracked before
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

      await (supabase as any).from('notifications').insert({
        user_id: user.id,
        title: type === 'LOCATION_LOSS' ? 'SOS: Location Offline' : 'Battery Critical',
        message: type === 'LOCATION_LOSS'
          ? `User ${user.email} location stopped updating.`
          : `User device battery is critical.`,
        type: 'alert',
        is_read: false
      })
    } catch (e) {
      console.warn('Failed to send admin alert', e)
    }
  }

  const playAlert = (type: 'location_lost' | 'network_lost') => {
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
        osc.type = 'square'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1)
        osc.frequency.setValueAtTime(0, ctx.currentTime + 0.15)
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.25)
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.35)

        gain.gain.setValueAtTime(0.5, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

        osc.start()
        osc.stop(ctx.currentTime + 0.6)

        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100])
      } else {
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.5)

        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5)

        osc.start()
        osc.stop(ctx.currentTime + 0.5)

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
      if (hasEverTracked) playAlert('network_lost') // Only alert if we've been tracking
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
  }, [hasEverTracked])

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
    const R = 6371e3
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
        // @ts-ignore
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

  // Permissions API Listener for robustness (silent - no alerts on permission changes)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((permissionStatus) => {

        const handleChange = () => {
          console.log('📍 Permission status changed to:', permissionStatus.state)
          if (permissionStatus.state === 'granted' && hasEverTracked) {
            // Only restart if we've been tracking before
            setPermissionRequested(false)
          } else if (permissionStatus.state === 'denied') {
            setIsTracking(false)
            // NO ALERT - this might be initial denial, not a loss
          }
        }

        permissionStatus.addEventListener('change', handleChange)
        return () => permissionStatus.removeEventListener('change', handleChange)
      })
    }
  }, [hasEverTracked])

  // Start tracking with permission request - IMMEDIATE, NO DELAY
  useEffect(() => {
    if (!isClient) return
    if (permissionRequested) return

    const startTracking = async () => {
      setPermissionRequested(true)

      try {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
          console.log('📍 Geolocation not available on this device')
          return
        }

        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Function to update location in database
        const updateLocation = async (position: GeolocationPosition) => {
          if (!mountedRef.current) return

          try {
            let currentBattery = batteryLevel
            if (currentBattery === null && 'getBattery' in navigator) {
              try {
                // @ts-ignore
                const batt = await navigator.getBattery()
                currentBattery = Math.round(batt.level * 100)
                setBatteryLevel(currentBattery)
              } catch (e) { }
            }

            let speed = position.coords.speed
            const currentTimestamp = position.timestamp || Date.now()

            if (speed === null && lastPositionRef.current) {
              const dist = getDistanceMeters(
                lastPositionRef.current.latitude,
                lastPositionRef.current.longitude,
                position.coords.latitude,
                position.coords.longitude
              )
              const timeDiff = (currentTimestamp - lastPositionRef.current.timestamp) / 1000

              if (timeDiff > 0) {
                speed = dist / timeDiff
              }
            }

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
              p_speed: speed ?? 0,
              p_battery_level: currentBattery
            })

            if (error) console.warn('📍 Location update failed (non-fatal):', error.message)
          } catch (e) {
            console.warn('📍 Location DB update failed (non-fatal):', e)
          }
        }

        console.log('📍 Requesting location permission (Native Trigger)...')

        try {
          // Silent retry - only for background recovery
          const silentRetry = () => {
            console.log('📍 Silent background retry...')
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setIsTracking(true)
                setHasEverTracked(true)
                updateLocation(pos)
              },
              (err) => {
                console.warn('Silent retry failed:', err)
                // Silent - no alert, will try again later via permission change
              },
              { enableHighAccuracy: true, timeout: 10000 }
            )
          }

          // Initial permission request
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            )
          })

          if (!mountedRef.current) return

          console.log('📍 Initial location obtained, starting continuous tracking')
          setHasEverTracked(true)
          await updateLocation(position)

          if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)

          watchIdRef.current = navigator.geolocation.watchPosition(
            async (pos) => {
              if (mountedRef.current) {
                if (!isTracking) {
                  setIsTracking(true)
                  console.log('📍 Tracking recovered via watch.')
                }
                await updateLocation(pos)
              }
            },
            (error) => {
              console.warn('📍 Watch position error:', error.message)
              const wasTracking = isTracking
              setIsTracking(false)

              // ONLY alert if we were already tracking (not initial setup)
              if (wasTracking && hasEverTracked) {
                sendAdminAlert('LOCATION_LOSS')
                playAlert('location_lost')
                toast.error('Location Access Lost! Please check settings.')
              }

              // Silent retry for recovery
              if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
                setTimeout(silentRetry, 5000)
              }
            },
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
          )

          setIsTracking(true)

        } catch (error: any) {
          console.warn('📍 Initial Location Permission Failed:', error)
          // NO ALERT on initial failure - user hasn't granted permission yet
          // Just show a silent toast
          toast('Location permission needed for tracking', {
            description: 'Please enable location access to use live tracking features.',
            duration: 5000
          })
        }
      } catch (error) {
        console.warn('📍 Location tracking setup failed:', error)
      }
    }

    startTracking()
  }, [isClient, permissionRequested])

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
