"use client"

/**
 * Notification Service
 * Microsoft Teams-like notification system with sound and vibration
 */

export class NotificationService {
    private static instance: NotificationService
    private audioContext: AudioContext | null = null
    private notificationSound: HTMLAudioElement | null = null
    private permission: NotificationPermission = 'default'

    private constructor() {
        if (typeof window !== 'undefined') {
            this.permission = Notification.permission
            this.initializeAudio()
        }
    }

    static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService()
        }
        return NotificationService.instance
    }

    private initializeAudio() {
        try {
            // Create notification sound (Microsoft Teams-like chime)
            this.notificationSound = new Audio()
            this.notificationSound.volume = 0.5

            // Create audio context for custom sounds
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        } catch (error) {
            console.error('Failed to initialize audio:', error)
        }
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
     * Play notification sound (Teams-like chime)
     */
    private playNotificationSound() {
        if (!this.audioContext) return

        try {
            const oscillator = this.audioContext.createOscillator()
            const gainNode = this.audioContext.createGain()

            // Create a pleasant chime sound (similar to Teams)
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime)
            oscillator.frequency.exponentialRampToValueAtTime(
                600,
                this.audioContext.currentTime + 0.1
            )

            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(
                0.01,
                this.audioContext.currentTime + 0.3
            )

            oscillator.connect(gainNode)
            gainNode.connect(this.audioContext.destination)

            oscillator.start(this.audioContext.currentTime)
            oscillator.stop(this.audioContext.currentTime + 0.3)
        } catch (error) {
            console.error('Error playing notification sound:', error)
        }
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
     * Show notification for emergency/broken arrow
     */
    async notifyEmergency(message: string) {
        await this.showNotification({
            title: '🚨 EMERGENCY ALERT',
            body: message,
            tag: 'emergency',
            requireInteraction: true,
            silent: false,
        })

        // Play additional alert sound for emergency
        this.playEmergencySound()
    }

    /**
     * Play emergency alert sound (more urgent)
     */
    private playEmergencySound() {
        if (!this.audioContext) return

        try {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const oscillator = this.audioContext!.createOscillator()
                    const gainNode = this.audioContext!.createGain()

                    oscillator.type = 'square'
                    oscillator.frequency.setValueAtTime(1000, this.audioContext!.currentTime)

                    gainNode.gain.setValueAtTime(0.4, this.audioContext!.currentTime)
                    gainNode.gain.exponentialRampToValueAtTime(
                        0.01,
                        this.audioContext!.currentTime + 0.2
                    )

                    oscillator.connect(gainNode)
                    gainNode.connect(this.audioContext!.destination)

                    oscillator.start(this.audioContext!.currentTime)
                    oscillator.stop(this.audioContext!.currentTime + 0.2)
                }, i * 300)
            }
        } catch (error) {
            console.error('Error playing emergency sound:', error)
        }
    }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance()
