'use client'

import { useSyncExternalStore } from 'react'
import { isLocationSharingEnabled, subscribeToLocationSharing } from '@/lib/location-sharing'
import { toggleLocationSharing, getLocationSharingStatus, getServerLocationSharingStatus, subscribeToLocationSharingStatus } from '@/lib/location-toggle'
import { toast } from 'sonner'

const setEnabled = (value: boolean) => toggleLocationSharing(value, message => toast.error(message))

export function useLocationSharing() {
  const enabled = useSyncExternalStore(subscribeToLocationSharing, isLocationSharingEnabled, () => false)
  const status = useSyncExternalStore(subscribeToLocationSharingStatus, getLocationSharingStatus, getServerLocationSharingStatus)
  return { enabled, checked: status.pending ? status.requested : enabled, pending: status.pending, error: status.error, setEnabled }
}
