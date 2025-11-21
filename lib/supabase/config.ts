const missingEnvMessage = (key: string) =>
  `Missing required Supabase environment variable: ${key}. Please populate it in .env.local`

const ensureEnvValue = (key: string, value: string | undefined | null): string => {
  if (!value || value.trim().length === 0) {
    const message = missingEnvMessage(key)
    if (process.env.NODE_ENV !== 'production') {
      console.error(message)
    }
    throw new Error(message)
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
