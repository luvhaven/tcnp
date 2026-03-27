'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Share, PlusSquare, Smartphone, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    // 1. Check if running in standalone mode (Installed PWA)
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true

      setIsInstalled(isStandalone)
      if (isStandalone) setShowInstallBanner(false)
    }

    checkStandalone()
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone)

    // 2. Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent)
    setIsIOS(isIosDevice)

    // On iOS, we can't rely on beforeinstallprompt, so we auto-show if not standalone
    // We wait a moment to avoid flashing if checking standalone takes time
    if (isIosDevice && !(window.navigator as any).standalone) {
      setTimeout(() => setShowInstallBanner(true), 1000)
    }

    // 3. Handle standard install prompt (Android/Desktop)
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Only show banner if NOT installed
      if (!isInstalled) {
        setShowInstallBanner(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowInstallBanner(false)
      toast.success('App installed successfully!')
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkStandalone)
    }
  }, [isInstalled])

  const handleInstallClick = async () => {
    if (isInstalled) return // Should act as "Open" if we could link, but we are already in it or it's just a status

    if (isIOS) {
      // Show iOS instructions
      setShowIOSInstructions(true)
    } else if (deferredPrompt) {
      // Trigger standard prompt
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
        setShowInstallBanner(false)
      }
    } else {
      // Fallback (e.g. if installed but browser doesn't know, or unknown device)
      toast.info('To install, look for "Add to Home Screen" in your browser menu.')
    }
  }

  // If app is already installed/running in standalone, simply don't show the button.
  // The user complained about it "re-opening" the app, which implies they don't want to see it when inside the app.
  if (isInstalled) {
    return null
  }

  // If banner is explicitly hidden or not relevant (though we allow manual click via header button)
  const showFloating = showInstallBanner && !isInstalled

  return (
    <>
      {/* 1. Header Button (Always visible on Desktop if not installed, or generic "Install" intent) */}
      {!isInstalled && (
        <Button
          onClick={handleInstallClick}
          variant="outline"
          size="sm"
          className="hidden md:flex bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
        >
          <Download className="mr-2 h-4 w-4" />
          Install App
        </Button>
      )}

      {/* 2. Floating Banner (Mobile/Prominent) */}
      {showFloating && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-500">
          <div className="bg-background border border-border shadow-xl rounded-xl p-4 max-w-xs md:max-w-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Install App</h3>
                </div>
              </div>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <span className="sr-only">Close</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleInstallClick} size="sm" className="w-full hidden">
                Install
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. iOS Instructions Dialog */}
      <Dialog open={showIOSInstructions} onOpenChange={setShowIOSInstructions}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install on iPhone/iPad</DialogTitle>
            <DialogDescription>
              Follow these steps to add the app to your Home Screen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Share className="h-5 w-5" />
              </div>
              <p className="text-sm">1. Tap the <span className="font-semibold">Share</span> icon in your browser bar.</p>
            </div>
            <div className="w-full h-px bg-border" />
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <PlusSquare className="h-5 w-5" />
              </div>
              <p className="text-sm">2. Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowIOSInstructions(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
