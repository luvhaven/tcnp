import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canApproveSignups } from '@/lib/utils'
import { canApproveProgramAdditions } from '@/lib/program-additions'
import ApprovalsClient from './ApprovalsClient'

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=%2Fapprovals')

  const { data: caller } = await supabase
    .from('users')
    .select('role, has_admin_access, oscar, activation_status, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!caller || caller.activation_status !== 'active' || caller.is_active === false || !(canApproveSignups(caller.role, caller.oscar, caller.has_admin_access) || canApproveProgramAdditions(caller.role, caller.has_admin_access))) {
    redirect('/dashboard')
  }

  return <ApprovalsClient />
}
