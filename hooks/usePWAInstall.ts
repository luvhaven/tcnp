'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useBrowserSnapshot } from './useBrowserSnapshot'

export type PWAPlatform =
  | 'android'
  | 'ios'
  | 'mac-safari'
  | 'desktop-chrome'
  | 'desktop-other'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface UsePWAInstallReturn {
  /** true if running inside an installed PWA (standalone display-mode) */
  isInstalled: boolean
  /** true if the browser has fired beforeinstallprompt and we can call .prompt() */
  canNativeInstall: boolean
  /** detected OS / browser category */
  platform: PWAPlatform | null
  /**
   * Trigger install.
   * - Returns 'accepted' | 'dismissed' when the native dialog was used.
   * - Returns 'show-instructions' when no native dialog is available
   *   (iOS / macOS Safari / unsupported desktop) — caller should open the
   *   instructions modal.
   */
  install: () => Promise<'accepted' | 'dismissed' | 'show-instructions'>
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [installedThisSession, setIsInstalled] = useState(false)
  const standalone = useBrowserSnapshot(() => ['standalone', 'window-controls-overlay', 'minimal-ui', 'fullscreen'].some(mode => window.matchMedia(`(display-mode: ${mode})`).matches) || (navigator as any).standalone === true, false)
  const isInstalled = standalone || installedThisSession
  const [canNativeInstall, setCanNativeInstall] = useState(false)
  const platform = useBrowserSnapshot<PWAPlatform | null>(() => {
    const ua = navigator.userAgent
    if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
    if (/Android/.test(ua)) return 'android'
    if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Firefox|Edg/.test(ua)) return 'mac-safari'
    return /Chrome|Edg/.test(ua) ? 'desktop-chrome' : 'desktop-other'
  }, null)
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ── Listen for native install event ──────────────────────────────────────
    const handleBIP = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setCanNativeInstall(true)
    }

    const handleInstalled = () => {
      setIsInstalled(true)
      setCanNativeInstall(false)
      deferredPrompt.current = null
    }

    window.addEventListener('beforeinstallprompt', handleBIP)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBIP)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const install = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'show-instructions'
  > => {
    if (deferredPrompt.current) {
      await deferredPrompt.current.prompt()
      const { outcome } = await deferredPrompt.current.userChoice
      deferredPrompt.current = null
      setCanNativeInstall(false)
      if (outcome === 'accepted') setIsInstalled(true)
      return outcome
    }
    // No native prompt available — caller shows manual instructions
    return 'show-instructions'
  }, [])

  return { isInstalled, canNativeInstall, platform, install }
}
