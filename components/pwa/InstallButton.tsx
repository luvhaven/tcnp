'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { PWAInstallModal } from './PWAInstallModal'

/**
 * Single install entry point for the header.
 * - Wherever the browser can install on request (Android, desktop Chrome and
 *   Edge), a click raises the native install dialog straight away.
 * - The instructions modal appears only where the device gives a page no way
 *   to install itself (iOS, Safari on Mac, Firefox, in-app browsers).
 * - Hidden entirely once the app is installed
 */
export default function InstallButton() {
  const { isInstalled, install, platform } = usePWAInstall()
  const [showModal, setShowModal] = useState(false)
  const [busy, setBusy] = useState(false)

  if (isInstalled) return null

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await install()
      if (result === 'show-instructions') {
        setShowModal(true)
      } else if (result === 'accepted') {
        toast.success('TCNP installed — check your home screen or app launcher.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Adaptive: labelled button above 860px, icon-only below */}
      <Button
        onClick={handleClick}
        pending={busy}
        variant="outline"
        size="sm"
        className="hidden bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 nav:inline-flex"
      >
        {!busy && <Download aria-hidden="true" />}
        Install App
      </Button>
      <Button
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy || undefined}
        variant="ghost"
        size="icon"
        className="inline-flex h-9 w-9 text-primary nav:hidden"
        aria-label="Install app"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
      </Button>

      {showModal && (
        <PWAInstallModal platform={platform} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
