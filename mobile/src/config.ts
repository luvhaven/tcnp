import Constants from 'expo-constants'

/**
 * Where the TCNP screens are served from. Set in app.json (`expo.extra.appUrl`)
 * so a staging build can point somewhere else without a code change.
 */
const configured = (Constants.expoConfig?.extra as { appUrl?: unknown } | undefined)?.appUrl
export const APP_URL = typeof configured === 'string' && /^https:\/\//.test(configured) ? configured.replace(/\/+$/, '') : 'https://tcnp.vercel.app'
export const APP_ORIGIN = new URL(APP_URL).origin
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'

/** True for pages the app itself serves; everything else opens in the phone's browser. */
export function isAppUrl(url: string): boolean {
  try { return new URL(url).origin === APP_ORIGIN } catch { return false }
}
