import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_BRIEFING_CONFIG, type RoleBriefingConfig } from '@/lib/constants/papaBriefingFields'
import { fetchActiveUnitMemberships, isPlatformAdminAuthority, unitAccess } from '@/lib/unit-access'

/**
 * Which unit owns which briefing section. Editing a section is programme work
 * in that unit: head or sub-lead of the unit (can_coordinate_unit), or a member
 * the database says may work the Papa's programme (can_work_unit_programme,
 * e.g. a Den floor grant). Platform administrators may edit every section.
 */
const BRIEFING_UNITS: Record<string, string> = {
  alpha: 'head_alpha_oscar',
  victor: 'head_victor_oscar',
  november_nest: 'head_noscar_nest',
  november_den: 'head_noscar_den',
  echo: 'head_echo_oscar',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: papaId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get requesting user's role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, has_admin_access, oscar, full_name, activation_status, is_active')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (userData.activation_status !== 'active' || userData.is_active === false) {
      return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }

    const role = userData.role as string
    const viewer = { role, hasAdminAccess: userData.has_admin_access }
    const isPlatformAdmin = isPlatformAdminAuthority(role, userData.has_admin_access)

    // Unit access comes from the caller's own memberships (their session, so RLS applies).
    const { memberships, error: membershipError } = await fetchActiveUnitMemberships(supabase as any, user.id)
    if (membershipError) {
      return NextResponse.json({ error: 'Could not check your unit access. Try again.' }, { status: 503 })
    }
    const candidateUnits = Object.keys(BRIEFING_UNITS).filter(slug => isPlatformAdmin || unitAccess(memberships, slug, viewer).isMember)
    if (candidateUnits.length === 0) {
      return NextResponse.json(
        { error: 'Your unit does not have edit permissions for Papa briefing fields.' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()
    const { data: targetPapa, error: targetError } = await (adminClient as any)
      .from('papas')
      .select('id, program_id, is_deleted')
      .eq('id', papaId)
      .maybeSingle()

    if (targetError || !targetPapa || targetPapa.is_deleted) {
      return NextResponse.json({ error: 'Papa not found' }, { status: 404 })
    }

    const editableUnits: string[] = []
    for (const slug of candidateUnits) {
      const access = unitAccess(memberships, slug, viewer)
      let allowed = access.canCoordinate
      if (!allowed && targetPapa.program_id) {
        const { data: canWork } = await (supabase as any).rpc('can_work_unit_programme', {
          unit_slug: slug,
          target_program: targetPapa.program_id,
        })
        allowed = canWork === true
      }
      if (allowed) editableUnits.push(slug)
    }

    const configs = editableUnits
      .map(slug => ROLE_BRIEFING_CONFIG[BRIEFING_UNITS[slug]])
      .filter((config): config is RoleBriefingConfig => Boolean(config) && config.editableFields.length > 0)

    if (configs.length === 0) {
      return NextResponse.json(
        { error: 'You do not have authority for this Papa or program.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    // Strictly filter: only allow keys the caller's units may edit
    const allowedKeys = new Set(configs.flatMap(config => config.editableFields))
    const filteredUpdate: Record<string, any> = {}

    for (const [key, value] of Object.entries(body)) {
      if (allowedKeys.has(key)) {
        filteredUpdate[key] = value === '' ? null : value
      }
    }

    if (Object.keys(filteredUpdate).length === 0) {
      return NextResponse.json({ error: 'No permitted fields in request' }, { status: 400 })
    }

    // Apply update via admin client (bypasses RLS for audit-safe write)
    const { error: updateError } = await (adminClient as any)
      .from('papas')
      .update({ ...filteredUpdate, updated_at: new Date().toISOString() })
      .eq('id', papaId)

    if (updateError) throw updateError

    // Write explicit audit log entry (supplements the DB trigger)
    await (adminClient as any).from('audit_logs').insert({
      user_id: user.id,
      user_role: role,
      action: 'PAPA_BRIEFING_UPDATE',
      entity_type: 'papa',
      entity_id: papaId,
      target_type: 'papa',
      target_id: papaId,
      description: `${userData.full_name} (${role}) updated Papa briefing fields: ${Object.keys(filteredUpdate).join(', ')}`,
      changes: {
        updated_fields: Object.keys(filteredUpdate),
        values: filteredUpdate,
        role_section: configs.map(config => config.sectionTitle).join(', '),
        units: editableUnits,
      },
      status: 'success',
    })

    return NextResponse.json({ success: true, updated: Object.keys(filteredUpdate) })
  } catch (err: any) {
    console.error('role-update error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
