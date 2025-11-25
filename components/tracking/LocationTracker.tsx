'use client'

import { useEffect, useState } from 'react'
import { useLocationTracking } from '@/hooks/useLocationTracking'
import { toast } from 'sonner'

/**
 * LocationTracker Component
 * 
 * Automatically tracks user location when they're logged in.
 * Runs in the background and updates location every 10 seconds.
 * 
 * This component is invisible and only handles location tracking logic.
 */
export function LocationTracker() {
  const [hasShownPermissionPrompt, setHasShownPermissionPrompt] = useState(false)
  
  const {
    location,
    error,
    permissionStatus,
    isTracking,
    requestPermission
  } = useLocationTracking({
    enableTracking: true,
    updateInterval: 10000, // 10 seconds
    highAccuracy: true
  })

  // Show permission prompt on first load
  useEffect(() => {
    if (!hasShownPermissionPrompt) {
      const timer = setTimeout(() => {
        if (permissionStatus === 'prompt') {
          toast.info('Enable location tracking to be visible on the live map', {
            duration: 5000,
            action: {
              label: 'Enable',
              onClick: () => requestPermission()
            }
          })
        }
        setHasShownPermissionPrompt(true)
      }, 2000) // Wait 2 seconds after login

      return () => clearTimeout(timer)
    }
  }, [hasShownPermissionPrompt, permissionStatus, requestPermission])

  // Show error if location tracking fails
  useEffect(() => {
    if (!error) return

    const errorMessage = typeof error === 'string'
      ? error
      : (error as { message?: string })?.message ?? String(error)

    if (/timeout/i.test(errorMessage)) {
      console.warn('⏱️ Location tracking timeout; continuing to monitor')
      return
    }

    console.warn('❌ Location tracking issue (non-fatal):', errorMessage)
  }, [error])

  // Log tracking status
  useEffect(() => {
    if (isTracking) {
      console.log('✅ Location tracking active')
    }
  }, [isTracking])

  // This component doesn't render anything
  return null
}
