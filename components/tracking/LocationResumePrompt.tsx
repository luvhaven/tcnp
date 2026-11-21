'use client'

import { useState, useSyncExternalStore } from 'react'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocationSharing } from '@/hooks/useLocationSharing'
import { getServerSharing, getServerSharingSnapshot, subscribeToServerSharing } from '@/lib/location-toggle'

/**
 * The officer's account says "share my location", but this phone is not
 * sending it. That happens after reinstalling the Home Screen app (iPhone
 * gives it fresh storage), clearing site data, or switching sharing on from
 * another device. The map then shows their last pin, frozen, with nothing on
 * the phone to say so. One tap resumes it here (the tap is also the gesture
 * iPhone needs before it asks for location) or turns sharing off everywhere.
 */
export function LocationResumePrompt() {
  const serverSharing = useSyncExternalStore(subscribeToServerSharing, getServerSharing, getServerSharingSnapshot)
  const { enabled, pending, setEnabled } = useLocationSharing()
  const [hidden, setHidden] = useState(false)
  if (hidden || serverSharing !== true || enabled || pending) return null
  return (
    <div className="pointer-events-auto w-full rounded-xl border border-amber-300 bg-card p-4 shadow-elevation-lg dark:border-amber-700" role="alert">
      <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-amber-600" aria-hidden />Your location is not being shared from this phone</p>
      <p className="mt-1 text-sm text-muted-foreground">Location sharing is on for your account, so Command expects to see you on the map, but this phone is not sending your location.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setEnabled(true)}>Share from this phone</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setEnabled(false); setHidden(true) }}>Turn sharing off</Button>
      </div>
    </div>
  )
}
