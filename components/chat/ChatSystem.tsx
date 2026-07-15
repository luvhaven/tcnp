'use client'

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MessageCircle, Send, Users, AtSign, Lock, Loader2, ChevronDown, Trash2, CornerUpLeft, Pencil, X, Smile, Search } from 'lucide-react'
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
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMMM d')
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
    const d = new Date(msg.created_at)
    if (!lastDate || !isSameDay(d, lastDate)) {
      items.push({ kind: 'date', id: `date-${msg.id}`, label: formatDateLabel(d) })
      lastDate = d; lastSenderId = null; lastTime = null
    }
    if (msg.id === firstUnreadId) items.push({ kind: 'unread', id: 'unread-divider' })
    const gap = lastTime ? d.getTime() - lastTime : Infinity
    const isFirst = lastSenderId !== msg.sender_id || gap > GAP
    const next = msgs[i + 1]
    const nextGap = next ? new Date(next.created_at).getTime() - d.getTime() : Infinity
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
  initialMessage
}: {
  programId?: string;
  papaId?: string;
  initialMessage?: string;
}) {
  const supabase = useMemo(() => createClient(), [])
  const confirm = useConfirm()
  const searchParams = useSearchParams()
  const highlightId = searchParams?.get('highlight')
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [newMessage, setNewMessage] = useState(initialMessage || '')
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [showUserList, setShowUserList] = useState(false)
  const [selectedMentions, setSelectedMentions] = useState<string[]>([])
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionType, setMentionType] = useState<'@' | '@@'>('@')
  const [cursorPosition, setCursorPosition] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
        console.error('âŒ Failed to fetch user profile for message sender:', { userId, error })
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
      console.error('âŒ Unexpected error fetching user profile:', { userId, error })
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

    if (['super_admin', 'dev_admin', 'admin'].includes(currentUser.role)) {
      setCanChatInProgram(true)
      setProgramAccessChecked(true)
      return
    }

    try {
      setProgramAccessChecked(false)
      const { data, error } = await (supabase as any)
        .from('current_title_assignments')
        .select('program_id')
        .eq('user_id', currentUser.id)
        .eq('program_id', programId)

      if (error) {
        console.error('âŒ Error checking program chat access:', error)
        setCanChatInProgram(false)
      } else {
        setCanChatInProgram(Array.isArray(data) && data.length > 0)
      }
    } catch (error) {
      console.error('âŒ Unexpected error checking program chat access:', error)
      setCanChatInProgram(false)
    } finally {
      setProgramAccessChecked(true)
    }
  }, [supabase, programId, currentUser?.id, currentUser?.role])

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
      console.error('âŒ Notification playback failed:', error)
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
    const index = items.findIndex((m) => m.id === message.id)
    if (index !== -1) {
      const next = [...items]
      next[index] = message
      return next.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }
    return [...items, message].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }, [])

  // updatePresenceFlags was removed because PresenceHeartbeat handles it globally

  const markMessageRead = useCallback(async (message: Message) => {
    if (!currentUser?.id) return
    if (message.sender_id === currentUser.id) return
    if (message.read_by.includes(currentUser.id)) return
    if (markedMessagesRef.current.has(message.id)) return

    markedMessagesRef.current.add(message.id)

    try {
      const { error } = await (supabase as any).rpc('mark_message_read', {
        message_uuid: message.id,
        user_uuid: currentUser.id
      })

      if (error) {
        markedMessagesRef.current.delete(message.id)
        console.error('Error marking message as read:', error)
      }
    } catch (error) {
      markedMessagesRef.current.delete(message.id)
      console.error('Unexpected error marking message as read:', error)
    }
  }, [supabase, currentUser?.id])

  const isRecentlySeen = (lastSeen: string | null): boolean => {
    if (!lastSeen) return false
    const ms = new Date().getTime() - new Date(lastSeen).getTime()
    return ms < 3 * 60 * 1000 // 3 minutes
  }

  const loadParticipants = useCallback(async () => {
    try {
      // Query users directly â€” get full_name, oscar, role, last_seen, is_online
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

    const channel = supabase.channel(
      `chat-messages-${programId || 'global'}-${papaId || 'none'}`,
      {
        config: {
          broadcast: { self: false },
          presence: { key: currentUser?.id || 'anonymous' }
        }
      }
    )

    const handlePayload = async (
      payload: RealtimePostgresChangesPayload<ChatMessageRow>
    ) => {
      if (!mounted) return
      console.log('📦 Realtime payload received:', payload.eventType, payload)

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
        if (newRow.program_id !== null || newRow.papa_id !== null) return
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
            setMessages((prev) => {
              // Prevent duplicates
              if (prev.some(m => m.id === message.id)) return prev
              const updated = upsertMessage(prev, message)
              return updated
            })

            if (message.sender_id !== currentUser?.id) {
              void markMessageRead(message)

              // Notification for mentions/private
              const isMentioned = message.mentions.includes(currentUser?.id || '')
              if (isMentioned || message.is_private) {
                const senderName = message.users?.full_name || 'Someone'
                void notificationService.notifyNewMessage(
                  senderName,
                  message.content,
                  message.is_private
                )
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
              read_by: (newRow.read_by as string[]) || [],
              mentions: (newRow.mentions as string[]) || [],
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
        if (userId === currentUser?.id) return

        setTypingUsers(prev => ({
          ...prev,
          [userId]: Date.now()
        }))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('âœ… Chat realtime subscription active')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('âŒ Chat subscription error')
        }
      })

    channelRef.current = channel

    return () => {
      mounted = false
      if (channelRef.current) {
        console.log('ðŸ§¹ Cleaning up chat subscription')
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [supabase, programId, papaId, currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) return

    messages.forEach((message) => {
      if (message.sender_id !== currentUser.id && !message.read_by.includes(currentUser.id)) {
        void markMessageRead(message)
      }
    })
  }, [messages, currentUser?.id, markMessageRead])

  useEffect(() => {
    if (!currentUser?.id) return

    // Subscribe to users table changes for is_online / last_seen updates
    const usersOnlineChannel = supabase
      .channel('chat-users-online-rt')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: undefined
      }, () => {
        void loadParticipants()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(usersOnlineChannel)
    }
  }, [supabase, currentUser?.id, loadParticipants])

  // Auto-scroll behavior
  const shouldAutoScroll = useRef(true)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlightId && messages.some(m => m.id === highlightId)) {
      setTimeout(() => {
        const el = document.getElementById(`msg-${highlightId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setHighlightedMessageId(highlightId)
          setTimeout(() => setHighlightedMessageId(null), 2000)
        }
      }, 300)
    } else if (shouldAutoScroll.current) {
      // Only auto-scroll if user is near bottom
      setTimeout(() => scrollToBottom(), 100)
    }
  }, [messages, highlightId])

  // Detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const atBottom = distanceFromBottom < 100
    shouldAutoScroll.current = atBottom
    setIsAtBottom(atBottom)
    if (atBottom) { setNewMsgCount(0); setFirstUnreadId(null) }
  }, [])

  const jumpToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true); setNewMsgCount(0); setFirstUnreadId(null)
  }, [])


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, oscar, role, email')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('âŒ Error loading current user:', error)
          return
        }

        console.log('âœ… Current user loaded:', data)
        setCurrentUser(data)
      }
    } catch (error) {
      console.error('âŒ Error in loadCurrentUser:', error)
    }
  }

  const loadMessages = async () => {
    setLoadingMessages(true)

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
        query = query.is('program_id', null).is('papa_id', null)
      }

      const { data, error } = await query

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
      console.error('âŒ Error loading messages:', {
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

      toast.error(friendlyMessage)
    } finally {
      setLoadingMessages(false)
    }
  }

  const loadEarlierMessages = async () => {
    if (!oldestTimestampRef.current || loadingEarlier) return
    setLoadingEarlier(true)
    try {
      let query = supabase
        .from('chat_messages')
        .select(`*, users:sender_id(full_name, oscar, role)`)
        .lt('created_at', oldestTimestampRef.current)
        .order('created_at', { ascending: false })
        .limit(50)

      if (papaId) {
        query = query.eq('papa_id', papaId)
        if (programId) query = query.eq('program_id', programId)
      } else if (programId) {
        query = query.eq('program_id', programId).is('papa_id', null)
      } else {
        query = query.is('program_id', null).is('papa_id', null)
      }

      const { data, error } = await query
      if (error) throw error

      const rows = (data || []).reverse()
      if (rows.length > 0) {
        oldestTimestampRef.current = rows[0].created_at
        setHasMoreMessages(rows.length === 50)
        const earlier = rows
          .map((msg) => { try { return transformMessage(msg as RawMessage) } catch { return null } })
          .filter((msg): msg is Message => msg !== null)
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

  const loadReactions = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    const { data } = await (supabase as any).from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids)
    if (!data) return
    const map: ReactionMap = {}
      ; (data as { message_id: string; user_id: string; emoji: string }[]).forEach(r => {
        if (!map[r.message_id]) map[r.message_id] = []
        const ex = map[r.message_id].find(x => x.emoji === r.emoji)
        if (ex) { ex.count++; ex.userIds.push(r.user_id) }
        else map[r.message_id].push({ emoji: r.emoji, count: 1, userIds: [r.user_id] })
      })
    setReactions(map)
  }, [supabase])

  useEffect(() => {
    const ids = messages.map(m => m.id)
    if (ids.length) void loadReactions(ids)
  }, [messages, loadReactions])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!currentUser?.id) return
    const existing = reactions[messageId]?.find(r => r.emoji === emoji)
    const hasReacted = existing?.userIds.includes(currentUser.id) ?? false
    if (hasReacted) {
      await (supabase as any).from('message_reactions').delete().eq('message_id', messageId).eq('user_id', currentUser.id).eq('emoji', emoji)
    } else {
      await (supabase as any).from('message_reactions').insert({ message_id: messageId, user_id: currentUser.id, emoji })
    }
    void loadReactions(messages.map(m => m.id))
  }, [supabase, currentUser, reactions, messages, loadReactions])

  const handleDeleteMessage = useCallback(async (messageId: string, hardDelete: boolean = false) => {
    if (!currentUser?.id) return
    const isAdmin = ['super_admin', 'dev_admin', 'admin'].includes(currentUser.role)

    if (hardDelete && isAdmin) {
      const { error } = await (supabase as any).from('chat_messages').delete().eq('id', messageId)
      if (error) {
        toast.error(`Could not delete message: ${error.message}`);
        return
      }
      setMessages(prev => prev.filter(m => m.id !== messageId))
      return
    }

    const deletedAt = new Date().toISOString()
    const isOwner = messages.find(m => m.id === messageId)?.sender_id === currentUser.id

    if (isAdmin && !isOwner) {
      // Soft delete by Admin
      const { error } = await (supabase as any).from('chat_messages').update({ deleted_at: deletedAt, deleted_by_admin: true }).eq('id', messageId)
      if (error) { toast.error(error.message); return }
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted_at: deletedAt, deleted_by_admin: true } : m))
    } else {
      // Soft delete by User
      const { error } = await (supabase as any).from('chat_messages').update({ deleted_at: deletedAt }).eq('id', messageId).eq('sender_id', currentUser.id)
      if (error) { toast.error(error.message); return }
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted_at: deletedAt } : m))
    }
  }, [supabase, currentUser, messages])

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
    if (!newMessage.trim()) return

    if (!currentUser?.id) {
      toast.error('You must be logged in to send messages')
      return
    }

    if (programId && !['dev_admin', 'admin'].includes(currentUser.role)) {
      if (!programAccessChecked) {
        toast.warning('Checking your permission for this program. Please wait a moment and try again.')
        return
      }
      if (!canChatInProgram) {
        toast.error('You are not assigned to this program as a protocol officer, so chat is read-only.')
        return
      }
    }

    try {
      if (editingMessage) {
        // Handle Edit
        const { data, error } = await (supabase as any).rpc('edit_chat_message', {
          message_id: editingMessage.id,
          new_content: newMessage
        })

        if (error) throw error

        // Update local state immediately for better UX
        setMessages(prev => prev.map(m =>
          m.id === editingMessage.id
            ? { ...m, content: newMessage, edited_at: new Date().toISOString() }
            : m
        ))

        toast.success('Message edited')
        cancelEdit()
      } else {
        // Handle New Message
        const sanitizedMentions = selectedMentions.filter((id) => id !== currentUser.id)
        if (sanitizedMentions.length !== selectedMentions.length) {
          toast.warning('You cannot mention yourself. Self-mentions were removed.')
          setSelectedMentions(sanitizedMentions)
        }

        const isPrivate = sanitizedMentions.length > 0 && newMessage.includes('@@')

        const payload: ChatMessageInsert = {
          sender_id: currentUser.id,
          content: newMessage,
          mentions: sanitizedMentions as unknown as ChatMessageInsert['mentions'],
          is_private: isPrivate,
          program_id: programId || null,
          papa_id: papaId || null,
          reply_to_id: replyTo?.id || null
        }

        console.log('Sending message:', payload)

        const { data, error } = await (supabase as any)
          .from('chat_messages')
          .insert([payload])
          .select(`
                      *,
                      users:sender_id(full_name, oscar, role)
                      `)

        if (error) {
          console.error('Supabase error details:', error)
          throw error
        }

        console.log('Message sent successfully:', data)

        if (Array.isArray(data) && data.length > 0) {
          const inserted = transformMessage(data[0] as RawMessage)
          setMessages((prev) => upsertMessage(prev, inserted))
        }

        // Send notifications to mentioned users
        if (sanitizedMentions.length > 0) {
          await createNotifications(sanitizedMentions, newMessage)
        }

        setNewMessage('')
        setSelectedMentions([])
        setReplyTo(null)
        toast.success('Message sent!')
      }
    } catch (error: any) {
      console.error('Error sending/editing message:', error)
      toast.error(error.message || 'Failed to process message')
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

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Auto-resize textarea
    const el = e.target; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 128)}px`
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
        if (searchText.length === 0 || /^[a-zA-Z\s]*$/.test(searchText)) {
          setMentionType('@@')
          setMentionSearch(searchText.toLowerCase())
          setShowMentionSuggestions(true)
          return
        }
      } else if (textAfterAt.startsWith('@')) {
        const searchText = textAfterAt.substring(1)
        if (searchText.length === 0 || /^[a-zA-Z\s]*$/.test(searchText)) {
          setMentionType('@')
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
      const mentionText = mentionType === '@@' ? `@@${user.full_name.split(' ')[0]} ` : `@${user.full_name.split(' ')[0]} `
      const newText = beforeAt + mentionText + textAfterCursor

      setNewMessage(newText)
      if (!selectedMentions.includes(user.id)) {
        setSelectedMentions([...selectedMentions, user.id])
      }

      setShowMentionSuggestions(false)
      setMentionSearch('')

      // Focus back on input
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = beforeAt.length + mentionText.length
          inputRef.current.focus()
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
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
        setNewMessage(prev => prev + `@${user.full_name} `)
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
        setNewMessage(prev => prev + `@@${user.full_name} `)
      }
    }
    setShowUserList(false)
  }

  // Filter users for mention suggestions
  const filteredUsers = users.filter(u => {
    if (u.id === currentUser?.id) return false // Exclude sender
    if (!mentionSearch) return true
    const firstName = u.full_name.split(' ')[0].toLowerCase()
    return firstName.startsWith(mentionSearch)
  })

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const getDisplayName = (meta: MessageUserMeta) => {
    return resolveDisplayName(meta.full_name, meta.oscar, meta.role)
  }

  const canViewMessage = (message: Message) => {
    if (message.is_archived) return false
    if (!currentUser) return false

    // Admins can see all messages
    if (['super_admin', 'dev_admin', 'admin'].includes(currentUser.role)) return true

    // Sender can see their own messages
    if (message.sender_id === currentUser.id) return true

    // Public messages
    if (!message.is_private) return true

    // Private messages where user is mentioned
    if (message.is_private && message.mentions.includes(currentUser.id)) return true

    return false
  }

  const isReadOnlyProgramChat =
    Boolean(programId) &&
    !!currentUser &&
    !['dev_admin', 'admin'].includes(currentUser.role) &&
    programAccessChecked &&
    !canChatInProgram

  // Get typing users list
  const typingUserNames = Object.keys(typingUsers).map(userId => {
    const user = users.find(u => u.id === userId)
    return user ? user.full_name.split(' ')[0] : 'Someone'
  })

  const visibleMessages = useMemo(() =>
    messages.filter(canViewMessage).filter(m => !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, searchQuery, currentUser]
  )

  const timeline = useMemo(() => buildTimeline(visibleMessages, firstUnreadId), [visibleMessages, firstUnreadId])

  return (
    <div className="relative flex flex-col h-[calc(100dvh-7.8rem)] min-h-[520px] bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border shadow-sm overflow-hidden">
      {/* Background Texture Drop */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] opacity-60 pointer-events-none" />

      {/* Header */}
      <div className="flex-none border-b border-border/40 bg-card/70 backdrop-blur-xl px-3 py-2 shadow-sm z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-xs font-semibold leading-tight">Team Chat</h2>
              <p className="text-[10px] text-muted-foreground">{users.filter(u => u.is_online).length} online · {visibleMessages.length} messages</p>
              {isReadOnlyProgramChat && <p className="text-[10px] text-amber-600 font-medium">Read-only: not assigned to this program</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="search" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="h-8 w-36 pl-8 pr-3 text-xs rounded-lg border bg-background/80 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all focus:w-48" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowUserList(!showUserList)} className="gap-1.5 h-8 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <Users className="h-3.5 w-3.5" />
              {users.filter(u => u.is_online).length}
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scroll-smooth z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border/40 hover:[&::-webkit-scrollbar-thumb]:bg-border/60 [&::-webkit-scrollbar-thumb]:rounded-full">
        <div className="px-4 py-3">
          {hasMoreMessages && !loadingMessages && (
            <div className="flex justify-center py-3">
              <button onClick={loadEarlierMessages} disabled={loadingEarlier}
                className="flex items-center gap-2 text-xs text-muted-foreground border rounded-full px-4 py-1.5 bg-background hover:bg-muted transition-colors disabled:opacity-50">
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

          {!loadingMessages && visibleMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"><MessageCircle className="h-8 w-8 text-primary/50" /></div>
              <div><p className="font-semibold text-muted-foreground">No messages yet</p><p className="text-sm text-muted-foreground/60 mt-1">Be the first to start the conversation</p></div>
            </div>
          )}

          {!loadingMessages && timeline.map(item => {
            if (item.kind === 'date') return (
              <div key={item.id} className="flex items-center gap-3 py-4">
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-[11px] text-muted-foreground font-medium px-3 py-1 rounded-full border bg-background/90 whitespace-nowrap">{item.label}</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>
            )
            if (item.kind === 'unread') return (
              <div key={item.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-primary/40" />
                <span className="text-[11px] text-primary font-semibold px-3 py-1 rounded-full bg-primary/10 whitespace-nowrap">â†“ New messages</span>
                <div className="flex-1 h-px bg-primary/40" />
              </div>
            )

            const { msg, isFirst, isLast } = item
            const isOwn = msg.sender_id === currentUser?.id
            const displayName = getDisplayName(msg.users)
            const isEditable = isOwn && (Date.now() - new Date(msg.created_at).getTime()) < 3 * 60 * 1000
            const repliedMsg = (msg as any).reply_to_id ? messages.find(m => m.id === (msg as any).reply_to_id) : null
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
                highlightedMessageId={highlightedMessageId}
                searchQuery={searchQuery}
                showReactionPicker={showReactionPicker}
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
            <div className="flex items-end gap-2 mt-3">
              <div className="w-8 flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-[10px] font-bold text-muted-foreground">{typingUserNames[0]?.[0]?.toUpperCase()}</span>
                </div>
              </div>
              <div className="bg-muted/60 border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-3">
                  {[0, 150, 300].map(delay => (
                    <span key={delay} className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-2" />
        </div>
      </div>

      {/* Jump to bottom */}
      {!isAtBottom && (
        <button onClick={jumpToBottom}
          className="absolute bottom-[5.5rem] right-4 flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground shadow-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all z-20 animate-in slide-in-from-bottom-2 duration-200">
          {newMsgCount > 0 && <span className="bg-white/25 rounded-full px-1.5 py-0.5 leading-tight">{newMsgCount}</span>}
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
              <button onClick={() => setShowUserList(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {users.sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0)).map(user => (
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { handleMention(user.id); setShowUserList(false) }} title="Mention"><AtSign className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { handleDoubleMention(user.id); setShowUserList(false) }} title="Private"><Lock className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Input area */}
      <div className="flex-none border-t border-border/50 bg-card/80 backdrop-blur-xl px-4 pt-3 pb-4 shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)] z-10">
        {replyTo && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-3 py-2 mb-2 text-xs">
            <div className="flex items-center gap-2 text-primary min-w-0">
              <CornerUpLeft className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Replying to <strong>{getDisplayName(replyTo.users)}</strong></span>
            </div>
            <button onClick={cancelReply} className="ml-2 text-muted-foreground hover:text-foreground flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {editingMessage && (
          <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2 mb-2 text-xs text-amber-700 dark:text-amber-400">
            <div className="flex items-center gap-2"><Pencil className="h-3.5 w-3.5" /><span className="font-semibold">Editing message</span></div>
            <button onClick={cancelEdit}><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {selectedMentions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedMentions.map(uid => {
              const u = users.find(x => x.id === uid)
              return u ? (
                <Badge key={uid} variant="secondary" className="gap-1 text-xs pr-1">
                  <AtSign className="h-3 w-3" />{u.full_name}
                  <button onClick={() => setSelectedMentions(selectedMentions.filter(id => id !== uid))} className="ml-0.5 hover:text-destructive">Ã—</button>
                </Badge>
              ) : null
            })}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              placeholder={isReadOnlyProgramChat ? 'Read-only: not assigned to this program' : editingMessage ? 'Edit message...' : 'Message the team...'}
              value={newMessage}
              onChange={handleMessageChange}
              disabled={isReadOnlyProgramChat}
              rows={1}
              className="block w-full resize-none rounded-xl border border-border/50 bg-background/50 shadow-inner px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all placeholder:text-muted-foreground/60 max-h-32 disabled:opacity-50"
              style={{ minHeight: '40px', height: '40px', padding: '9px 14px', lineHeight: '22px', boxSizing: 'border-box' }}
            />
            {showMentionSuggestions && filteredUsers.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-background border rounded-2xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-150">
                <div className={`px-3 py-2 border-b flex items-center gap-2 text-xs font-semibold ${mentionType === '@@' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-primary bg-primary/5'}`}>
                  {mentionType === '@@' ? <Lock className="h-3.5 w-3.5" /> : <AtSign className="h-3.5 w-3.5" />}
                  {mentionType === '@@' ? 'Private mention' : 'Mention'} · type first name
                </div>
                {filteredUsers.slice(0, 5).map(user => (
                  <div key={user.id} onClick={() => selectMention(user)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer border-b last:border-0 transition-colors">
                    <Avatar className="h-7 w-7 flex-shrink-0"><AvatarFallback className="text-[10px] font-bold">{getInitials(user.full_name)}</AvatarFallback></Avatar>
                    <div className="min-w-0"><p className="text-sm font-medium">{user.full_name}</p><p className="text-[11px] text-muted-foreground truncate">{user.oscar || user.role}</p></div>
                    {mentionType === '@@' && <Lock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 ml-auto" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button
            onClick={() => void handleSendMessage()}
            disabled={isReadOnlyProgramChat || !newMessage.trim()}
            className="rounded-xl flex-shrink-0 shadow-sm p-0 self-end"
            style={{ height: '40px', width: '40px', minHeight: '40px', minWidth: '40px' }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-1.5 text-right select-none">Click send to post · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

