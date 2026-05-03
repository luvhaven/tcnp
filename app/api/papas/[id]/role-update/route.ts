import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_BRIEFING_CONFIG } from '@/lib/constants/papaBriefingFields'

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
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const role = userData.role as string
    const config = ROLE_BRIEFING_CONFIG[role]

    if (!config || config.editableFields.length === 0) {
      return NextResponse.json(
        { error: 'Your role does not have edit permissions for Papa briefing fields.' },
        { status: 403 }
      )
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
    const adminClient = createAdminClient()
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
      },
      status: 'success',
    })

    return NextResponse.json({ success: true, updated: Object.keys(filteredUpdate) })
  } catch (err: any) {
    console.error('role-update error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
