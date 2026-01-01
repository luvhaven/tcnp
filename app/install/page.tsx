'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, Share, PlusSquare, CheckCircle, Smartphone, Monitor } from 'lucide-react'
import Link from 'next/link'

// Type for the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function InstallPage() {
    const [isIOS, setIsIOS] = useState(false)
    const [isStandalone, setIsStandalone] = useState(false)
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | 'unknown'>('unknown')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
            setIsStandalone(true)
        }

        // Platform detection
        const ua = navigator.userAgent.toLowerCase()

        if (/iphone|ipad|ipod/.test(ua)) {
            setIsIOS(true)
            setPlatform('ios')
        } else if (/android/.test(ua)) {
            setPlatform('android')
        } else {
            setPlatform('desktop')
        }

        // Listen for install prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault()
            // Stash the event so it can be triggered later
            setInstallPrompt(e as BeforeInstallPromptEvent)
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        }
    }, [])

    const handleInstallClick = async () => {
        if (!installPrompt) return

        // Show the install prompt
        await installPrompt.prompt()

        // Wait for the user to respond to the prompt
        const choiceResult = await installPrompt.userChoice

        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt')
            // Clear the prompt
            setInstallPrompt(null)
        } else {
            console.log('User dismissed the install prompt')
        }
    }

    if (!mounted) return null

    // CASE 1: Already Installed
    if (isStandalone) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="max-w-md w-full text-center">
                    <CardHeader>
                        <div className="mx-auto bg-green-100 p-3 rounded-full mb-4 w-fit">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                        <CardTitle>TCNP Journey is Installed</CardTitle>
                        <CardDescription>
                            The app is already installed on your device.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild className="w-full" size="lg">
                            <Link href="/">Open App</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // CASE 2: Android / Desktop (Installable via Prompt)
    if (installPrompt) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="max-w-md w-full text-center shadow-lg border-primary/20">
                    <CardHeader>
                        <div className="mx-auto bg-primary/10 p-4 rounded-full mb-4 w-fit">
                            <Download className="h-10 w-10 text-primary animate-bounce" />
                        </div>
                        <CardTitle className="text-2xl">Install TCNP Journey</CardTitle>
                        <CardDescription className="text-base">
                            Install the app for the best experience with offline support and notifications.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            onClick={handleInstallClick}
                            className="w-full text-lg py-6 font-semibold shadow-md hover:shadow-lg transition-all"
                        >
                            Install App
                        </Button>
                        <p className="text-xs text-muted-foreground mt-4">
                            Works on Android, Chrome, Edge, and most modern browsers.
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // CASE 3: iOS (Manual Instructions)
    if (isIOS) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto bg-blue-50 p-3 rounded-full mb-4 w-fit">
                            <Smartphone className="h-8 w-8 text-blue-600" />
                        </div>
                        <CardTitle className="text-xl">Install on iPhone / iPad</CardTitle>
                        <CardDescription>
                            Follow these steps to install the app on your home screen.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex items-start gap-4">
                            <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center shrink-0 font-bold text-gray-600">1</div>
                            <div>
                                <p className="font-medium text-sm">Tap the Share button</p>
                                <p className="text-xs text-muted-foreground mt-1">Found at the bottom or top of your browser.</p>
                                <div className="mt-2 bg-gray-100 p-2 rounded inline-block">
                                    <Share className="h-5 w-5 text-blue-600" />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center shrink-0 font-bold text-gray-600">2</div>
                            <div>
                                <p className="font-medium text-sm">Scroll down and tap 'Add to Home Screen'</p>
                                <div className="mt-2 bg-gray-100 p-2 rounded inline-flex items-center gap-2">
                                    <PlusSquare className="h-5 w-5 text-gray-700" />
                                    <span className="text-xs font-semibold">Add to Home Screen</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center shrink-0 font-bold text-gray-600">3</div>
                            <div>
                                <p className="font-medium text-sm">Tap 'Add' to confirm</p>
                                <p className="text-xs text-muted-foreground mt-1">The app icon will appear on your home screen.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // CASE 4: Desktop / Unknown (Fallback)
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="max-w-md w-full text-center">
                <CardHeader>
                    <div className="mx-auto bg-gray-100 p-3 rounded-full mb-4 w-fit">
                        <Monitor className="h-8 w-8 text-gray-600" />
                    </div>
                    <CardTitle>Install TCNP Journey</CardTitle>
                    <CardDescription>
                        To install this app, look for the install icon in your browser's address bar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="bg-muted/50 p-4 rounded-lg mb-6 text-left text-sm">
                        <p className="font-semibold mb-2">Instructions:</p>
                        <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                            <li>Chrome/Edge: Click the <Download className="h-3 w-3 inline" /> icon in the address bar.</li>
                            <li>Safari: Right-click tab > Pin Tab (for quick access).</li>
                            <li>Mobile: Use the browser menu to "Add to Home Screen".</li>
                        </ul>
                    </div>
                    <Button asChild variant="outline" className="w-full">
                        <Link href="/">Continue to App</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
