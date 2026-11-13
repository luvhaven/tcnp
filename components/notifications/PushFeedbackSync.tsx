'use client'

import { useEffect } from 'react'
import { audioManager } from '@/lib/audio/AudioManager'
import { getFeedbackPreferences } from '@/lib/notification-feedback'
import { syncPushFeedback } from '@/lib/device-push'

/**
 * Keeps the push worker's copy of this device's alert choices current.
 *
 * "App sounds" and "In-app vibration" live in the page's localStorage, which a
 * service worker cannot read. When TCNP is closed the worker is the only code
 * running, so without this it could not honour either switch: it would buzz a
 * phone whose owner had turned both off, or stay quiet when they wanted it.
 */
export function PushFeedbackSync() {
  useEffect(() => {
    const sync = () => { void syncPushFeedback({ vibration: getFeedbackPreferences().vibration, sound: !audioManager.getMuted() }) }
    sync()
    const stopAudio = audioManager.subscribe(sync)
    window.addEventListener('tcnp-feedback-change', sync)
    // Another tab changed a switch, or this device was just connected.
    window.addEventListener('storage', sync)
    window.addEventListener('tcnp-push-change', sync)
    return () => {
      stopAudio()
      window.removeEventListener('tcnp-feedback-change', sync)
      window.removeEventListener('storage', sync)
      window.removeEventListener('tcnp-push-change', sync)
    }
  }, [])
  return null
}
