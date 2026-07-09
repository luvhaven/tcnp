import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import JourneysClient from './JourneysClient'

export default async function JourneysPage() {
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

  // Fetch initial journeys (first 50)
  const { data: initialJourneys } = await supabase.from('journeys').select(`
    *,
    papas (title, full_name),
    cheetahs (call_sign, registration_number, driver_name, driver_phone),
    assigned_do:users!journeys_assigned_duty_officer_id_fkey (full_name),
    nests (name),
    eagle_squares (name, code),
    programs (name, status)
  `)
  .order('created_at', { ascending: false })
  .range(0, 49)

  // Fetch lookups concurrently
  const [papasRes, cheetahsRes, programsRes, officersResult, nestsResult, eagleResult] = await Promise.all([
    supabase.from('papas_basic').select('*').order('full_name'),
    supabase.from('cheetahs').select('*').order('registration_number'),
    supabase.from('programs').select('*').order('name'),
    supabase.from('users').select('id, full_name, role').eq('role', 'delta_oscar').order('full_name'),
    supabase.from('nests').select('*').order('name', { ascending: true }),
    supabase.from('eagle_squares').select('*').order('name', { ascending: true })
  ])

  return (
    <JourneysClient 
      initialJourneys={initialJourneys || []} 
      initialPapas={papasRes.data || []}
      initialCheetahs={cheetahsRes.data || []}
      initialPrograms={programsRes.data || []}
      initialOfficers={officersResult.data || []}
      initialNests={nestsResult.data || []}
      initialEagleSquares={eagleResult.data || []}
    />
  )
}
