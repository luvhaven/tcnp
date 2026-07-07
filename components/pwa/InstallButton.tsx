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
 * Never a dead click.
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
      {/* Adaptive: labelled button on md+, icon-only on mobile */}
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        className="hidden md:inline-flex bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
      >
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        Install App
      </Button>
      <Button
        onClick={handleClick}
        variant="ghost"
        size="icon"
        className="inline-flex md:hidden h-9 w-9 text-primary"
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
