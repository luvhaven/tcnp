import { isPlatformAdministrator, OFFICER_TEAMS } from '@/lib/utils'

export type ChatRoomKind = 'team' | 'program' | 'papa'

export type ChatRoomScope = {
  programId: string | null
  papaId: string | null
  team: string | null
}

export type ChatRoomSummary = ChatRoomScope & {
  id: string
  kind: ChatRoomKind
  label: string
  programName?: string | null
  memberCount?: number
}

export type ChatRoomMember = {
  id: string
  full_name: string | null
  role: string | null
  oscar: string | null
  photo_url: string | null
  is_online: boolean
  last_seen: string | null
  accessType: 'executive' | 'member' | 'team' | 'program'
}

export type ChatRoomsResponse = {
  rooms: ChatRoomSummary[]
  canManageMembers: boolean
}

export type ChatRoomMembersResponse = {
  members: ChatRoomMember[]
  candidates?: ChatRoomMember[]
  canManageMembers: boolean
}

export const CHAT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function canManageChatMemberships(role?: string | null): boolean {
  return isPlatformAdministrator(role)
}

export function isChatProgramOpen(program: {
  status?: string | null
  is_archived?: boolean | null
  is_deleted?: boolean | null
}): boolean {
  return program.status?.trim().toLowerCase() !== 'archived'
    && program.is_archived !== true
    && program.is_deleted !== true
}

/** Exactly one room scope is required; a program invitation never implies a Papa invitation. */
export function parseChatRoomScope(value: {
  programId?: unknown
  papaId?: unknown
  team?: unknown
}): ChatRoomScope | null {
  const programId = value.programId == null || value.programId === '' ? null : value.programId
  const papaId = value.papaId == null || value.papaId === '' ? null : value.papaId
  const team = value.team == null || value.team === '' ? null : value.team
  if (team !== null) {
    if (programId !== null || papaId !== null || !OFFICER_TEAMS.some(item => item.value === team)) return null
    return { programId: null, papaId: null, team: team as string }
  }
  if (typeof programId !== 'string' || !CHAT_UUID_PATTERN.test(programId)) return null
  if (papaId !== null && (typeof papaId !== 'string' || !CHAT_UUID_PATTERN.test(papaId))) return null
  return { programId, papaId: papaId as string | null, team: null }
}

export function getChatRoomId(scope: ChatRoomScope): string {
  if (scope.team) return `team:${scope.team}`
  if (scope.papaId) return `papa:${scope.papaId}`
  return `program:${scope.programId}`
}
