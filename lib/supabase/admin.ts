import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { getSupabaseBrowserConfig, getSupabaseServiceRoleKey } from '@/lib/supabase/config'
import { logSupabaseError } from '@/lib/supabase/error-utils'

export function createAdminClient() {
  try {
    const { url } = getSupabaseBrowserConfig()
    const serviceRoleKey = getSupabaseServiceRoleKey()

    return createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    })
  } catch (error) {
    logSupabaseError('Supabase admin client initialization failed', error)
    throw error
  }
}
