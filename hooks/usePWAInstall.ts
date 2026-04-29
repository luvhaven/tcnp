'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

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
  const [isInstalled, setIsInstalled] = useState(false)
  const [canNativeInstall, setCanNativeInstall] = useState(false)
  const [platform, setPlatform] = useState<PWAPlatform | null>(null)
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ── Already running as installed PWA ────────────────────────────────────
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (isStandalone) {
      setIsInstalled(true)
      return
    }

    // ── Detect platform ──────────────────────────────────────────────────────
    const ua = navigator.userAgent
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isAndroid = /Android/.test(ua)
    const isMac = /Macintosh/.test(ua) && !isIOS
    const isSafariOnly =
      /Safari/.test(ua) &&
      !/Chrome/.test(ua) &&
      !/Firefox/.test(ua) &&
      !/Edg/.test(ua)

    if (isIOS) setPlatform('ios')
    else if (isAndroid) setPlatform('android')
    else if (isMac && isSafariOnly) setPlatform('mac-safari')
    else if (/Chrome/.test(ua) || /Edg/.test(ua)) setPlatform('desktop-chrome')
    else setPlatform('desktop-other')

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
