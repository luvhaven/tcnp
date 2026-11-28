import { Alert } from 'react-native'

/**
 * Loaded before everything else. If the app's own code fails while starting,
 * Android would otherwise just say "TCNP keeps stopping", which tells nobody
 * what went wrong. This shows the reason on screen instead, so it can be read
 * out or photographed and fixed.
 *
 * It cannot catch a failure inside Android's own native code; those still
 * close the app.
 */
type ErrorHandler = (error: unknown, isFatal?: boolean) => void
const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler(): ErrorHandler; setGlobalHandler(handler: ErrorHandler): void } }).ErrorUtils

if (errorUtils && !__DEV__) {
  const previous = errorUtils.getGlobalHandler()
  let shown = false
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) { previous(error, isFatal); return }
    if (shown) return
    shown = true
    const detail = error instanceof Error ? `${error.message}\n\n${(error.stack ?? '').split('\n').slice(0, 4).join('\n')}` : String(error)
    try {
      Alert.alert('TCNP could not start', `Please send a photo of this message to Command.\n\n${detail.slice(0, 700)}`)
    } catch { previous(error, isFatal) }
  })
}
