'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { Settings, Sun, Moon, Monitor } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTheme, type AppTheme } from '@/components/theme/ThemeProvider'
import { DeviceNotificationControl } from '@/components/notifications/DeviceNotificationControl'
import { LocationSharingControl } from '@/components/tracking/LocationSharingControl'
import { audioManager } from '@/lib/audio/AudioManager'

const themes: { value: AppTheme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'Follow device', icon: Monitor },
]
const unavailable = [
  ['Organization details', 'Organization name, contact information and address'],
  ['Email and SMS delivery', 'Email and SMS notification preferences'],
  ['Journey automation', 'Default duration, automatic vehicle assignment and approval rules'],
  ['Security policies', 'Session timeout, enforced two-factor authentication and password expiry'],
  ['Language and formats', 'Language, time zone, date and time formatting'],
  ['Map configuration', 'Map provider, default coordinates, zoom and tracking interval'],
  ['Offline preferences', 'A configurable offline mode'],
]

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const muted = useSyncExternalStore(audioManager.subscribe, audioManager.getMuted, () => false)
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-6">
      <div className="flex items-center gap-3">
        <Settings className="h-7 w-7 text-primary" aria-hidden />
        <div><h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and device permissions.</p></div>
      </div>
      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Changes apply immediately and stay in sync with the profile menu on this device.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="App appearance">
            {themes.map(({ value, label, icon: Icon }) => (
              <Button key={value} type="button" variant={theme === value ? 'default' : 'outline'} aria-pressed={theme === value} onClick={() => setTheme(value)}>
                <Icon className="mr-2 h-4 w-4" aria-hidden />{label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Saved automatically in this browser. Follow device updates when your device changes between light and dark mode.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Notifications and sound</CardTitle><CardDescription>Device notifications and sounds are managed separately.</CardDescription></CardHeader>
        <CardContent className="space-y-6">
          <DeviceNotificationControl compact />
          <div className="flex items-start justify-between gap-4 border-t pt-5">
            <div className="space-y-1"><Label htmlFor="app-sounds">App sounds</Label>
              <p id="app-sounds-description" className="text-sm text-muted-foreground">{muted ? 'Off' : 'On'} — applies to all in-app sounds, including chat alerts and emergency alarms. Device notification sounds follow your browser and operating system settings.</p></div>
            <Switch id="app-sounds" checked={!muted} onCheckedChange={enabled => audioManager.setMuted(!enabled)} aria-describedby="app-sounds-description" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Location</CardTitle><CardDescription>Choose whether to share your location with TCNP.</CardDescription></CardHeader>
        <CardContent><LocationSharingControl /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Account</CardTitle><CardDescription>Keep your officer details and sign-in credentials up to date.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline"><Link href="/profile">My profile</Link></Button>
          <Button asChild variant="outline"><Link href="/change-password">Change password</Link></Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Unavailable settings</CardTitle><CardDescription>These previous controls are not connected to app behavior. They are disabled until the corresponding features are implemented. Previously saved values are preserved.</CardDescription></CardHeader>
        <CardContent>
          <fieldset disabled aria-label="Unavailable settings" className="space-y-4">
            {unavailable.map(([label, description]) => (
              <label key={label} className="flex items-start gap-3 text-sm text-muted-foreground">
                <input type="checkbox" disabled className="mt-1 h-4 w-4 shrink-0" />
                <span><span className="font-medium">{label} · Unavailable</span><span className="mt-0.5 block">{description}</span></span>
              </label>
            ))}
          </fieldset>
        </CardContent>
      </Card>
    </div>
  )
}
