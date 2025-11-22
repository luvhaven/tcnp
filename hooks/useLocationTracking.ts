import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

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
  updateInterval?: number // milliseconds
  highAccuracy?: boolean
}

const GEO_PERMISSION_DENIED = 1
const GEO_POSITION_UNAVAILABLE = 2
const GEO_TIMEOUT = 3

const isSecureGeolocationContext = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  if (window.isSecureContext) {
    return true
  }

  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

const normalizePermissionError = (
  code: number | undefined,
  rawMessage: string,
  permissionStatus: PermissionState | null
) => {
  const normalizedRaw = rawMessage?.trim() ?? ''
  const lower = normalizedRaw.toLowerCase()

  if (code === GEO_TIMEOUT || /timeout/i.test(lower)) {
    return {
      message: 'Location permission request timed out.',
      toastMessage: 'Location permission timed out. Approve the location prompt to enable live tracking.',
      severity: 'warning' as const,
      recoverable: true,
      shouldNotify: permissionStatus !== 'granted'
    }
  }

  if (code === GEO_PERMISSION_DENIED || permissionStatus === 'denied' || /denied/i.test(lower)) {
    return {
      message: 'Location permission is blocked. Enable location access in your browser settings.',
      toastMessage: 'Enable location access in your browser settings and reload to share your position.',
      severity: 'error' as const,
      recoverable: false,
      shouldNotify: true
    }
  }

  if (code === GEO_POSITION_UNAVAILABLE || /position unavailable/i.test(lower)) {
    return {
      message: "Location information unavailable. Turn on your device's location services and try again.",
      toastMessage: 'Turn on GPS or location services, then refresh to resume live tracking.',
      severity: 'error' as const,
      recoverable: false,
      shouldNotify: true
    }
  }

  if (lower.includes('secure origin') || lower.includes('https')) {
    return {
      message: 'Location tracking requires a secure origin (HTTPS or localhost).',
      toastMessage: 'Open the app over HTTPS or localhost to enable location tracking.',
      severity: 'error' as const,
      recoverable: false,
      shouldNotify: true
    }
  }

  if (normalizedRaw.length > 0) {
    return {
      message: normalizedRaw,
      toastMessage: normalizedRaw,
      severity: 'error' as const,
      recoverable: false,
      shouldNotify: true
    }
  }

  return {
    message: 'We could not access your location. Verify that location services are enabled and refresh the page.',
    toastMessage: 'Enable location services in your browser and reload to resume live tracking.',
    severity: 'error' as const,
    recoverable: false,
    shouldNotify: true
  }
}

export function useLocationTracking(options: UseLocationTrackingOptions = {}) {
  const {
    enableTracking = true,
    updateInterval = 10000, // 10 seconds
    highAccuracy = true
  } = options

  const supabase = createClient()
  const [location, setLocation] = useState<LocationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastReminderRef = useRef<number>(0)
  const isTrackingRef = useRef(false)
  const lastPermissionWarningRef = useRef<number>(0)

  // Request location permission
  const requestPermission = useCallback(async () => {
    try {
      if (typeof window === 'undefined') {
        return false
      }

      if (!isSecureGeolocationContext()) {
        const message = 'Location tracking requires a secure origin (HTTPS or localhost).'
        console.error('❌ Location permission error:', message)
        setError(message)
        toast.error('Open the app over HTTPS or localhost to enable location tracking.')
        return false
      }

      if (!('geolocation' in navigator)) {
        throw new Error('Geolocation is not supported by your browser')
      }

      // Check permission status
      const permissionsApi = (navigator as any).permissions
      if (permissionsApi && typeof permissionsApi.query === 'function') {
        try {
          const result = await permissionsApi.query({ name: 'geolocation' })
          setPermissionStatus(result.state)

          result.addEventListener('change', () => {
            setPermissionStatus(result.state)
          })
        } catch (permissionError) {
          console.warn('⚠️ Unable to query geolocation permission status:', permissionError)
        }
      }

      // Request position to trigger permission prompt
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout: 10000,
          maximumAge: 0
        })
      })

      console.log('✅ Location permission granted')
      return true
    } catch (err: any) {
      const geolocationError = err as GeolocationPositionError | Error
      const code = typeof geolocationError === 'object' && geolocationError !== null && typeof (geolocationError as GeolocationPositionError).code === 'number'
        ? (geolocationError as GeolocationPositionError).code
        : undefined
      const rawMessage =
        typeof geolocationError === 'object' && geolocationError !== null && 'message' in geolocationError && typeof (geolocationError as any).message === 'string'
          ? (geolocationError as any).message
          : typeof err === 'string'
            ? err
            : ''
      const {
        message: friendlyMessage,
        toastMessage,
        severity,
        recoverable,
        shouldNotify
      } = normalizePermissionError(code, rawMessage, permissionStatus)

      const logPrefix = severity === 'warning' ? '⚠️ Location permission warning:' : '❌ Location permission error:'
      // Always log location permission issues as warnings to avoid red noise,
      // while keeping the severity distinction in the prefix and toast behavior.
      const logFn = console.warn
      logFn(logPrefix, friendlyMessage, geolocationError)

      if (recoverable) {
        setError(null)
        if (!isTrackingRef.current && shouldNotify) {
          const now = Date.now()
          if (now - lastPermissionWarningRef.current > 60000) {
            lastPermissionWarningRef.current = now
            toast.warning(toastMessage ?? friendlyMessage)
          }
        }
        return true
      }

      setError(friendlyMessage)
      if (shouldNotify) {
        const notify = severity === 'warning' ? toast.warning : toast.error
        notify(toastMessage ?? friendlyMessage)
      }
      return false
    }
  }, [highAccuracy, permissionStatus])

  const remindEnableLocation = useCallback(
    (reason: 'denied' | 'unavailable' | 'stopped' = 'denied') => {
      const now = Date.now()
      if (now - lastReminderRef.current < 10000) {
        return
      }
      lastReminderRef.current = now

      const baseMessage =
        reason === 'unavailable'
          ? 'Unable to read your location. Please turn location services back on to stay visible.'
          : reason === 'stopped'
            ? 'Location tracking paused. Enable location services to continue sharing your position.'
            : 'Location access is disabled. Turn it back on to stay visible on the live map.'

      toast.warning(baseMessage, {
        action: {
          label: 'Enable',
          onClick: () => {
            void requestPermission()
          }
        }
      })
    },
    [requestPermission]
  )

  // Update location in database
  const updateLocationInDB = useCallback(async (locationData: LocationData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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

      const { error } = await (supabase as any).rpc('upsert_user_location', {
        p_user_id: user.id,
        p_latitude: locationData.latitude,
        p_longitude: locationData.longitude,
        p_accuracy: locationData.accuracy,
        p_altitude: locationData.altitude || null,
        p_heading: locationData.heading || null,
        p_speed: locationData.speed || null,
        p_battery_level: batteryLevel || null
      })

      if (error) {
        console.error('❌ Error updating location:', error)
      } else {
        console.log('📍 Location updated:', locationData)
      }
    } catch (err) {
      console.error('❌ Error in updateLocationInDB:', err)
    }
  }, [supabase])

  // Handle position update
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
    
    // Update in database
    void updateLocationInDB(locationData)
  }, [updateLocationInDB])

  // Handle position error
  const handleError = useCallback((err: GeolocationPositionError) => {
    let message = 'Failed to get location'

    switch (err.code) {
      case err.PERMISSION_DENIED:
        message = 'Location permission denied'
        break
      case err.POSITION_UNAVAILABLE:
        message = 'Location information unavailable'
        break
      case err.TIMEOUT:
        message = 'Location request timed out'
        break
    }

    if (err.code === err.TIMEOUT) {
      console.warn('⏱️ Geolocation timed out; will retry automatically')
      setError(null)
      return
    } else {
      console.error('❌ Geolocation error:', message, err)
    }

    setError(message)

    if (err.code === err.PERMISSION_DENIED) {
      remindEnableLocation('denied')
    }

    if (err.code === err.POSITION_UNAVAILABLE) {
      remindEnableLocation('unavailable')
    }
  }, [remindEnableLocation])

  // Start tracking
  const startTracking = useCallback(async () => {
    if (!enableTracking) return
    if (isTracking) return

    console.log('🎯 Starting location tracking...')

    // Request permission first
    const hasPermission = await requestPermission()
    if (!hasPermission) return

    // Start watching position
    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        {
          enableHighAccuracy: highAccuracy,
          timeout: 10000,
          maximumAge: 0
        }
      )

      setIsTracking(true)
      console.log('✅ Location tracking started')
    }
  }, [enableTracking, isTracking, requestPermission, handlePosition, handleError, highAccuracy])

  // Stop tracking
  const stopTracking = useCallback((options?: { silent?: boolean }) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    setIsTracking(false)
    console.log('⏹️ Location tracking stopped')
    if (!options?.silent) {
      remindEnableLocation('stopped')
    }
  }, [remindEnableLocation])

  useEffect(() => {
    isTrackingRef.current = isTracking
  }, [isTracking])

  // Auto-start tracking on mount
  useEffect(() => {
    if (enableTracking) {
      void startTracking()
    }

    return () => {
      stopTracking({ silent: true })
    }
  }, [enableTracking, startTracking, stopTracking])

  // Periodic updates (backup to watchPosition)
  useEffect(() => {
    if (!isTracking || !enableTracking) return

    intervalRef.current = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          handlePosition,
          handleError,
          {
            enableHighAccuracy: highAccuracy,
            timeout: 5000,
            maximumAge: 0
          }
        )
      }
    }, updateInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isTracking, enableTracking, updateInterval, handlePosition, handleError, highAccuracy])

  // Proactively remind when permissions change
  useEffect(() => {
    if (!enableTracking) return
    if (permissionStatus === 'denied' || permissionStatus === 'prompt') {
      remindEnableLocation('denied')
    }
  }, [permissionStatus, enableTracking, remindEnableLocation])

  // Attempt to restart tracking when visibility or connectivity returns
  useEffect(() => {
    if (!enableTracking) return

    const attemptRestart = () => {
      if (!isTrackingRef.current) {
        void startTracking()
      }
    }

    document.addEventListener('visibilitychange', attemptRestart)
    window.addEventListener('focus', attemptRestart)
    window.addEventListener('online', attemptRestart)

    return () => {
      document.removeEventListener('visibilitychange', attemptRestart)
      window.removeEventListener('focus', attemptRestart)
      window.removeEventListener('online', attemptRestart)
    }
  }, [enableTracking, startTracking])

  // Periodically ensure tracking stays active in background
  useEffect(() => {
    if (!enableTracking) return

    const watchdog = setInterval(() => {
      if (!isTrackingRef.current) {
        void startTracking()
      }
    }, 60000)

    return () => {
      clearInterval(watchdog)
    }
  }, [enableTracking, startTracking])

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
