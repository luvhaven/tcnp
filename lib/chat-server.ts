import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageChatMemberships, isChatProgramOpen, type ChatRoomScope } from '@/lib/chat-access'

export const CHAT_PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

export function chatError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: CHAT_PRIVATE_HEADERS })
}

export async function getChatCaller() {
  const auth = await createClient()
  const { data: { user }, error: authError } = await auth.auth.getUser()
  if (authError || !user) return { error: chatError('Sign in to open chat.', 401) } as const
  const { data: profile, error } = await auth.from('users')
    .select('id, role, team, activation_status, is_active')
    .eq('id', user.id).maybeSingle()
  if (error || !profile || profile.activation_status !== 'active' || profile.is_active !== true) {
    return { error: chatError('Your account does not currently have chat access.', 403) } as const
  }
  return {
    auth,
    db: createAdminClient() as any,
    profile,
    canManageMembers: canManageChatMemberships(profile.role),
  } as const
}

export async function assertOpenChatScope(db: any, scope: ChatRoomScope) {
  if (scope.team) return null
  // Some deployed schemas have archive/delete flags in addition to status.
  // Read the row rather than naming optional columns; never return it verbatim.
  const { data: program, error } = await db.from('programs').select('*').eq('id', scope.programId).maybeSingle()
  if (error) return chatError('Could not check this chat room. Please retry.', 500)
  if (!program || !isChatProgramOpen(program)) return chatError('This program chat is no longer available.', 404)
  if (scope.papaId) {
    const { data: papa, error: papaError } = await db.from('papas')
      .select('id, program_id, is_deleted').eq('id', scope.papaId).maybeSingle()
    if (papaError) return chatError('Could not check this chat room. Please retry.', 500)
    if (!papa || papa.is_deleted || papa.program_id !== scope.programId) return chatError('This Papa chat is no longer available.', 404)
  }
  return null
}
