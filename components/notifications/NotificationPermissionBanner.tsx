'use client'

import { useEffect, useRef, useState } from 'react'
import { DeviceNotificationControl } from './DeviceNotificationControl'
import { createClient } from '@/lib/supabase/client'
import { devicePushConnected, pushDisabled } from '@/lib/device-push'
import { NOTIFICATION_REMINDER_KEY, notificationReminderSession, shouldShowNotificationReminder } from '@/lib/notification-reminder'

export default function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false)
  const sessionKey = useRef<string | null>(null)
  const dismissed = useRef(false)
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
      try {
        const { data: { session } } = await db.auth.getSession()
        const key = notificationReminderSession(session, fallback.current)
        if (!live || revision !== refreshRevision.current) return
        if (sessionKey.current !== key) { sessionKey.current = key; dismissed.current = false }
        let dismissedSession: string | null = null
        try { dismissedSession = sessionStorage.getItem(NOTIFICATION_REMINDER_KEY) } catch {}
        const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
        const connected = permission === 'granted' && await devicePushConnected()
        if (live && revision === refreshRevision.current && !dismissed.current) setVisible(shouldShowNotificationReminder({ session: key, dismissedSession, disabled: pushDisabled(), permission, connected }))
      } catch {
        // Keep an undecided officer's enable control available after a transient
        // session read failure; native permission still requires their click.
        if (live && revision === refreshRevision.current && !dismissed.current && typeof Notification !== 'undefined' && Notification.permission === 'default' && !pushDisabled()) setVisible(true)
      }
    }
    const timer = window.setTimeout(() => { void refresh() }, 500)
    const onChange = () => { void refresh() }
    const onVisible = () => { if (document.visibilityState === 'visible') onChange() }
    window.addEventListener('tcnp-push-change', onChange)
    window.addEventListener('focus', onChange)
    document.addEventListener('visibilitychange', onVisible)
    return () => { live = false; window.clearTimeout(timer); window.removeEventListener('tcnp-push-change', onChange); window.removeEventListener('focus', onChange); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  // Remain mounted to reconnect already-authorized devices after login.
  return <div className={visible ? 'pointer-events-auto w-full rounded-xl border bg-card p-4 shadow-lg' : 'hidden'}>
    <DeviceNotificationControl compact />
    {visible && <button type="button" className="mt-3 min-h-10 text-sm text-muted-foreground underline" onClick={() => {
      dismissed.current = true
      refreshRevision.current++
      setVisible(false)
      if (sessionKey.current) try { sessionStorage.setItem(NOTIFICATION_REMINDER_KEY, sessionKey.current) } catch {}
    }}>Not now — remind me next time I sign in</button>}
  </div>
}
