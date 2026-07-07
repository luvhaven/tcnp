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
      is_team_head
    `)
    .order('full_name')

  if (error) {
    console.error('Officers fetch error:', error)
  }

  return (
    <OfficersClient 
      initialOfficers={(initialOfficers as any) || []} 
    />
  )
}
