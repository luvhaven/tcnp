import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { isPlatformAdministrator, OFFICER_TEAMS } from '@/lib/utils'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEAMS: readonly string[] = OFFICER_TEAMS.map(team => team.value)
type Scope = { programId: string | null; papaId: string | null; team: string | null; messageId: string | null; all: boolean }

function parseScope(input: Record<string, unknown>): Scope | null {
  const scope: Scope = { programId: null, papaId: null, team: null, messageId: null, all: input.all === true }
  for (const key of ['programId', 'papaId', 'messageId'] as const) {
    const value = input[key]
    if (value != null && value !== '') {
      if (typeof value !== 'string' || !UUID.test(value)) return null
      scope[key] = value
    }
  }
  if (input.team != null && input.team !== '') {
    if (typeof input.team !== 'string' || !TEAMS.includes(input.team)) return null
    scope.team = input.team
  }
  if (scope.papaId && !scope.programId) return null
  const targets = Number(!!scope.programId) + Number(!!scope.team) + Number(!!scope.messageId) + Number(scope.all)
  if (targets !== 1) return null
  return scope
}

function scoped(query: any, scope: Scope) {
  if (scope.messageId) return query.eq('id', scope.messageId)
  if (scope.programId) {
    query = query.eq('program_id', scope.programId).is('team', null)
    return scope.papaId ? query.eq('papa_id', scope.papaId) : query.is('papa_id', null)
  }
  if (scope.team) return query.eq('team', scope.team).is('program_id', null).is('papa_id', null)
  return query
}

async function caller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  const { data: profile, error } = await supabase.from('users')
    .select('role, full_name, team, is_team_head, activation_status, is_active')
    .eq('id', user.id).maybeSingle()
  if (error || !profile || profile.activation_status !== 'active' || profile.is_active !== true) {
    return { error: NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 }) } as const
  }
  return { supabase, user, profile } as const
}

export async function DELETE(request: Request) {
  try {
    const limitCheck = await checkRateLimit(request, 'admin-chat-delete', 20, 60000)
    if (!limitCheck.success) return NextResponse.json({ error: 'Too many chat actions. Please try again shortly.' }, { status: 429 })
    const auth = await caller()
    if ('error' in auth) return auth.error
    const { profile: callerData, user } = auth
    if (!isPlatformAdministrator(callerData.role)) {
      return NextResponse.json({ error: 'Forbidden: only platform administrators can permanently delete chats' }, { status: 403 })
    }
    const params = new URL(request.url).searchParams
    const scope = parseScope({ programId: params.get('programId'), papaId: params.get('papaId'), team: params.get('team'), messageId: params.get('messageId'), all: params.get('all') === 'true' })
    if (!scope) return NextResponse.json({ error: 'Choose exactly one valid chat room, message, or all chats.' }, { status: 400 })

    const db = createAdminClient() as any
    // Snapshot and page all ids instead of silently deleting only the first
    // PostgREST page. New messages are excluded from bulk deletion.
    const startedAt = new Date().toISOString()
    const ids: string[] = []
    for (let offset = 0; ; offset += 500) {
      let query = scoped(db.from('chat_messages').select('id'), scope)
      if (!scope.messageId) query = query.lte('created_at', startedAt)
      const { data, error } = await query.order('id').range(offset, offset + 499)
      if (error) throw error
      ids.push(...(data ?? []).map((message: { id: string }) => message.id))
      if (!data || data.length < 500) break
    }
    for (let offset = 0; offset < ids.length; offset += 500) {
      const batch = ids.slice(offset, offset + 500)
      const reactions = await db.from('message_reactions').delete().in('message_id', batch)
      if (reactions.error) throw reactions.error
      const replies = await db.from('chat_messages').update({ reply_to_id: null }).in('reply_to_id', batch)
      if (replies.error) throw replies.error
      const removed = await db.from('chat_messages').delete().in('id', batch)
      if (removed.error) throw removed.error
    }
    if (ids.length) {
      const audit = await db.from('audit_logs').insert({
        user_id: user.id, action: 'destroy_chats', target_type: 'chat_messages',
        target_id: scope.messageId || scope.papaId || scope.programId || scope.team || 'all',
        description: `Permanently deleted ${ids.length} chat messages`,
        metadata: { scope, deletedCount: ids.length },
      })
      if (audit.error) console.warn('[admin-chat-delete] Audit record could not be saved')
    }
    return NextResponse.json({ success: true, count: ids.length })
  } catch (error) {
    console.error('[admin-chat-delete] Failed:', error)
    return NextResponse.json({ error: 'Could not delete chats. Please try again.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const limitCheck = await checkRateLimit(request, 'admin-chat-action', 30, 60000)
    if (!limitCheck.success) return NextResponse.json({ error: 'Too many chat actions. Please try again shortly.' }, { status: 429 })
    const auth = await caller()
    if ('error' in auth) return auth.error
    const { supabase, user, profile: callerData } = auth
    const body = await request.json().catch(() => null)
    if (!body || !['archive', 'soft_delete', 'flag', 'unflag'].includes(body.action)) {
      return NextResponse.json({ error: 'Choose a valid chat action.' }, { status: 400 })
    }
    const { action, messageId } = body
    if (action === 'archive') {
      if (!isPlatformAdministrator(callerData.role)) {
        return NextResponse.json({ error: 'Forbidden: only platform administrators can archive chats' }, { status: 403 })
      }
      const scope = parseScope(body)
      if (!scope || scope.messageId) return NextResponse.json({ error: 'Choose one valid chat room or all chats.' }, { status: 400 })
      const db = createAdminClient() as any
      const { error } = await scoped(db.from('chat_messages').update({ is_archived: true }), scope)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (typeof messageId !== 'string' || !UUID.test(messageId)) {
      return NextResponse.json({ error: 'A valid messageId is required.' }, { status: 400 })
    }

    const platformAdmin = isPlatformAdministrator(callerData.role)
    if (!platformAdmin) {
      // auth.uid() must be the actual caller, not the service-role identity.
      const { data: allowed, error } = await (supabase as any).rpc('can_access_chat_message', { target_message_id: messageId })
      if (error || allowed !== true) return NextResponse.json({ error: 'Message not found or no longer accessible.' }, { status: 404 })
    }
    const db = createAdminClient() as any
    const reader = platformAdmin ? db : supabase
    const { data: message, error: readError } = await reader.from('chat_messages')
      .select('id, sender_id, team, flagged, flagged_by, deleted_at').eq('id', messageId).maybeSingle()
    if (readError || !message) return NextResponse.json({ error: 'Message not found or no longer accessible.' }, { status: 404 })
    const isAuthor = message.sender_id === user.id
    const isTeamModerator = !!message.team && callerData.team === message.team && callerData.is_team_head === true

    if (action === 'soft_delete') {
      if (!platformAdmin && !isAuthor && !isTeamModerator) {
        return NextResponse.json({ error: 'You cannot delete this message.' }, { status: 403 })
      }
      const deletedAt = message.deleted_at || new Date().toISOString()
      const { error } = await db.from('chat_messages').update({ deleted_at: deletedAt, deleted_by_admin: !isAuthor }).eq('id', messageId)
      if (error) throw error
      return NextResponse.json({ success: true, deleted_at: deletedAt, deleted_by_admin: !isAuthor })
    }
    if (action === 'unflag' && !platformAdmin && !isTeamModerator && message.flagged_by !== user.id) {
      return NextResponse.json({ error: 'You cannot remove this report.' }, { status: 403 })
    }
    if (action === 'flag' && message.flagged) return NextResponse.json({ success: true })
    const { error } = await db.from('chat_messages').update({ flagged: action === 'flag', flagged_by: action === 'flag' ? user.id : null }).eq('id', messageId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[admin-chat-action] Failed:', error)
    return NextResponse.json({ error: 'Could not update this message. Please try again.' }, { status: 500 })
  }
}
