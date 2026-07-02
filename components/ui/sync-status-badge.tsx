"use client"

import { useEffect, useState } from 'react'
import { syncService } from '@/lib/sync-service'
import { Badge } from '@/components/ui/badge'
import { Cloud, CloudOff, AlertTriangle } from 'lucide-react'

export function SyncStatusBadge() {
    const [pendingCount, setPendingCount] = useState(0)
    const [hasEmergency, setHasEmergency] = useState(false)
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        setIsOnline(navigator.onLine)

        const updateCount = async () => {
            const count = await syncService.getPendingCount()
            setPendingCount(count)
            if (count > 0) {
                const emergency = await syncService.hasPendingEmergency()
                setHasEmergency(emergency)
            } else {
                setHasEmergency(false)
            }
        }

        updateCount()

        const handleOnline = () => {
            setIsOnline(true)
            updateCount()
        }

        const handleOffline = () => {
            setIsOnline(false)
            updateCount()
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        const unsubscribe = syncService.onSync(updateCount)

        // Update count every 5 seconds
        const interval = setInterval(updateCount, 5000)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            unsubscribe()
            clearInterval(interval)
        }
    }, [])

    if (pendingCount === 0) return null

    if (hasEmergency) {
        return (
            <Badge
                variant="destructive"
                className="fixed bottom-4 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-4 z-[9999] gap-2 px-4 py-3 bg-red-600 animate-pulse shadow-2xl border-2 border-red-400 text-white"
            >
                <AlertTriangle className="h-5 w-5" />
                <span className="font-bold uppercase tracking-wider">
                    PENDING EMERGENCY (OFFLINE)
                </span>
            </Badge>
        )
    }

    return (
        <Badge
            variant="outline"
            className="fixed bottom-4 right-4 z-50 gap-2 px-3 py-2 bg-background/95 backdrop-blur-sm shadow-lg border-2"
        >
            {isOnline ? (
                <Cloud className="h-4 w-4 text-blue-500" />
            ) : (
                <CloudOff className="h-4 w-4 text-orange-500" />
            )}
            <span className="font-medium">
                {pendingCount} pending sync{pendingCount > 1 ? 's' : ''}
            </span>
        </Badge>
    )
}
