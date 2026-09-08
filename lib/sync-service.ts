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
        let processed = 0
        let errors = 0

        try {
            // Check queue availability first (safeguard for iOS private mode)
            let pending: QueuedSubmission[] = []
            try {
                const count = await offlineQueue.getQueueCount()
                if (count === 0) {
                    this.isSyncing = false
                    return
                }
                pending = await offlineQueue.getAllPending()
            } catch (e) {
                console.warn('Sync skipped - queue not available', e)
                this.isSyncing = false
                return
            }

            console.log(`🔄 Syncing ${pending.length} queued submissions...`)

            const supabase = createClient()
            const { data: { user }, error: authError } = await supabase.auth.getUser()
            if (authError || !user) return

            for (const submission of pending) {
                // Legacy entries without ownership remain recoverable but must
                // never be replayed under an unrelated account.
                if (submission.ownerId !== user.id) continue
                try {
                    const { data: { user: currentUser }, error: currentAuthError } = await supabase.auth.getUser()
                    if (currentAuthError || currentUser?.id !== submission.ownerId) break
                    await this.syncSubmission(supabase, submission)
                    await offlineQueue.removeFromQueue(submission.id)
                    processed++
                } catch (error) {
                    console.error(`Failed to sync ${submission.type}:`, error)
                    await offlineQueue.incrementRetry(submission.id)
                    errors++

                    // Preserve failed submissions for retry; never discard data.
                }
            }

            if (processed > 0) {
                toast.success(`✅ Synced ${processed} submission${processed > 1 ? 's' : ''}`)
            }

            if (errors > 0) {
                toast.error(`❌ ${errors} submission${errors > 1 ? 's' : ''} failed to sync`)
            }

            this.notifyListeners()
        } catch (error) {
            console.error('Sync error:', error)
        } finally {
            this.isSyncing = false
        }
    }

    private async syncSubmission(supabase: any, submission: QueuedSubmission): Promise<void> {
        const checked = async (operation: any) => {
            const { error } = await operation
            if (error) throw error
        }
        switch (submission.type) {
            case 'journey':
                await checked(supabase.from('journeys').upsert([submission.data], { onConflict: 'id', ignoreDuplicates: true }))
                break

            case 'incident':
                await checked(supabase.from('incidents').upsert([submission.data], { onConflict: 'id', ignoreDuplicates: true }))
                break

            case 'papa':
                await checked(supabase.from('papas').upsert([submission.data], { onConflict: 'id', ignoreDuplicates: true }))
                break

            case 'program':
                await checked(supabase.from('programs').upsert([submission.data], { onConflict: 'id', ignoreDuplicates: true }))
                break

            case 'chat_message':
                await checked(supabase.from('chat_messages').upsert([submission.data], { onConflict: 'id', ignoreDuplicates: true }))
                break

            case 'journey_update':
                const result = await supabase.from('journeys').update(submission.data.updates).eq('id', submission.data.id).select('id').single()
                if (result.error || !result.data) throw result.error || new Error('Journey update was not applied.')
                break

            case 'journey_event':
                await checked(supabase.from('journey_events').upsert([submission.data], { onConflict: 'id', ignoreDuplicates: true }))
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
        try {
            return await offlineQueue.getQueueCount()
        } catch (e) {
            return 0
        }
    }

    async hasPendingEmergency(): Promise<boolean> {
        try {
            const pending = await offlineQueue.getAllPending()
            return pending.some(sub => sub.isEmergency)
        } catch (e) {
            return false
        }
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
