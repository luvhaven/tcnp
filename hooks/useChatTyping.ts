'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatRoomMember } from '@/lib/chat-access'

// Serialize cleanup before rejoining a topic. This also handles Strict Mode's
// setup/cleanup/setup cycle without reusing a channel that is still leaving.
const topicTasks = new Map<string, Promise<void>>()

export function useChatTyping(roomKey: string, userId: string | undefined, members: ChatRoomMember[], enabled: boolean) {
  const supabase = useMemo(() => createClient(), [])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastSent = useRef(0)
  const [typing, setTyping] = useState<Record<string, number>>({})
  const memberIds = useMemo(() => new Set(members.map(member => member.id)), [members])
  const memberIdsRef = useRef(memberIds)
  useEffect(() => { memberIdsRef.current = memberIds }, [memberIds])

  useEffect(() => {
    if (!enabled || !userId) return
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    const topic = `chat-room:${roomKey}`
    const setup = (topicTasks.get(topic) ?? Promise.resolve()).then(() => {
      if (cancelled) return
      channel = supabase.channel(topic, { config: { private: true, broadcast: { self: false } } })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (cancelled || typeof payload?.userId !== 'string' || payload.userId === userId || !memberIdsRef.current.has(payload.userId)) return
          setTyping(previous => ({ ...previous, [payload.userId]: Date.now() }))
        }).subscribe()
      channelRef.current = channel
    }).catch(() => { /* Typing is optional; the conversation remains usable. */ })
    topicTasks.set(topic, setup)
    const expiry = setInterval(() => {
      const now = Date.now()
      setTyping(previous => {
        const next = Object.fromEntries(Object.entries(previous).filter(([id, time]) => now - time < 3500 && memberIdsRef.current.has(id)))
        return Object.keys(next).length === Object.keys(previous).length ? previous : next
      })
    }, 1200)
    return () => {
      cancelled = true
      clearInterval(expiry)
      const cleanup = setup.then(async () => {
        if (channel) await supabase.removeChannel(channel)
        if (channelRef.current === channel) channelRef.current = null
      }).catch(() => {})
      topicTasks.set(topic, cleanup)
      void cleanup.then(() => { if (topicTasks.get(topic) === cleanup) topicTasks.delete(topic) })
    }
  }, [enabled, roomKey, userId, supabase])

  const announce = useCallback(() => {
    if (!enabled || !userId || !channelRef.current || Date.now() - lastSent.current < 1800) return
    lastSent.current = Date.now()
    // No draft content, names or private message data is broadcast.
    void channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId } }).catch(() => {})
  }, [enabled, userId])

  return {
    announce,
    names: enabled ? members.filter(member => typing[member.id]).map(member => member.full_name?.split(' ')[0] || 'An officer') : [],
  }
}
