"use client"

import { audioManager } from '@/lib/audio/AudioManager'

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
        if (typeof window !== 'undefined') {
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
     * Play notification sound via the global AudioManager singleton.
     */
    private playNotificationSound() {
        audioManager.playChime('info')
    }

    /**
     * Vibrate device (mobile only)
     */
    private vibrate() {
        if ('vibrate' in navigator) {
            try {
                // Vibration pattern: vibrate for 200ms, pause 100ms, vibrate 200ms
                navigator.vibrate([200, 100, 200])
            } catch (error) {
                console.error('Error vibrating device:', error)
            }
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
        // Request permission if not granted
        if (this.permission !== 'granted') {
            const granted = await this.requestPermission()
            if (!granted) {
                console.warn('Notification permission not granted')
                return
            }
        }

        try {
            // Show browser notification
            const notification = new Notification(options.title, {
                body: options.body,
                icon: options.icon || '/tcnp_logo.png',
                badge: '/tcnp_logo.png',
                tag: options.tag,
                data: options.data,
                requireInteraction: options.requireInteraction || false,
                silent: options.silent || false,
            })

            // Play sound if not silent
            if (!options.silent) {
                this.playNotificationSound()
            }

            // Vibrate on mobile
            this.vibrate()

            // Auto-close after 5 seconds unless requireInteraction is true
            if (!options.requireInteraction) {
                setTimeout(() => notification.close(), 5000)
            }

            return notification
        } catch (error) {
            console.error('Error showing notification:', error)
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
