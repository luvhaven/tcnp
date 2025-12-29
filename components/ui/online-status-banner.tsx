"use client"

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'

export function OnlineStatusBanner() {
    const [isOnline, setIsOnline] = useState(true)
    const [wasOffline, setWasOffline] = useState(false)
    const [showReconnected, setShowReconnected] = useState(false)

    useEffect(() => {
        // Check initial status
        setIsOnline(navigator.onLine)

        const handleOnline = () => {
            setIsOnline(true)
            if (wasOffline) {
                setShowReconnected(true)
                // Auto-hide "reconnected" message after 3 seconds
                setTimeout(() => setShowReconnected(false), 3000)
            }
            setWasOffline(false)
        }

        const handleOffline = () => {
            setIsOnline(false)
            setWasOffline(true)
            setShowReconnected(false)
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [wasOffline])

    // Don't show anything if online and never was offline
    if (isOnline && !showReconnected) return null

    return (
        <div
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
                isOnline ? "translate-y-0" : "translate-y-0"
            )}
        >
            {!isOnline && (
                <div className="bg-yellow-500 text-white px-4 py-2 text-sm flex items-center justify-center gap-2 shadow-lg">
                    <WifiOff className="h-4 w-4" />
                    <span className="font-medium">You're offline</span>
                    <span className="hidden sm:inline">- App running in offline mode. Changes will sync when reconnected.</span>
                </div>
            )}

            {showReconnected && (
                <div className="bg-green-500 text-white px-4 py-2 text-sm flex items-center justify-center gap-2 shadow-lg animate-in slide-in-from-top">
                    <Wifi className="h-4 w-4" />
                    <span className="font-medium">Back online!</span>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span className="hidden sm:inline">Syncing updates...</span>
                </div>
            )}
        </div>
    )
}
