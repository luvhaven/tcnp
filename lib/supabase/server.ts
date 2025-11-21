import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'
import { getSupabaseBrowserConfig } from '@/lib/supabase/config'
import { logSupabaseError } from '@/lib/supabase/error-utils'

export async function createClient() {
  const cookieStore = await cookies()

  try {
    const { url, anonKey } = getSupabaseBrowserConfig()

    return createServerClient<Database>(
      url,
      anonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value, ...options })
            } catch (error) {
              logSupabaseError('Supabase server client cookie set failed', error)
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options })
            } catch (error) {
              logSupabaseError('Supabase server client cookie remove failed', error)
            }
          }
        }
      }
    )
  } catch (error) {
    logSupabaseError('Supabase server client initialization failed', error)
    throw error
  }
}
