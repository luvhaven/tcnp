'use client'

import { audioManager } from '@/lib/audio/AudioManager'

export type NotificationTone = 'signature' | 'soft' | 'clear'
export interface FeedbackPreferences { tone: NotificationTone; vibration: boolean }
const KEY = 'tcnp-notification-feedback'
const DEFAULTS: FeedbackPreferences = { tone: 'signature', vibration: true }
let preferences = DEFAULTS
let loaded = false
export function getFeedbackPreferences(): FeedbackPreferences {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
      preferences = { tone: ['signature', 'soft', 'clear'].includes(saved?.tone) ? saved.tone : 'signature', vibration: saved?.vibration !== false }
    } catch { /* Use session defaults when storage is unavailable. */ }
  }
  return preferences
}
export const feedbackSnapshot = () => JSON.stringify(getFeedbackPreferences())
export const feedbackServerSnapshot = () => JSON.stringify(DEFAULTS)
export function subscribeFeedback(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) { loaded = false; listener() }
  }
  window.addEventListener('storage', storage)
  window.addEventListener('tcnp-feedback-change', listener)
  return () => { window.removeEventListener('storage', storage); window.removeEventListener('tcnp-feedback-change', listener) }
}
export function setFeedbackPreferences(next: Partial<FeedbackPreferences>) {
  preferences = { ...getFeedbackPreferences(), ...next }
  loaded = true
  try { localStorage.setItem(KEY, JSON.stringify(preferences)) } catch { /* Keep controls usable for this session. */ }
  window.dispatchEvent(new Event('tcnp-feedback-change'))
}
export function playNotificationFeedback(kind = 'info') {
  // BrokenArrowAlert remains the sole owner of emergency sound and haptics.
  if (kind === 'broken_arrow') return
  const { tone, vibration } = getFeedbackPreferences()
  const distinct = ['mention', 'food_ready', 'mission_request', 'warning', 'error'].includes(kind)
  audioManager.playChime(distinct ? kind : `notification_${tone}`)
  if (vibration) audioManager.vibrate(kind === 'mention' ? [70, 50, 70, 50, 120] : [45, 70, 90])
}
