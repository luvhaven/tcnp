// Background Sync Service
// Automatically syncs queued submissions when online

import { createClient } from '@/lib/supabase/client'
import { offlineQueue, type QueuedSubmission } from './offline-queue'
import { toast } from 'sonner'

class SyncService {
    private isSyncing = false
    private syncListeners: Set<() => void> = new Set()

    async syncAll(): Promise<void> {
        if (this.isSyncing) return
        if (!navigator.onLine) return

        this.isSyncing = true
        const supabase = createClient()

        try {
            const pending = await offlineQueue.getAllPending()

            if (pending.length === 0) {
                this.isSyncing = false
                return
            }

            console.log(`🔄 Syncing ${pending.length} queued submissions...`)

            let successCount = 0
            let failCount = 0

            for (const submission of pending) {
                try {
                    await this.syncSubmission(supabase, submission)
                    await offlineQueue.removeFromQueue(submission.id)
                    successCount++
                } catch (error) {
                    console.error(`Failed to sync ${submission.type}:`, error)
                    await offlineQueue.incrementRetry(submission.id)
                    failCount++

                    // Remove after 3 failed attempts
                    if (submission.retries >= 3) {
                        await offlineQueue.removeFromQueue(submission.id)
                        toast.error(`Failed to sync ${submission.type} after 3 attempts`)
                    }
                }
            }

            if (successCount > 0) {
                toast.success(`✅ Synced ${successCount} submission${successCount > 1 ? 's' : ''}`)
            }

            if (failCount > 0) {
                toast.error(`❌ ${failCount} submission${failCount > 1 ? 's' : ''} failed to sync`)
            }

            this.notifyListeners()
        } catch (error) {
            console.error('Sync error:', error)
        } finally {
            this.isSyncing = false
        }
    }

    private async syncSubmission(supabase: any, submission: QueuedSubmission): Promise<void> {
        switch (submission.type) {
            case 'journey':
                await supabase.from('journeys').insert([submission.data])
                break

            case 'incident':
                await supabase.from('incidents').insert([submission.data])
                break

            case 'papa':
                await supabase.from('papas').insert([submission.data])
                break

            case 'program':
                await supabase.from('programs').insert([submission.data])
                break

            case 'chat_message':
                await supabase.from('chat_messages').insert([submission.data])
                break

            default:
                throw new Error(`Unknown submission type: ${submission.type}`)
        }
    }

    onSync(callback: () => void): () => void {
        this.syncListeners.add(callback)
        return () => this.syncListeners.delete(callback)
    }

    private notifyListeners(): void {
        this.syncListeners.forEach(callback => callback())
    }

    async getPendingCount(): Promise<number> {
        return offlineQueue.getQueueCount()
    }
}

export const syncService = new SyncService()

// Auto-sync when coming online
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        console.log('📡 Network reconnected, syncing...')
        setTimeout(() => syncService.syncAll(), 1000)
    })
}
