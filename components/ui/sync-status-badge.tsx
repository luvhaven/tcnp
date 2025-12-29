"use client"

import { useEffect, useState } from 'react'
import { syncService } from '@/lib/sync-service'
import { Badge } from '@/components/ui/badge'
import { Cloud, CloudOff } from 'lucide-react'

export function SyncStatusBadge() {
    const [pendingCount, setPendingCount] = useState(0)
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        setIsOnline(navigator.onLine)

        const updateCount = async () => {
            const count = await syncService.getPendingCount()
            setPendingCount(count)
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
