"use client"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, BellOff } from 'lucide-react'
import { notificationService } from '@/lib/services/notificationService'

export default function NotificationPermissionBanner() {
    const [show, setShow] = useState(false)
    const [permission, setPermission] = useState<NotificationPermission>('default')

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            const currentPermission = Notification.permission
            setPermission(currentPermission)

            // Show banner if permission is not granted
            if (currentPermission === 'default') {
                // Wait 3 seconds before showing to not overwhelm user
                setTimeout(() => setShow(true), 3000)
            }
        }
    }, [])

    const handleEnableNotifications = async () => {
        const granted = await notificationService.requestPermission()
        if (granted) {
            setPermission('granted')
            setShow(false)

            // Show a test notification
            await notificationService.showNotification({
                title: '🔔 Notifications Enabled!',
                body: 'You will now receive real-time updates with sound and vibration.',
            })
        } else {
            setPermission('denied')
        }
    }

    const handleDismiss = () => {
        setShow(false)
        // Remember dismissal in localStorage
        localStorage.setItem('notification-banner-dismissed', 'true')
    }

    // Don't show if already dismissed
    useEffect(() => {
        const dismissed = localStorage.getItem('notification-banner-dismissed')
        if (dismissed === 'true') {
            setShow(false)
        }
    }, [])

    if (!show || permission !== 'default') {
        return null
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-5">
            <Card className="border-primary/50 shadow-lg">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Bell className="h-5 w-5 text-primary" />
                        Enable Notifications
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Get real-time alerts with sound and vibration for messages, journey updates, and emergencies
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                    <Button onClick={handleEnableNotifications} size="sm" className="flex-1">
                        <Bell className="h-4 w-4 mr-2" />
                        Enable
                    </Button>
                    <Button onClick={handleDismiss} size="sm" variant="outline">
                        <BellOff className="h-4 w-4 mr-2" />
                        Not Now
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
