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

      // Query permission API if available (just for logging/state, don't block)
      if ('permissions' in navigator) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
          setPermissionStatus(result.state)

          // Listen for permission changes
          result.addEventListener('change', () => {
            setPermissionStatus(result.state)
            console.log('📍 Permission changed:', result.state)
          })

          // We log it but we DON'T return false here anymore. 
          // We'll let getCurrentPosition fail if it's truly denied.
          if (result.state === 'denied') {
            console.warn('⚠️ Permission API reports denied, but we will try to request anyway.')
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
        devLog.warn('⚠️ Geolocation permission/error:', error.message, error.code)
        if (error.code === error.PERMISSION_DENIED) {
          toast.error('Location access denied. Please allow location access in your browser address bar.')
          setPermissionStatus('denied')
          return false
        } else {
          // For other errors (like persistent timeout), we still consider it "allowed" but failed
          console.warn('⚠️ Permission granted but location unavailable:', error.message)
          // Return true so we can try again later via the interval/watch
          return true
        }
      }
    } catch (err) {
      console.error('❌ Error requesting permission:', err)
      return false
    }
  }, [highAccuracy, handlePosition])

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

    console.log('🚀 Starting location tracking...')

    // Use watchPosition for continuous tracking
    const watchId = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: highAccuracy,
        timeout: 30000,
        maximumAge: 0 // Force fresh location every time
      }
    )

    watchIdRef.current = watchId
    setIsTracking(true)
    console.log('✅ Location tracking started (watchId:', watchId, ')')

    // Also update periodically to ensure fresh data
    updateIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        (error) => {
          if (error.code !== error.TIMEOUT) {
            handleError(error)
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: 30000,
          maximumAge: 0
        }
      )
    }, updateInterval)
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
      // Small delay to allow component to mount fully
      const timer = setTimeout(() => {
        startTracking()
      }, 1000)

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
