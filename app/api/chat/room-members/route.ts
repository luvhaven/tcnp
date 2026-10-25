import { NextResponse } from 'next/server'
import { CHAT_PRIVATE_HEADERS, assertOpenChatScope, chatError, getChatCaller } from '@/lib/chat-server'
import { CHAT_UUID_PATTERN, canManageChatMemberships, parseChatRoomScope, type ChatRoomMember } from '@/lib/chat-access'
import { PLATFORM_ADMIN_ROLES } from '@/lib/utils'
import { isOfficerOnline } from '@/lib/presence'
import { checkRateLimit } from '@/lib/security/rate-limit'

const MEMBER_FIELDS = 'id, full_name, role, oscar, photo_url, is_online, last_seen, is_active, activation_status'

function memberView(user: any, accessType: ChatRoomMember['accessType']): ChatRoomMember {
  return {
    id: user.id, full_name: user.full_name, role: user.role, oscar: user.oscar,
    photo_url: user.photo_url, last_seen: user.last_seen,
    is_online: isOfficerOnline(user), accessType,
  }
}

export async function GET(request: Request) {
  try {
    const caller = await getChatCaller()
    if ('error' in caller) return caller.error
    const { auth, db, canManageMembers } = caller
    const params = new URL(request.url).searchParams
    const scope = parseChatRoomScope({ programId: params.get('programId'), papaId: params.get('papaId'), team: params.get('team') })
    if (!scope) return chatError('Choose a valid chat room.', 400)
    const { data: allowed, error: accessError } = await (auth as any).rpc('can_access_chat_room', {
      target_program_id: scope.programId, target_papa_id: scope.papaId, target_team: scope.team,
    })
    if (accessError) return chatError('Chat access is being updated. Please retry shortly.', 503)
    if (!allowed) return chatError('You have not been added to this chat room.', 403)
    const scopeError = await assertOpenChatScope(db, scope)
    if (scopeError) return scopeError

    let memberIds: string[] = []
    if (!scope.team) {
      let query = db.from('chat_room_memberships').select('user_id').eq('program_id', scope.programId)
      query = scope.papaId ? query.eq('papa_id', scope.papaId) : query.is('papa_id', null)
      const result = await query
      if (result.error) return chatError('Could not load room members. Please retry.', 500)
      memberIds = (result.data ?? []).map((row: { user_id: string }) => row.user_id)
    }
    const baseUsers = () => db.from('users').select(MEMBER_FIELDS).eq('is_active', true).eq('activation_status', 'active').eq('is_directory_hidden', false).order('full_name')
    let activeUsers: any[]
    if (canManageMembers) {
      const result = await baseUsers()
      if (result.error) return chatError('Could not load room members. Please retry.', 500)
      activeUsers = result.data ?? []
    } else {
      const executives = await baseUsers().in('role', [...PLATFORM_ADMIN_ROLES])
      if (executives.error) return chatError('Could not load room members. Please retry.', 500)
      let assigned: any[] = []
      if (scope.team || memberIds.length) {
        const result = await (scope.team ? baseUsers().eq('team', scope.team) : baseUsers().in('id', memberIds))
        if (result.error) return chatError('Could not load room members. Please retry.', 500)
        assigned = result.data ?? []
      }
      activeUsers = [...new Map([...(executives.data ?? []), ...assigned].map((user: any) => [user.id, user])).values()]
    }
    // Team assignments remain operational data; this endpoint never moves users between teams.
    let teamMemberIds: Set<string> | null = null
    if (scope.team && canManageMembers) {
      const assigned = await db.from('users').select('id').eq('team', scope.team)
      if (assigned.error) return chatError('Could not load room members. Please retry.', 500)
      teamMemberIds = new Set((assigned.data ?? []).map((user: { id: string }) => user.id))
    }
    const explicitIds = new Set(memberIds)
    const members = activeUsers.filter(user => canManageChatMemberships(user.role) || (scope.team ? (!canManageMembers || teamMemberIds?.has(user.id)) : explicitIds.has(user.id)))
      .map(user => memberView(user, canManageChatMemberships(user.role) ? 'executive' : scope.team ? 'team' : 'member'))
    const candidates = canManageMembers && !scope.team
      ? activeUsers.filter(user => !canManageChatMemberships(user.role) && !explicitIds.has(user.id)).map(user => memberView(user, 'member'))
      : undefined
    return NextResponse.json({ members, candidates, canManageMembers: canManageMembers && !scope.team }, { headers: CHAT_PRIVATE_HEADERS })
  } catch (error) {
    console.error('[chat/room-members] Could not load members:', error)
    return chatError('Could not load room members. Please retry.', 500)
  }
}

async function changeMembership(request: Request, remove: boolean) {
  try {
    const limit = await checkRateLimit(request, 'chat-membership-change', 60, 60_000)
    if (!limit.success) return chatError('Too many membership changes. Please wait a moment.', 429)
    const caller = await getChatCaller()
    if ('error' in caller) return caller.error
    if (!caller.canManageMembers) return chatError('Only administrators can manage room members.', 403)
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return chatError('Provide a valid room and officer.', 400)
    const scope = parseChatRoomScope(body)
    if (!scope || scope.team) return chatError('Choose a program or Papa chat room.', 400)
    if (typeof body.userId !== 'string' || !CHAT_UUID_PATTERN.test(body.userId)) return chatError('Choose a valid officer.', 400)
    const scopeError = await assertOpenChatScope(caller.db, scope)
    if (scopeError) return scopeError
    const { data: target, error: targetError } = await caller.db.from('users')
      .select('id, role, activation_status, is_active, is_directory_hidden').eq('id', body.userId).maybeSingle()
    if (targetError) return chatError('Could not check this officer. Please retry.', 500)
    if (!target || target.is_directory_hidden) return chatError('Choose a valid officer.', 400)
    if (!remove && (target.is_active !== true || target.activation_status !== 'active')) return chatError('Choose an active officer.', 400)
    if (canManageChatMemberships(target.role)) return chatError('This officer already has access to every chat room.', 400)
    const membershipDb = caller.auth as any
    if (remove) {
      let query = membershipDb.from('chat_room_memberships').delete().eq('program_id', scope.programId).eq('user_id', body.userId)
      query = scope.papaId ? query.eq('papa_id', scope.papaId) : query.is('papa_id', null)
      const { error } = await query
      if (error) return chatError('Could not remove this room member. Please retry.', 500)
    } else {
      const { error } = await membershipDb.from('chat_room_memberships').insert({
        program_id: scope.programId, papa_id: scope.papaId, user_id: body.userId, added_by: caller.profile.id,
      })
      if (error && error.code !== '23505') return chatError('Could not add this room member. Please retry.', 500)
    }
    return NextResponse.json({ success: true }, { headers: CHAT_PRIVATE_HEADERS })
  } catch (error) {
    console.error('[chat/room-members] Could not update membership:', error)
    return chatError('Could not update room membership. Please retry.', 500)
  }
}

export const POST = (request: Request) => changeMembership(request, false)
export const DELETE = (request: Request) => changeMembership(request, true)
