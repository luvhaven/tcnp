'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { PWAInstallModal } from './PWAInstallModal'

/**
 * Single install entry point for the header.
 * - Android / desktop Chromium: native install dialog
 * - iOS / macOS Safari / other browsers: platform-specific instructions modal
 * - Hidden entirely once the app is installed
 */
export default function InstallButton() {
  const { isInstalled, install, platform } = usePWAInstall()
  const [showModal, setShowModal] = useState(false)

  if (isInstalled) return null

  const handleClick = async () => {
    const result = await install()
    if (result === 'show-instructions') {
      setShowModal(true)
    } else if (result === 'accepted') {
      toast.success('TCNP installed — check your home screen or app launcher.')
    }
  }

  return (
    <>
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
        aria-label="Install app"
      >
        <Download className="h-4 w-4 sm:mr-2" aria-hidden="true" />
        <span className="hidden sm:inline">Install App</span>
      </Button>

      {showModal && (
        <PWAInstallModal platform={platform} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
