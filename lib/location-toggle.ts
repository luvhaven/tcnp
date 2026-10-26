import { createLocationSharingGuard, setLocationSharingEnabled } from '@/lib/location-sharing'

/** Called directly by the switch, before any await, to retain Safari's user gesture. */
export function toggleLocationSharing(value: boolean, onError: (message: string) => void) {
  if (!value) { setLocationSharingEnabled(false); return }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    setLocationSharingEnabled(false)
    onError('Location is unavailable on this device.')
    return
  }
  setLocationSharingEnabled(true)
  const canShare = createLocationSharingGuard()
  try {
    navigator.geolocation.getCurrentPosition(
      () => { if (canShare()) window.dispatchEvent(new Event('tcnp-location-ready')) },
      error => {
        if (!canShare()) return
        setLocationSharingEnabled(false)
        onError(error.code === 1
          ? 'Location is blocked. Allow location for TCNP in your browser or device settings, then turn tracking on again.'
          : 'Could not get your location. Check device location is on, then try again.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  } catch {
    if (!canShare()) return
    setLocationSharingEnabled(false)
    onError('Location could not start. Check your browser location settings and try again.')
  }
}
