'use client'

import { useEffect, useState } from 'react'
import { DeviceNotificationControl } from './DeviceNotificationControl'

export default function NotificationPermissionBanner() {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setDismissed(localStorage.getItem('notification-banner-dismissed') === 'true') } catch { setDismissed(false) }
    }, 3000)
    return () => clearTimeout(timer)
  }, [])
  // Remain mounted to reconnect granted subscriptions after sign-in.
  return <div className={dismissed ? 'hidden' : 'pointer-events-auto w-full rounded-xl border bg-card p-4 shadow-lg'}>
    <DeviceNotificationControl compact />
    {!dismissed && <button type="button" className="mt-3 min-h-10 text-sm text-muted-foreground underline" onClick={() => { setDismissed(true); try { localStorage.setItem('notification-banner-dismissed', 'true') } catch {} }}>Dismiss — manage this in My Profile</button>}
  </div>
}
