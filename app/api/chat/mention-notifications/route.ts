import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { isPlatformAdministrator } from '@/lib/utils'
import { getProgramChatAssignments } from '@/lib/chat-program-membership'

const MAX_RECIPIENTS = 50
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function notificationId(messageId: string, recipientId: string) {
  // Stable ids make concurrent retries idempotent without a notification spam race.
  const bytes = createHash('sha256').update(`chat-mention:${messageId}:${recipientId}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Stored message mentions are filtered through exact room membership before notifying. */
export async function POST(req: NextRequest) {
  try {
    const limitCheck = await checkRateLimit(req, 'chat-mention-notify', 30, 60 * 1000)
    if (!limitCheck.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => null)
    const messageId = typeof body?.messageId === 'string' ? body.messageId : ''
    if (!UUID_PATTERN.test(messageId)) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })

    const { data: profile } = await supabase.from('users').select('activation_status, is_active').eq('id', user.id).maybeSingle()
    if (!profile || profile.activation_status !== 'active' || profile.is_active !== true) {
      return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }
    // Caller-bound access also handles membership revocation and archived programs.
    const { data: allowed, error: accessError } = await (supabase as any).rpc('can_access_chat_message', { target_message_id: messageId })
    if (accessError || allowed !== true) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    const { data: message, error: messageError } = await supabase.from('chat_messages')
      .select('id, sender_id, content, mentions, created_at, deleted_at, is_archived, is_private, program_id, papa_id, team')
      .eq('id', messageId).maybeSingle()
    if (messageError || !message || message.sender_id !== user.id || message.deleted_at || message.is_archived) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    const age = Date.now() - Date.parse(message.created_at ?? '')
    if (!Number.isFinite(age) || age < 0 || age > MAX_MESSAGE_AGE_MS) {
      return NextResponse.json({ error: 'Message is too old to notify' }, { status: 409 })
    }
    const mentioned = Array.isArray(message.mentions) ? message.mentions : []
    const recipientIds = Array.from(new Set(
      mentioned.filter((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id))
        .map(id => id.toLowerCase()).filter(id => id !== user.id.toLowerCase())
    )).slice(0, MAX_RECIPIENTS)
    if (!recipientIds.length) return NextResponse.json({ success: true, recipients: 0 })

    const db = createAdminClient() as any
    // Preserve idempotency for notifications created by older versions as well.
    const { count: existing, error: duplicateError } = await db.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('metadata->>message_id', message.id)
    if (duplicateError) throw duplicateError
    if (existing && existing > 0) return NextResponse.json({ success: true, recipients: 0 })

    const { data: activeRecipients, error: recipientError } = await db.from('users')
      .select('id, role, team').in('id', recipientIds).eq('is_active', true).eq('activation_status', 'active')
    if (recipientError) throw recipientError
    const candidates = (activeRecipients ?? []) as { id: string; role: string | null; team: string | null }[]
    const permitted = new Set(candidates.filter(recipient => isPlatformAdministrator(recipient.role)).map(recipient => recipient.id))

    if (message.team) {
      candidates.filter(recipient => recipient.team === message.team).forEach(recipient => permitted.add(recipient.id))
    } else if (message.program_id) {
      let membershipQuery = db.from('chat_room_memberships').select('user_id')
        .eq('program_id', message.program_id).in('user_id', recipientIds)
      membershipQuery = message.papa_id
        ? membershipQuery.eq('papa_id', message.papa_id)
        : membershipQuery.is('papa_id', null)
      const { data: memberships, error: membershipError } = await membershipQuery
      if (membershipError) throw membershipError
      if (!message.papa_id) {
        const { data: assigned, error: assignmentError } = await getProgramChatAssignments(db, { programId: message.program_id, userIds: recipientIds })
        if (assignmentError) throw assignmentError
        for (const assignment of assigned ?? []) permitted.add(assignment.user_id)
      }
      ;(memberships ?? []).forEach((membership: { user_id: string }) => permitted.add(membership.user_id))
    }
    // Private message recipients originate from the stored mentions list above;
    // room membership is still required even if somebody was @mentioned by id.
    const recipients = candidates.filter(recipient => permitted.has(recipient.id))
    if (!recipients.length) return NextResponse.json({ success: true, recipients: 0 })
    const roomParams = new URLSearchParams({ highlight: message.id })
    if (message.program_id) roomParams.set('programId', message.program_id)
    if (message.papa_id) roomParams.set('papaId', message.papa_id)
    if (message.team) roomParams.set('team', message.team)
    const rows = recipients.map(recipient => ({
      id: notificationId(message.id, recipient.id), user_id: recipient.id,
      title: 'New chat message', message: String(message.content ?? '').slice(0, 1000),
      type: 'chat', channel: 'push',
      metadata: { kind: 'mention', message_id: message.id, sender_id: user.id, program_id: message.program_id, papa_id: message.papa_id, team: message.team, url: `/chat?${roomParams}` },
    }))
    const { error } = await db.from('notifications').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    return NextResponse.json({ success: true, recipients: rows.length })
  } catch (error) {
    console.error('[chat/mention-notifications] Failed:', error)
    return NextResponse.json({ error: 'Could not send mention notifications' }, { status: 500 })
  }
}
