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

  const { data: initialTheatres } = await supabase
    .from('theatres')
    .select(`
      *,
      eagle_squares(name)
    `)
    .order('name')

  const { data: initialEagleSquares } = await supabase
    .from('eagle_squares')
    .select('*')
    .order('name')

  return (
    <TheatresClient 
      initialTheatres={initialTheatres || []} 
      initialEagleSquares={initialEagleSquares || []}
    />
  )
}
