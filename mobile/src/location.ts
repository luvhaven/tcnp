import { Alert, Linking, Platform } from 'react-native'
import * as Battery from 'expo-battery'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { APP_ORIGIN } from './config'
import { getDeviceId, getLastSentAt, getUpload, setLastSentAt, setUpload } from './storage'

/**
 * Background location for TCNP.
 *
 * The phone's operating system delivers positions to LOCATION_TASK whether the
 * app is on screen, in the background, or the phone is locked. Each one is
 * sent to the TCNP server with this device's upload token. Nothing here needs
 * the web screens to be loaded.
 */
export const LOCATION_TASK = 'tcnp-background-location'

/** Do not upload more often than this, however fast the phone reports. */
const MIN_UPLOAD_GAP_MS = 12_000
const UPLOAD_TIMEOUT_MS = 15_000

export type Permission = 'always' | 'foreground' | 'denied' | 'undetermined'
export type LocationStatus = {
  running: boolean
  permission: Permission
  lastSentAt: number | null
  deviceId: string
  platform: string
}

let lastSentAt: number | null = null
let sending = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())

/** Called whenever a position is sent or tracking starts or stops. */
export function subscribeToLocation(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

async function batteryPercent(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync()
    return level >= 0 && level <= 1 ? Math.round(level * 100) : null
  } catch { return null }
}

async function upload(location: Location.LocationObject): Promise<void> {
  if (sending) return
  const now = Date.now()
  if (lastSentAt === null) lastSentAt = await getLastSentAt()
  if (lastSentAt !== null && now - lastSentAt < MIN_UPLOAD_GAP_MS) return
  const target = await getUpload()
  if (!target) { await stopTracking(); return }

  sending = true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const response = await fetch(target.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.token}` },
      body: JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        heading: location.coords.heading,
        speed: location.coords.speed,
        batteryLevel: await batteryPercent(),
        recordedAt: location.timestamp,
      }),
      signal: controller.signal,
    })
    if (response.ok) {
      lastSentAt = Date.now()
      await setLastSentAt(lastSentAt)
      notify()
      return
    }
    // The server says this device should stop: sharing was switched off, or
    // the token was replaced (another officer signed in on this phone).
    if (response.status === 401 || response.status === 409) {
      const body = await response.json().catch(() => null) as { stop?: boolean } | null
      if (body?.stop) await stopTracking()
    }
  } catch {
    // No signal or a slow network: the next position is tried in a few seconds.
  } finally {
    clearTimeout(timer)
    sending = false
  }
}

// Must be defined at module load: when the system wakes the app in the
// background no screen is mounted, only this file is run.
TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error) return
  const locations = data?.locations
  if (!locations?.length) return
  // Only the newest position matters for a live map.
  await upload(locations[locations.length - 1])
})

export async function getPermission(): Promise<Permission> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync()
    if (!foreground.granted) return foreground.canAskAgain ? 'undetermined' : 'denied'
    const background = await Location.getBackgroundPermissionsAsync()
    return background.granted ? 'always' : 'foreground'
  } catch { return 'undetermined' }
}

function explainBackground(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      'Share location in the background',
      'TCNP collects your location and shares it with Command on Live Tracking while location sharing is switched on, even when the app is closed or the phone is locked. You can switch sharing off in TCNP at any time.\n\nOn the next screen choose '
        + (Platform.OS === 'ios' ? '“Always Allow”.' : '“Allow all the time”.'),
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

/**
 * Asks for location, then for background ("Always") location. The background
 * request is preceded by a plain explanation of what is collected and why,
 * which both app stores require.
 */
export async function requestPermission(): Promise<Permission> {
  let foreground = await Location.getForegroundPermissionsAsync()
  if (!foreground.granted) {
    if (!foreground.canAskAgain) { await Linking.openSettings().catch(() => undefined); return 'denied' }
    foreground = await Location.requestForegroundPermissionsAsync()
    if (!foreground.granted) return 'denied'
  }
  let background = await Location.getBackgroundPermissionsAsync()
  if (!background.granted) {
    if (!(await explainBackground())) return 'foreground'
    if (background.canAskAgain) background = await Location.requestBackgroundPermissionsAsync()
    if (!background.granted && !background.canAskAgain) await Linking.openSettings().catch(() => undefined)
  }
  return (await getPermission())
}

export async function isTracking(): Promise<boolean> {
  try { return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK) } catch { return false }
}

export async function getStatus(): Promise<LocationStatus> {
  const [running, permission, deviceId, upload_, stored] = await Promise.all([isTracking(), getPermission(), getDeviceId(), getUpload(), getLastSentAt()])
  return {
    // Running without a token would send nothing: report it as stopped so the
    // screen fetches a new token.
    running: running && Boolean(upload_),
    permission,
    lastSentAt: lastSentAt ?? stored,
    deviceId,
    platform: Platform.OS,
  }
}

export async function startTracking(token: string, ingestUrl: string): Promise<LocationStatus> {
  // The token is only ever sent to the TCNP server this app was built for.
  let origin = ''
  try { origin = new URL(ingestUrl).origin } catch { /* rejected below */ }
  if (origin !== APP_ORIGIN) throw new Error('This upload address is not part of TCNP.')
  if (!/^tcnp_loc_[A-Za-z0-9_-]{30,70}$/.test(token)) throw new Error('This device token is not valid.')

  const permission = await getPermission()
  if (permission === 'denied' || permission === 'undetermined') throw new Error('Location is not allowed for TCNP on this phone.')
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) throw new Error('Location is switched off on this phone. Turn it on in Settings, then try again.')

  await setUpload({ token, ingestUrl })
  lastSentAt = null
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined)
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    // A position at least every 10 seconds even when standing still, so a
    // stationary officer is not mistaken for one whose phone has gone quiet.
    timeInterval: 10_000,
    distanceInterval: 0,
    deferredUpdatesInterval: 10_000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.OtherNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'TCNP is sharing your location',
      notificationBody: 'Command can see you on Live Tracking. Switch sharing off in TCNP to stop.',
      notificationColor: '#F26522',
    },
  })
  notify()
  return getStatus()
}

export async function stopTracking(): Promise<void> {
  try { if (await isTracking()) await Location.stopLocationUpdatesAsync(LOCATION_TASK) } catch { /* already stopped */ }
  await setUpload(null)
  lastSentAt = null
  notify()
}
