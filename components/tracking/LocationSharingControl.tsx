'use client'

import { useId } from 'react'
import { useLocationSharing } from '@/hooks/useLocationSharing'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function LocationSharingControl() {
  const id = useId()
  const { enabled, setEnabled } = useLocationSharing()

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>Location sharing</Label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {enabled
            ? 'On — the app can use your location when browser permission is allowed.'
            : 'Off — the app stops requesting and sharing your location.'}
          {' '}Saved automatically on this device. Device location settings stay unchanged.
        </p>
      </div>
      <Switch id={id} checked={enabled} onCheckedChange={setEnabled} aria-describedby={`${id}-description`} />
    </div>
  )
}
