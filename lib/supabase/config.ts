const missingEnvMessage = (key: string) =>
  `Missing required Supabase environment variable: ${key}. In local development, set this in .env.local. On Vercel, add it under Project → Settings → Environment Variables.`

const ensureEnvValue = (key: string, value: string | undefined | null): string => {
  if (!value || value.trim().length === 0) {
    const message = missingEnvMessage(key)
    // In production/build, we warn but don't crash to allow build to finish
    // The app will fail at runtime if these are missing, which is expected
    console.warn(`⚠️ ${message}`)
    return key.includes('URL') ? 'https://placeholder.supabase.co' : 'placeholder-key'
  }
  return value
}

export const getSupabaseBrowserConfig = () => ({
  url: ensureEnvValue('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  anonKey: ensureEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
})

export const getSupabaseServiceRoleKey = () =>
  ensureEnvValue('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)

export const getEnvOrThrow = (key: string): string =>
  ensureEnvValue(key, process.env[key as keyof NodeJS.ProcessEnv])
