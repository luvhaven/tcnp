import { isPlatformAdministrator } from '@/lib/utils'

export type ConversationScope = { programId?: string | null; papaId?: string | null; team?: string | null }
export type ConversationMessage = {
  id: string
  sender_id: string
  content: string
  created_at: string
  program_id?: string | null
  papa_id?: string | null
  team?: string | null
  mentions?: unknown
  read_by?: unknown
  is_private?: boolean | null
  is_archived?: boolean | null
}

export function conversationKey(scope: ConversationScope): string {
  return scope.team ? `team:${scope.team}` : scope.papaId ? `papa:${scope.papaId}` : `program:${scope.programId ?? 'unavailable'}`
}

export function roomSearchParams(scope: ConversationScope): URLSearchParams {
  const params = new URLSearchParams()
  if (scope.programId) params.set('programId', scope.programId)
  if (scope.papaId) params.set('papaId', scope.papaId)
  if (scope.team) params.set('team', scope.team)
  return params
}

export function matchesConversation(message: ConversationMessage, scope: ConversationScope): boolean {
  if (scope.team) return message.team === scope.team && !message.program_id && !message.papa_id
  if (!scope.programId || message.program_id !== scope.programId || message.team) return false
  return (message.papa_id ?? null) === (scope.papaId ?? null)
}

export function chatIds(value: unknown): string[] {
  if (typeof value === 'string') {
    try { return chatIds(JSON.parse(value)) } catch { return [] }
  }
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

export function canReadChatMessage(message: ConversationMessage, user: { id: string; role?: string | null }): boolean {
  if (message.is_archived) return false
  return !message.is_private || message.sender_id === user.id || isPlatformAdministrator(user.role) || chatIds(message.mentions).includes(user.id)
}

/** Stable keyset pagination also handles many messages sent in the same instant. */
export function chatCursorFilter(cursor: { created_at: string; id: string }): string {
  if (!Number.isFinite(Date.parse(cursor.created_at)) || !/^[0-9a-f-]{36}$/i.test(cursor.id)) throw new Error('Invalid message cursor')
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
}

export function compareChatMessages(a: { created_at: string; id: string }, b: { created_at: string; id: string }): number {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
}

export function newChatMessageId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, letter => {
    const value = Math.floor(Math.random() * 16)
    return (letter === 'x' ? value : (value & 3) | 8).toString(16)
  })
}
