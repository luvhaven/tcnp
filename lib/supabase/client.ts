import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'
import { getSupabaseBrowserConfig } from '@/lib/supabase/config'
import { logSupabaseError } from '@/lib/supabase/error-utils'

export function createClient() {
  try {
    const { url, anonKey } = getSupabaseBrowserConfig()
    return createBrowserClient<Database>(url, anonKey)
  } catch (error) {
    logSupabaseError('Supabase client initialization failed', error)
    throw error
  }
}
