'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Share, PlusSquare, Smartphone } from 'lucide-react'
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
    // 1. Check if running in standalone mode (installed PWA)
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
      setIsInstalled(standalone)
      if (standalone) setShowInstallBanner(false)
    }

    checkStandalone()
    const mql = window.matchMedia('(display-mode: standalone)')
    mql.addEventListener('change', checkStandalone)

    // 2. Detect iOS
    const ua = window.navigator.userAgent.toLowerCase()
    const iosDevice = /iphone|ipad|ipod/.test(ua)
    setIsIOS(iosDevice)

    // 3. Standard install prompt (Android / desktop Chrome)
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowInstallBanner(false)
      toast.success('App installed successfully!')
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      mql.removeEventListener('change', checkStandalone)
    }
  }, [])

  const handleInstallClick = async () => {
    if (isInstalled) return

    if (isIOS) {
      setShowIOSInstructions(true)
    } else if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
        setShowInstallBanner(false)
      }
    } else {
      toast.info('To install, look for "Add to Home Screen" in your browser menu.')
    }
  }

  // Already installed → render nothing
  if (isInstalled) return null

  return (
    <>
      {/*
        ── Desktop header button ─────────────────────────────────────────
        Shown only on md+ screens. On mobile the button is hidden so it
        never clutters the compact header. iOS users tap "Install" and get
        the step-by-step dialog. Android/Chrome users get the native prompt.
      */}
      <Button
        onClick={handleInstallClick}
        variant="outline"
        size="sm"
        className="hidden md:flex bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
      >
        <Download className="mr-2 h-4 w-4" />
        Install App
      </Button>

      {/*
        ── Mobile: compact icon-only CTA ────────────────────────────────
        Only shown when the browser has confirmed the app CAN be installed
        (deferredPrompt is set) OR when on iOS (so the user can get the
        "Add to Home Screen" instructions). Hidden once installed.
      */}
      {(deferredPrompt || isIOS) && (
        <Button
          onClick={handleInstallClick}
          variant="ghost"
          size="icon"
          className="flex md:hidden h-8 w-8 text-primary"
          aria-label="Install app"
        >
          <Smartphone className="h-4 w-4" />
        </Button>
      )}

      {/* iOS step-by-step instructions dialog */}
      <Dialog open={showIOSInstructions} onOpenChange={setShowIOSInstructions}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install on iPhone / iPad</DialogTitle>
            <DialogDescription>
              Add this app to your Home Screen for the best experience.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Share className="h-5 w-5" />
              </div>
              <p className="text-sm">
                1. Tap the <span className="font-semibold">Share</span> icon in your browser toolbar.
              </p>
            </div>
            <div className="w-full h-px bg-border" />
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <PlusSquare className="h-5 w-5" />
              </div>
              <p className="text-sm">
                2. Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.
              </p>
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
