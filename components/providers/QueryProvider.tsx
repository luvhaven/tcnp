"use client"

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { useState, useRef } from 'react'

// ─── Singleton QueryClient ──────────────────────────────────────────────────
// Created once per app session. Stable reference prevents re-renders and
// ensures realtime subscriptions tied to query keys are never orphaned.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,           // 1 minute — keeps data fresh but reduces refetches
        gcTime: 1000 * 60 * 60 * 24,    // 24 hours — retained in cache for offline use
        refetchOnWindowFocus: true,
        networkMode: 'offlineFirst',
        retry: (failureCount, error: any) => {
          // Don't retry on 4xx auth/permission errors
          if (error?.status >= 400 && error?.status < 500) return false
          return failureCount < 2
        },
      },
      mutations: {
        networkMode: 'offlineFirst',
      },
    },
  })
}

// ─── Async Storage Persister ───────────────────────────────────────────────
// createAsyncStoragePersister is non-blocking (vs sync which blocks main thread).
// Only instantiated on the client (window check inside the hook).
function makeAsyncPersister() {
  if (typeof window === 'undefined') return null
  return createAsyncStoragePersister({
    storage: window.localStorage,
    // Throttle writes to localStorage to avoid thrashing on rapid updates
    throttleTime: 1000,
  })
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState initializer runs once — stable singleton for the lifetime of the app
  const [queryClient] = useState(makeQueryClient)
  const persisterRef = useRef(makeAsyncPersister())

  // If persister is unavailable (SSR), render without persistence
  if (!persisterRef.current) {
    return (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: { persistClient: async () => { }, restoreClient: async () => undefined, removeClient: async () => { } } }}
      >
        {children}
      </PersistQueryClientProvider>
    )
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: persisterRef.current,
        maxAge: 1000 * 60 * 60 * 24, // Discard caches older than 24h on restore
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            // Only persist successful, non-sensitive queries
            query.state.status === 'success',
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
