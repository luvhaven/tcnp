import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  canApproveSignups,
  canDecideSignup,
  parseSignupDecision,
  signupDecisionErrorStatus,
  SIGNUP_DECLINED_WINDOW_DAYS,
} from '@/lib/utils'
import { fetchActiveUnitMemberships, isCommandAuthority, isPlatformAdminAuthority } from '@/lib/unit-access'

/**
 * Pending self-registrations and their decisions.
 *
 * Who may do what (the database re-checks every decision in decide_signup()):
 *   - approve / decline: a platform admin (every signup), or the HEAD of the
 *     applicant's unit by active unit membership. The applicant's unit is the
 *     one their own role / Oscar names; the caller's Oscar text grants nothing.
 *   - reopen a declined signup (back to pending): admins and Command only.
 * A decline needs a reason, keeps the account row, and signs the person out.
 */
async function getApprover() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: caller } = await supabase
    .from('users')
    .select('id, role, has_admin_access, activation_status, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!caller || caller.activation_status !== 'active' || caller.is_active === false) {
    return { error: NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 }) }
  }

  const isPlatformAdmin = isPlatformAdminAuthority(caller.role, caller.has_admin_access)
  const canReopen = isCommandAuthority(caller.role, caller.has_admin_access)

  // Headship comes from the caller's own membership rows, read with their session.
  const { memberships, error: membershipError } = await fetchActiveUnitMemberships(supabase, user.id)
  if (membershipError && !isPlatformAdmin && !canReopen) {
    console.error('[signup-approvals] membership read failed:', membershipError)
    return { error: NextResponse.json({ error: "We couldn't check your unit. Please try again." }, { status: 503 }) }
  }

  const canApprove = canApproveSignups(caller.role, null, caller.has_admin_access, memberships)
  if (!canApprove && !canReopen) {
    return { error: NextResponse.json({ error: 'Only an admin or a unit head can approve signups' }, { status: 403 }) }
  }
  return { supabase, caller, memberships, isPlatformAdmin, canApprove, canReopen }
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * The units each applicant signed up for: only the rows the legacy sync built
 * from the applicant's own role and Oscar (managed_by_legacy), any status. A
 * head can add curated rows for anyone in their unit, so those never count.
 * A Command applicant belongs to Command alone (Head of Command or an admin
 * decides), as in SQL can_decide_signup().
 */
async function applicantUnits(adminClient: AdminClient, applicantIds: string[]) {
  const byApplicant = new Map<string, string[]>()
  if (!applicantIds.length) return byApplicant
  const { data, error } = await (adminClient as any)
    .from('unit_memberships')
    .select('user_id, units!inner(slug)')
    .in('user_id', applicantIds)
    .eq('managed_by_legacy', true)
  if (error) throw error
  for (const row of (data ?? []) as { user_id: string; units: { slug: string } | null }[]) {
    if (!row.units?.slug) continue
    byApplicant.set(row.user_id, [...(byApplicant.get(row.user_id) ?? []), row.units.slug])
  }
  for (const [userId, slugs] of byApplicant) {
    if (slugs.includes('command')) byApplicant.set(userId, ['command'])
  }
  return byApplicant
}

type DeclinedSignup = {
  id: string
  full_name: string | null
  email: string
  oscar: string | null
  reason: string | null
  declined_at: string
  declined_by_name: string | null
}

/** Accounts still declined whose latest decline is in the window, newest first. */
async function recentDeclined(adminClient: AdminClient): Promise<DeclinedSignup[]> {
  const since = new Date(Date.now() - SIGNUP_DECLINED_WINDOW_DAYS * 86_400_000).toISOString()
  const { data: decisions, error } = await (adminClient as any)
    .from('signup_decisions')
    .select('user_id, reason, decided_at, decided_by')
    .eq('decision', 'declined')
    .gte('decided_at', since)
    .order('decided_at', { ascending: false })
    .limit(200)
  if (error) throw error

  const latest = new Map<string, { user_id: string; reason: string | null; decided_at: string; decided_by: string | null }>()
  for (const row of decisions ?? []) if (!latest.has(row.user_id)) latest.set(row.user_id, row)
  if (!latest.size) return []

  const ids = new Set<string>(latest.keys())
  for (const row of latest.values()) if (row.decided_by) ids.add(row.decided_by)
  const { data: people, error: peopleError } = await adminClient
    .from('users')
    .select('id, full_name, email, oscar, activation_status, is_directory_hidden')
    .in('id', [...ids])
  if (peopleError) throw peopleError
  const byId = new Map((people ?? []).map(person => [person.id, person]))

  return [...latest.values()].flatMap(row => {
    const person = byId.get(row.user_id)
    if (!person || person.activation_status !== 'declined' || person.is_directory_hidden) return []
    return [{
      id: person.id,
      full_name: person.full_name,
      email: person.email,
      oscar: person.oscar,
      reason: row.reason,
      declined_at: row.decided_at,
      declined_by_name: row.decided_by ? byId.get(row.decided_by)?.full_name ?? null : null,
    }]
  })
}

export async function GET() {
  try {
    const approver = await getApprover()
    if (approver.error) return approver.error
    const { caller, memberships, isPlatformAdmin, canApprove, canReopen } = approver

    const adminClient = createAdminClient()
    let pending: unknown[] = []
    if (canApprove) {
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
      const rows = data ?? []
      const units = isPlatformAdmin ? new Map<string, string[]>() : await applicantUnits(adminClient, rows.map(row => row.id))
      pending = rows.filter(applicant => canDecideSignup(
        { role: caller.role, hasAdminAccess: caller.has_admin_access, memberships },
        units.get(applicant.id),
      ))
    }

    // A failure here must not hide the pending list; the page shows it separately.
    let declined: DeclinedSignup[] | null = null
    if (canReopen) {
      try {
        declined = await recentDeclined(adminClient)
      } catch (declinedError) {
        console.error('[signup-approvals] declined list error:', declinedError)
      }
    }

    return NextResponse.json({
      pending,
      scope: isPlatformAdmin ? 'all' : canApprove ? 'unit' : 'none',
      canReopen,
      declined: canReopen ? declined : [],
      declinedFailed: canReopen && declined === null,
    })
  } catch (err: any) {
    console.error('[signup-approvals] unexpected GET error:', err)
    return NextResponse.json({ error: 'Failed to load pending signups' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const approver = await getApprover()
    if (approver.error) return approver.error
    const { supabase, caller, memberships, isPlatformAdmin, canApprove, canReopen } = approver

    const parsed = parseSignupDecision(await request.json().catch(() => null))
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { officerId, decision, reason } = parsed

    if (decision === 'reopen') {
      if (!canReopen) return NextResponse.json({ error: 'Only an admin or Command can reopen a declined signup' }, { status: 403 })
    } else {
      if (!canApprove) return NextResponse.json({ error: 'Only an admin or a unit head can approve signups' }, { status: 403 })
      if (!isPlatformAdmin) {
        const units = await applicantUnits(createAdminClient(), [officerId])
        if (!canDecideSignup({ role: caller.role, hasAdminAccess: caller.has_admin_access, memberships }, units.get(officerId))) {
          return NextResponse.json({ error: 'You can only approve or decline signups into your own unit' }, { status: 403 })
        }
      }
    }

    // Runs as the signed-in approver: the database checks authority and state
    // again, writes the audit row and (for a decline) signs the person out.
    const { data, error: decideError } = await (supabase as any).rpc('decide_signup', {
      target_user: officerId,
      signup_decision: decision,
      decision_reason: reason,
    })

    if (decideError) {
      const { status, userFacing } = signupDecisionErrorStatus(decideError.code)
      if (!userFacing) console.error('[signup-approvals] decide error:', decideError)
      const fallback = status === 503
        ? 'Signup decisions are not available yet. Please try again later.'
        : 'Could not save this decision'
      return NextResponse.json({ error: userFacing ? decideError.message : fallback }, { status })
    }

    return NextResponse.json({ success: true, ...(data ?? {}) })
  } catch (err: any) {
    console.error('[signup-approvals] unexpected POST error:', err)
    return NextResponse.json({ error: 'Could not save this decision' }, { status: 500 })
  }
}
