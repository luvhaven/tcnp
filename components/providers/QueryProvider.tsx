"use client"

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { useState, useEffect } from 'react'

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        refetchOnWindowFocus: true,
        networkMode: 'offlineFirst',
      },
      mutations: {
        networkMode: 'offlineFirst',
      }
    },
  }))

  const [persister, setPersister] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPersister(createSyncStoragePersister({
        storage: window.localStorage,
      }))
    }
  }, [])

  if (!persister) {
    // Return standard provider until client-side hydration completes
    return (
      <PersistQueryClientProvider 
        client={queryClient} 
        persistOptions={{ persister: createSyncStoragePersister({ storage: undefined as any }) }}
      >
        {children}
      </PersistQueryClientProvider>
    )
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
