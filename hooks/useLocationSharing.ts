'use client'

import { useSyncExternalStore } from 'react'
import { isLocationSharingEnabled, subscribeToLocationSharing } from '@/lib/location-sharing'
import { toggleLocationSharing } from '@/lib/location-toggle'
import { toast } from 'sonner'

const setEnabled = (value: boolean) => toggleLocationSharing(value, message => toast.error(message))

export function useLocationSharing() {
  const enabled = useSyncExternalStore(subscribeToLocationSharing, isLocationSharingEnabled, () => false)
  return { enabled, setEnabled }
}
