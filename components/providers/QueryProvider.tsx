"use client"

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { isTransientNetworkError } from '@/lib/supabase/error-utils'

/**
 * Attempts for a read whose connection dropped. Mobile networks here drop
 * requests often enough that a single immediate retry tends to fail for the
 * same reason the first one did.
 */
const TRANSIENT_RETRY_LIMIT = 3

/** What a query must set in `meta` to have its final failure reported. */
type SentryQueryMeta = {
  sentry?: { tags?: Record<string, string>; level?: 'warning' | 'error' }
}

/**
 * Retry only failures that a retry can actually fix. A permission denial or a
 * missing row returns the same answer however many times it is asked.
 */
const retryTransientReads = (failureCount: number, error: unknown) =>
  isTransientNetworkError(error) && failureCount < TRANSIENT_RETRY_LIMIT

/** 1s, 2s, 4s — capped, so a bad connection cannot stall a page indefinitely. */
const transientRetryDelay = (attemptIndex: number) =>
  Math.min(1000 * 2 ** attemptIndex, 4000)

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: true,
        retry: retryTransientReads,
        retryDelay: transientRetryDelay,
      },
    },
    // Reporting here rather than inside each queryFn means a failure is
    // recorded ONCE, after the retries are exhausted — not once per attempt,
    // and not at all when a retry succeeds. Opt-in via `meta.sentry` so
    // adding a query does not silently start sending events.
    queryCache: new QueryCache({
      onError: (error, query) => {
        const meta = query.meta as SentryQueryMeta | undefined
        if (!meta?.sentry) return
        Sentry.captureException(error, {
          level: meta.sentry.level ?? 'error',
          tags: meta.sentry.tags,
        })
      },
    }),
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
  return <QueryClientProvider client={queryClient}>{ready ? children : (
    <div role="status" className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      {/* Plain <img>: this paints before the session exists, so it must not wait on the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tcnp_logo.png" alt="" width={56} height={56} className="h-14 w-14 object-contain" />
      <div className="space-y-1">
        <p className="text-title-sm text-foreground">TCN Protocol</p>
        {/* No visible caption while loading: the logo and bar say enough. Screen
            readers still get one, and the delayed message stays visible. */}
        {delayed
          ? <p className="text-sm text-muted-foreground">Your workspace is taking longer than expected to connect.</p>
          : <span className="sr-only">Loading</span>}
      </div>
      {delayed ? (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">Check your connection and retry. Your saved device submissions will not be removed.</p>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-5 text-sm font-medium shadow-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Retry connection</button>
        </>
      ) : (
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="boot-bar h-full w-2/5 rounded-full bg-primary" />
        </div>
      )}
    </div>
  )}</QueryClientProvider>
}
