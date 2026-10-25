'use client'

import { useSyncExternalStore } from 'react'
import { isLocationSharingEnabled, setLocationSharingEnabled, subscribeToLocationSharing } from '@/lib/location-sharing'

export function useLocationSharing() {
  const enabled = useSyncExternalStore(subscribeToLocationSharing, isLocationSharingEnabled, () => false)
  return { enabled, setEnabled: setLocationSharingEnabled }
}
