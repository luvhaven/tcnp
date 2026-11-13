'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle, Download, ShieldCheck } from 'lucide-react'
import packageInfo from '@/package.json'
import { Button } from '@/components/ui/button'
import { useIsClient } from '@/hooks/useIsClient'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { PWAInstallModal } from '@/components/pwa/PWAInstallModal'

/**
 * Public install page. One button on every device: it raises the native
 * install dialog where the browser allows that, and opens the device-specific
 * steps only where it does not.
 */
export default function InstallPage() {
    const mounted = useIsClient()
    const { isInstalled, install, platform } = usePWAInstall()
    const [showModal, setShowModal] = useState(false)
    const [busy, setBusy] = useState(false)

    const handleInstall = async () => {
        if (busy) return
        setBusy(true)
        try {
            if (await install() === 'show-instructions') setShowModal(true)
        } finally {
            setBusy(false)
        }
    }

    if (!mounted) return null

    return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-elevation-xl">
                <div className="bg-gradient-to-br from-primary to-primary-text px-8 py-10 text-center text-primary-foreground">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[1.25rem] bg-white p-2 shadow-elevation-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icon-192.png" alt="" width={64} height={64} className="h-full w-full object-contain" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">TCN Protocol</h1>
                    <p className="mt-1 text-sm opacity-90">Central Application</p>
                </div>

                <div className="space-y-4 p-6">
                    {isInstalled ? (
                        <>
                            <p className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
                                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                TCNP is installed on this device.
                            </p>
                            <Button asChild size="lg" className="h-12 w-full text-base">
                                <Link href="/dashboard">Open TCNP</Link>
                            </Button>
                        </>
                    ) : (
                        <>
                            <p className="text-center text-sm text-muted-foreground">
                                Install TCNP for one-tap access, a full-screen view and alerts even when the app is closed.
                            </p>
                            <Button onClick={handleInstall} pending={busy} size="lg" className="h-12 w-full text-base">
                                {!busy && <Download aria-hidden="true" />}
                                Install app
                            </Button>
                            <Button asChild variant="ghost" className="w-full text-muted-foreground">
                                <Link href="/dashboard">Continue in browser</Link>
                            </Button>
                        </>
                    )}

                    <p className="flex items-center justify-center gap-1.5 border-t pt-4 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Secure application for TCN Protocol officers
                    </p>
                </div>
            </div>

            <p className="mt-6 text-xs text-muted-foreground">Version {packageInfo.version}</p>

            {showModal && <PWAInstallModal platform={platform} onClose={() => setShowModal(false)} />}
        </div>
    )
}
