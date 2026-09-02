import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_BRIEFING_CONFIG } from '@/lib/constants/papaBriefingFields'
import { effectiveOscarRole, isAdmin } from '@/lib/utils'

const ROLE_UNIT: Record<string, string> = {
  head_alpha_oscar: 'alpha',
  head_tango_oscar: 'tango',
  head_victor_oscar: 'victor',
  head_noscar_nest: 'november_nest',
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
      .select('role, oscar, full_name')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const role = userData.role as string
    const effectiveRole = effectiveOscarRole(role, userData.oscar) ?? role
    const config = ROLE_BRIEFING_CONFIG[effectiveRole]

    if (!config || config.editableFields.length === 0) {
      return NextResponse.json(
        { error: 'Your role does not have edit permissions for Papa briefing fields.' },
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

    // A unit head may update briefings only through the unit they actually
    // lead. Platform administrators retain cross-program authority. During the
    // additive membership rollout, an active title assignment remains a safe
    // compatibility path for legacy head accounts.
    if (!isAdmin(role)) {
      const requiredUnit = ROLE_UNIT[effectiveRole]
      let hasScopedAuthority = false

      if (requiredUnit) {
        const { data: membership } = await (supabase as any)
          .from('unit_memberships')
          .select('access_level, status, units!inner(slug)')
          .eq('user_id', user.id)
          .eq('access_level', 'head')
          .eq('status', 'active')
          .eq('units.slug', requiredUnit)
          .maybeSingle()
        hasScopedAuthority = Boolean(membership)
      }

      if (!hasScopedAuthority && targetPapa.program_id) {
        const { data: assignment } = await (supabase as any)
          .from('current_title_assignments')
          .select('id')
          .eq('user_id', user.id)
          .eq('program_id', targetPapa.program_id)
          .eq('is_active', true)
          .maybeSingle()
        hasScopedAuthority = Boolean(assignment)
      }

      if (!hasScopedAuthority) {
        return NextResponse.json(
          { error: 'You do not have authority for this Papa or program.' },
          { status: 403 }
        )
      }
    }

    const body = await req.json()

    // Strictly filter: only allow keys that this role is permitted to edit
    const allowedKeys = new Set(config.editableFields)
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
        role_section: config.sectionTitle,
        effective_role: effectiveRole,
      },
      status: 'success',
    })

    return NextResponse.json({ success: true, updated: Object.keys(filteredUpdate) })
  } catch (err: any) {
    console.error('role-update error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
