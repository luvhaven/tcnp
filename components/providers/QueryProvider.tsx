"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: true, retry: 1 },
    },
  }))
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try { localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE') } catch { /* Storage may be disabled. */ }
    const clearRuntimeData = async () => {
      if (!('caches' in window)) return
      const retired = new Set(['start-url', 'next-data', 'static-data-assets', 'apis', 'pages-rsc-prefetch', 'pages-rsc', 'pages', 'cross-origin'])
      try { await Promise.all((await caches.keys()).filter(name => retired.has(name)).map(name => caches.delete(name))) }
      catch { /* Some private browsing modes disable Cache Storage. */ }
    }
    void clearRuntimeData()
    let previousUser: string | null | undefined
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
      const userId = session?.user.id ?? null
      if (event === 'SIGNED_OUT' || previousUser !== userId) {
        queryClient.clear()
        void clearRuntimeData()
      }
      previousUser = userId
      setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [queryClient])
  return <QueryClientProvider client={queryClient}>{ready ? children : <div role="status" className="p-6 text-sm">Loading your workspace…</div>}</QueryClientProvider>
}
