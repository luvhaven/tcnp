// Offline-aware form submission helper
import { offlineQueue } from './offline-queue'
import { syncService } from './sync-service'
import { toast } from 'sonner'

export interface SubmitOptions {
    onSuccess?: () => void
    onError?: (error: any) => void
    successMessage?: string
    offlineMessage?: string
}

export async function submitWithOfflineSupport<T = any>(
    type: 'journey' | 'incident' | 'papa' | 'program' | 'chat_message',
    submitFunction: () => Promise<T>,
    data: any,
    options: SubmitOptions = {}
): Promise<T | null> {
    const {
        onSuccess,
        onError,
        successMessage = 'Submitted successfully!',
        offlineMessage = 'Saved offline. Will sync when online.'
    } = options

    // Check if online
    if (!navigator.onLine) {
        try {
            await offlineQueue.addToQueue(type, data)
            toast.info(offlineMessage)
            onSuccess?.()
            return null
        } catch (error) {
            console.error('Error queuing submission:', error)
            toast.error('Failed to save offline')
            onError?.(error)
            throw error
        }
    }

    // Try online submission
    try {
        const result = await submitFunction()
        toast.success(successMessage)
        onSuccess?.()
        return result
    } catch (error: any) {
        // If network error, queue for offline
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
            try {
                await offlineQueue.addToQueue(type, data)
                toast.info(offlineMessage)
                onSuccess?.()
                return null
            } catch (queueError) {
                console.error('Error queuing after network failure:', queueError)
                toast.error('Failed to save submission')
                onError?.(queueError)
                throw queueError
            }
        }

        // Other errors
        console.error('Submission error:', error)
        toast.error(error.message || 'Submission failed')
        onError?.(error)
        throw error
    }
}
