import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import CheetahsClient from './CheetahsClient'

export default async function CheetahsPage() {
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

  const { data: initialCheetahs } = await supabase
    .from('cheetahs')
    .select(`
      *,
      current_location:vehicle_locations(latitude, longitude, heading, speed, timestamp)
    `)
    .order('registration_number')
    .limit(100)

  return (
    <CheetahsClient 
      initialCheetahs={initialCheetahs || []} 
    />
  )
}
