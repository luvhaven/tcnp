'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { audioManager } from '@/lib/audio/AudioManager'
import { getFeedbackPreferences } from '@/lib/notification-feedback'
import { devicePushSyncedAt, prepareDevicePush, resumeDevicePush, syncPushFeedback } from '@/lib/device-push'

const RESYNC_AFTER = 6 * 60 * 60 * 1000

/**
 * Always mounted in the signed-in app. It keeps device notifications working
 * without the officer having to think about it:
 *  - re-links an already-allowed device on app start and when returning to it
 *    (new login, rotated endpoint, server cleanup), never with a prompt;
 *  - warms up the worker before the first Enable tap;
 *  - opens the right page when a notification is tapped while TCNP is open;
 *  - hands the worker this device's sound/vibration choices.
 */
export function DevicePushBridge() {
  const router = useRouter()

  useEffect(() => {
    let live = true
    const start = window.setTimeout(() => {
      if (!live) return
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') void resumeDevicePush()
      else void prepareDevicePush()
    }, 1500)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - devicePushSyncedAt() > RESYNC_AFTER) void resumeDevicePush()
    }
    // Permission granted from device Settings while TCNP was in the background.
    const onFocus = () => { if (devicePushSyncedAt() === 0) void resumeDevicePush() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => { live = false; window.clearTimeout(start); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onFocus) }
  }, [])

  useEffect(() => {
    const container = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
    if (!container) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'TCNP_OPEN' || typeof event.data.url !== 'string') return
      const url = event.data.url
      if (!url.startsWith('/') || url.startsWith('//')) return
      router.push(url)
    }
    container.addEventListener('message', onMessage)
    return () => container.removeEventListener('message', onMessage)
  }, [router])

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
