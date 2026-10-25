'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { uniqueTopic } from '@/lib/realtime/topic'
import { chatCursorFilter, chatIds, compareChatMessages, conversationKey, matchesConversation, roomSearchParams, type ConversationScope } from '@/lib/chat-conversation'
import type { ChatRoomMembersResponse } from '@/lib/chat-access'
import type { Message, Reaction } from '@/components/chat/MessageBubble'

type WireMessage = Message & { program_id: string | null; papa_id: string | null; team: string | null }
type ReactionRow = { message_id: string; user_id: string; emoji: string }
export type OutgoingChatMessage = { id: string; content: string; mentions: string[]; isPrivate: boolean; replyId: string | null }
export class ChatRoomError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ChatRoomError' }
}

export async function getChatRoomMembers(scope: ConversationScope, signal?: AbortSignal): Promise<ChatRoomMembersResponse> {
  const response = await fetch(`/api/chat/room-members?${roomSearchParams(scope)}`, { signal, cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ChatRoomError(body.error || 'This conversation is unavailable.', response.status)
  return body
}

function normalizeMessage(row: any): WireMessage {
  return {
    ...row,
    created_at: row.created_at || new Date().toISOString(),
    mentions: chatIds(row.mentions), read_by: chatIds(row.read_by),
    users: {
      full_name: row.users?.full_name || 'Officer',
      oscar: row.users?.oscar || '', role: row.users?.role || '',
    },
  }
}

const SELECT_MESSAGE = '*, users:sender_id(full_name, oscar, role)'
const PAGE_SIZE = 50

export function useChatConversation(scope: ConversationScope) {
  const { programId, papaId, team } = scope
  const roomKey = conversationKey(scope)
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { data: me, isLoading: userLoading } = useCurrentUser()
  const [messages, setMessages] = useState<WireMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting')
  const messagesRef = useRef<WireMessage[]>([])
  const mountedRef = useRef(true)
  const pageLock = useRef(false)
  const actionLock = useRef(false)
  const reactionLocks = useRef(new Set<string>())
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null)
  const historyGeneration = useRef(0)
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const memberKey = useMemo(() => ['chat-room-members', me?.id, roomKey], [me?.id, roomKey])
  const membersQuery = useQuery({
    queryKey: memberKey,
    queryFn: ({ signal }) => getChatRoomMembers({ programId, papaId, team }, signal),
    enabled: Boolean(me && (programId || team)),
    staleTime: 0, refetchInterval: 15_000, retry: false,
  })
  const denied = membersQuery.error instanceof ChatRoomError && [401, 403, 404, 409].includes(membersQuery.error.status)
  const allowed = Boolean(membersQuery.data) && !denied
  const allowedRef = useRef(false)
  useEffect(() => { allowedRef.current = allowed }, [allowed])

  const scopeQuery = useCallback((query: any) => {
    if (team) return query.eq('team', team).is('program_id', null).is('papa_id', null)
    query = query.eq('program_id', programId).is('team', null)
    return papaId ? query.eq('papa_id', papaId) : query.is('papa_id', null)
  }, [programId, papaId, team])

  const loadMessages = useCallback(async () => {
    if (!allowedRef.current) return
    const generation = ++historyGeneration.current
    // Reconnecting must replace history: edits, deletions and access changes
    // may have happened while this client could not receive room events.
    setMessages([])
    messagesRef.current = []
    cursorRef.current = null
    setHasMore(false)
    setLoading(true)
    setError(null)
    try {
      const { data, error: readError } = await scopeQuery(supabase.from('chat_messages').select(SELECT_MESSAGE))
        .or('is_archived.is.null,is_archived.eq.false')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE)
      if (readError) throw readError
      if (!mountedRef.current || !allowedRef.current || generation !== historyGeneration.current) return
      const rows = (data || []).map(normalizeMessage).sort(compareChatMessages)
      cursorRef.current = rows[0] ?? null
      setHasMore(rows.length === PAGE_SIZE)
      setMessages(rows)
    } catch {
      if (mountedRef.current && generation === historyGeneration.current) setError('Messages could not load. Check your connection and retry.')
    } finally {
      if (mountedRef.current && generation === historyGeneration.current) setLoading(false)
    }
  }, [supabase, scopeQuery])

  useEffect(() => {
    if (allowed) { allowedRef.current = true; void loadMessages() }
    else if (denied) { historyGeneration.current += 1; setMessages([]); setLoading(false) }
  }, [allowed, denied, loadMessages])

  const loadEarlier = useCallback(async () => {
    if (!cursorRef.current || !allowedRef.current || pageLock.current) return
    pageLock.current = true
    const generation = historyGeneration.current
    setLoadingEarlier(true)
    try {
      const { data, error: readError } = await scopeQuery(supabase.from('chat_messages').select(SELECT_MESSAGE))
        .or('is_archived.is.null,is_archived.eq.false').or(chatCursorFilter(cursorRef.current))
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE)
      if (readError) throw readError
      if (!mountedRef.current || !allowedRef.current || generation !== historyGeneration.current) return
      const rows = (data || []).map(normalizeMessage).sort(compareChatMessages)
      if (rows.length) cursorRef.current = rows[0]
      setHasMore(rows.length === PAGE_SIZE)
      setMessages(previous => {
        const map = new Map(previous.map(message => [message.id, message]))
        rows.forEach((message: WireMessage) => map.set(message.id, message))
        return [...map.values()].sort(compareChatMessages)
      })
    } catch { throw new Error('Earlier messages could not load. Please retry.') }
    finally { pageLock.current = false; if (mountedRef.current) setLoadingEarlier(false) }
  }, [supabase, scopeQuery])

  const reactionIds = useMemo(() => messages.map(message => message.id).join(','), [messages])
  const reactionKey = useMemo(() => ['chat-reactions', me?.id, roomKey], [me?.id, roomKey])
  const reactionsQuery = useQuery({
    queryKey: [...reactionKey, reactionIds],
    queryFn: async () => {
      const ids = reactionIds.split(',').filter(Boolean)
      const result: Record<string, Reaction[]> = {}
      for (let start = 0; start < ids.length; start += 100) {
        for (let offset = 0; ; offset += 500) {
          const { data, error: reactionError } = await (supabase as any).from('message_reactions')
            .select('message_id,user_id,emoji').in('message_id', ids.slice(start, start + 100))
            .order('id').range(offset, offset + 499)
          if (reactionError) throw reactionError
          const rows = (data ?? []) as ReactionRow[]
          for (const row of rows) {
            const list = result[row.message_id] ??= []
            const entry = list.find(item => item.emoji === row.emoji)
            if (entry) { entry.userIds.push(row.user_id); entry.count += 1 }
            else list.push({ emoji: row.emoji, count: 1, userIds: [row.user_id] })
          }
          if (rows.length < 500) break
        }
      }
      return result
    },
    enabled: allowed && Boolean(reactionIds), staleTime: 10_000, refetchInterval: 30_000,
  })

  const reconcileMessage = useCallback(async (id: string) => {
    const generation = historyGeneration.current
    const { data, error: readError } = await scopeQuery(supabase.from('chat_messages').select(SELECT_MESSAGE)).eq('id', id).maybeSingle()
    if (!mountedRef.current || !allowedRef.current || generation !== historyGeneration.current || readError) return
    setMessages(previous => {
      if (!data || data.is_archived) return previous.filter(message => message.id !== id)
      const message = normalizeMessage(data)
      const map = new Map(previous.map(item => [item.id, item]))
      map.set(id, message)
      return [...map.values()].sort(compareChatMessages)
    })
  }, [supabase, scopeQuery])

  const reconcileVisibleHistory = useCallback(async () => {
    if (!allowedRef.current || document.visibilityState !== 'visible') return
    const generation = historyGeneration.current
    const ids = messagesRef.current.map(message => message.id)
    if (!ids.length) return
    const visible = new Set<string>()
    try {
      // A row which becomes unreadable can disappear from Postgres Changes
      // before its final UPDATE reaches us. Recheck ids without resetting scroll.
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error: readError } = await scopeQuery(supabase.from('chat_messages').select('id'))
          .in('id', ids.slice(offset, offset + 100)).or('is_archived.is.null,is_archived.eq.false')
        if (readError) return
        for (const row of data ?? []) visible.add(row.id)
      }
      if (!mountedRef.current || !allowedRef.current || generation !== historyGeneration.current) return
      const checked = new Set(ids)
      setMessages(previous => {
        const next = previous.filter(message => !checked.has(message.id) || visible.has(message.id))
        return next.length === previous.length ? previous : next
      })
    } catch { /* A temporary consistency-check failure keeps the current view. */ }
  }, [supabase, scopeQuery])

  useEffect(() => {
    if (!allowed || !me?.id) return
    let cancelled = false
    let subscribed = false
    let interrupted = false
    const filter = team ? `team=eq.${team}` : `program_id=eq.${programId}`
    const channel = supabase.channel(uniqueTopic(`chat-data-${roomKey}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter }, payload => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') {
          setMessages(previous => previous.filter(message => message.id !== payload.old.id))
        } else if (matchesConversation(payload.new as any, { programId, papaId, team })) {
          void reconcileMessage(payload.new.id)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, payload => {
        if (cancelled) return
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<ReactionRow>
        // DELETE can contain only the primary key with default replica identity.
        if ((payload.eventType === 'DELETE' && !row?.message_id) || messagesRef.current.some(message => message.id === row?.message_id)) {
          void queryClient.invalidateQueries({ queryKey: reactionKey })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_room_memberships', filter: `user_id=eq.${me.id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: memberKey })
        void queryClient.invalidateQueries({ queryKey: ['chat-rooms'] })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'programs', ...(programId ? { filter: `id=eq.${programId}` } : {}) }, () => {
        void queryClient.invalidateQueries({ queryKey: memberKey })
        void queryClient.invalidateQueries({ queryKey: ['chat-rooms'] })
      })
      .subscribe(status => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          if (subscribed && interrupted) {
            void queryClient.invalidateQueries({ queryKey: memberKey })
            void loadMessages()
          }
          subscribed = true
          interrupted = false
        } else if (subscribed) interrupted = true
        setConnection(status === 'SUBSCRIBED' ? 'connected' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'reconnecting' : 'connecting')
      })
    const onOnline = () => {
      setConnection('reconnecting')
      void queryClient.invalidateQueries({ queryKey: memberKey })
      void loadMessages()
    }
    const onOffline = () => { interrupted = true; setConnection('offline') }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void queryClient.invalidateQueries({ queryKey: memberKey })
      void reconcileVisibleHistory()
    }
    const consistencyTimer = window.setInterval(() => { void reconcileVisibleHistory() }, 15_000)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    if (!navigator.onLine) setConnection('offline')
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(consistencyTimer)
      void supabase.removeChannel(channel)
    }
  }, [allowed, me?.id, programId, papaId, team, roomKey, supabase, reconcileMessage, reconcileVisibleHistory, queryClient, reactionKey, memberKey, loadMessages])

  const notifyMentions = useCallback(async (messageId: string) => {
    try {
      await fetch('/api/chat/mention-notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId }),
      })
    } catch { /* A notification failure never resends a delivered chat message. */ }
  }, [])

  const sendMessage = useCallback(async (draft: OutgoingChatMessage) => {
    if (!me || !allowedRef.current) throw new ChatRoomError('You no longer have access to this conversation.', 403)
    if (actionLock.current) throw new Error('A message is already being sent.')
    actionLock.current = true
    try {
      const memberIds = new Set(membersQuery.data?.members.map(member => member.id))
      const mentions = [...new Set(draft.mentions)].filter(id => memberIds.has(id) && id !== me.id)
      if (draft.isPrivate && !mentions.length) throw new Error('Choose a current room member before sending a restricted message.')
      const payload = {
        id: draft.id, sender_id: me.id, content: draft.content.trim(), mentions,
        is_private: draft.isPrivate && mentions.length > 0,
        program_id: programId || null, papa_id: papaId || null, team: team || null, reply_to_id: draft.replyId,
      }
      const { data, error: sendError } = await supabase.from('chat_messages').insert(payload).select(SELECT_MESSAGE).single()
      if (sendError) {
        // Retrying an uncertain network response uses the same id, never a second message.
        if (sendError.code !== '23505') throw sendError
        const { data: existing, error: existingError } = await scopeQuery(supabase.from('chat_messages').select(SELECT_MESSAGE)).eq('id', draft.id).eq('sender_id', me.id).single()
        if (existingError || !existing) throw sendError
        if (mountedRef.current) setMessages(previous => [...previous.filter(message => message.id !== existing.id), normalizeMessage(existing)].sort(compareChatMessages))
        if (chatIds(existing.mentions).length) void notifyMentions(existing.id)
        return
      }
      if (data && mountedRef.current) setMessages(previous => [...previous.filter(message => message.id !== data.id), normalizeMessage(data)].sort(compareChatMessages))
      if (mentions.length && data?.id) void notifyMentions(data.id)
    } finally { actionLock.current = false }
  }, [me, membersQuery.data, programId, papaId, team, supabase, scopeQuery, notifyMentions])

  const editMessage = useCallback(async (id: string, content: string) => {
    if (!allowedRef.current) throw new ChatRoomError('This conversation is unavailable.', 403)
    const { error: editError } = await (supabase as any).rpc('edit_room_chat_message', { message_id: id, new_content: content.trim() })
    if (editError) throw editError
    await reconcileMessage(id)
  }, [supabase, reconcileMessage])

  const deleteMessage = useCallback(async (id: string, permanently = false) => {
    if (!allowedRef.current) throw new ChatRoomError('This conversation is unavailable.', 403)
    const response = await fetch(permanently ? `/api/admin/chat?messageId=${encodeURIComponent(id)}` : '/api/admin/chat', {
      method: permanently ? 'DELETE' : 'POST',
      ...(!permanently ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'soft_delete', messageId: id }) } : {}),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'This message could not be removed.')
    if (permanently) setMessages(previous => previous.filter(message => message.id !== id))
    else await reconcileMessage(id)
  }, [reconcileMessage])

  const toggleReaction = useCallback(async (id: string, emoji: string) => {
    if (!me || !allowedRef.current) return
    const key = `${id}:${emoji}`
    if (reactionLocks.current.has(key)) return
    reactionLocks.current.add(key)
    try {
      const mine = reactionsQuery.data?.[id]?.find(reaction => reaction.emoji === emoji)?.userIds.includes(me.id)
      const { error: reactionError } = mine
        ? await (supabase as any).from('message_reactions').delete().eq('message_id', id).eq('user_id', me.id).eq('emoji', emoji)
        : await (supabase as any).from('message_reactions').insert({ message_id: id, user_id: me.id, emoji })
      if (reactionError && reactionError.code !== '23505') throw reactionError
      await queryClient.invalidateQueries({ queryKey: reactionKey })
    } finally { reactionLocks.current.delete(key) }
  }, [me, reactionsQuery.data, supabase, queryClient, reactionKey])

  const markRead = useCallback(async (ids: string[]) => {
    if (!me || !allowedRef.current || document.visibilityState !== 'visible') return
    const uniqueIds = [...new Set(ids)]
    for (let offset = 0; offset < uniqueIds.length; offset += 100) {
      if (!allowedRef.current || document.visibilityState !== 'visible') return
      const { error: readError } = await (supabase as any).rpc('mark_chat_messages_read', { message_ids: uniqueIds.slice(offset, offset + 100) })
      if (readError) throw readError
    }
    window.dispatchEvent(new Event('tcnp:chat-read'))
  }, [me, supabase])

  return {
    me, messages: allowed ? messages : [], members: membersQuery.data?.members ?? [], membersData: membersQuery.data,
    loading: userLoading || membersQuery.isPending || (allowed && loading),
    error: membersQuery.error && !denied ? 'Conversation access could not be checked. Please retry.' : error,
    denied, allowed, hasMore, loadingEarlier, connection,
    reactions: reactionsQuery.data ?? {},
    retry: () => { void membersQuery.refetch(); if (allowed) void loadMessages() },
    loadEarlier, sendMessage, editMessage, deleteMessage, toggleReaction, markRead,
  }
}
