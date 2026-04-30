import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import NestsClient from './NestsClient'

export default async function NestsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  const { data: initialNests } = await supabase
    .from('nests')
    .select(`
      *,
      programs(name)
    `)
    .order('name')
    .limit(100)

  return (
    <NestsClient 
      initialNests={initialNests || []} 
    />
  )
}
