'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Download, Share, PlusSquare, CheckCircle, Smartphone, Info } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

// Type for the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function InstallPage() {
    const [isIOS, setIsIOS] = useState(false)
    const [isStandalone, setIsStandalone] = useState(false)
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)

        // Check if already installed
        if (
            window.matchMedia('(display-mode: standalone)').matches ||
            (navigator as any).standalone ||
            document.referrer.includes('android-app')
        ) {
            setIsStandalone(true)
        }

        // Platform detection
        const ua = navigator.userAgent.toLowerCase()
        if (/iphone|ipad|ipod/.test(ua)) {
            setIsIOS(true)
        }

        // Listen for install prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault()
            setInstallPrompt(e as BeforeInstallPromptEvent)
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }, [])

    const handleInstallClick = async () => {
        if (!installPrompt) return
        await installPrompt.prompt()
        const choiceResult = await installPrompt.userChoice
        if (choiceResult.outcome === 'accepted') {
            setInstallPrompt(null)
        }
    }

    if (!mounted) return null

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <Card className="max-w-md w-full shadow-xl border-0 overflow-hidden">

                {/* App Header Zone */}
                <div className="bg-gradient-to-br from-[#F26522] to-[#D1490E] p-8 text-center text-white">
                    <div className="bg-white p-1 rounded-[18px] inline-block shadow-lg mb-4">
                        {/* Uses the PWA Icon */}
                        <div className="w-20 h-20 bg-gray-100 rounded-[14px] overflow-hidden relative">
                            <Image
                                src="/icon-192.png"
                                alt="App Icon"
                                width={80}
                                height={80}
                                className="object-cover"
                            />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold">TCNP Journey</h1>
                    <p className="opacity-90 text-sm mt-1">Enterprise Journey Management</p>
                </div>

                <CardContent className="p-6 space-y-6">

                    {/* ACTION BUTTON ZONE */}
                    <div className="space-y-3">
                        {isStandalone ? (
                            <Button asChild className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 shadow-md">
                                <Link href="/dashboard" className="flex items-center gap-2">
                                    OPEN APP <CheckCircle className="w-5 h-5" />
                                </Link>
                            </Button>
                        ) : installPrompt ? (
                            <Button
                                onClick={handleInstallClick}
                                className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 shadow-md animate-pulse"
                            >
                                INSTALL APP <Download className="w-5 h-5 ml-2" />
                            </Button>
                        ) : isIOS ? (
                            <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm border border-blue-100">
                                <p className="font-semibold mb-2 flex items-center gap-2">
                                    <Smartphone className="w-4 h-4" /> Install on iOS
                                </p>
                                <ol className="list-decimal pl-4 space-y-1 opacity-90">
                                    <li>Tap <strong>Share</strong> <Share className="w-3 h-3 inline" /></li>
                                    <li>Scroll down & tap <strong>Add to Home Screen</strong> <PlusSquare className="w-3 h-3 inline" /></li>
                                </ol>
                            </div>
                        ) : (
                            <div className="bg-gray-100 text-gray-700 p-4 rounded-lg text-sm text-center">
                                <p className="font-medium mb-2">Install from Browser</p>
                                <p className="text-xs opacity-75">
                                    Use your browser's menu to "Install App" or "Add to Home Screen".
                                </p>
                            </div>
                        )}

                        {/* Secondary Open Link (always visible just in case) */}
                        {!isStandalone && (
                            <Button asChild variant="ghost" className="w-full text-muted-foreground">
                                <Link href="/dashboard">Continue in Browser &rarr;</Link>
                            </Button>
                        )}
                    </div>

                    <div className="text-center pt-4 border-t">
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                            <Info className="w-3 h-3" />
                            Secure Enterprise Application
                        </p>
                    </div>

                </CardContent>
            </Card>

            <p className="mt-8 text-xs text-gray-400">
                v1.0.0 • The Covenant Nation Protocol
            </p>
        </div>
    )
}
