'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, X } from 'lucide-react'
import { toast } from 'sonner'

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // Listen for the beforeinstallprompt event
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowInstallBanner(false)
      toast.success('App installed successfully!')
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) {
      toast.error('Installation not available')
      return
    }

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    
    if (outcome === 'accepted') {
      toast.success('Installing app...')
    } else {
      toast.info('Installation cancelled')
    }
    
    setDeferredPrompt(null)
    setShowInstallBanner(false)
  }

  if (isInstalled) {
    // When running as a PWA / installed app, show a subtle status badge in the header
    return (
      <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 animate-slide-up">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        PWA active
      </span>
    )
  }

  if (!showInstallBanner) {
    return null
  }

  return (
    <>
      {/* Floating Install Banner */}
      <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
        <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Download className="h-5 w-5" />
              <h3 className="font-semibold">Install TCNP Journey</h3>
            </div>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="hover:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm mb-3 opacity-90">
            Install our app for a better experience with offline access and notifications.
          </p>
          <div className="flex space-x-2">
            <Button
              onClick={handleInstall}
              variant="secondary"
              size="sm"
              className="flex-1"
            >
              <Download className="mr-2 h-4 w-4" />
              Install Now
            </Button>
            <Button
              onClick={() => setShowInstallBanner(false)}
              variant="ghost"
              size="sm"
            >
              Later
            </Button>
          </div>
        </div>
      </div>

      {/* Header Install Button */}
      <Button
        onClick={handleInstall}
        variant="outline"
        size="sm"
        className="hidden md:flex"
      >
        <Download className="mr-2 h-4 w-4" />
        Install App
      </Button>
    </>
  )
}
