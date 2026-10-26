"use client"

import { playNotificationFeedback } from '@/lib/notification-feedback'
import { showSystemNotification } from '@/lib/services/system-notification'

/**
 * Notification Service
 * Microsoft Teams-like notification system with sound and vibration
 * Audio is routed through the global AudioManager singleton so that
 * the mute button in BrokenArrowAlert silences everything.
 */

export class NotificationService {
    private static instance: NotificationService
    private permission: NotificationPermission = 'default'

    private constructor() {
        // `window` existing does not imply `Notification` does. iOS Safari
        // exposes the Notification API only to installed PWAs, so in a normal
        // tab this reads an undeclared global and throws a ReferenceError.
        // Because the singleton below is built at module scope, that throw
        // happens on IMPORT — taking down every route that pulls this in
        // (chat, my-operations, my-assignments, the permission banner) via
        // the error boundary, long before anything renders.
        if (typeof window !== 'undefined' && 'Notification' in window) {
            this.permission = Notification.permission
        }
    }

    static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService()
        }
        return NotificationService.instance
    }

    /**
     * Request notification permission from user
     */
    async requestPermission(): Promise<boolean> {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            return false
        }

        if (this.permission === 'granted') {
            return true
        }

        try {
            const permission = await Notification.requestPermission()
            this.permission = permission
            return permission === 'granted'
        } catch (error) {
            console.error('Error requesting notification permission:', error)
            return false
        }
    }

    /**
     * Show browser notification with sound and vibration
     */
    async showNotification(options: {
        title: string
        body: string
        icon?: string
        tag?: string
        data?: any
        requireInteraction?: boolean
        silent?: boolean
    }) {
        // Never prompt from here: these calls come from realtime events, not user
        // gestures. NotificationPermissionBanner asks for permission instead.
        if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
            return
        }

        // Goes through the service worker where available; `new Notification()`
        // throws on Android Chrome.
        const foreground = !document.hidden && document.hasFocus()
        const shown = await showSystemNotification(options.title, {
            body: options.body,
            icon: options.icon || '/tcnp_logo.png',
            badge: '/tcnp_logo.png',
            tag: options.tag,
            data: options.data,
            requireInteraction: options.requireInteraction || false,
            silent: foreground || options.silent || false,
        })

        if (shown && foreground && !options.silent) {
            playNotificationFeedback()
        }
    }

    /**
     * Show notification for new chat message
     */
    async notifyNewMessage(sender: string, message: string, isPrivate: boolean = false) {
        await this.showNotification({
            title: isPrivate ? `🔒 Private message from ${sender}` : `💬 ${sender}`,
            body: message,
            tag: 'chat-message',
            requireInteraction: isPrivate,
        })
    }

    /**
     * Show notification for journey status update
     */
    async notifyJourneyUpdate(papaName: string, status: string) {
        await this.showNotification({
            title: `🚗 Journey Update: ${papaName}`,
            body: `Status changed to: ${status}`,
            tag: 'journey-update',
        })
    }

    /**
     * Show notification for assignment
     */
    async notifyAssignment(title: string, details: string) {
        await this.showNotification({
            title: `📋 New Assignment: ${title}`,
            body: details,
            tag: 'assignment',
            requireInteraction: true,
        })
    }

    /**
     * Show notification for emergency/broken arrow.
     * Audio is intentionally NOT started here — BrokenArrowAlert owns the alarm loop
     * via AudioManager so that a single mute button silences everything.
     */
    async notifyEmergency(message: string) {
        await this.showNotification({
            title: '🚨 EMERGENCY ALERT',
            body: message,
            tag: 'emergency',
            requireInteraction: true,
            silent: true, // BrokenArrowAlert handles audio via AudioManager
        })
    }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance()
