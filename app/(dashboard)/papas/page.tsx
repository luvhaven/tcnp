import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import PapasClient from './PapasClient'

export default async function PapasPage() {
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

  const { data: initialPapas } = await supabase
    .from('papas')
    .select('*')
    .order('full_name')

  return (
    <PapasClient 
      initialPapas={initialPapas || []} 
    />
  )
}
