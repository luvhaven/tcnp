'use client'

import React, { useEffect, useLayoutEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { AlertCircle, MessageCircle, Send, Users, AtSign, Lock, Loader2, ChevronDown, Trash2, CornerUpLeft, Pencil, X, Smile, Search } from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow, isToday, isYesterday, isSameDay } from 'date-fns'
import { MessageBubble } from './MessageBubble'
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  RealtimePresenceState
} from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { notificationService } from '@/lib/services/notificationService'
import { isAdmin, effectiveOscarRole } from '@/lib/utils'

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row']
type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert']
type NotificationInsert = Database['public']['Tables']['notifications']['Insert']

type Reaction = { emoji: string; count: number; userIds: string[] }
type ReactionMap = Record<string, Reaction[]>
type TimelineItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'unread'; id: string }
  | { kind: 'msg'; id: string; msg: Message; isFirst: boolean; isLast: boolean }

const QUICK_REACTIONS = ['\uD83D\uDC4D', '\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDD25'] as const

function formatDateLabel(d: Date): string {
  if (!d || isNaN(d.getTime())) return 'Recent'
  try {
    if (isToday(d)) return 'Today'
    if (isYesterday(d)) return 'Yesterday'
    return format(d, 'EEEE, MMMM d')
  } catch {
    return 'Recent'
  }
}

function renderContent(content: string, searchQuery: string): React.ReactNode {
  const parts = content.split(/(@@?[\w]+(?:\s[\w]+)?)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@@')) return <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[0.78em] font-semibold mx-0.5"><Lock className="inline h-2.5 w-2.5" />{part}</span>
    if (part.startsWith('@') && part.length > 1) return <span key={i} className="inline-flex items-center rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[0.78em] font-semibold mx-0.5">{part}</span>
    if (searchQuery && part) {
      const segs = part.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
      return segs.map((seg, j) => seg.toLowerCase() === searchQuery.toLowerCase()
        ? <mark key={`${i}-${j}`} className="bg-yellow-300/80 dark:bg-yellow-500/50 text-foreground rounded px-0.5">{seg}</mark>
        : seg)
    }
    return part
  })
}

function buildTimeline(msgs: Message[], firstUnreadId: string | null): TimelineItem[] {
  const items: TimelineItem[] = []
  let lastDate: Date | null = null
  let lastSenderId: string | null = null
  let lastTime: number | null = null
  const GAP = 5 * 60 * 1000
  msgs.forEach((msg, i) => {
    const rawDate = msg?.created_at ? new Date(msg.created_at) : new Date()
    const d = isNaN(rawDate.getTime()) ? new Date() : rawDate
    if (!lastDate || !isSameDay(d, lastDate)) {
      items.push({ kind: 'date', id: `date-${msg.id}`, label: formatDateLabel(d) })
      lastDate = d; lastSenderId = null; lastTime = null
    }
    if (msg.id === firstUnreadId) items.push({ kind: 'unread', id: 'unread-divider' })
    const gap = lastTime ? d.getTime() - lastTime : Infinity
    const isFirst = lastSenderId !== msg.sender_id || gap > GAP
    const next = msgs[i + 1]
    const nextRaw = next?.created_at ? new Date(next.created_at) : null
    const nextTime = nextRaw && !isNaN(nextRaw.getTime()) ? nextRaw.getTime() : null
    const nextGap = nextTime !== null ? nextTime - d.getTime() : Infinity
    const isLast = !next || next.sender_id !== msg.sender_id || nextGap > GAP
    items.push({ kind: 'msg', id: msg.id, msg, isFirst, isLast })
    lastSenderId = msg.sender_id; lastTime = d.getTime()
  })
  return items
}

type RawMessage = ChatMessageRow & {
  users?: {
    full_name: string
    oscar: string
    role: string
  }
}

const pickFirstNonEmpty = (...values: (string | null | undefined)[]) => {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }
  return null
}

const resolveDisplayName = (
  fullName?: string | null,
  oscar?: string | null,
  role?: string | null,
  fallback = 'Unknown User'
) => {
  return pickFirstNonEmpty(fullName, oscar, role) ?? fallback
}

const parseJsonArray = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : []
    } catch {
      return []
    }
  }
  return []
}

type MessageUserMeta = {
  full_name: string
  oscar: string
  role: string
}

type Message = {
  id: string
  sender_id: string
  content: string
  mentions: string[]
  read_by: string[]
  is_private: boolean
  created_at: string
  reply_to_id?: string | null
  is_archived?: boolean
  deleted_at?: string | null
  deleted_by_admin?: boolean
  edited_at?: string | null
  users: MessageUserMeta
}


type User = {
  id: string
  full_name: string
  oscar: string
  role: string
  is_online: boolean
  last_seen: string | null
}

type ChatParticipant = {
  id: string
  full_name: string
  oscar: string
  role: string
  is_online: boolean | null
  last_seen: string | null
}

export default function ChatSystem({
  programId,
  papaId,
  initialMessage,
  roomLabel
}: {
  programId?: string;
  papaId?: string;
  initialMessage?: string;
  roomLabel?: string;
}) {
  const supabase = useMemo(() => createClient(), [])
  const confirm = useConfirm()
  const searchParams = useSearchParams()
  const highlightId = searchParams?.get('highlight')
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const messagesRef = useRef<Message[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [newMessage, setNewMessage] = useState(initialMessage || '')
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [messageLoadError, setMessageLoadError] = useState<string | null>(null)
  const [showUserList, setShowUserList] = useState(false)
  const [selectedMentions, setSelectedMentions] = useState<string[]>([])
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionType, setMentionType] = useState<'@' | '@@'>('@')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const markedMessagesRef = useRef<Set<string>>(new Set())
  const missingUsersRef = useRef<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const oldestTimestampRef = useRef<string | null>(null)
  const [canChatInProgram, setCanChatInProgram] = useState(true)
  const [programAccessChecked, setProgramAccessChecked] = useState(false)
  const [reactions, setReactions] = useState<ReactionMap>({})
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Handlers inside the realtime subscription read these refs so the channel is
  // created once per room instead of again whenever the user record loads.
  const currentUserRef = useRef<any>(null)
  const isAtBottomRef = useRef(true)
  const loadRequestRef = useRef(0)
  const sendingRef = useRef(false)
  const [sending, setSending] = useState(false)
  const highlightDoneRef = useRef(false)
  const prependAnchorRef = useRef<number | null>(null)

  const userDirectory = useMemo<Record<string, MessageUserMeta>>(() => {
    const directory: Record<string, MessageUserMeta> = {}

    users.forEach((user) => {
      directory[user.id] = {
        full_name: user.full_name,
        oscar: user.oscar,
        role: user.role
      }
    })

    if (currentUser?.id) {
      directory[currentUser.id] = {
        full_name: currentUser.full_name ?? 'You',
        oscar: currentUser.oscar ?? '',
        role: currentUser.role ?? ''
      }
    }

    return directory
  }, [users, currentUser])

  const ensureUserProfile = useCallback(async (userId: string) => {
    if (!userId) return
    if (userDirectory[userId]) return
    if (missingUsersRef.current.has(userId)) return

    missingUsersRef.current.add(userId)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, oscar, role, last_seen')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('Failed to fetch user profile for message sender:', { userId, error })
        return
      }

      if (data) {
        const userData = data as { id: string, full_name: string | null, oscar: string | null, role: string | null, last_seen: string | null }
        setUsers((prev: User[]) => {
          if (prev.some((user) => user.id === userId)) {
            return prev.map((user) =>
              user.id === userId
                ? {
                  ...user,
                  full_name: userData.full_name || user.full_name || 'Unknown User',
                  oscar: userData.oscar || user.oscar,
                  role: userData.role || user.role
                }
                : user
            )
          }

          return [
            ...prev,
            {
              id: userData.id,
              full_name: userData.full_name || 'Unknown User',
              oscar: userData.oscar || '',
              role: userData.role || '',
              is_online: false,
              last_seen: userData.last_seen
            }
          ]
        })
      }
    } catch (error) {
      console.error('Unexpected error fetching user profile:', { userId, error })
    } finally {
      missingUsersRef.current.delete(userId)
    }
  }, [supabase, userDirectory])

  const evaluateProgramAccess = useCallback(async () => {
    // Global chat or no specific program: allow by default
    if (!programId) {
      setCanChatInProgram(true)
      setProgramAccessChecked(true)
      return
    }

    if (!currentUser?.id) {
      setCanChatInProgram(false)
      setProgramAccessChecked(true)
      return
    }

    const isUserAdmin = isAdmin(currentUser.role) || isAdmin(effectiveOscarRole(currentUser.role, currentUser.oscar))
    if (isUserAdmin) {
      setCanChatInProgram(true)
      setProgramAccessChecked(true)
      return
    }

    if (currentUser.is_active === false || currentUser.activation_status === 'deactivated') {
      setCanChatInProgram(false)
      setProgramAccessChecked(true)
      return
    }

    try {
      setProgramAccessChecked(false)

      // 1. Check title_assignments directly
      const { data: titleData } = await (supabase as any)
        .from('title_assignments')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('program_id', programId)
        .eq('is_active', true)
        .limit(1)

      if (Array.isArray(titleData) && titleData.length > 0) {
        setCanChatInProgram(true)
        return
      }

      // 2. Check current_title_assignments view
      const { data: currentData } = await (supabase as any)
        .from('current_title_assignments')
        .select('program_id')
        .eq('user_id', currentUser.id)
        .eq('program_id', programId)
        .limit(1)

      if (Array.isArray(currentData) && currentData.length > 0) {
        setCanChatInProgram(true)
        return
      }

      // 3. Check journey assignments under this program
      const { data: journeyData } = await (supabase as any)
        .from('journeys')
        .select('id')
        .eq('program_id', programId)
        .eq('assigned_duty_officer_id', currentUser.id)
        .limit(1)

      if (Array.isArray(journeyData) && journeyData.length > 0) {
        setCanChatInProgram(true)
        return
      }

      // 4. Any active protocol officer in an active or planning program has chat access
      const { data: progData } = await supabase
        .from('programs')
        .select('status')
        .eq('id', programId)
        .single()

      if (progData && ['active', 'planning'].includes(progData.status)) {
        setCanChatInProgram(true)
        return
      }

      setCanChatInProgram(false)
    } catch (error) {
      console.error('Unexpected error checking program chat access:', error)
      setCanChatInProgram(currentUser?.is_active !== false)
    } finally {
      setProgramAccessChecked(true)
    }
  }, [supabase, programId, currentUser?.id, currentUser?.role, currentUser?.oscar, currentUser?.is_active, currentUser?.activation_status])

  useEffect(() => {
    void evaluateProgramAccess()
  }, [evaluateProgramAccess])

  const playNotification = useCallback(() => {
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()

      oscillator.type = 'triangle'
      oscillator.frequency.value = 880
      gainNode.gain.value = 0.15

      oscillator.connect(gainNode)
      gainNode.connect(context.destination)

      oscillator.start()
      oscillator.stop(context.currentTime + 0.15)

      if ('vibrate' in navigator) {
        navigator.vibrate(120)
      }
    } catch (error) {
      console.error('Notification playback failed:', error)
    }
  }, [])

  const transformMessage = useCallback((message: RawMessage): Message => {
    const mentions = parseJsonArray(message.mentions)
    const readBy = parseJsonArray(message.read_by)

    // Safely extract user metadata with fallbacks
    let userMeta: MessageUserMeta = { full_name: 'Unknown User', oscar: '', role: '' }

    if (message.users) {
      userMeta = {
        full_name: message.users.full_name || 'Unknown User',
        oscar: message.users.oscar || '',
        role: message.users.role || ''
      }
    } else if (message.sender_id && userDirectory[message.sender_id]) {
      userMeta = userDirectory[message.sender_id]
    }

    if (userMeta.full_name === 'Unknown User' && message.sender_id) {
      void ensureUserProfile(message.sender_id)
    }

    return {
      id: message.id,
      sender_id: message.sender_id,
      content: message.content,
      mentions,
      read_by: readBy,
      is_private: Boolean(message.is_private),
      is_archived: Boolean((message as any).is_archived),
      deleted_at: (message as any).deleted_at ?? null,
      deleted_by_admin: Boolean((message as any).deleted_by_admin),
      created_at: message.created_at ?? new Date().toISOString(),
      reply_to_id: (message as any).reply_to_id ?? null,
      edited_at: (message as any).edited_at ?? null,
      users: userMeta
    }
  }, [userDirectory, ensureUserProfile])


  useEffect(() => {
    setMessages((prev) =>
      prev.map((message) => {
        const directoryMeta = userDirectory[message.sender_id]
        if (!directoryMeta) return message

        if (
          message.users.full_name === directoryMeta.full_name &&
          message.users.oscar === directoryMeta.oscar &&
          message.users.role === directoryMeta.role
        ) {
          return message
        }

        return {
          ...message,
          users: directoryMeta
        }
      })
    )
  }, [userDirectory])

  const upsertMessage = useCallback((items: Message[], message: Message) => {
    const getSafeTime = (val?: string | null) => {
      if (!val) return 0
      const t = new Date(val).getTime()
      return isNaN(t) ? 0 : t
    }
    const index = items.findIndex((m) => m.id === message.id)
    if (index !== -1) {
      const next = [...items]
      next[index] = message
      return next.sort(
        (a, b) => getSafeTime(a.created_at) - getSafeTime(b.created_at)
      )
    }
    return [...items, message].sort(
      (a, b) => getSafeTime(a.created_at) - getSafeTime(b.created_at)
    )
  }, [])

  // updatePresenceFlags was removed because PresenceHeartbeat handles it globally

  // Read receipts are queued and flushed in one batch, and only while the tab is
  // visible: marking 50 history messages used to fire 50 RPCs on every render.
  const readQueueRef = useRef<Set<string>>(new Set())
  const readFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushReadQueue = useCallback(async () => {
    readFlushTimerRef.current = null
    const userId = currentUserRef.current?.id
    if (!userId || typeof document === 'undefined' || document.visibilityState !== 'visible') return
    const ids = Array.from(readQueueRef.current)
    readQueueRef.current.clear()
    await Promise.all(ids.map(async (id) => {
      const { error } = await (supabase as any).rpc('mark_message_read', { message_uuid: id, user_uuid: userId })
      if (error) markedMessagesRef.current.delete(id)
    }))
    if (ids.length) window.dispatchEvent(new Event('tcnp:chat-read'))
  }, [supabase])

  const markMessageRead = useCallback((message: Message) => {
    const userId = currentUserRef.current?.id
    if (!userId) return
    if (message.sender_id === userId) return
    if (message.read_by.includes(userId)) return
    if (markedMessagesRef.current.has(message.id)) return

    markedMessagesRef.current.add(message.id)
    readQueueRef.current.add(message.id)
    if (!readFlushTimerRef.current) {
      readFlushTimerRef.current = setTimeout(() => { void flushReadQueue() }, 1200)
    }
  }, [flushReadQueue])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && readQueueRef.current.size > 0) void flushReadQueue()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      if (readFlushTimerRef.current) clearTimeout(readFlushTimerRef.current)
    }
  }, [flushReadQueue])

  const isRecentlySeen = (lastSeen: string | null): boolean => {
    if (!lastSeen) return false
    const ms = new Date().getTime() - new Date(lastSeen).getTime()
    return ms < 3 * 60 * 1000 // 3 minutes
  }

  const loadParticipants = useCallback(async () => {
    try {
      // Query users directly to get profile and presence metadata.
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, oscar, role, last_seen, is_online')
        .eq('is_active', true)
        .order('full_name')

      if (error) throw error

      const participants = (data ?? []) as (ChatParticipant & { is_online: boolean | null })[]

      setUsers((prev: User[]) => {
        const merged = new Map<string, User>()
        prev.forEach((user) => merged.set(user.id, user))

        participants.forEach((participant) => {
          const existing = merged.get(participant.id)
          // The `is_online` DB flag is set true on mount/focus but only cleared via
          // `beforeunload`, which doesn't reliably fire (mobile backgrounding, force-quit,
          // dropped connection) — it gets stuck true for days. Trust last_seen recency only.
          const isOnline = isRecentlySeen(participant.last_seen ?? null)

          merged.set(participant.id, {
            id: participant.id,
            full_name: participant.full_name || existing?.full_name || 'Unknown',
            oscar: participant.oscar || existing?.oscar || '',
            role: participant.role || existing?.role || '',
            is_online: isOnline,
            last_seen: participant.last_seen ?? existing?.last_seen ?? null
          })
        })

        return Array.from(merged.values())
      })
    } catch (error) {
      console.error('Error loading chat participants:', error)
    }
  }, [supabase])


  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({})
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastTypingBroadcastRef = useRef<number>(0)

  // Cleanup old typing statuses
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingUsers(prev => {
        const next = { ...prev }
        let changed = false
        Object.entries(next).forEach(([userId, timestamp]) => {
          if (now - timestamp > 3000) {
            delete next[userId]
            changed = true
          }
        })
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleTyping = useCallback(async () => {
    if (!channelRef.current || !currentUser?.id) return

    const now = Date.now()
    if (now - lastTypingBroadcastRef.current < 2000) return // Debounce 2s

    lastTypingBroadcastRef.current = now
    await channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: currentUser.id,
        fullName: currentUser.full_name || 'Someone'
      }
    })
  }, [currentUser])

  useEffect(() => {
    let mounted = true

    // Load current user first, then set up subscriptions
    const initializeChat = async () => {
      await loadCurrentUser()
      if (!mounted) return
      await loadMessages()
      if (!mounted) return
      await loadParticipants()
    }

    void initializeChat()

    // Unique per mount: realtime-js hands back an existing channel for a reused
    // topic, and a second mount would then attach callbacks to a subscribed channel.
    const channel = supabase.channel(
      `chat-messages-${programId || 'global'}-${papaId || 'none'}-${Math.random().toString(36).slice(2, 8)}`,
      { config: { broadcast: { self: false } } }
    )

    const handlePayload = async (
      payload: RealtimePostgresChangesPayload<ChatMessageRow>
    ) => {
      if (!mounted) return

      const newRow = payload.new as ChatMessageRow

      if (payload.eventType === 'DELETE') {
        if (mounted && payload.old?.id) {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id))
        }
        return
      }

      // Context filtering
      if (papaId) {
        if (newRow.papa_id !== papaId) return
      } else if (programId) {
        if (newRow.program_id !== programId || newRow.papa_id !== null) return
      } else {
        // Team-room messages also have no program/papa; keep them out of global chat.
        if (newRow.program_id !== null || newRow.papa_id !== null || (newRow as any).team != null) return
      }

      const raw = payload.new as RawMessage

      // For INSERT events, fetch the full message with user data
      if (payload.eventType === 'INSERT' && raw.id) {
        try {
          const { data: fullMessage, error } = await supabase
            .from('chat_messages')
            .select(`*, users:sender_id(full_name, oscar, role)`)
            .eq('id', raw.id)
            .single()

          if (!mounted) return

          if (!error && fullMessage) {
            const message = transformMessage(fullMessage as RawMessage)
            const isNew = !messagesRef.current.some(m => m.id === message.id)
            setMessages((prev) => {
              // Prevent duplicates
              if (prev.some(m => m.id === message.id)) return prev
              return upsertMessage(prev, message)
            })

            const me = currentUserRef.current?.id
            if (isNew && message.sender_id !== me) {
              if (isAtBottomRef.current) {
                markMessageRead(message)
              } else {
                // Reading history: count it for the jump button and mark where new ones start.
                setNewMsgCount(count => count + 1)
                setFirstUnreadId(current => current ?? message.id)
              }

              // Device notification for private messages only when the tab is hidden;
              // mentions already reach the user through useChatNotifications.
              if (message.is_private && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                const senderName = message.users?.full_name || 'Someone'
                void notificationService.notifyNewMessage(senderName, message.content, true)
              }
            }

            // Remove sender from typing
            setTypingUsers(prev => {
              const next = { ...prev }
              delete next[message.sender_id]
              return next
            })
            return
          }
        } catch (err) {
          console.error('❌ Error fetching full message:', err)
        }
      }

      // UPDATE: message was edited or read_by updated — refresh it in state
      if (payload.eventType === 'UPDATE' && mounted) {
        setMessages(prev => {
          const idx = prev.findIndex(m => m.id === newRow.id)
          if (idx !== -1) {
            const next = [...prev]
            next[idx] = {
              ...next[idx],
              content: newRow.content,
              read_by: parseJsonArray(newRow.read_by),
              mentions: parseJsonArray(newRow.mentions),
              is_archived: Boolean((newRow as any).is_archived),
              edited_at: (newRow as any).edited_at ?? next[idx].edited_at ?? null,
              deleted_at: (newRow as any).deleted_at ?? null,
              deleted_by_admin: Boolean((newRow as any).deleted_by_admin)
            }
            return next
          }
          return prev
        })
        return
      }

      // Fallback
      if (mounted && payload.eventType === 'INSERT') {
        const message = transformMessage(raw)
        setMessages((prev) => {
          if (prev.some(m => m.id === message.id)) return prev
          return upsertMessage(prev, message)
        })
      }
    }


    const subscriptionConfig: any = {
      event: '*',
      schema: 'public',
      table: 'chat_messages'
    }

    if (papaId) {
      subscriptionConfig.filter = `papa_id=eq.${papaId}`
    } else if (programId) {
      subscriptionConfig.filter = `program_id=eq.${programId}`
    }

    channel
      .on('postgres_changes', subscriptionConfig, handlePayload)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (!mounted) return
        const { userId } = payload.payload
        if (userId === currentUserRef.current?.id) return

        setTypingUsers(prev => ({
          ...prev,
          [userId]: Date.now()
        }))
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Chat subscription error:', status)
        }
      })

    channelRef.current = channel

    return () => {
      mounted = false
      supabase.removeChannel(channel)
      if (channelRef.current === channel) channelRef.current = null
    }
    // Handlers read the user through currentUserRef, so the channel is built once per room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, programId, papaId])

  useEffect(() => {
    currentUserRef.current = currentUser
  }, [currentUser])

  // Mark what is on screen as read while the reader is at the latest messages.
  useEffect(() => {
    if (!currentUser?.id || !isAtBottom) return
    messages.forEach((message) => markMessageRead(message))
  }, [messages, currentUser?.id, isAtBottom, markMessageRead])

  // Presence is a last_seen snapshot; refresh it on a timer instead of reloading
  // the participant list on every UPDATE to any user row (each heartbeat is one).
  useEffect(() => {
    if (!currentUser?.id) return
    const interval = setInterval(() => { void loadParticipants() }, 60 * 1000)
    return () => clearInterval(interval)
  }, [currentUser?.id, loadParticipants])

  // Auto-scroll behavior
  const shouldAutoScroll = useRef(true)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Runs before paint so the list never visibly jumps.
  useLayoutEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return

    // Older messages were prepended: keep the reader on the message they were looking at.
    if (prependAnchorRef.current !== null) {
      el.scrollTop = el.scrollHeight - prependAnchorRef.current
      prependAnchorRef.current = null
      return
    }

    if (highlightId && !highlightDoneRef.current && messages.some(m => m.id === highlightId)) {
      highlightDoneRef.current = true
      const target = document.getElementById(`msg-${highlightId}`)
      if (target) {
        target.scrollIntoView({ block: 'center' })
        setHighlightedMessageId(highlightId)
        setTimeout(() => setHighlightedMessageId(null), 2000)
      }
      return
    }

    if (shouldAutoScroll.current) el.scrollTop = el.scrollHeight
  }, [messages, highlightId])

  // Detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const atBottom = distanceFromBottom < 100
    shouldAutoScroll.current = atBottom
    isAtBottomRef.current = atBottom
    setIsAtBottom(atBottom)
    if (atBottom) { setNewMsgCount(0); setFirstUnreadId(null) }
  }, [])

  const jumpToBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    shouldAutoScroll.current = true
    isAtBottomRef.current = true
    setIsAtBottom(true); setNewMsgCount(0); setFirstUnreadId(null)
  }, [])

  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, oscar, role, email, is_active, activation_status')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Error loading current user:', error)
          return
        }

        setCurrentUser(data)
      }
    } catch (error) {
      console.error('Error in loadCurrentUser:', error)
    }
  }

  const loadMessages = async () => {
    // A slower response for the previous room must not overwrite this one.
    const requestId = ++loadRequestRef.current
    setLoadingMessages(true)
    setMessageLoadError(null)

    try {
      let query = supabase
        .from('chat_messages')
        .select(`
                      *,
                      users:sender_id(full_name, oscar, role)
                      `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (papaId) {
        query = query.eq('papa_id', papaId)
        if (programId) {
          query = query.eq('program_id', programId)
        }
      } else if (programId) {
        query = query.eq('program_id', programId).is('papa_id', null)
      } else {
        query = query.is('program_id', null).is('papa_id', null).is('team', null)
      }

      const { data, error } = await query
      if (requestId !== loadRequestRef.current) return

      if (error) throw error

      const rows = (data || []).reverse() // oldest first
      oldestTimestampRef.current = rows[0]?.created_at ?? null
      setHasMoreMessages(rows.length === 50)

      const transformedMessages = rows
        .map((msg) => {
          try {
            return transformMessage(msg as RawMessage)
          } catch (err) {
            console.error('Error transforming message:', msg, err)
            return null
          }
        })
        .filter((msg): msg is Message => msg !== null)

      setMessages(transformedMessages)
    } catch (error: any) {
      const supabaseError = error || {}
      console.error('Error loading messages:', {
        error: supabaseError,
        message: supabaseError.message,
        details: supabaseError.details,
        hint: supabaseError.hint,
        code: supabaseError.code,
        programId,
        papaId
      })

      const friendlyMessage =
        supabaseError.message ||
        supabaseError.details ||
        supabaseError.hint ||
        'Failed to load messages'

      if (requestId === loadRequestRef.current) setMessageLoadError(friendlyMessage)
    } finally {
      if (requestId === loadRequestRef.current) setLoadingMessages(false)
    }
  }

  const loadEarlierMessages = async () => {
    if (!oldestTimestampRef.current || loadingEarlier) return
    setLoadingEarlier(true)
    try {
      let query = supabase
        .from('chat_messages')
        .select(`*, users:sender_id(full_name, oscar, role)`)
        // lte + dedupe below: lt would skip messages sharing the boundary timestamp
        .lte('created_at', oldestTimestampRef.current)
        .order('created_at', { ascending: false })
        .limit(50)

      if (papaId) {
        query = query.eq('papa_id', papaId)
        if (programId) query = query.eq('program_id', programId)
      } else if (programId) {
        query = query.eq('program_id', programId).is('papa_id', null)
      } else {
        query = query.is('program_id', null).is('papa_id', null).is('team', null)
      }

      const { data, error } = await query
      if (error) throw error

      const rows = (data || []).reverse()
      const known = new Set(messagesRef.current.map(m => m.id))
      const fresh = rows.filter(row => !known.has(row.id))
      if (fresh.length > 0) {
        oldestTimestampRef.current = rows[0].created_at
        setHasMoreMessages(rows.length === 50)
        const earlier = fresh
          .map((msg) => { try { return transformMessage(msg as RawMessage) } catch { return null } })
          .filter((msg): msg is Message => msg !== null)
        const el = messagesContainerRef.current
        if (el) prependAnchorRef.current = el.scrollHeight - el.scrollTop
        setMessages(prev => [...earlier, ...prev])
      } else {
        setHasMoreMessages(false)
      }
    } catch (err: any) {
      toast.error('Failed to load earlier messages')
    } finally {
      setLoadingEarlier(false)
    }
  }

  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)

  // Cancel reply/edit when switching program or papa — start fresh in new context
  useEffect(() => {
    setReplyTo(null)
    setEditingMessage(null)
    setNewMessage('')
  }, [programId, papaId])

  const reactionsLoadedRef = useRef<Set<string>>(new Set())
  const reactionsRef = useRef<ReactionMap>({})
  useEffect(() => { reactionsRef.current = reactions }, [reactions])

  const loadReactions = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    const { data } = await (supabase as any).from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids)
    if (!data) return
    const map: ReactionMap = {}
    ids.forEach(id => { map[id] = [] })
      ; (data as { message_id: string; user_id: string; emoji: string }[]).forEach(r => {
        const ex = map[r.message_id].find(x => x.emoji === r.emoji)
        if (ex) { ex.count++; ex.userIds.push(r.user_id) }
        else map[r.message_id].push({ emoji: r.emoji, count: 1, userIds: [r.user_id] })
      })
    setReactions(prev => ({ ...prev, ...map }))
  }, [supabase])

  // Only fetch reactions for messages not loaded yet: read receipts and edits
  // change `messages` constantly and used to refetch every reaction each time.
  useEffect(() => {
    const ids = messages.map(m => m.id).filter(id => !reactionsLoadedRef.current.has(id))
    if (!ids.length) return
    ids.forEach(id => reactionsLoadedRef.current.add(id))
    void loadReactions(ids)
  }, [messages, loadReactions])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const userId = currentUserRef.current?.id
    if (!userId) return
    const hasReacted = reactionsRef.current[messageId]?.find(r => r.emoji === emoji)?.userIds.includes(userId) ?? false

    // Optimistic: update the chip immediately, then reconcile with the server.
    setReactions(prev => {
      const list = (prev[messageId] ?? []).map(r => ({ ...r, userIds: [...r.userIds] }))
      const entry = list.find(r => r.emoji === emoji)
      if (hasReacted && entry) {
        entry.userIds = entry.userIds.filter(id => id !== userId)
        entry.count = entry.userIds.length
      } else if (entry) {
        entry.userIds.push(userId)
        entry.count = entry.userIds.length
      } else {
        list.push({ emoji, count: 1, userIds: [userId] })
      }
      return { ...prev, [messageId]: list.filter(r => r.count > 0) }
    })

    const { error } = hasReacted
      ? await (supabase as any).from('message_reactions').delete().eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji)
      : await (supabase as any).from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji })
    if (error) toast.error('Could not update reaction')
    void loadReactions([messageId])
  }, [supabase, loadReactions])

  const handleDeleteMessage = useCallback(async (messageId: string, hardDelete: boolean = false) => {
    if (!currentUser?.id) return
    const isUserAdmin = isAdmin(currentUser.role) || isAdmin(effectiveOscarRole(currentUser.role, currentUser.oscar))

    if (hardDelete && isUserAdmin) {
      try {
        const response = await fetch(`/api/admin/chat?messageId=${encodeURIComponent(messageId)}`, {
          method: 'DELETE'
        })
        const res = await response.json()
        if (!response.ok) throw new Error(res.error || 'Could not delete message')
        setMessages(prev => prev.filter(m => m.id !== messageId))
        toast.success('Message permanently deleted')
        return
      } catch (err: any) {
        toast.error(err.message || 'Could not delete message')
        return
      }
    }

    const isOwner = messagesRef.current.find(m => m.id === messageId)?.sender_id === currentUser.id

    try {
      const response = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'soft_delete',
          messageId
        })
      })
      const res = await response.json()
      if (!response.ok) throw new Error(res.error || 'Could not delete message')

      const deletedAt = res.deleted_at || new Date().toISOString()
      const deletedByAdmin = res.deleted_by_admin ?? (!isOwner && isUserAdmin)
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted_at: deletedAt, deleted_by_admin: deletedByAdmin } : m))
      toast.success('Message deleted')
    } catch (err: any) {
      toast.error(err.message || 'Could not delete message')
    }
  }, [currentUser])

  const handleReply = useCallback((message: Message) => {
    setEditingMessage(null)
    setReplyTo(message)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  const handleEdit = useCallback((message: Message) => {
    setReplyTo(null)
    setEditingMessage(message)
    setNewMessage(message.content)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  const cancelReply = () => {
    setReplyTo(null)
  }

  const cancelEdit = () => {
    setEditingMessage(null)
    setNewMessage('')
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sendingRef.current) return

    if (!currentUser?.id) {
      toast.error('You must be logged in to send messages')
      return
    }

    const isUserAdmin = Boolean(
      currentUser && (isAdmin(currentUser.role) || isAdmin(effectiveOscarRole(currentUser.role, currentUser.oscar)))
    )

    if (programId && !isUserAdmin) {
      if (!programAccessChecked) {
        toast.warning('Checking your permission for this program. Please wait a moment and try again.')
        return
      }
      if (!canChatInProgram) {
        toast.error('You are not assigned to this program, so chat is read-only.')
        return
      }
    }

    const draft = newMessage
    sendingRef.current = true
    setSending(true)

    try {
      if (editingMessage) {
        if (draft.trim() === editingMessage.content.trim()) {
          cancelEdit()
          return
        }

        const { error } = await (supabase as any).rpc('edit_chat_message', {
          message_id: editingMessage.id,
          new_content: draft
        })

        if (error) {
          // Most often the edit window closed while typing; leave edit mode either way.
          toast.error('This message can no longer be edited.')
          cancelEdit()
          return
        }

        setMessages(prev => prev.map(m =>
          m.id === editingMessage.id
            ? { ...m, content: draft, edited_at: new Date().toISOString() }
            : m
        ))
        cancelEdit()
      } else {
        // Only keep mentions whose name is still in the text, so deleting an
        // @Name also drops the notification (and the private flag) for that person.
        const firstNameOf = (id: string) => users.find(u => u.id === id)?.full_name?.trim().split(/\s+/)[0]
        const sanitizedMentions = selectedMentions.filter((id) => {
          if (id === currentUser.id) return false
          const firstName = firstNameOf(id)
          return firstName ? draft.includes(`@${firstName}`) : false
        })
        const isPrivate = sanitizedMentions.some((id) => {
          const firstName = firstNameOf(id)
          return firstName ? draft.includes(`@@${firstName}`) : false
        })

        // Clear the composer straight away; the draft is restored if sending fails.
        setNewMessage('')
        setSelectedMentions([])
        const replyTarget = replyTo
        setReplyTo(null)

        const payload: ChatMessageInsert = {
          sender_id: currentUser.id,
          content: draft,
          mentions: sanitizedMentions as unknown as ChatMessageInsert['mentions'],
          is_private: isPrivate,
          program_id: programId || null,
          papa_id: papaId || null,
          reply_to_id: replyTarget?.id || null
        }

        const { data, error } = await (supabase as any)
          .from('chat_messages')
          .insert([payload])
          .select(`
                      *,
                      users:sender_id(full_name, oscar, role)
                      `)

        if (error) {
          setNewMessage(current => current || draft)
          setSelectedMentions(current => current.length ? current : sanitizedMentions)
          setReplyTo(current => current ?? replyTarget)
          throw error
        }

        if (Array.isArray(data) && data.length > 0) {
          const inserted = transformMessage(data[0] as RawMessage)
          shouldAutoScroll.current = true
          setMessages((prev) => upsertMessage(prev, inserted))
        }

        if (sanitizedMentions.length > 0) {
          void createNotifications(sanitizedMentions, draft)
        }
      }
    } catch (error: any) {
      console.error('Error sending/editing message:', error)
      toast.error('Message not sent. Check your connection and try again.')
    } finally {
      sendingRef.current = false
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  const createNotifications = async (userIds: string[], message: string) => {
    if (!currentUser?.id || userIds.length === 0) return

    try {
      const notificationPayloads: NotificationInsert[] = userIds.map((userId) => ({
        user_id: userId,
        title: 'New chat message',
        message,
        type: 'chat',
        channel: 'push'
      }))

      const { error } = await (supabase as any)
        .from('notifications')
        .insert(notificationPayloads)

      if (error) {
        console.error('Error creating notifications:', error)
      }
    } catch (error) {
      console.error('Unexpected error creating notifications:', error)
    }
  }

  // Grow with the draft and shrink back after sending or when an edit prefills it.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [newMessage])

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart || 0
    setNewMessage(value)
    setCursorPosition(cursorPos)

    // Broadcast typing status
    void handleTyping()

    // Check for @ or @@ mentions
    const textBeforeCursor = value.substring(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex)

      // Check if it's @@ or @
      if (textAfterAt.startsWith('@@')) {
        const searchText = textAfterAt.substring(2)
        if (/^[a-zA-Z]*$/.test(searchText)) {
          setMentionType('@@')
          setMentionIndex(0)
          setMentionSearch(searchText.toLowerCase())
          setShowMentionSuggestions(true)
          return
        }
      } else if (textAfterAt.startsWith('@')) {
        const searchText = textAfterAt.substring(1)
        if (/^[a-zA-Z]*$/.test(searchText)) {
          setMentionType('@')
          setMentionIndex(0)
          setMentionSearch(searchText.toLowerCase())
          setShowMentionSuggestions(true)
          return
        }
      }
    }

    setShowMentionSuggestions(false)
  }

  const selectMention = (user: User) => {
    const textBeforeCursor = newMessage.substring(0, cursorPosition)
    const textAfterCursor = newMessage.substring(cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex !== -1) {
      if (user.id === currentUser?.id) {
        toast.warning('You cannot mention yourself')
        setShowMentionSuggestions(false)
        return
      }
      const beforeAt = textBeforeCursor.substring(0, lastAtIndex)
      const firstName = user.full_name?.trim() ? user.full_name.trim().split(/\s+/)[0] : (user.oscar || user.oscar || 'Officer')
      const mentionText = mentionType === '@@' ? `@@${firstName} ` : `@${firstName} `
      const newText = beforeAt + mentionText + textAfterCursor

      setNewMessage(newText)
      if (!selectedMentions.includes(user.id)) {
        setSelectedMentions([...selectedMentions, user.id])
      }

      setShowMentionSuggestions(false)
      setMentionSearch('')

      // Restore focus and the caret to the composer.
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = beforeAt.length + mentionText.length
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      }, 0)
    }
  }

  const handleMention = (userId: string) => {
    if (userId === currentUser?.id) {
      toast.warning('You cannot mention yourself')
      return
    }
    if (!selectedMentions.includes(userId)) {
      setSelectedMentions([...selectedMentions, userId])
      const user = users.find(u => u.id === userId)
      if (user) {
        setNewMessage(prev => prev + `@${user.full_name || user.oscar || 'Officer'} `)
      }
    }
    setShowUserList(false)
  }

  const handleDoubleMention = (userId: string) => {
    if (userId === currentUser?.id) {
      toast.warning('You cannot mention yourself')
      return
    }
    if (!selectedMentions.includes(userId)) {
      setSelectedMentions([...selectedMentions, userId])
      const user = users.find(u => u.id === userId)
      if (user) {
        setNewMessage(prev => prev + `@@${user.full_name || user.oscar || 'Officer'} `)
      }
    }
    setShowUserList(false)
  }

  // Filter users for mention suggestions
  const filteredUsers = users.filter(u => {
    if (u.id === currentUser?.id) return false // Exclude sender
    if (!mentionSearch) return true
    const firstName = (u.full_name?.trim() ? u.full_name.trim().split(/\s+/)[0] : (u.oscar || u.oscar || '')).toLowerCase()
    return firstName.startsWith(mentionSearch.toLowerCase())
  })

  const getInitials = (name?: string | null) => {
    if (!name || typeof name !== 'string') return '??'
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '??'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const getDisplayName = (meta?: MessageUserMeta | null) => {
    return resolveDisplayName(meta?.full_name, meta?.oscar, meta?.role)
  }

  const canViewMessage = (message: Message) => {
    if (message.is_archived) return false
    if (!currentUser) return false

    // Admins and leadership can see all messages
    const isUserAdmin = isAdmin(currentUser.role) || isAdmin(effectiveOscarRole(currentUser.role, currentUser.oscar))
    if (isUserAdmin) return true

    // Sender can see their own messages
    if (message.sender_id === currentUser.id) return true

    // Public messages
    if (!message.is_private) return true

    // Private messages where user is mentioned
    if (message.is_private && message.mentions.includes(currentUser.id)) return true

    return false
  }

  const isUserAdmin = Boolean(
    currentUser && (isAdmin(currentUser.role) || isAdmin(effectiveOscarRole(currentUser.role, currentUser.oscar)))
  )

  const isReadOnlyProgramChat =
    Boolean(programId) &&
    !!currentUser &&
    !isUserAdmin &&
    programAccessChecked &&
    !canChatInProgram

  // Get typing users list
  const typingUserNames = Object.keys(typingUsers).map(userId => {
    const user = users.find(u => u.id === userId)
    if (!user) return 'Someone'
    if (user.full_name && typeof user.full_name === 'string' && user.full_name.trim().length > 0) {
      return user.full_name.trim().split(/\s+/)[0]
    }
    return user.oscar || user.oscar || 'Someone'
  })

  const typingLabel =
    typingUserNames.length === 0 ? '' :
      typingUserNames.length === 1 ? `${typingUserNames[0]} is typing…` :
        typingUserNames.length === 2 ? `${typingUserNames[0]} and ${typingUserNames[1]} are typing…` :
          `${typingUserNames.length} people are typing…`

  const messageById = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages])

  const visibleMessages = useMemo(() =>
    messages.filter(canViewMessage).filter(m => !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, searchQuery, currentUser]
  )

  const timeline = useMemo(() => buildTimeline(visibleMessages, firstUnreadId), [visibleMessages, firstUnreadId])

  return (
    <div className="relative flex flex-col h-[calc(100dvh-13rem)] sm:h-[calc(100dvh-12rem)] min-h-[420px] bg-background rounded-xl border shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex-none border-b border-border/40 bg-card/70 backdrop-blur-xl px-3 py-2 shadow-sm z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight truncate">{roomLabel || (programId ? 'Program chat' : 'General chat')}</h2>
              <p className="text-xs text-muted-foreground">
                {typingLabel || `${users.filter(u => u.is_online).length} online`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="search" aria-label="Search loaded messages" placeholder="Search…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="h-9 w-28 sm:w-40 pl-8 pr-3 text-base sm:text-xs rounded-lg border bg-background/80 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all sm:focus:w-52" />
            </div>
            <Button aria-label={`${users.filter(u => u.is_online).length} team members online`} aria-expanded={showUserList} variant="outline" size="sm" onClick={() => setShowUserList(!showUserList)} className="gap-1.5 h-9 text-xs">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-500 motion-safe:animate-pulse" />
              <Users aria-hidden="true" className="h-3.5 w-3.5" />
              {users.filter(u => u.is_online).length}
            </Button>
          </div>
        </div>
      </div>

      {isReadOnlyProgramChat && (
        <div role="status" className="flex-none border-b bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 z-10">
          Read-only: you are not assigned to this program, so you can read but not post.
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages"
        className="flex-1 overflow-y-auto overscroll-contain z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border/40 hover:[&::-webkit-scrollbar-thumb]:bg-border/60 [&::-webkit-scrollbar-thumb]:rounded-full">
        <div className="px-4 py-3">
          {hasMoreMessages && !loadingMessages && (
            <div className="flex justify-center py-3">
              <button type="button" onClick={loadEarlierMessages} disabled={loadingEarlier}
                className="flex items-center gap-2 text-xs text-muted-foreground border rounded-full px-4 py-2 bg-background hover:bg-muted transition-colors disabled:opacity-50">
                {loadingEarlier && <Loader2 className="h-3 w-3 animate-spin" />}
                {loadingEarlier ? 'Loading...' : 'Load earlier messages'}
              </button>
            </div>
          )}

          {loadingMessages && (
            <div className="space-y-4 py-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`flex items-end gap-3 ${i % 3 === 0 ? 'flex-row-reverse' : ''}`}>
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
                  <div className="space-y-1.5"><div className="h-2.5 w-16 rounded bg-muted animate-pulse" /><div className="h-10 w-52 rounded-2xl bg-muted animate-pulse" /></div>
                </div>
              ))}
            </div>
          )}

          {!loadingMessages && !messageLoadError && visibleMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"><MessageCircle className="h-8 w-8 text-primary/50" /></div>
              <div><p className="font-semibold text-muted-foreground">No messages yet</p><p className="text-sm text-muted-foreground/60 mt-1">Be the first to start the conversation</p></div>
            </div>
          )}

          {!loadingMessages && messageLoadError && (
            <div role="alert" className="mx-auto my-8 max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
              <AlertCircle aria-hidden="true" className="mx-auto h-5 w-5 text-destructive" />
              <p className="mt-2 text-sm font-medium">Unable to load messages</p>
              <p className="mt-1 text-xs text-muted-foreground">{messageLoadError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadMessages()}>Try again</Button>
            </div>
          )}

          {!loadingMessages && timeline.map(item => {
            if (item.kind === 'date') return (
              <div key={item.id} className="sticky top-1 z-10 flex justify-center py-3">
                <span className="text-xs text-muted-foreground font-medium px-3 py-1 rounded-full border bg-card/95 backdrop-blur shadow-sm whitespace-nowrap">{item.label}</span>
              </div>
            )
            if (item.kind === 'unread') return (
              <div key={item.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-primary/40" />
                <span className="text-xs text-primary font-semibold px-3 py-1 rounded-full bg-primary/10 whitespace-nowrap">New messages</span>
                <div className="flex-1 h-px bg-primary/40" />
              </div>
            )

            const { msg, isFirst, isLast } = item
            const isOwn = msg.sender_id === currentUser?.id
            const displayName = getDisplayName(msg.users)
            const msgTime = msg.created_at ? new Date(msg.created_at).getTime() : NaN
            const isEditable = isOwn && !isNaN(msgTime) && (Date.now() - msgTime) < 3 * 60 * 1000
            const repliedMsg = msg.reply_to_id ? messageById.get(msg.reply_to_id) ?? null : null
            const msgReactions = reactions[msg.id] ?? []

            return (
              <MessageBubble
                key={item.id}
                msg={msg}
                isFirst={isFirst}
                isLast={isLast}
                isOwn={isOwn}
                displayName={displayName}
                isEditable={isEditable}
                repliedMsg={repliedMsg}
                msgReactions={msgReactions}
                isHighlighted={highlightedMessageId === msg.id}
                isPickerOpen={showReactionPicker === msg.id}
                searchQuery={searchQuery}
                currentUserRole={currentUser?.role}
                currentUserId={currentUser?.id}
                setShowReactionPicker={setShowReactionPicker}
                handleReply={handleReply}
                handleEdit={handleEdit}
                handleDeleteMessage={handleDeleteMessage}
                toggleReaction={toggleReaction}
                confirm={confirm}
              />
            )
          })}

          {typingUserNames.length > 0 && (
            <div className="flex items-center gap-2 mt-3" aria-hidden="true">
              <div className="bg-muted/60 border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-3">
                  {[0, 150, 300].map(delay => (
                    <span key={delay} className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{typingLabel}</span>
            </div>
          )}

          <div ref={messagesEndRef} className="h-2" />
        </div>
      </div>

      {/* Jump to bottom */}
      {!isAtBottom && (
        <button type="button" onClick={jumpToBottom}
          aria-label={newMsgCount > 0 ? `Jump to latest, ${newMsgCount} new` : 'Jump to latest messages'}
          className="absolute bottom-[6.5rem] right-4 flex h-10 items-center gap-1.5 rounded-full bg-primary text-primary-foreground shadow-lg px-3 text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all z-20 animate-in slide-in-from-bottom-2 duration-200">
          {newMsgCount > 0 && <span className="bg-white/25 rounded-full px-1.5 py-0.5 leading-tight">{newMsgCount} new</span>}
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      {/* User list overlay */}
      {showUserList && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowUserList(false)} />
          <div className="absolute bottom-[5.5rem] right-4 w-72 bg-background border rounded-2xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-4 duration-200">
            <div className="bg-muted/50 px-4 py-3 border-b flex items-center justify-between">
              <div><h3 className="text-sm font-semibold">Team Members</h3><p className="text-xs text-muted-foreground">{users.filter(u => u.is_online).length} online · {users.length} total</p></div>
              <button type="button" aria-label="Close team members" onClick={() => setShowUserList(false)} className="hit-area text-muted-foreground hover:text-foreground"><X aria-hidden="true" className="h-4 w-4" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {[...users].sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0)).map(user => (
                <div key={user.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors border-b last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-[11px] font-bold">{getInitials(user.full_name)}</AvatarFallback></Avatar>
                      <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${user.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{user.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">{user.is_online ? 'Online' : user.last_seen ? `Last seen ${formatDistanceToNow(new Date(user.last_seen), { addSuffix: true })}` : 'Offline'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button aria-label={`Mention ${user.full_name}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => { handleMention(user.id); setShowUserList(false) }}><AtSign aria-hidden="true" className="h-3.5 w-3.5" /></Button>
                    <Button aria-label={`Privately mention ${user.full_name}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => { handleDoubleMention(user.id); setShowUserList(false) }}><Lock aria-hidden="true" className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Input area */}
      <div className="flex-none border-t border-border/50 bg-card px-3 sm:px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10">
        {replyTo && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-3 py-2 mb-2 text-xs">
            <div className="flex items-center gap-2 text-primary min-w-0">
              <CornerUpLeft className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Replying to <strong>{getDisplayName(replyTo.users)}</strong></span>
            </div>
            <button type="button" aria-label="Cancel reply" onClick={cancelReply} className="hit-area ml-2 text-muted-foreground hover:text-foreground flex-shrink-0"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        )}
        {editingMessage && (
          <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2 mb-2 text-xs text-amber-700 dark:text-amber-400">
            <div className="flex items-center gap-2"><Pencil className="h-3.5 w-3.5" /><span className="font-semibold">Editing message</span></div>
            <button type="button" aria-label="Cancel editing" onClick={cancelEdit} className="hit-area"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        )}
        {selectedMentions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedMentions.map(uid => {
              const u = users.find(x => x.id === uid)
              const name = u?.full_name || u?.oscar || 'Officer'
              return u ? (
                <Badge key={uid} variant="secondary" className="gap-1 text-xs pr-1">
                  <AtSign className="h-3 w-3" />{name}
                  <button type="button" aria-label={`Remove ${name} mention`} onClick={() => setSelectedMentions(selectedMentions.filter(id => id !== uid))} className="ml-0.5 hover:text-destructive">×</button>
                </Badge>
              ) : null
            })}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              aria-label={editingMessage ? 'Edit message' : 'Write a message'}
              aria-autocomplete="list"
              aria-controls="chat-mention-list"
              aria-activedescendant={showMentionSuggestions && filteredUsers[mentionIndex] ? `chat-mention-${filteredUsers[mentionIndex].id}` : undefined}
              placeholder={isReadOnlyProgramChat ? 'Read-only' : editingMessage ? 'Edit message…' : 'Message…  (@ to mention)'}
              value={newMessage}
              onChange={handleMessageChange}
              enterKeyHint="send"
              onKeyDown={(event) => {
                const suggestions = showMentionSuggestions ? filteredUsers.slice(0, 5) : []
                if (suggestions.length > 0) {
                  if (event.key === 'ArrowDown') { event.preventDefault(); setMentionIndex(i => (i + 1) % suggestions.length); return }
                  if (event.key === 'ArrowUp') { event.preventDefault(); setMentionIndex(i => (i - 1 + suggestions.length) % suggestions.length); return }
                  if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); selectMention(suggestions[Math.min(mentionIndex, suggestions.length - 1)]); return }
                  if (event.key === 'Escape') { event.preventDefault(); setShowMentionSuggestions(false); return }
                }
                if (event.key === 'Escape' && (editingMessage || replyTo)) {
                  event.preventDefault()
                  if (editingMessage) cancelEdit(); else cancelReply()
                  return
                }
                // On touch keyboards Enter inserts a newline and the send button sends;
                // with a physical keyboard Enter sends and Shift+Enter adds a line.
                const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !coarse) {
                  event.preventDefault()
                  void handleSendMessage()
                }
              }}
              disabled={isReadOnlyProgramChat}
              rows={1}
              className="block w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-base sm:text-sm leading-6 min-h-11 max-h-40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow placeholder:text-muted-foreground disabled:opacity-50"
            />
            {showMentionSuggestions && filteredUsers.length > 0 && (
              <div id="chat-mention-list" role="listbox" aria-label={mentionType === '@@' ? 'Private mention' : 'Mention'} className="absolute bottom-full left-0 right-0 mb-2 bg-background border rounded-2xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-150">
                <div className={`px-3 py-2 border-b flex items-center gap-2 text-xs font-semibold ${mentionType === '@@' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-primary bg-primary/5'}`}>
                  {mentionType === '@@' ? <Lock className="h-3.5 w-3.5" /> : <AtSign className="h-3.5 w-3.5" />}
                  {mentionType === '@@' ? 'Private mention' : 'Mention'} · ↑↓ to choose, Enter to pick
                </div>
                {filteredUsers.slice(0, 5).map((user, index) => (
                  <div
                    key={user.id}
                    id={`chat-mention-${user.id}`}
                    role="option"
                    aria-selected={index === mentionIndex}
                    onMouseDown={(event) => { event.preventDefault(); selectMention(user) }}
                    onMouseEnter={() => setMentionIndex(index)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b last:border-0 transition-colors ${index === mentionIndex ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                  >
                    <Avatar className="h-7 w-7 flex-shrink-0"><AvatarFallback className="text-[10px] font-bold">{getInitials(user.full_name)}</AvatarFallback></Avatar>
                    <div className="min-w-0"><p className="text-sm font-medium">{user.full_name}</p><p className="text-[11px] text-muted-foreground truncate">{user.oscar || user.role}</p></div>
                    {mentionType === '@@' && <Lock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 ml-auto" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button
            type="button"
            aria-label={editingMessage ? 'Save edited message' : 'Send message'}
            onClick={() => void handleSendMessage()}
            disabled={isReadOnlyProgramChat || !newMessage.trim() || sending}
            aria-busy={sending}
            className="h-11 w-11 shrink-0 rounded-full p-0 self-end shadow-sm"
          >
            {sending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
          </Button>
        </div>
        <p className="hidden [@media(pointer:fine)]:block text-xs text-muted-foreground mt-1.5 text-right select-none">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  )
}

