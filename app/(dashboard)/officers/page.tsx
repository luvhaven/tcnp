import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdministrator } from '@/lib/utils'
import { isOfficerOnline } from '@/lib/presence'
import OfficersClient from './OfficersClient'

export default async function OfficersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=%2Fofficers')

  const { data: caller } = await supabase
    .from('users')
    .select('role, activation_status, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!caller || caller.activation_status !== 'active' || caller.is_active === false || !isPlatformAdministrator(caller.role)) {
    redirect('/dashboard')
  }

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
      is_online,
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
      local_government_area,
      state,
      nearest_bus_stop_landmark,
      city,
      bio,
      profile_completed_at
    `)
    .eq('is_directory_hidden', false)
    .order('full_name')

  if (error) {
    console.error('Officers fetch error:', error)
  }

  // Use the same presence rule for the first paint and subsequent API refreshes.
  // eslint-disable-next-line react-hooks/purity -- Request-time snapshot in an async Server Component.
  const now = Date.now()
  const enrichedInitialOfficers = (initialOfficers || []).map((officer: any) => ({
    ...officer,
    is_online: isOfficerOnline(officer, now),
  }))

  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading officers directory…</div>}>
      <OfficersClient
        initialOfficers={error ? undefined : enrichedInitialOfficers}
      />
    </Suspense>
  )
}
