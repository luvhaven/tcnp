import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'
import { getSupabaseBrowserConfig } from '@/lib/supabase/config'
import { logSupabaseError } from '@/lib/supabase/error-utils'

// ─── Module-Level Singleton ─────────────────────────────────────────────────
// One client per browser session. Prevents orphaned Realtime subscriptions
// that occur when new instances are created inside useMemo / component renders.
// Server-side renders receive `null` — use lib/supabase/server.ts for RSC/API.
let _client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  const { url, anonKey } = getSupabaseBrowserConfig()

  if (typeof window === 'undefined') {
    // Generate a fresh client during SSR of Client Components to avoid memory leaks or cross-request state bleeding
    return createBrowserClient<Database>(url, anonKey)
  }

  if (_client) return _client

  try {
    _client = createBrowserClient<Database>(url, anonKey)
    return _client
  } catch (error) {
    logSupabaseError('Supabase client initialization failed', error)
    throw error
  }
}

// Convenience export for components that don't need lazy init
// Usage: import { supabase } from '@/lib/supabase/client'
export const supabase = typeof window !== 'undefined' ? (() => {
  try { return createClient() } catch { return null }
})() : null
