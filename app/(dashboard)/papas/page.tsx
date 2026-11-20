import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import PapasClient from './PapasClient'
import { PAPA_DIRECTORY_COLUMNS } from '@/lib/papa-privacy'

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

  // Explicit columns: the server-rendered payload never carries anything
  // private (passports live in papa_private_details and are fetched on
  // demand, only for people allowed to see them).
  const { data: initialPapas } = await supabase
    .from('papas')
    .select(PAPA_DIRECTORY_COLUMNS)
    .order('full_name')

  return (
    <PapasClient 
      initialPapas={(initialPapas || []) as any} 
    />
  )
}
