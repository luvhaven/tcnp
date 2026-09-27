import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import TheatresClient from './TheatresClient'

export default async function TheatresPage() {
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

  const { data: initialTheatres, error: theatresError } = await supabase
    .from('theatres')
    .select('id, name, address, city, capacity, venue_type, facilities')
    .order('name')

  return (
    <TheatresClient 
      initialTheatres={initialTheatres || []} 
      initialTheatresError={Boolean(theatresError)}
    />
  )
}
