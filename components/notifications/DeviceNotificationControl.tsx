'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { connectDevicePush, disconnectDevicePush, getPushConfig, pushSupported, pushDisabled } from '@/lib/device-push'

export function DeviceNotificationControl({ compact = false }: { compact?: boolean }) {
  const [config, setConfig] = useState<any>(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Checking this device…')
  useEffect(() => {
    let live = true
    async function sync() {
      if (!pushSupported()) { if (live) setMessage('On iPhone or iPad, add TCNP to your Home Screen and open it there. Otherwise use a browser that supports Web Push.'); return }
      try {
        const next = await getPushConfig()
        if (!live) return
        setConfig(next)
        if (next.ready && Notification.permission === 'granted' && !pushDisabled()) {
          await connectDevicePush(next)
          if (live) { setEnabled(true); setMessage('Enabled on this device, including when TCNP is closed.') }
        } else if (live) { setEnabled(false); setMessage(next.ready ? 'Get room invitations and updates even when TCNP is closed.' : 'Device notifications are being set up. Please try again shortly.') }
      } catch { if (live) setMessage('Could not check device notifications. Refresh to retry.') }
    }
    void sync()
    return () => { live = false }
  }, [])
  return <section className={compact ? 'space-y-3' : 'space-y-3 rounded-xl border p-4'} aria-label="Device notifications">
    <div><h3 className="flex items-center gap-2 font-medium"><Bell className="h-4 w-4" aria-hidden />Device notifications</h3><p className="mt-1 text-sm text-muted-foreground" role="status">{message}</p></div>
    <Button variant={enabled ? 'outline' : 'default'} size="sm" disabled={busy || !config?.ready} pending={busy} onClick={async () => {
      if (busy) return
      setBusy(true)
      try {
        if (enabled) { await disconnectDevicePush(); setEnabled(false); setMessage('Off on this device. Your in-app notification bell still works.') }
        else { await connectDevicePush(config, true); setEnabled(true); setMessage('Enabled on this device, including when TCNP is closed.') }
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update device notifications. Please retry.') }
      finally { setBusy(false) }
    }}>{enabled ? 'Turn off on this device' : 'Enable on this device'}</Button>
  </section>
}
