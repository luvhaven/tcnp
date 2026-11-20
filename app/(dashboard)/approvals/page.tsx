import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canApproveSignups } from '@/lib/utils'
import { canApproveProgramAdditions } from '@/lib/program-additions'
import { fetchActiveUnitMemberships, isCommandAuthority } from '@/lib/unit-access'
import ApprovalsClient from './ApprovalsClient'

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=%2Fapprovals')

  const { data: caller } = await supabase
    .from('users')
    .select('role, has_admin_access, activation_status, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!caller || caller.activation_status !== 'active' || caller.is_active === false) {
    redirect('/dashboard')
  }

  // Headship comes from the caller's active head membership rows (the same
  // rule as the signup-approvals API and SQL can_decide_signup). If the rows
  // cannot be read, fall back to the head role rather than locking a head out;
  // the API re-checks every decision anyway.
  const { memberships, error: membershipError } = await fetchActiveUnitMemberships(supabase, user.id)

  // Platform admins and unit heads decide signups; Command (is_admin) can
  // reopen declined signups; the Head of Command approves programme additions.
  const allowed =
    canApproveSignups(caller.role, null, caller.has_admin_access, membershipError ? undefined : memberships)
    || isCommandAuthority(caller.role, caller.has_admin_access)
    || canApproveProgramAdditions(caller.role, caller.has_admin_access)

  if (!allowed) redirect('/dashboard')

  return <ApprovalsClient />
}
