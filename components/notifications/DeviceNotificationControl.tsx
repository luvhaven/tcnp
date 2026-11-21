'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellOff, CheckCircle2, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  blockedHelp, devicePushConnected, disconnectDevicePush, enableDevicePush, pushDisabled, pushSupport, pushSupportMessage,
  sendDeviceNotificationTest, type PushSupport,
} from '@/lib/device-push'

const ENABLED = 'On for this device — you’ll be alerted even when TCNP is closed.'
const TEST_SENT = 'Test sent. If nothing appeared, allow banners and sounds for TCNP in your device’s notification settings and turn off Do Not Disturb / Focus.'
const errorMessage = (error: unknown) => error instanceof Error && error.message ? error.message : 'Could not update device notifications. Please try again.'

type Status = 'checking' | 'unsupported' | 'blocked' | 'off' | 'connecting' | 'on'

export function DeviceNotificationControl({ compact = false, onEnabled }: { compact?: boolean; onEnabled?: () => void }) {
  const [status, setStatus] = useState<Status>('checking')
  const [support, setSupport] = useState<PushSupport>('supported')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Checking this device…')
  const working = useRef(false)

  const refresh = useCallback(async () => {
    if (working.current) return
    const next = pushSupport()
    setSupport(next)
    if (next !== 'supported') { setStatus('unsupported'); setMessage(pushSupportMessage(next)); return }
    const permission = Notification.permission
    if (permission === 'denied') { setStatus('blocked'); setMessage(blockedHelp()); return }
    if (permission === 'granted' && !pushDisabled()) {
      if (await devicePushConnected()) { setStatus('on'); setMessage(ENABLED); return }
      // Allowed but not yet linked (new login, reinstall): the app links it in the background.
      setStatus('connecting'); setMessage('Notifications are allowed. Tap Enable to finish connecting this device.')
      return
    }
    setStatus('off')
    setMessage(pushDisabled() ? 'Off for this device. Your in-app notification bell still works.' : 'Get mission, chat and journey alerts on this device, even when TCNP is closed.')
  }, [])

  useEffect(() => {
    const onChange = () => { void refresh() }
    void Promise.resolve().then(onChange)
    const onVisible = () => { if (document.visibilityState === 'visible') onChange() }
    window.addEventListener('tcnp-push-change', onChange)
    window.addEventListener('focus', onChange)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('tcnp-push-change', onChange)
      window.removeEventListener('focus', onChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const enable = () => {
    if (working.current) return
    working.current = true
    setBusy(true)
    // Called synchronously inside the tap: iPhone only shows the prompt from the tap itself.
    enableDevicePush(setMessage).then(() => {
      setStatus('on'); setMessage(ENABLED)
      onEnabled?.()
    }, error => {
      setMessage(errorMessage(error))
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setStatus('blocked')
    }).finally(() => { working.current = false; setBusy(false) })
  }
  const disable = async () => {
    if (working.current) return
    working.current = true
    setBusy(true)
    try {
      await disconnectDevicePush()
      setStatus('off'); setMessage('Off for this device. Your in-app notification bell still works.')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { working.current = false; setBusy(false) }
  }
  const test = async () => {
    try { await sendDeviceNotificationTest(); setMessage(TEST_SENT) }
    catch (error) { setMessage(errorMessage(error)) }
  }

  const Icon = status === 'on' ? CheckCircle2 : status === 'blocked' ? BellOff : support === 'ios-install' ? Smartphone : Bell
  return <section className={compact ? 'space-y-3' : 'space-y-3 rounded-xl border p-4'} aria-label="Device notifications" data-status={status}>
    <div>
      <h3 className="flex items-center gap-2 font-medium"><Icon className={`h-4 w-4 ${status === 'on' ? 'text-emerald-600 dark:text-emerald-400' : ''}`} aria-hidden />Device notifications</h3>
      <p className="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">{message}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {status === 'on'
        ? <>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void test()}>Send test notification</Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} pending={busy} onClick={() => void disable()}>Turn off on this device</Button>
        </>
        : status === 'blocked'
          ? <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>I’ve allowed it — check again</Button>
          : status !== 'unsupported' && status !== 'checking' &&
            <Button type="button" size="sm" disabled={busy} pending={busy} onClick={enable}>{busy ? 'Enabling…' : 'Enable notifications'}</Button>}
    </div>
  </section>
}
