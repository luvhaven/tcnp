import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canApproveSignupFor, canApproveSignups, isPlatformAdministrator } from '@/lib/utils'

/**
 * Pending self-registrations. Admins see and approve everyone; unit heads see
 * and approve only applicants who signed up into their own unit.
 */
async function getApprover() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: caller } = await supabase
    .from('users')
    .select('id, role, oscar, activation_status, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!caller || caller.activation_status !== 'active' || caller.is_active === false) {
    return { error: NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 }) }
  }
  if (!canApproveSignups(caller.role, caller.oscar)) {
    return { error: NextResponse.json({ error: 'Only an admin or a unit head can approve signups' }, { status: 403 }) }
  }
  return { caller }
}

export async function GET() {
  try {
    const { caller, error } = await getApprover()
    if (error) return error

    const adminClient = createAdminClient()
    const { data, error: fetchError } = await adminClient
      .from('users')
      .select('id, full_name, email, phone, oscar, team, photo_url, created_at')
      .eq('activation_status', 'pending')
      .eq('is_directory_hidden', false)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('[signup-approvals] fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to load pending signups' }, { status: 500 })
    }

    const pending = (data ?? []).filter(applicant => canApproveSignupFor(caller.role, caller.oscar, applicant.oscar))
    return NextResponse.json({ pending, scope: isPlatformAdministrator(caller.role) ? 'all' : 'unit' })
  } catch (err: any) {
    console.error('[signup-approvals] unexpected GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { caller, error } = await getApprover()
    if (error) return error

    const { officerId } = (await request.json()) as { officerId?: string }
    if (!officerId) return NextResponse.json({ error: 'officerId is required' }, { status: 400 })

    const adminClient = createAdminClient()
    const { data: applicant } = await adminClient
      .from('users')
      .select('id, oscar, activation_status, is_directory_hidden')
      .eq('id', officerId)
      .maybeSingle()

    if (!applicant || applicant.is_directory_hidden) {
      return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
    }
    if (applicant.activation_status !== 'pending') {
      return NextResponse.json({ error: 'This signup is no longer pending' }, { status: 409 })
    }
    if (!canApproveSignupFor(caller.role, caller.oscar, applicant.oscar)) {
      return NextResponse.json({ error: 'You can only approve signups into your own unit' }, { status: 403 })
    }

    const { data: updated, error: updateError } = await adminClient
      .from('users')
      .update({ is_active: true, activation_status: 'active' })
      .eq('id', officerId)
      .eq('activation_status', 'pending')
      .select('id, is_active, activation_status')
      .maybeSingle()

    if (updateError) {
      console.error('[signup-approvals] update error:', updateError)
      return NextResponse.json({ error: 'Could not approve this signup' }, { status: 500 })
    }
    if (!updated) return NextResponse.json({ error: 'This signup is no longer pending' }, { status: 409 })

    return NextResponse.json({ success: true, ...updated })
  } catch (err: any) {
    console.error('[signup-approvals] unexpected POST error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
