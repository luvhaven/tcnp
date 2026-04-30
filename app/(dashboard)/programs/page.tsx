import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import ProgramsClient from './ProgramsClient'

export default async function ProgramsPage() {
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

  const [programsRes, theatresRes] = await Promise.all([
    supabase
      .from('programs')
      .select(`*, theatres(name)`)
      .order('created_at', { ascending: false }),
    supabase.from('theatres').select('*').order('name')
  ])

  return (
    <ProgramsClient 
      initialPrograms={programsRes.data || []} 
      initialTheatres={theatresRes.data || []} 
    />
  )
}
