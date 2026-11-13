'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useBrowserSnapshot } from './useBrowserSnapshot'
import {
  detectPlatform,
  hasInstallPrompt,
  isRunningInstalled,
  requestInstall,
  subscribeToInstall,
  wasInstalledThisSession,
  type InstallOutcome,
  type PWAPlatform,
} from '@/lib/pwa-install'

export type { PWAPlatform } from '@/lib/pwa-install'

export interface UsePWAInstallReturn {
  /** true if running inside an installed PWA, or installed during this visit */
  isInstalled: boolean
  /** true while the browser's native install dialog is available to raise */
  canNativeInstall: boolean
  /** detected OS / browser category */
  platform: PWAPlatform | null
  /**
   * Install the app.
   * - 'accepted' | 'dismissed': the native dialog was shown and answered.
   * - 'show-instructions': this device gives a page no way to install itself
   *   (iOS, Safari on Mac, Firefox, in-app browsers), so the caller should
   *   open the instructions modal.
   */
  install: () => Promise<InstallOutcome>
}

const never = () => false

/**
 * Every install control shares one record of the browser's offer
 * (lib/pwa-install), so it does not matter which control mounted first or
 * which one the user clicks.
 */
export function usePWAInstall(): UsePWAInstallReturn {
  const standalone = useBrowserSnapshot(isRunningInstalled, false)
  const installedThisSession = useSyncExternalStore(subscribeToInstall, wasInstalledThisSession, never)
  const canNativeInstall = useSyncExternalStore(subscribeToInstall, hasInstallPrompt, never)
  const platform = useBrowserSnapshot<PWAPlatform | null>(
    () => detectPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    null,
  )

  const install = useCallback(() => requestInstall(platform), [platform])

  return { isInstalled: standalone || installedThisSession, canNativeInstall, platform, install }
}
