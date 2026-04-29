'use client'

import { useState } from 'react'
import { Download, X } from 'lucide-react'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { PWAInstallModal } from './PWAInstallModal'

/**
 * Floating bottom banner — shown after the user hasn't dismissed it for 7 days
 * and the app is not yet installed. On Android/Desktop it triggers the native
 * install dialog; on iOS/macOS Safari it opens the instructions modal.
 */
export function PWAInstallPrompt() {
  const { isInstalled, install, platform } = usePWAInstall()
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    const ts = localStorage.getItem('pwa-prompt-dismissed')
    if (!ts) return false
    return (Date.now() - Number(ts)) / 86_400_000 < 7
  })
  const [showModal, setShowModal] = useState(false)

  if (isInstalled || dismissed) return null

  const handleClick = async () => {
    const result = await install()
    if (result === 'show-instructions') setShowModal(true)
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString())
    setDismissed(true)
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom-4 duration-300">
        <div className="rounded-xl border bg-card shadow-xl shadow-black/20 p-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Download className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Install TCNP</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {platform === 'ios'
                ? 'Add to your Home Screen for instant access.'
                : 'Install for quick access and offline support.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClick}
            className="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all"
          >
            Install
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {showModal && (
        <PWAInstallModal platform={platform} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
