import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { isAdmin, effectiveOscarRole } from '@/lib/utils'

export async function DELETE(request: Request) {
    const limitCheck = checkRateLimit(request, 'admin-chat-delete', 20, 60000)
    if (!limitCheck.success) {
        return NextResponse.json({ error: 'Rate limit exceeded for admin chat operations.' }, { status: 429 })
    }

    const cookieStore = await cookies()

    // 1. Authenticate caller
    const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) { return cookieStore.get(name)?.value },
                set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
                remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) },
            },
        }
    )

    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Check caller role
    const { data: callerData } = await supabaseAuth
        .from('users')
        .select('role, oscar, full_name, team, is_team_head')
        .eq('id', user.id)
        .single()

    const isUserAdmin = callerData && (isAdmin(callerData.role) || isAdmin(effectiveOscarRole(callerData.role, callerData.oscar)))
    if (!isUserAdmin) {
        return NextResponse.json({ error: 'Forbidden: only administrators can permanently delete chats' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')
    const team = searchParams.get('team')
    const messageId = searchParams.get('messageId')
    const deleteAll = searchParams.get('all') === 'true'

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        // Find matching messages to delete
        let query = supabaseAdmin.from('chat_messages').select('id')

        if (messageId) {
            query = query.eq('id', messageId)
        } else if (programId) {
            query = query.eq('program_id', programId)
        } else if (team) {
            query = query.eq('team', team)
        } else if (!deleteAll) {
            return NextResponse.json({ error: 'Target scope (programId, team, messageId, or all) is required' }, { status: 400 })
        }

        const { data: targetMessages, error: selectError } = await query
        if (selectError) throw selectError

        if (!targetMessages || targetMessages.length === 0) {
            return NextResponse.json({ success: true, count: 0, message: 'No messages found to delete' })
        }

        const targetIds = targetMessages.map(m => m.id)

        // 1. Delete associated message reactions
        await supabaseAdmin
            .from('message_reactions')
            .delete()
            .in('message_id', targetIds)

        // 2. Nullify self-referencing reply_to_id
        await supabaseAdmin
            .from('chat_messages')
            .update({ reply_to_id: null })
            .in('reply_to_id', targetIds)

        // 3. Delete messages permanently
        const { error: deleteError } = await supabaseAdmin
            .from('chat_messages')
            .delete()
            .in('id', targetIds)

        if (deleteError) throw deleteError

        // 4. Record audit log
        try {
            await supabaseAdmin.from('audit_logs').insert({
                user_id: user.id,
                action: 'destroy_chats',
                target_type: 'chat_messages',
                target_id: messageId || programId || team || 'all',
                description: `Permanently destroyed ${targetIds.length} chat message(s) by ${callerData?.full_name || user.email} (scope: ${messageId ? `message ${messageId}` : programId ? `program ${programId}` : team ? `team ${team}` : 'all'})`,
                metadata: {
                    scope: { programId, team, messageId, deleteAll },
                    deletedCount: targetIds.length
                }
            })
        } catch (auditErr) {
            console.warn('[admin-chat-delete] Non-fatal audit log error:', auditErr)
        }

        return NextResponse.json({ success: true, count: targetIds.length })
    } catch (err: any) {
        console.error('[admin-chat-delete] Error permanently deleting chats:', err)
        return NextResponse.json({ error: err.message || 'Failed to delete chats' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    const limitCheck = checkRateLimit(request, 'admin-chat-action', 30, 60000)
    if (!limitCheck.success) {
        return NextResponse.json({ error: 'Rate limit exceeded for chat actions.' }, { status: 429 })
    }

    const cookieStore = await cookies()

    const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) { return cookieStore.get(name)?.value },
                set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
                remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) },
            },
        }
    )

    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerData } = await supabaseAuth
        .from('users')
        .select('role, oscar, full_name, team, is_team_head')
        .eq('id', user.id)
        .single()

    const isUserAdmin = callerData && (isAdmin(callerData.role) || isAdmin(effectiveOscarRole(callerData.role, callerData.oscar)))

    const body = await request.json()
    const { action, programId, team, messageId } = body

    if (!action) {
        return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        if (action === 'archive') {
            if (!isUserAdmin) {
                return NextResponse.json({ error: 'Forbidden: only administrators can archive chats' }, { status: 403 })
            }

            let updateQuery = supabaseAdmin.from('chat_messages').update({ is_archived: true })
            if (programId) {
                updateQuery = updateQuery.eq('program_id', programId)
            } else if (team) {
                updateQuery = updateQuery.eq('team', team)
            } else {
                updateQuery = updateQuery.neq('id', '00000000-0000-0000-0000-000000000000')
            }

            const { error: archiveError } = await updateQuery
            if (archiveError) throw archiveError

            return NextResponse.json({ success: true })
        }

        if (action === 'soft_delete') {
            if (!messageId) {
                return NextResponse.json({ error: 'messageId is required for soft delete' }, { status: 400 })
            }

            // Allowed if user is admin, team head for team messages, or author
            const { data: msg } = await supabaseAdmin.from('chat_messages').select('sender_id, team').eq('id', messageId).single()
            if (!msg) {
                return NextResponse.json({ error: 'Message not found' }, { status: 404 })
            }

            const isAuthor = msg.sender_id === user.id
            const isTeamModerator = msg.team && callerData?.team === msg.team && (callerData?.is_team_head || isUserAdmin)

            if (!isUserAdmin && !isAuthor && !isTeamModerator) {
                return NextResponse.json({ error: 'Forbidden: not authorized to delete this message' }, { status: 403 })
            }

            const deletedAt = new Date().toISOString()
            const { error: updateError } = await supabaseAdmin
                .from('chat_messages')
                .update({
                    deleted_at: deletedAt,
                    deleted_by_admin: !isAuthor
                })
                .eq('id', messageId)

            if (updateError) throw updateError
            return NextResponse.json({ success: true, deleted_at: deletedAt, deleted_by_admin: !isAuthor })
        }

        if (action === 'flag' || action === 'unflag') {
            if (!messageId) {
                return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
            }

            const { error: flagError } = await supabaseAdmin
                .from('chat_messages')
                .update({
                    flagged: action === 'flag',
                    flagged_by: action === 'flag' ? user.id : null
                })
                .eq('id', messageId)

            if (flagError) throw flagError
            return NextResponse.json({ success: true })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (err: any) {
        console.error('[admin-chat-action] Error:', err)
        return NextResponse.json({ error: err.message || 'Failed to execute chat action' }, { status: 500 })
    }
}
