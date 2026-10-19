import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'

const MAX_RECIPIENTS = 50
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Notifies the users @mentioned in a chat message the caller just sent.
 * Recipients and text come from the stored message, not the request body, so
 * a client can only notify the people its own recent message mentions.
 */
export async function POST(req: NextRequest) {
  try {
    const limitCheck = await checkRateLimit(req, 'chat-mention-notify', 30, 60 * 1000)
    if (!limitCheck.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const messageId = typeof body?.messageId === 'string' ? body.messageId : ''
    if (!UUID_PATTERN.test(messageId)) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
    }

    const db = createAdminClient() as any

    const { data: profile } = await db.from('users').select('activation_status, is_active').eq('id', user.id).maybeSingle()
    if (!profile || profile.activation_status !== 'active' || profile.is_active === false) {
      return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }

    const { data: message } = await db
      .from('chat_messages')
      .select('id, sender_id, content, mentions, created_at, deleted_at')
      .eq('id', messageId)
      .maybeSingle()
    if (!message || message.sender_id !== user.id || message.deleted_at) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    if (Date.now() - new Date(message.created_at).getTime() > MAX_MESSAGE_AGE_MS) {
      return NextResponse.json({ error: 'Message is too old to notify' }, { status: 409 })
    }

    const mentioned = Array.isArray(message.mentions) ? message.mentions : []
    const recipientIds = Array.from(new Set(
      mentioned.filter((id: unknown): id is string => typeof id === 'string' && UUID_PATTERN.test(id) && id !== user.id)
    )).slice(0, MAX_RECIPIENTS)
    if (recipientIds.length === 0) return NextResponse.json({ success: true, recipients: 0 })

    // One notification per message: a repeat call is a no-op.
    const { count: existing } = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('metadata->>message_id', message.id)
    if (existing && existing > 0) return NextResponse.json({ success: true, recipients: 0 })

    const { data: activeRecipients } = await db
      .from('users')
      .select('id')
      .in('id', recipientIds)
      .eq('is_active', true)
      .eq('activation_status', 'active')
    const rows = (activeRecipients ?? []).map((recipient: { id: string }) => ({
      user_id: recipient.id,
      title: 'New chat message',
      message: String(message.content ?? '').slice(0, 1000),
      type: 'chat',
      channel: 'push',
      metadata: { kind: 'mention', message_id: message.id, sender_id: user.id },
    }))
    if (rows.length === 0) return NextResponse.json({ success: true, recipients: 0 })

    const { error } = await db.from('notifications').insert(rows)
    if (error) throw error

    return NextResponse.json({ success: true, recipients: rows.length })
  } catch (err) {
    console.error('Error in chat/mention-notifications route:', err)
    return NextResponse.json({ error: 'Could not send mention notifications' }, { status: 500 })
  }
}
