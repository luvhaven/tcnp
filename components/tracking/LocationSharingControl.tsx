'use client'

import { useId } from 'react'
import { useLocationSharing } from '@/hooks/useLocationSharing'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function LocationSharingControl() {
  const id = useId()
  const { enabled, checked, pending, error, setEnabled } = useLocationSharing()

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>Location sharing</Label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {error || (pending ? checked ? 'Enabling location sharing…' : 'Hiding your shared location…' : enabled
            ? 'On — the app can use your location when browser permission is allowed.'
            : 'Off — tracking has stopped and your pin is hidden on this device.')}
          {' '}Saved automatically on this device. Device location settings stay unchanged.
        </p>
        {error && <button type="button" className="text-xs underline" onClick={() => setEnabled(false)}>Retry hiding location</button>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={setEnabled} aria-describedby={`${id}-description`} />
    </div>
  )
}
