import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPermanentOwnerEmail } from '@/lib/platform-owner'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user || !isPermanentOwnerEmail(user.email)) {
      return NextResponse.json({ error: 'Only the permanent owner can remove this profile' }, { status: 403 })
    }

    const { data: owner, error: ownerError } = await supabase
      .from('users')
      .select('id, email, role, activation_status, is_active, is_directory_hidden')
      .eq('id', user.id)
      .maybeSingle()

    if (ownerError || !owner || !isPermanentOwnerEmail(owner.email) || owner.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permanent owner identity could not be verified' }, { status: 403 })
    }
    if (owner.activation_status !== 'active' || owner.is_active === false) {
      return NextResponse.json({ error: 'The permanent owner account must remain active' }, { status: 403 })
    }
    if (owner.is_directory_hidden) return NextResponse.json({ success: true })

    // Use the caller's authenticated client so the database can verify this
    // was the owner removing their own directory profile.
    const { error } = await supabase
      .from('users')
      .update({ is_directory_hidden: true })
      .eq('id', user.id)

    if (error) {
      console.error('Permanent owner profile removal failed:', error)
      return NextResponse.json({ error: 'Failed to remove officer profile' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error removing permanent owner profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
