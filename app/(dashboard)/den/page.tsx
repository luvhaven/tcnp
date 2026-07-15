import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import DenClient from './DenClient'

export default async function DenPage() {
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

  const { data: initialDens } = await supabase
    .from('nests')
    .select(`
      *,
      programs(name)
    `)
    .eq('type', 'den')
    .order('name')
    .limit(100)

  return (
    <DenClient
      initialDens={initialDens || []}
    />
  )
}
