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
  const [delayed, setDelayed] = useState(false)
  useEffect(() => {
    if (ready) return
    const timer = window.setTimeout(() => setDelayed(true), 12000)
    return () => window.clearTimeout(timer)
  }, [ready])
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
  return <QueryClientProvider client={queryClient}>{ready ? children : <div role="status" className="mx-auto max-w-lg space-y-4 p-6 text-sm"><p>{delayed ? 'Your workspace is taking longer than expected to connect.' : 'Loading your workspace…'}</p>{delayed && <><p>Check your connection and retry. Your saved device submissions will not be removed.</p><button type="button" onClick={() => window.location.reload()} className="rounded-lg border px-4 py-3 font-medium focus-visible:outline focus-visible:outline-2">Retry connection</button></>}</div>}</QueryClientProvider>
}
