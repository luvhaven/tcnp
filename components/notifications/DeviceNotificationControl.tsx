'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { connectDevicePush, disconnectDevicePush, getPushConfig, pushSupported, pushDisabled, sendDeviceNotificationTest, type DevicePushConfig } from '@/lib/device-push'

const ENABLED = 'Enabled on this device, including when TCNP is closed.'
const TEST_SENT = 'Test notification sent. Look in your device’s notification center. Allow banners, sounds and vibration for TCNP or your browser in device notification settings, and turn off Do not disturb.'
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not update device notifications. Please try again.'

export function DeviceNotificationControl({ compact = false }: { compact?: boolean }) {
  const [config, setConfig] = useState<DevicePushConfig | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [supported, setSupported] = useState(true)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('Checking this device…')
  const working = useRef(false)
  useEffect(() => {
    let live = true
    async function sync() {
      working.current = true
      try {
        if (!pushSupported()) {
          if (live) {
            setSupported(false)
            setMessage('This browser does not support device notifications. Use a browser with Web Push support. On iPhone or iPad, open TCNP from the Home Screen.')
          }
          return
        }
        const next = await getPushConfig()
        if (!live) return
        setConfig(next)
        if (next.ready && Notification.permission === 'granted' && !pushDisabled()) {
          await connectDevicePush(next, false, value => { if (live) setMessage(value) })
          if (live) { setEnabled(true); setMessage(ENABLED) }
        } else if (live) {
          setEnabled(false)
          setMessage(!next.ready ? 'Device notifications are temporarily unavailable. Retry setup shortly.'
            : Notification.permission === 'denied' ? 'Notifications are blocked in this browser. Allow notifications for TCNP in the browser’s site settings, then click Enable.'
            : 'Get room invitations and updates even when TCNP is closed. Click Enable to allow notifications.')
        }
      } catch (error) { if (live) setMessage(errorMessage(error)) }
      finally { if (live) { working.current = false; setBusy(false) } }
    }
    void sync()
    return () => { live = false }
  }, [])
  const testNotification = async () => {
    try { await sendDeviceNotificationTest(); setMessage(TEST_SENT) }
    catch (error) { setMessage(errorMessage(error)) }
  }
  return <section className={compact ? 'space-y-3' : 'space-y-3 rounded-xl border p-4'} aria-label="Device notifications">
    <div><h3 className="flex items-center gap-2 font-medium"><Bell className="h-4 w-4" aria-hidden />Device notifications</h3><p className="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">{message}</p></div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant={enabled ? 'outline' : 'default'} size="sm" disabled={busy || !supported} pending={busy} onClick={async () => {
        if (working.current) return
        working.current = true
        setBusy(true)
        try {
          if (enabled) {
            await disconnectDevicePush()
            setEnabled(false)
            setMessage('Off on this device. Your in-app notification bell still works.')
          } else if (!config?.ready) {
            const next = await getPushConfig()
            setConfig(next)
            setMessage(next.ready ? 'Ready. Click Enable on this device to allow notifications.' : 'Device notifications are temporarily unavailable. Please retry shortly.')
          } else {
            await connectDevicePush(config, true, setMessage)
            setEnabled(true)
            setMessage(ENABLED)
            await testNotification()
          }
        } catch (error) { setMessage(errorMessage(error)) }
        finally { working.current = false; setBusy(false) }
      }}>{busy ? 'Setting up…' : enabled ? 'Turn off on this device' : config?.ready ? 'Enable on this device' : 'Retry setup'}</Button>
      {enabled && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void testNotification()}>Send test notification</Button>}
    </div>
  </section>
}
