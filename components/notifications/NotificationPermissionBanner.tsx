'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { DeviceNotificationControl } from './DeviceNotificationControl'
import { createClient } from '@/lib/supabase/client'
import { devicePushConnected, pushDisabled } from '@/lib/device-push'
import { NOTIFICATION_REMINDER_KEY, notificationReminderSession, shouldShowNotificationReminder } from '@/lib/notification-reminder'

/** Never let a slow auth read keep the reminder stuck on screen. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms)
    work.then(value => { window.clearTimeout(timer); resolve(value) }, error => { window.clearTimeout(timer); reject(error) })
  })
}

export default function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false)
  const sessionKey = useRef<string | null>(null)
  const dismissed = useRef(false)
  const enabled = useRef(false)
  const fallback = useRef('')
  const refreshRevision = useRef(0)
  useEffect(() => {
    let live = true
    const db = createClient()
    fallback.current = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `mount-${Date.now()}-${Math.random()}`
    // Old versions made one Dismiss suppress reminders for every later login.
    try { localStorage.removeItem('notification-banner-dismissed') } catch {}
    const refresh = async () => {
      const revision = ++refreshRevision.current
      const current = () => live && revision === refreshRevision.current && !dismissed.current
      const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
      let connected = false
      try { connected = permission === 'granted' && await devicePushConnected() } catch {}
      if (connected) enabled.current = false
      // Once this device is connected the reminder goes away immediately, whatever else is pending.
      if (connected || enabled.current) { if (current()) setVisible(false); return }
      try {
        const { data: { session } } = await withTimeout(db.auth.getSession(), 4000)
        const key = notificationReminderSession(session, fallback.current)
        if (!current()) return
        if (sessionKey.current !== key) { sessionKey.current = key; dismissed.current = false }
        let dismissedSession: string | null = null
        try { dismissedSession = sessionStorage.getItem(NOTIFICATION_REMINDER_KEY) } catch {}
        if (current()) setVisible(shouldShowNotificationReminder({ session: key, dismissedSession, disabled: pushDisabled(), permission, connected }))
      } catch {
        // A slow or failed session read must not trap the banner either way:
        // only an undecided device keeps its Enable control.
        if (current()) setVisible(permission === 'default' && !pushDisabled())
      }
    }
    const timer = window.setTimeout(() => { void refresh() }, 800)
    const onChange = () => { void refresh() }
    const onVisible = () => { if (document.visibilityState === 'visible') onChange() }
    window.addEventListener('tcnp-push-change', onChange)
    window.addEventListener('focus', onChange)
    document.addEventListener('visibilitychange', onVisible)
    return () => { live = false; window.clearTimeout(timer); window.removeEventListener('tcnp-push-change', onChange); window.removeEventListener('focus', onChange); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  const hide = (remember: boolean) => {
    dismissed.current = remember
    refreshRevision.current++
    setVisible(false)
    if (remember && sessionKey.current) try { sessionStorage.setItem(NOTIFICATION_REMINDER_KEY, sessionKey.current) } catch {}
  }
  if (!visible) return null
  return <div className="notification-reminder pointer-events-auto relative w-full rounded-xl border bg-card p-4 pr-12 shadow-elevation-lg" role="dialog" aria-label="Turn on notifications">
    <button type="button" aria-label="Close" onClick={() => hide(true)} className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><X className="h-4 w-4" aria-hidden /></button>
    <DeviceNotificationControl compact onEnabled={() => { enabled.current = true; hide(false) }} />
    <button type="button" className="mt-1 min-h-10 rounded text-left text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => hide(true)}>Not now — remind me next time I sign in</button>
  </div>
}
