import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import OfficersClient from './OfficersClient'

export default async function OfficersPage() {
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

  const { data: initialOfficers, error } = await supabase
    .from('users')
    .select(`
      id,
      email,
      full_name,
      role,
      unit,
      phone,
      is_active,
      oscar,
      last_seen,
      created_at,
      current_title_id,
      activation_status,
      photo_url,
      team,
      is_team_head,
      date_of_birth,
      gender,
      address,
      city,
      bio,
      profile_completed_at
    `)
    .order('full_name')

  if (error) {
    console.error('Officers fetch error:', error)
  }

  // Compute is_online from last_seen freshness so the first paint (before the
  // client re-fetches via /api/officers/list) already shows correct counts —
  // this column isn't selected/derived above, so it was always undefined here.
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const enrichedInitialOfficers = (initialOfficers || []).map((officer: any) => ({
    ...officer,
    is_online: officer.last_seen != null && officer.last_seen >= fiveMinutesAgo,
  }))

  return (
    <OfficersClient
      initialOfficers={enrichedInitialOfficers}
    />
  )
}
