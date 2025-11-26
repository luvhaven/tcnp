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
  const [bannerDismissed, setBannerDismissed] = useState(false)
  
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

  const showTrackingBanner = isTracking && permissionStatus === 'granted' && !bannerDismissed

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

  return showTrackingBanner ? (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-3 sm:px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-2 text-xs text-white shadow-lg sm:text-sm">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" />
        <span>Live location sharing is active on this device.</span>
        <button
          type="button"
          onClick={() => setBannerDismissed(true)}
          className="ml-1 text-xs font-medium text-emerald-100 hover:text-white"
        >
          Hide
        </button>
      </div>
    </div>
  ) : null
}
