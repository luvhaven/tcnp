import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { devLog } from '@/lib/utils/devLogger'

interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  altitude?: number
  heading?: number
  speed?: number
}

interface UseLocationTrackingOptions {
  enableTracking?: boolean
  updateInterval?: number
  highAccuracy?: boolean
}

export function useLocationTracking(options: UseLocationTrackingOptions = {}) {
  const {
    enableTracking = true,
    updateInterval = 10000,
    highAccuracy = true
  } = options

  const supabase = createClient()
  const [location, setLocation] = useState<LocationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [ipFallbackCache, setIpFallbackCache] = useState<LocationData | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Update location in database
  const updateLocationInDB = useCallback(async (locationData: LocationData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.warn('⚠️ User not authenticated, skipping location update')
        return
      }

      // Get battery level if available
      let batteryLevel: number | undefined
      if ('getBattery' in navigator) {
        try {
          const battery = await (navigator as any).getBattery()
          batteryLevel = Math.round(battery.level * 100)
        } catch (e) {
          // Battery API not available
        }
      }

      const { error: rpcError } = await (supabase as any).rpc('upsert_user_location', {
        p_user_id: user.id,
        p_latitude: locationData.latitude,
        p_longitude: locationData.longitude,
        p_accuracy: locationData.accuracy,
        p_altitude: locationData.altitude ?? null,
        p_heading: locationData.heading ?? null,
        p_speed: locationData.speed ?? null,
        p_battery_level: batteryLevel ?? null
      })

      if (rpcError) {
        console.error('❌ Failed to update location in database:', rpcError)
      } else {
        console.log('✅ Location updated in database')
      }
    } catch (err) {
      console.error('❌ Error updating location:', err)
    }
  }, [supabase])

  // Handle successful position
  const handlePosition = useCallback((position: GeolocationPosition) => {
    const locationData: LocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude ?? undefined,
      heading: position.coords.heading ?? undefined,
      speed: position.coords.speed ?? undefined
    }

    setLocation(locationData)
    setError(null)
    console.log('📍 Location updated:', {
      lat: locationData.latitude.toFixed(6),
      lng: locationData.longitude.toFixed(6),
      accuracy: `${locationData.accuracy.toFixed(0)}m`
    })

    updateLocationInDB(locationData)
  }, [updateLocationInDB])

  // Handle position error
  const handleError = useCallback((err: GeolocationPositionError) => {
    let errorMessage = 'Unable to get your location'

    switch (err.code) {
      case err.PERMISSION_DENIED:
        errorMessage = 'Location permission denied. Please enable location access in your browser settings.'
        setPermissionStatus('denied')
        break
      case err.POSITION_UNAVAILABLE:
        errorMessage = 'Location information unavailable. Please turn on your device location services.'
        break
      case err.TIMEOUT:
        errorMessage = 'Location request timed out. Trying again...'
        console.warn('⏱️ Location timeout, will retry automatically')
        return // Don't set error for timeouts, just retry
    }

    devLog.warn('⚠️ Location issue:', errorMessage, err)
    setError(errorMessage)
  }, [])

  // IP Fallback mechanism for devices without GPS mapping headers or restricted browser/OS
  const executeIPFallback = useCallback(async () => {
    if (ipFallbackCache) {
      handlePosition({
        coords: { ...ipFallbackCache, altitude: null, heading: null, speed: null, altitudeAccuracy: null },
        timestamp: Date.now()
      } as unknown as GeolocationPosition)
      return true
    }

    try {
      const ipRes = await fetch('/api/geoip')
      const ipData = await ipRes.json()
      if (ipData && ipData.latitude && ipData.longitude) {
        const fallbackData = {
          latitude: ipData.latitude,
          longitude: ipData.longitude,
          accuracy: 5000,
          altitude: undefined,
          heading: undefined,
          speed: undefined
        }
        setIpFallbackCache(fallbackData)
        handlePosition({
          coords: { ...fallbackData, altitude: null, heading: null, speed: null, altitudeAccuracy: null },
          timestamp: Date.now()
        } as unknown as GeolocationPosition)
        toast.warning('Hardware GPS restricted. Tracking via network approximation.', { id: 'ip-fallback-warn', duration: 4000 })
        return true
      }
    } catch (e) {
      console.warn('IP Fallback sequence failed', e)
    }
    return false
  }, [ipFallbackCache, handlePosition])

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) {
        toast.error('Geolocation is not supported by your browser')
        return false
      }

      // Check if we're on HTTPS or localhost
      const isSecure = window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'

      if (!isSecure) {
        toast.error('Location tracking requires HTTPS or localhost')
        return false
      }

      // iOS Safari detection (approximate)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

      // Query permission API if available (skip on iOS as it's often unsupported/flaky)
      if ('permissions' in navigator && !isIOS) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
          setPermissionStatus(result.state)

          // Listen for permission changes
          result.addEventListener('change', () => {
            setPermissionStatus(result.state)
            console.log('📍 Permission changed:', result.state)
          })

          // If explicitly denied, don't even try to request
          if (result.state === 'denied') {
            console.warn('⚠️ Permission API reports denied.')
            setPermissionStatus('denied')
            return false
          }
        } catch (e) {
          console.warn('⚠️ Permission API not available:', e)
        }
      }

      // Helper to get position with fallback
      const getPosition = async (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
          // Attempt 1: High Accuracy
          navigator.geolocation.getCurrentPosition(
            resolve,
            (error) => {
              // If timeout and we wanted high accuracy, try again with low accuracy
              if (error.code === error.TIMEOUT && highAccuracy) {
                console.warn('⚠️ High accuracy timed out, falling back to low accuracy')
                toast('High precision location unavailable, using approximate location.', {
                  description: 'Move outdoors for better accuracy.'
                })

                navigator.geolocation.getCurrentPosition(
                  resolve,
                  reject,
                  {
                    enableHighAccuracy: false,
                    timeout: 20000,
                    maximumAge: 0
                  }
                )
              } else {
                reject(error)
              }
            },
            {
              enableHighAccuracy: highAccuracy,
              timeout: 15000, // 15s for high accuracy attempt
              maximumAge: 0
            }
          )
        })
      }

      try {
        const position = await getPosition()
        console.log('✅ Location permission granted (forced)')
        setPermissionStatus('granted')
        handlePosition(position)
        return true
      } catch (error: any) {
        if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
          const fallbackSuccess = await executeIPFallback()
          if (fallbackSuccess) {
            setPermissionStatus('granted') // Mock success so the app keeps tracking
            return true
          }
        }

        devLog.warn('⚠️ Geolocation permission/error:', error.message, error.code)
        if (error.code === error.PERMISSION_DENIED) {
          toast.error('Location access denied. Please allow location access in your browser address bar.')
          setPermissionStatus('denied')
          return false
        } else {
          // For other errors (like persistent timeout), we still consider it "allowed" but failed
          console.warn('⚠️ Permission granted but location unavailable:', error.message)
          // Return false so we don't start tracking loop if we can't get location
          return false
        }
      }
    } catch (err) {
      console.error('❌ Error requesting permission:', err)
      return false
    }
  }, [highAccuracy, handlePosition, executeIPFallback])

  // Start tracking
  const startTracking = useCallback(async () => {
    if (isTracking) {
      console.log('ℹ️ Tracking already active')
      return
    }

    if (!('geolocation' in navigator)) {
      toast.error('Geolocation not supported')
      return
    }

    // Request permission first
    const hasPermission = await requestPermission()
    if (!hasPermission) {
      console.warn('⚠️ Cannot start tracking without permission')
      return
    }

    // iOS detection for special handling
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    console.log('🚀 Starting location tracking...', isIOS ? '(iOS device detected)' : '')

    // iOS requires longer timeouts due to Safari's power-saving behavior
    const watchTimeout = isIOS ? 60000 : 30000
    const updateFrequency = isIOS ? 15000 : 10000 // Slightly longer interval for iOS battery

    // Use watchPosition for continuous tracking
    const watchId = navigator.geolocation.watchPosition(
      handlePosition,
      async (error) => {
        // On iOS, timeout errors often resolve on retry, so handle gracefully
        if (isIOS && error.code === error.TIMEOUT) {
          console.log('📍 iOS timeout - will retry automatically')
          return
        }

        if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
          await executeIPFallback()
          return
        }

        handleError(error)
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: watchTimeout,
        maximumAge: isIOS ? 5000 : 0 // Allow slightly stale data on iOS to reduce battery drain
      }
    )

    watchIdRef.current = watchId
    setIsTracking(true)
    console.log('✅ Location tracking started (watchId:', watchId, ')')

    // Also update periodically to ensure fresh data
    updateIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        async (error) => {
          if (error.code !== error.TIMEOUT) {
            if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
              await executeIPFallback()
            } else {
              handleError(error)
            }
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: watchTimeout,
          maximumAge: isIOS ? 5000 : 0
        }
      )
    }, updateFrequency)
  }, [isTracking, highAccuracy, updateInterval, requestPermission, handlePosition, handleError])

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      console.log('⏹️ Location tracking stopped')
    }

    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current)
      updateIntervalRef.current = null
    }

    setIsTracking(false)
  }, [])

  // Auto-start tracking when component mounts
  useEffect(() => {
    if (enableTracking && !isTracking) {
      // Check if iOS to prevent aggressive prompts/crashes on load
      const isIOS = typeof navigator !== 'undefined' &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

      // Delay significantly on iOS to allow hydration and other heavy tasks to finish
      const delay = isIOS ? 5000 : 1000;

      const timer = setTimeout(() => {
        // Double check browser support before starting
        if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
          startTracking().catch(e => console.warn("Auto-start tracking failed", e));
        }
      }, delay)

      return () => clearTimeout(timer)
    }
  }, [enableTracking, isTracking, startTracking])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking()
    }
  }, [stopTracking])

  return {
    location,
    error,
    permissionStatus,
    isTracking,
    startTracking,
    stopTracking,
    requestPermission
  }
}
