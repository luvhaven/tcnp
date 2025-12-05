"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

type Notification = {
    id: string
    title: string
    message: string
    type: 'info' | 'success' | 'warning' | 'error'
    is_read: boolean
    created_at: string
}

export default function NotificationCenter() {
    const supabase = createClient()
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [userId, setUserId] = useState<string | null>(null)

    useEffect(() => {
        loadNotifications()
        setupRealtimeSubscription()
    }, [])

    const loadNotifications = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            setUserId(user.id)

            // Get last 10 notifications
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10)

            if (error) throw error

            setNotifications(data || [])
            setUnreadCount(data?.filter(n => !n.is_read).length || 0)
        } catch (error) {
            console.error('Error loading notifications:', error)
        }
    }

    const setupRealtimeSubscription = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Subscribe to new notifications
        const channel = supabase
            .channel('notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    const newNotification = payload.new as Notification

                    // Add to list
                    setNotifications(prev => [newNotification, ...prev.slice(0, 9)])
                    setUnreadCount(prev => prev + 1)

                    // Show toast notification
                    showToastNotification(newNotification)

                    // Play sound and vibrate
                    playNotificationSound()
                    vibrateDevice()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }

    const showToastNotification = (notification: Notification) => {
        const toastFn = {
            info: toast.info,
            success: toast.success,
            warning: toast.warning,
            error: toast.error,
        }[notification.type] || toast.info

        toastFn(notification.title, {
            description: notification.message,
            duration: 5000,
        })
    }

    const playNotificationSound = () => {
        try {
            if (typeof window === 'undefined') return

            // Create a notification sound similar to Microsoft Teams
            // iOS requires AudioContext to be created or resumed from a user gesture event initially
            // However, we wrap this in try/catch to prevent app crash if it fails
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
            if (!AudioContextClass) return

            const audioContext = new AudioContextClass()

            // Create a more pleasant notification sound (two-tone chime)
            const playTone = (frequency: number, startTime: number, duration: number) => {
                const oscillator = audioContext.createOscillator()
                const gainNode = audioContext.createGain()

                oscillator.connect(gainNode)
                gainNode.connect(audioContext.destination)

                oscillator.frequency.value = frequency
                oscillator.type = 'sine'

                // Envelope for smooth sound
                gainNode.gain.setValueAtTime(0, startTime)
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01)
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration)

                oscillator.start(startTime)
                oscillator.stop(startTime + duration)
            }

            const now = audioContext.currentTime
            playTone(800, now, 0.15)  // First tone
            playTone(1000, now + 0.15, 0.2)  // Second tone (higher pitch)

        } catch (error) {
            // Silent fail for audio issues to prevent app crash
            console.warn('Audio playback failed (non-fatal):', error)
        }
    }

    const vibrateDevice = () => {
        try {
            // Vibration pattern: vibrate for 200ms, pause 100ms, vibrate for 200ms
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200])
            }
        } catch (error) {
            console.error('Error vibrating device:', error)
        }
    }

    const markAsRead = async (notificationId: string) => {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId)

            if (error) throw error

            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
            )
            setUnreadCount(prev => Math.max(0, prev - 1))
        } catch (error) {
            console.error('Error marking notification as read:', error)
        }
    }

    const markAllAsRead = async () => {
        if (!userId) return

        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false)

            if (error) throw error

            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
            setUnreadCount(0)
            toast.success('All notifications marked as read')
        } catch (error) {
            console.error('Error marking all as read:', error)
            toast.error('Failed to mark notifications as read')
        }
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'success': return 'text-green-600 dark:text-green-400'
            case 'warning': return 'text-yellow-600 dark:text-yellow-400'
            case 'error': return 'text-red-600 dark:text-red-400'
            default: return 'text-blue-600 dark:text-blue-400'
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="notification-badge">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex justify-between items-center">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={markAllAsRead}
                            className="h-auto p-1 text-xs"
                        >
                            Mark all as read
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {notifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                        No notifications
                    </div>
                ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                        {notifications.map((notification) => (
                            <DropdownMenuItem
                                key={notification.id}
                                className="flex flex-col items-start p-3 cursor-pointer"
                                onClick={() => !notification.is_read && markAsRead(notification.id)}
                            >
                                <div className="flex items-start justify-between w-full gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className={`font-medium text-sm ${getTypeColor(notification.type)}`}>
                                                {notification.title}
                                            </p>
                                            {!notification.is_read && (
                                                <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {notification.message}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {notification.created_at && !isNaN(new Date(notification.created_at).getTime())
                                                ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
                                                : 'Just now'}
                                        </p>
                                    </div>
                                </div>
                            </DropdownMenuItem>
                        ))}
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
