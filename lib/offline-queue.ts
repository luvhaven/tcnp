// Offline Queue Manager using IndexedDB
// Stores form submissions when offline and syncs when online

const DB_NAME = 'tcnp_offline_queue'
const DB_VERSION = 1
const STORE_NAME = 'pending_submissions'

export interface QueuedSubmission {
    id: string
    type: 'journey' | 'incident' | 'papa' | 'program' | 'chat_message'
    data: any
    timestamp: number
    retries: number
}

class OfflineQueueManager {
    private db: IDBDatabase | null = null

    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)

            request.onerror = () => reject(request.error)
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
        })
    }

    async addToQueue(type: QueuedSubmission['type'], data: any): Promise<string> {
        if (!this.db) await this.init()

        const submission: QueuedSubmission = {
            id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            data,
            timestamp: Date.now(),
            retries: 0
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.add(submission)

            request.onsuccess = () => resolve(submission.id)
            request.onerror = () => reject(request.error)
        })
    }

    async getAllPending(): Promise<QueuedSubmission[]> {
        if (!this.db) await this.init()

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
