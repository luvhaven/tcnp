// Offline Queue Manager using IndexedDB
// Stores form submissions when offline and syncs when online

const DB_NAME = 'tcnp_offline_queue'
const DB_VERSION = 1
const STORE_NAME = 'pending_submissions'

export interface QueuedSubmission {
    id: string
    type: 'journey' | 'incident' | 'papa' | 'program' | 'chat_message' | 'journey_update' | 'journey_event'
    data: any
    isEmergency?: boolean
    timestamp: number
    retries: number
}

class OfflineQueueManager {
    private db: IDBDatabase | null = null
    private isSupported: boolean = false

    constructor() {
        // Check if IndexedDB is supported and accessible (iOS Safari private mode blocks it)
        if (typeof window !== 'undefined') {
            this.isSupported = this.checkIndexedDBSupport()
        }
    }

    private checkIndexedDBSupport(): boolean {
        try {
            return 'indexedDB' in window && indexedDB !== null
        } catch {
            return false
        }
    }

    async init(): Promise<void> {
        if (!this.isSupported) {
            console.warn('IndexedDB not supported on this device or in current browsing mode.')
            return
        }

        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION)

                request.onerror = () => {
                    console.warn('IndexedDB failed to open:', request.error)
                    this.isSupported = false // Disable further IndexedDB operations
                    resolve() // Don't reject, just disable and resolve
                }
                request.onsuccess = () => {
                    this.db = request.result
                    resolve()
                }

                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result

                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
                        store.createIndex('type', 'type', { unique: false })
                        store.createIndex('timestamp', 'timestamp', { unique: false })
                    }
                }
            } catch (error) {
                console.warn('IndexedDB initialization error:', error)
                this.isSupported = false // Disable further IndexedDB operations
                resolve() // Don't crash the app, just disable and resolve
            }
        })
    }

    async addToQueue(type: QueuedSubmission['type'], data: any): Promise<string> {
        if (!this.isSupported || !this.db) {
            console.warn('Queue not available, skipping')
            return Promise.resolve('skipped')
        }

        if (!this.db) await this.init()
        if (!this.db) return Promise.resolve('skipped')

        const isEmergency = data?.isEmergency || data?.status === 'broken_arrow' || data?.type === 'BROKEN ARROW' || data?.updates?.status === 'broken_arrow';

        const submission: QueuedSubmission = {
            id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            data,
            isEmergency,
            timestamp: Date.now(),
            retries: 0
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
                const store = transaction.objectStore(STORE_NAME)
                const request = store.add(submission)

                request.onsuccess = () => resolve(submission.id)
                request.onerror = () => {
                    console.warn('Failed to add to queue:', request.error)
                    resolve('error')
                }
            } catch (error) {
                console.warn('Queue add error:', error)
                resolve('error')
            }
        })
    }

    async getAllPending(): Promise<QueuedSubmission[]> {
        if (!this.isSupported || !this.db) return []
        if (!this.db) await this.init()
        if (!this.db) return []

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.getAll()

            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    }

    async removeFromQueue(id: string): Promise<void> {
        if (!this.db) await this.init()

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.delete(id)

            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    }

    async incrementRetry(id: string): Promise<void> {
        if (!this.db) await this.init()

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const getRequest = store.get(id)

            getRequest.onsuccess = () => {
                const submission = getRequest.result
                if (submission) {
                    submission.retries += 1
                    const putRequest = store.put(submission)
                    putRequest.onsuccess = () => resolve()
                    putRequest.onerror = () => reject(putRequest.error)
                } else {
                    resolve()
                }
            }
            getRequest.onerror = () => reject(getRequest.error)
        })
    }

    async getQueueCount(): Promise<number> {
        if (!this.db) await this.init()

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.count()

            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    }

    async clearQueue(): Promise<void> {
        if (!this.db) await this.init()

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.clear()

            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    }
}

export const offlineQueue = new OfflineQueueManager()
